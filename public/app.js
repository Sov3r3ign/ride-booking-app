const session = getCurrentSession();
if (!session || session.role !== 'rider') {
  window.location.href = '/login.html';
}

// Initialize the Leaflet map
const map = L.map('map').setView([-26.2023, 28.0436], 13);

// Add OpenStreetMap tiles
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let pickupMarker = null;
let dropoffMarker = null;
let clickState = 'pickup';
let isRequestingRide = false;

// DOM References
const instruction = document.getElementById('instruction');
const rideControls = document.getElementById('ride-controls');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const currentRideContainer = document.getElementById('current-ride');

// Holds the current ride's markers/line so each new request replaces the last
const currentRideLayerGroup = L.layerGroup().addTo(map);
const loadingIndicator = document.getElementById('loading-indicator');


const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// ==========================================
// REVERSE GEOCODING
// ==========================================
// Calls our own server's /api/geocode endpoint (same-origin, no CORS issues).
// The server handles the Nominatim rate limit, retries, and a shared cache
// across all users, so the client just needs its own small lookup cache to
// avoid re-requesting the same coordinates on this page.
const geocodeCache = new Map();

async function getLocationName(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

  if (geocodeCache.has(key)) {
    return geocodeCache.get(key);
  }

  try {
    const response = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    const name = data.name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    geocodeCache.set(key, name);
    return name;

  } catch (err) {
    console.error('Reverse geocoding error:', err);
    const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    geocodeCache.set(key, fallback);
    return fallback;
  }
}

function showLoading(show = true) {
  loadingIndicator.classList.toggle('active', show);
  requestBtn.disabled = show;
}

function updateInstruction(text, type = 'info') {
  instruction.className = `instruction ${type === 'warning' ? 'warning' : type === 'success' ? 'success' : ''}`;
  instruction.textContent = text;
}

function showCurrentRide(ride) {
  const statusEmoji = ride.status === 'pending' ? '🟠' : ride.status === 'accepted' ? '🟢' : '✓';
  const pickupId = `pickup-${ride._id}`;
  const dropoffId = `dropoff-${ride._id}`;

  currentRideContainer.innerHTML = `
    <div class="ride-status-badge">
      <span class="status ${ride.status}">${ride.status.toUpperCase()}</span>
      <span class="ride-time">${statusEmoji} ${ride._id.slice(-6).toUpperCase()}</span>
    </div>
    <div style="margin-top: 0.75rem;">
      <strong> Pickup</strong><br>
      <span id="${pickupId}">Loading location...</span><br>
      <br>
      <strong> Dropoff</strong><br>
      <span id="${dropoffId}">Loading location...</span><br>
      <br>
      <strong> Distance</strong> ${ride.distance != null ? ride.distance.toFixed(2) + ' km' : 'N/A'}<br>
      <strong> Fare</strong> ${ride.fare != null ? 'R' + ride.fare.toFixed(2) : 'N/A'}
    </div>
  `;

  getLocationName(ride.pickup.lat, ride.pickup.lng).then(name => {
    const el = document.getElementById(pickupId);
    if (el) el.textContent = name;
  });

  getLocationName(ride.dropoff.lat, ride.dropoff.lng).then(name => {
    const el = document.getElementById(dropoffId);
    if (el) el.textContent = name;
  });
}

function addRideToMap(ride) {
  // Clear the previous ride's markers/line — only the current request is shown
  currentRideLayerGroup.clearLayers();

  // Pickup marker
  const pickupMarker = L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
    radius: 10,
    color: '#059669',
    fillColor: '#059669',
    fillOpacity: 0.8,
    weight: 2
  }).addTo(currentRideLayerGroup).bindPopup(`<strong>Pickup</strong><br>Ride ${ride._id.slice(-4).toUpperCase()}`);

  getLocationName(ride.pickup.lat, ride.pickup.lng).then(name => {
    pickupMarker.setPopupContent(`<strong>Pickup</strong><br>${name}`);
  });

  // Dropoff marker
  const dropoffMarker = L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 10,
    color: '#dc2626',
    fillColor: '#dc2626',
    fillOpacity: 0.8,
    weight: 2
  }).addTo(currentRideLayerGroup).bindPopup(`<strong>Dropoff</strong><br>Ride ${ride._id.slice(-4).toUpperCase()}`);

  getLocationName(ride.dropoff.lat, ride.dropoff.lng).then(name => {
    dropoffMarker.setPopupContent(`<strong>Dropoff</strong><br>${name}`);
  });

  // Connect with line
  L.polyline([
    [ride.pickup.lat, ride.pickup.lng],
    [ride.dropoff.lat, ride.dropoff.lng]
  ], {
    color: '#7c3aed',
    weight: 3,
    dashArray: '5, 10',
    opacity: 0.7
  }).addTo(currentRideLayerGroup);

  // Fit bounds
  const bounds = L.latLngBounds([
    [ride.pickup.lat, ride.pickup.lng],
    [ride.dropoff.lat, ride.dropoff.lng]
  ]);
  map.fitBounds(bounds, { padding: [100, 100], maxZoom: 15 });
}

function resetMarkers() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  
  pickupMarker = null;
  dropoffMarker = null;
  clickState = 'pickup';
  
  updateInstruction('Click the map to set your pickup location');
  rideControls.classList.add('hidden');
}

map.on('click', function (e) {
  if (isRequestingRide) return;

  if (clickState === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    
    pickupMarker = L.marker(e.latlng, { icon: greenIcon })
      .addTo(map)
      .bindPopup(' Pickup Location')
      .openPopup();

    getLocationName(e.latlng.lat, e.latlng.lng).then(name => {
      pickupMarker.setPopupContent(` Pickup: ${name}`);
    });
    
    clickState = 'dropoff';
    updateInstruction('Now click to set your dropoff location');
    
  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    
    dropoffMarker = L.marker(e.latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup(' Dropoff Location')
      .openPopup();

    getLocationName(e.latlng.lat, e.latlng.lng).then(name => {
      dropoffMarker.setPopupContent(` Dropoff: ${name}`);
    });
    
    clickState = 'done';
    updateInstruction(' Ready! Click "Request Ride"', 'success');
    rideControls.classList.remove('hidden');
  }
});

requestBtn.addEventListener('click', async function () {
  if (!pickupMarker || !dropoffMarker) return;
  if (isRequestingRide) return;

  isRequestingRide = true;
  showLoading(true);
  updateInstruction(' Submitting your ride request...');

  try {
    const rideData = {
      pickup: {
        lat: pickupMarker.getLatLng().lat,
        lng: pickupMarker.getLatLng().lng
      },
      dropoff: {
        lat: dropoffMarker.getLatLng().lat,
        lng: dropoffMarker.getLatLng().lng
      }
    };

    const API_URL = 'https://ridebook-api.onrender.com';
    const response = await fetch(`${API_URL}/api/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rideData)
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const savedRide = await response.json();
    
    addRideToMap(savedRide);
    showCurrentRide(savedRide);
    
    updateInstruction(' Ride requested! Driver will accept soon.', 'success');
    showLoading(false);
    
    setTimeout(() => {
      resetMarkers();
      updateInstruction('Click the map to set your pickup location');
    }, 1500);

  } catch (err) {
    console.error('Error requesting ride:', err);
    showLoading(false);
    updateInstruction(' Failed to request ride. Please try again.', 'warning');
    isRequestingRide = false;
  }
});

resetBtn.addEventListener('click', function () {
  resetMarkers();
  updateInstruction('Click the map to set your pickup location');
});

document.addEventListener('DOMContentLoaded', () => {
  // Rider page starts on a clean slate — past rides live on the History page
});

console.log(' RideBook Rider App Loaded');
console.log(' Johannesburg, South Africa view');