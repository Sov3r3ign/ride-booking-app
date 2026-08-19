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
let currentRideId = null;
let isCancellingRide = false;

// Display labels for ride types. Seats/pricing are decided server-side —
// this is only for showing a readable name on the summary card.
const RIDE_TYPE_LABELS = {
  ride: 'Ride',
  rideL: 'RideL',
  rideXL: 'RideXL'
};

// DOM References
const sidebar = document.getElementById('sidebar');
const instruction = document.getElementById('instruction');
const rideControls = document.getElementById('ride-controls');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const currentRideContainer = document.getElementById('current-ride');
const fareValueEl = document.getElementById('ride-fare-value');
 
// Mirrors the server's fare formula (server.js) so the rider sees a live
// estimate before confirming. The server remains the source of truth --
// this is just for display.
const BASE_FARE = 25;
const RATE_PER_KM = 8;
const RIDE_TYPE_MULTIPLIERS = { ride: 1, rideL: 1.4, rideXL: 1.8 };
 
// Expands/collapses the bottom booking panel. Expanded while the rider is
// choosing a ride (pickup + dropoff set), collapsed once confirmed or reset.
function setPanelExpanded(expanded) {
  sidebar.classList.toggle('panel-expanded', expanded);
}
 
function updateFareEstimate() {
  if (!pickupMarker || !dropoffMarker) {
    fareValueEl.textContent = '\u2014';
    return;
  }
 
  const distanceKm = pickupMarker.getLatLng().distanceTo(dropoffMarker.getLatLng()) / 1000;
  const rideTypeInput = document.querySelector('input[name="ride-type"]:checked');
  const multiplier = RIDE_TYPE_MULTIPLIERS[rideTypeInput ? rideTypeInput.value : 'ride'] ?? 1;
  const fare = Math.round((BASE_FARE + distanceKm * RATE_PER_KM) * multiplier * 100) / 100;
 
  fareValueEl.textContent = `R${fare.toFixed(2)}`;
}
 
document.getElementById('ride-type-selector').addEventListener('change', updateFareEstimate);
 
// ==========================================
// MAP ROUTING (real road routes, not straight lines)
// ==========================================
// Uses OSRM's public routing API directly from the browser (it supports
// CORS, so no server proxy is needed the way geocoding needs one).
// Falls back to a straight dashed line if the routing request fails.
async function getRoute(pickup, dropoff) {
  const url = `https://router.project-osrm.org/route/v1/driving/` +
    `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}` +
    `?overview=full&geometries=geojson`;
 
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Routing failed: ${response.status}`);
 
    const data = await response.json();
    const route = data.routes && data.routes[0];
    if (!route) throw new Error('No route found');
 
    return {
      // GeoJSON is [lng, lat]; Leaflet wants [lat, lng]
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60
    };
  } catch (err) {
    console.error('Routing error:', err);
    return null;
  }
}
 
function drawRoute(layerGroup, pickupLatLng, dropoffLatLng, route, options = {}) {
  const { color = '#7c3aed', weight = 4, dashArray = null, fitBounds = true } = options;
 
  const path = route
    ? route.coordinates
    : [[pickupLatLng.lat, pickupLatLng.lng], [dropoffLatLng.lat, dropoffLatLng.lng]];
 
  const line = L.polyline(path, {
    color,
    weight,
    opacity: route ? 0.85 : 0.6,
    dashArray: route ? dashArray : '5, 10',
    lineJoin: 'round'
  }).addTo(layerGroup);
 
  if (fitBounds) {
    map.fitBounds(line.getBounds(), { padding: [100, 100], maxZoom: 15 });
  }
 
  return line;
}
 
// Live preview line shown while the rider is choosing pickup/dropoff,
// separate from the confirmed-ride layer so it doesn't fight with it.
const previewRouteLayerGroup = L.layerGroup().addTo(map);
 
async function updateRoutePreview() {
  if (!pickupMarker || !dropoffMarker) return;
 
  const tripInfoEl = document.getElementById('ride-trip-distance');
  if (tripInfoEl) tripInfoEl.textContent = 'Calculating route…';
 
  const route = await getRoute(pickupMarker.getLatLng(), dropoffMarker.getLatLng());
 
  // The rider may have reset or moved on while this was in flight
  if (!pickupMarker || !dropoffMarker) return;
 
  previewRouteLayerGroup.clearLayers();
  drawRoute(previewRouteLayerGroup, pickupMarker.getLatLng(), dropoffMarker.getLatLng(), route, {
    color: '#1e3a8a',
    weight: 5,
    fitBounds: true
  });
 
  if (tripInfoEl) {
    tripInfoEl.textContent = route
      ? `${route.distanceKm.toFixed(1)} km • ~${Math.round(route.durationMin)} min drive`
      : 'Route unavailable — showing straight-line estimate';
  }
}

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
  currentRideId = ride._id;

  const statusEmoji = ride.status === 'pending' ? '🟠' : ride.status === 'accepted' ? '🟢' : ride.status === 'cancelled' ? '✕' : '✓';
  const pickupId = `pickup-${ride._id}`;
  const dropoffId = `dropoff-${ride._id}`;
  const rideTypeLabel = RIDE_TYPE_LABELS[ride.rideType] || 'Ride';

  // Only a still-pending ride (no driver assigned yet) can be cancelled by the rider
  const cancelButtonHtml = ride.status === 'pending'
    ? `<button id="cancel-ride-btn" class="cancel-ride-btn" style="margin-top: 0.75rem; width: 100%;">Cancel Ride</button>`
    : '';

  currentRideContainer.innerHTML = `
    <div class="ride-status-badge">
      <span class="status ${ride.status}">${ride.status.toUpperCase()}</span>
      <span class="ride-time">${statusEmoji} ${ride._id.slice(-6).toUpperCase()}</span>
    </div>
    <div style="margin-top: 0.75rem;">
      <strong> Ride Type</strong> ${rideTypeLabel} (${ride.seats || 2} seats)<br>
      <strong> Pickup</strong><br>
      <span id="${pickupId}">Loading location...</span><br>
      <br>
      <strong> Dropoff</strong><br>
      <span id="${dropoffId}">Loading location...</span><br>
      <br>
      <strong> Distance</strong> ${ride.distance != null ? ride.distance.toFixed(2) + ' km' : 'N/A'}<br>
      <strong> Fare</strong> ${ride.fare != null ? 'R' + ride.fare.toFixed(2) : 'N/A'}
    </div>
    ${cancelButtonHtml}
  `;

  const cancelBtn = document.getElementById('cancel-ride-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => cancelRide(ride._id));
  }

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
  // Clear the previous ride's markers/line -- only the current request is shown
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
 
  // Draw the real road route (falls back to a straight dashed line if
  // routing is unavailable). Fetched async so markers appear immediately.
  const pickupLatLng = L.latLng(ride.pickup.lat, ride.pickup.lng);
  const dropoffLatLng = L.latLng(ride.dropoff.lat, ride.dropoff.lng);
 
  // Draw a placeholder straight line immediately so there's no gap while
  // the route request is in flight, then swap it for the real route.
  const placeholderLine = drawRoute(currentRideLayerGroup, pickupLatLng, dropoffLatLng, null, {
    color: '#7c3aed'
  });
 
  getRoute(pickupLatLng, dropoffLatLng).then(route => {
    if (!route) return;
    // Ride may have been replaced by a newer one while this was in flight
    if (!currentRideLayerGroup.hasLayer(placeholderLine)) return;
 
    currentRideLayerGroup.removeLayer(placeholderLine);
    drawRoute(currentRideLayerGroup, pickupLatLng, dropoffLatLng, route, {
      color: '#7c3aed',
      weight: 4
    });
  });
}

function resetMarkers() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  
  pickupMarker = null;
  dropoffMarker = null;
  clickState = 'pickup';

  // Back to the default ride size for the next request
  const defaultTypeInput = document.querySelector('input[name="ride-type"][value="ride"]');
  if (defaultTypeInput) defaultTypeInput.checked = true;

  const pickupAddressEl = document.getElementById('pickup-address');
  const dropoffAddressEl = document.getElementById('dropoff-address');
  if (pickupAddressEl) pickupAddressEl.textContent = '—';
  if (dropoffAddressEl) dropoffAddressEl.textContent = '—';
  
  updateInstruction('Click the map to set your pickup location');
  rideControls.classList.add('hidden');
  updateFareEstimate();
  previewRouteLayerGroup.clearLayers();
  const tripInfoEl = document.getElementById('ride-trip-distance');
  if (tripInfoEl) tripInfoEl.textContent = 'Calculating route…';
  // Ride confirmed or dismissed — collapse the booking panel back down.
  setPanelExpanded(false);
}

// Sets the pickup marker + address from any lat/lng source (a map click or
// the device's GPS) and advances the flow to picking a dropoff — unless a
// dropoff was already chosen, in which case the ride stays ready to confirm.
function setPickupLocation(latlng, { popupPrefix = ' Pickup Location' } = {}) {
  if (pickupMarker) map.removeLayer(pickupMarker);

  pickupMarker = L.marker(latlng, { icon: greenIcon })
    .addTo(map)
    .bindPopup(popupPrefix)
    .openPopup();

  const pickupAddressEl = document.getElementById('pickup-address');
  if (pickupAddressEl) pickupAddressEl.textContent = 'Loading…';

  getLocationName(latlng.lat, latlng.lng).then(name => {
    pickupMarker.setPopupContent(` Pickup: ${name}`);
    if (pickupAddressEl) pickupAddressEl.textContent = name;
  });

  if (dropoffMarker) {
    clickState = 'done';
    updateInstruction(' Ready! Confirm your ride', 'success');
  } else {
    clickState = 'dropoff';
    updateInstruction('Now click to set your dropoff location');
  }
}

// ==========================================
// "USE MY LOCATION" (GPS)
// ==========================================
const useLocationBtn = document.getElementById('use-location-btn');

function useCurrentLocation() {
  if (isRequestingRide) return;

  if (!('geolocation' in navigator)) {
    updateInstruction('Geolocation is not supported on this device.', 'warning');
    return;
  }

  useLocationBtn.disabled = true;
  const originalLabel = useLocationBtn.innerHTML;
  useLocationBtn.innerHTML = 'Locating…';
  updateInstruction('Getting your current location…');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);

      setPickupLocation(latlng, { popupPrefix: ' Pickup: Your Location' });
      map.setView(latlng, 15);

      useLocationBtn.disabled = false;
      useLocationBtn.innerHTML = originalLabel;

      // If a dropoff was already chosen, refresh the route/fare against
      // the new pickup point.
      if (dropoffMarker) {
        updateFareEstimate();
        updateRoutePreview();
      }
    },
    (error) => {
      useLocationBtn.disabled = false;
      useLocationBtn.innerHTML = originalLabel;

      const message = error.code === error.PERMISSION_DENIED
        ? 'Location access denied. Click the map to set your pickup location instead.'
        : 'Could not get your location. Click the map to set your pickup location instead.';

      updateInstruction(message, 'warning');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

useLocationBtn.addEventListener('click', useCurrentLocation);

map.on('click', function (e) {
  if (isRequestingRide) return;

  if (clickState === 'pickup') {
    setPickupLocation(e.latlng);

  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    
    dropoffMarker = L.marker(e.latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup(' Dropoff Location')
      .openPopup();

    const dropoffAddressEl = document.getElementById('dropoff-address');
    if (dropoffAddressEl) dropoffAddressEl.textContent = 'Loading…';

    getLocationName(e.latlng.lat, e.latlng.lng).then(name => {
      dropoffMarker.setPopupContent(` Dropoff: ${name}`);
      if (dropoffAddressEl) dropoffAddressEl.textContent = name;
    });
    
    clickState = 'done';
    updateInstruction(' Ready! Confirm your ride', 'success');
    rideControls.classList.remove('hidden');
    updateFareEstimate();
    updateRoutePreview();
    // Rider is now choosing a ride — slide the booking panel up so ride
    // options, pickup/dropoff, price and the confirm button are all
    // easy to see and interact with.
    setPanelExpanded(true);
  }
});

requestBtn.addEventListener('click', async function () {
  if (!pickupMarker || !dropoffMarker) return;
  if (isRequestingRide) return;

  isRequestingRide = true;
  showLoading(true);
  updateInstruction(' Submitting your ride request...');

  try {
    const rideTypeInput = document.querySelector('input[name="ride-type"]:checked');
    const rideData = {
      pickup: {
        lat: pickupMarker.getLatLng().lat,
        lng: pickupMarker.getLatLng().lng
      },
      dropoff: {
        lat: dropoffMarker.getLatLng().lat,
        lng: dropoffMarker.getLatLng().lng
      },
      rideType: rideTypeInput ? rideTypeInput.value : 'ride'
    };

    const response = await fetch(`/api/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rideData)
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const savedRide = await response.json();
    
    previewRouteLayerGroup.clearLayers();
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
  } finally {
    // Reset so the rider can request another ride afterward (previously this
    // stayed true forever after a successful request, silently disabling
    // the button for the rest of the session).
    isRequestingRide = false;
  }
});

resetBtn.addEventListener('click', function () {
  resetMarkers();
  updateInstruction('Click the map to set your pickup location');
});

async function cancelRide(rideId) {
  if (isCancellingRide) return;
  if (!confirm('Cancel this ride request?')) return;

  isCancellingRide = true;
  const cancelBtn = document.getElementById('cancel-ride-btn');
  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling...';
  }

  try {
    const response = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const cancelledRide = await response.json();

    showCurrentRide(cancelledRide);
    currentRideLayerGroup.clearLayers();
    updateInstruction('Ride cancelled.', 'warning');

  } catch (err) {
    console.error('Error cancelling ride:', err);
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel Ride';
    }
    alert(err.message || 'Failed to cancel ride. Please try again.');
  } finally {
    isCancellingRide = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Rider page starts on a clean slate — past rides live on the History page
});

console.log(' RideBook Rider App Loaded');
console.log(' Johannesburg, South Africa view');