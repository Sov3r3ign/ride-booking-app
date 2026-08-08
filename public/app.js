
// Initialize the Leaflet map centered on London
/* const map = L.map('map').setView([51.505, -0.09], 13);

// Add OpenStreetMap tiles as the base layer
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// ==========================================
// STATE MANAGEMENT
// ==========================================

let pickupMarker = null;
let dropoffMarker = null;
let clickState = 'pickup';
let isRequestingRide = false;

// DOM References
const instruction = document.getElementById('instruction');
const rideControls = document.getElementById('ride-controls');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const ridesList = document.getElementById('rides-list');
const loadingIndicator = document.getElementById('loading-indicator');

// ==========================================
// MARKER ICONS - Color-coded for UX clarity
// ==========================================

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

function showLoading(show = true) {
  loadingIndicator.classList.toggle('active', show);
  requestBtn.disabled = show;
}

function updateInstruction(text) {
  instruction.style.opacity = '0.5';
  setTimeout(() => {
    instruction.textContent = text;
    instruction.style.opacity = '1';
  }, 150);
  instruction.style.transition = 'opacity 150ms ease-in-out';
}

function addRideToList(ride) {
  // Remove the empty state message if it exists
  const emptyState = ridesList.querySelector('[style*="italic"]');
  if (emptyState) emptyState.remove();

  const li = document.createElement('li');
  li.role = 'listitem';
  
  const statusDot = ride.status === 'pending' 
    ? '🟠' 
    : ride.status === 'accepted' 
    ? '🟢' 
    : '✓';

  li.innerHTML = `
    <div class="ride-status-badge">
      <span class="status ${ride.status}">${ride.status.toUpperCase()}</span>
      <span class="ride-time">ID: ${ride._id.slice(-6).toUpperCase()}</span>
    </div>
    <div style="margin-top: 0.75rem;">
      <strong style="color: var(--color-text-primary);">📍 Pickup</strong><br>
      <span style="font-family: var(--font-mono);">${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}</span><br>
      <br>
      <strong style="color: var(--color-text-primary);">📍 Dropoff</strong><br>
      <span style="font-family: var(--font-mono);">${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}</span>
    </div>
  `;
  
  ridesList.prepend(li);
}

function addRideToMap(ride) {
  // Pickup marker - Teal circle
  L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
    radius: 10,
    color: '#14b8a6',
    fillColor: '#14b8a6',
    fillOpacity: 0.8,
    weight: 2,
    className: 'ride-marker-pickup'
  }).addTo(map).bindPopup(
    `<strong>Pickup</strong><br>Ride ${ride._id.slice(-4).toUpperCase()}<br><small style="color: #94a3b8;">${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}</small>`,
    { className: 'ride-popup' }
  );

  // Dropoff marker - Red circle
  L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 10,
    color: '#ef4444',
    fillColor: '#ef4444',
    fillOpacity: 0.8,
    weight: 2,
    className: 'ride-marker-dropoff'
  }).addTo(map).bindPopup(
    `<strong>Dropoff</strong><br>Ride ${ride._id.slice(-4).toUpperCase()}<br><small style="color: #94a3b8;">${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}</small>`,
    { className: 'ride-popup' }
  );

  // Connect with animated dashed line
  L.polyline([
    [ride.pickup.lat, ride.pickup.lng],
    [ride.dropoff.lat, ride.dropoff.lng]
  ], {
    color: '#8b5cf6',
    weight: 3,
    dashArray: '5, 10',
    opacity: 0.7,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // Fit map to show both markers
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
  if (isRequestingRide) return; // Prevent placing markers while requesting

  if (clickState === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    
    pickupMarker = L.marker(e.latlng, { icon: greenIcon })
      .addTo(map)
      .bindPopup('📍 Pickup Location')
      .openPopup();
    
    clickState = 'dropoff';
    updateInstruction('Now click to set your dropoff location');
    
  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    
    dropoffMarker = L.marker(e.latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup('📍 Dropoff Location')
      .openPopup();
    
    clickState = 'done';
    updateInstruction('✨ Ready! Click "Request Ride" to submit your booking');
    rideControls.classList.remove('hidden');
  }
});

requestBtn.addEventListener('click', async function () {
  if (!pickupMarker || !dropoffMarker) return;
  if (isRequestingRide) return;

  isRequestingRide = true;
  showLoading(true);
  updateInstruction('🔄 Submitting your ride request...');

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

    // Send to API
    const response = await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rideData)
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const savedRide = await response.json();
    
    // Add to UI
    addRideToList(savedRide);
    addRideToMap(savedRide);
    
    // Success feedback
    updateInstruction('✅ Ride requested! Driver will accept soon.');
    showLoading(false);
    
    // Reset after a moment
    setTimeout(() => {
      resetMarkers();
      updateInstruction('Click the map to set your pickup location');
    }, 1500);

  } catch (err) {
    console.error('Error requesting ride:', err);
    showLoading(false);
    updateInstruction('❌ Failed to request ride. Please try again.');
    isRequestingRide = false;
  }
});

resetBtn.addEventListener('click', function () {
  resetMarkers();
  updateInstruction('Click the map to set your pickup location');
});

async function loadRides() {
  try {
    const response = await fetch('/api/rides');
    
    if (!response.ok) {
      throw new Error(`Failed to load rides: ${response.status}`);
    }

    const rides = await response.json();

    // Clear the empty state
    const emptyState = ridesList.querySelector('[style*="italic"]');
    if (emptyState && rides.length > 0) {
      emptyState.remove();
    }

    // Add each ride to the UI
    rides.forEach(ride => {
      addRideToList(ride);
      addRideToMap(ride);
    });

  } catch (err) {
    console.error('Error loading rides:', err);
    instruction.textContent = '⚠️ Could not load rides. Refresh to try again.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadRides();
  
  // Optional: Refresh rides periodically (every 30 seconds)
  // This helps keep the ride list in sync if viewed on multiple tabs
  // setInterval(loadRides, 30000);
});

// Log app status
console.log('🚗 RideBook Rider App Loaded');
console.log('Map centered on London - click to place pickup/dropoff markers');*/


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
const ridesList = document.getElementById('rides-list');
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

function showLoading(show = true) {
  loadingIndicator.classList.toggle('active', show);
  requestBtn.disabled = show;
}

function updateInstruction(text, type = 'info') {
  instruction.className = `instruction ${type === 'warning' ? 'warning' : type === 'success' ? 'success' : ''}`;
  instruction.textContent = text;
}

function addRideToList(ride) {
  const emptyState = ridesList.querySelector('[style*="italic"]');
  if (emptyState) emptyState.remove();

  const li = document.createElement('li');
  li.role = 'listitem';
  
  const statusEmoji = ride.status === 'pending' ? '🟠' : ride.status === 'accepted' ? '🟢' : '✓';

  li.innerHTML = `
    <div class="ride-status-badge">
      <span class="status ${ride.status}">${ride.status.toUpperCase()}</span>
      <span class="ride-time">${statusEmoji} ${ride._id.slice(-6).toUpperCase()}</span>
    </div>
    <div style="margin-top: 0.75rem;">
      <strong> Pickup</strong><br>
      <span style="font-family: var(--font-mono);">${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}</span><br>
      <br>
      <strong> Dropoff</strong><br>
      <span style="font-family: var(--font-mono);">${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}</span>
    </div>
  `;
  
  ridesList.prepend(li);
}

function addRideToMap(ride) {
  // Pickup marker
  L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
    radius: 10,
    color: '#059669',
    fillColor: '#059669',
    fillOpacity: 0.8,
    weight: 2
  }).addTo(map).bindPopup(
    `<strong>Pickup</strong><br>Ride ${ride._id.slice(-4).toUpperCase()}`
  );

  // Dropoff marker
  L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 10,
    color: '#dc2626',
    fillColor: '#dc2626',
    fillOpacity: 0.8,
    weight: 2
  }).addTo(map).bindPopup(
    `<strong>Dropoff</strong><br>Ride ${ride._id.slice(-4).toUpperCase()}`
  );

  // Connect with line
  L.polyline([
    [ride.pickup.lat, ride.pickup.lng],
    [ride.dropoff.lat, ride.dropoff.lng]
  ], {
    color: '#7c3aed',
    weight: 3,
    dashArray: '5, 10',
    opacity: 0.7
  }).addTo(map);

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
    
    clickState = 'dropoff';
    updateInstruction('Now click to set your dropoff location');
    
  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    
    dropoffMarker = L.marker(e.latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup(' Dropoff Location')
      .openPopup();
    
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
    
    addRideToList(savedRide);
    addRideToMap(savedRide);
    
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

async function loadRides() {
  try {
    const response = await fetch('/api/rides');
    
    if (!response.ok) {
      throw new Error(`Failed to load rides: ${response.status}`);
    }

    const rides = await response.json();

    const emptyState = ridesList.querySelector('[style*="italic"]');
    if (emptyState && rides.length > 0) {
      emptyState.remove();
    }

    rides.forEach(ride => {
      addRideToList(ride);
      addRideToMap(ride);
    });

  } catch (err) {
    console.error('Error loading rides:', err);
    updateInstruction(' Could not load rides. Check your connection.', 'warning');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadRides();
  
  // Refresh rides every 10 seconds
  setInterval(loadRides, 10000);
});

console.log(' RideBook Rider App Loaded');
console.log(' Johannesburg, South Africa view');