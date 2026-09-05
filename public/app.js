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

// The rider's current pending/accepted ride
let activeRide = null;
let activeRidePollInterval = null;

// Display labels for ride types. RIDE_TYPES itself is fetched from
// GET /api/ride-types below (server.js is the single source of truth for
// seats/multipliers) — these are just presentational fallbacks used until
// that fetch resolves, or if it fails.
const RIDE_TYPE_LABELS = {
  ride: 'Ride',
  rideL: 'RideL',
  rideXL: 'RideXL'
};

let RIDE_TYPES = {
  ride:   { label: 'Ride',   seats: 2, multiplier: 1 },
  rideL:  { label: 'RideL',  seats: 4, multiplier: 1.4 },
  rideXL: { label: 'RideXL', seats: 6, multiplier: 1.8 }
};

async function loadRideTypes() {
  try {
    const response = await fetch('/api/ride-types');
    if (!response.ok) return;
    const data = await response.json();
    if (data && Object.keys(data).length) {
      RIDE_TYPES = data;
      updateFareEstimate();
    }
  } catch (err) {
    console.error('Could not load ride types, using local defaults:', err);
  }
}
loadRideTypes();

// DOM References
const sidebar = document.getElementById('sidebar');
const instruction = document.getElementById('instruction');
const rideControls = document.getElementById('ride-controls');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const currentRideContainer = document.getElementById('current-ride');
const fareValueEl = document.getElementById('ride-fare-value');

// Mirrors the server's fare formula (base + per-km rate are stable enough
// to keep here; the multiplier itself now comes from RIDE_TYPES above so
// it can never drift from what the server actually bills).
const BASE_FARE = 25;
const RATE_PER_KM = 8;

// The most recently resolved driving route between pickup and dropoff.
// updateFareEstimate() uses this so the quoted fare matches the real-road
// distance the server will bill — not a straight-line shortcut through it.
let currentRoute = null;

function isBookingLocked() {
  return !!activeRide;
}

function setPanelExpanded(expanded) {
  sidebar.classList.toggle('panel-expanded', expanded);

  // #map is flex:1 next to #sidebar, so its actual pixel height changes
  // every time the panel expands or collapses — which happens right when
  // a ride is requested or accepted. Leaflet caches its container size and
  // only re-measures on a window resize event, so without telling it
  // explicitly here, the map keeps rendering at its old size: grey gaps
  // where tiles haven't loaded for the newly-revealed area, markers drawn
  // at the wrong screen position, and clicks translating to the wrong
  // lat/lng. Calling this immediately handles instant layout changes
  // (including prefers-reduced-motion, which disables the CSS transition
  // below); the transitionend listener re-measures again once the
  // animated resize has actually finished, so tiles land correctly at the
  // final size rather than a mid-animation one.
  map.invalidateSize();
}

sidebar.addEventListener('transitionend', (e) => {
  if (e.propertyName === 'height') {
    map.invalidateSize();
  }
});

function updateFareEstimate() {
  if (!pickupMarker || !dropoffMarker) {
    fareValueEl.textContent = '\u2014';
    return;
  }

  const distanceKm = currentRoute
    ? currentRoute.distanceKm
    : pickupMarker.getLatLng().distanceTo(dropoffMarker.getLatLng()) / 1000;
  const rideTypeInput = document.querySelector('input[name="ride-type"]:checked');
  const multiplier = RIDE_TYPES[rideTypeInput ? rideTypeInput.value : 'ride']?.multiplier ?? 1;
  const fare = Math.round((BASE_FARE + distanceKm * RATE_PER_KM) * multiplier * 100) / 100;

  fareValueEl.textContent = `R${fare.toFixed(2)}`;
}

document.getElementById('ride-type-selector').addEventListener('change', updateFareEstimate);

// ==========================================
// MAP ROUTING
// ==========================================
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

const previewRouteLayerGroup = L.layerGroup().addTo(map);

async function updateRoutePreview() {
  if (!pickupMarker || !dropoffMarker) return;

  const tripInfoEl = document.getElementById('ride-trip-distance');
  if (tripInfoEl) tripInfoEl.textContent = 'Calculating route…';

  const route = await getRoute(pickupMarker.getLatLng(), dropoffMarker.getLatLng());

  if (!pickupMarker || !dropoffMarker) return;

  currentRoute = route;
  updateFareEstimate();

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

// ==========================================
// RIDE STATUS DISPLAY
// ==========================================

function getStatusEmoji(status) {
  const statusMap = {
    'pending': '🟠',
    'accepted': '🟢',
    'arrived': '🚗',
    'in_progress': '🔄',
    'completed': '✅',
    'cancelled': '✕'
  };
  return statusMap[status] || '🟠';
}

function getStatusLabel(status) {
  const statusMap = {
    'pending': 'Searching for a driver...',
    'accepted': 'Driver assigned!',
    'arrived': 'Driver has arrived',
    'in_progress': 'Trip in progress',
    'completed': 'Trip completed',
    'cancelled': 'Cancelled'
  };
  return statusMap[status] || status;
}

function getStatusColor(status) {
  const statusMap = {
    'pending': 'var(--color-accent-warning)',
    'accepted': 'var(--color-accent-success)',
    'arrived': 'var(--color-accent-primary)',
    'in_progress': 'var(--color-accent-blue)',
    'completed': 'var(--color-accent-success)',
    'cancelled': 'var(--color-accent-danger)'
  };
  return statusMap[status] || 'var(--color-text-tertiary)';
}

function showCurrentRide(ride) {
  currentRideId = ride._id;

  const statusEmoji = getStatusEmoji(ride.status);
  const statusLabel = getStatusLabel(ride.status);
  const statusColor = getStatusColor(ride.status);
  const pickupId = `pickup-${ride._id}`;
  const dropoffId = `dropoff-${ride._id}`;
  const rideTypeLabel = RIDE_TYPE_LABELS[ride.rideType] || 'Ride';

  // Build driver info section if ride is accepted or beyond
  let driverInfoHtml = '';
  if (ride.status === 'accepted' || ride.status === 'arrived' || ride.status === 'in_progress') {
    // For demo purposes, use mock driver data
    // In production, this would come from the database
    const driverName = ride.driverName || 'Sam Driver';
    const driverRating = ride.driverRating || '4.9';
    const vehicle = ride.vehicle || 'Toyota Corolla';
    const registration = ride.registration || 'CA 123-456';
    const eta = ride.eta || '5 min';

    driverInfoHtml = `
      <div style="margin-top: 1rem; padding: 1rem; background: var(--color-card); border-radius: var(--radius-lg); border: 1px solid var(--color-border);">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-blue)); display: flex; align-items: center; justify-content: center; font-weight: 700; color: white; font-size: 1.2rem; flex-shrink: 0;">
            ${driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <div style="font-weight: 700; color: var(--color-text-primary);">${driverName}</div>
            <div style="font-size: 0.85rem; color: var(--color-accent-warning);">★ ${driverRating}</div>
          </div>
        </div>
        <div style="font-size: 0.85rem; color: var(--color-text-secondary);">
          <div><strong style="color: var(--color-text-primary);">Vehicle:</strong> ${vehicle}</div>
          <div><strong style="color: var(--color-text-primary);">Registration:</strong> ${registration}</div>
          <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(0, 194, 168, 0.1); border-radius: var(--radius-md); border: 1px solid var(--color-accent-primary);">
            <strong style="color: var(--color-accent-primary);">⏱ ETA:</strong> ${eta}
          </div>
        </div>
      </div>
    `;
  }

  // Show completion status for completed rides
  let completionHtml = '';
  if (ride.status === 'completed') {
    completionHtml = `
      <div style="margin-top: 1rem; padding: 1rem; background: rgba(34, 197, 94, 0.1); border-radius: var(--radius-lg); border: 1px solid var(--color-accent-success); text-align: center;">
        <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">✅</div>
        <div style="font-weight: 600; color: var(--color-accent-success);">Trip completed successfully!</div>
        <div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-top: 0.25rem;">Thank you for riding with us.</div>
      </div>
    `;
  }

  // Show loading indicator for pending status
  let loadingIndicatorHtml = '';
  if (ride.status === 'pending') {
    loadingIndicatorHtml = `
      <div style="display: flex; align-items: center; gap: 0.75rem; margin: 0.75rem 0; padding: 0.5rem; background: rgba(245, 158, 11, 0.05); border-radius: var(--radius-md);">
        <div class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
        <span style="color: var(--color-text-secondary); font-size: 0.85rem;">Searching for nearby drivers...</span>
      </div>
    `;
  }

  // Show arrived notification
  let arrivedHtml = '';
  if (ride.status === 'arrived') {
    arrivedHtml = `
      <div style="margin-top: 0.5rem; padding: 0.75rem; background: rgba(0, 194, 168, 0.1); border-radius: var(--radius-md); border: 1px solid var(--color-accent-primary); text-align: center;">
        <div style="font-weight: 600; color: var(--color-accent-primary);">🚗 Your driver has arrived!</div>
      </div>
    `;
  }

  // Only show cancel button for pending rides
  const cancelButtonHtml = (ride.status === 'pending')
    ? `<button id="cancel-ride-btn" class="cancel-ride-btn" style="margin-top: 0.75rem; width: 100%;">Cancel Ride</button>`
    : '';

  // Show "Request Another" button once the ride is over (completed or
  // cancelled) so the ticket doesn't just sit there with no way to
  // dismiss it and get back to a clean map.
  const requestAnotherHtml = (ride.status === 'completed' || ride.status === 'cancelled')
    ? `<button id="request-another-btn" class="accept-btn" style="margin-top: 0.75rem; width: 100%;">📱 Request Another Ride</button>`
    : '';

  currentRideContainer.innerHTML = `
    <div class="ride-status-badge">
      <span class="status ${ride.status}" style="background: ${statusColor}20; color: ${statusColor};">
        ${statusEmoji} ${statusLabel}
      </span>
      <span class="ride-time">#${ride._id.slice(-6).toUpperCase()}</span>
    </div>
    ${loadingIndicatorHtml}
    ${arrivedHtml}

    <div class="route-line" style="margin-top: 0.75rem;">
      <div class="route-line-track" aria-hidden="true">
        <span class="route-stop-dot pickup"></span>
        <span class="route-thread"></span>
        <span class="route-stop-dot dropoff"></span>
      </div>
      <div class="route-line-stops">
        <div class="route-stop">
          <span class="route-stop-label">Pickup</span>
          <span class="route-stop-value" id="${pickupId}">Loading location…</span>
        </div>
        <div class="route-stop">
          <span class="route-stop-label">Dropoff</span>
          <span class="route-stop-value" id="${dropoffId}">Loading location…</span>
        </div>
      </div>
    </div>

    <div class="ride-fare-estimate" style="margin-top: 0.75rem;">
      <div class="ride-fare-row">
        <span class="ride-fare-label">${rideTypeLabel} · ${ride.seats || 2} seats</span>
        <span class="ride-fare-trip">${ride.distance != null ? ride.distance.toFixed(2) + ' km' : 'N/A'}</span>
      </div>
      <div class="ride-fare-divider"></div>
      <div class="ride-fare-row ride-fare-row-total">
        <span class="ride-fare-label">Fare</span>
        <span class="ride-fare-value">${ride.fare != null ? 'R' + ride.fare.toFixed(2) : 'N/A'}</span>
      </div>
    </div>

    ${driverInfoHtml}
    ${completionHtml}
    ${cancelButtonHtml}
    ${requestAnotherHtml}
  `;

  const cancelBtn = document.getElementById('cancel-ride-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => cancelRide(ride._id));
  }

  const requestAnotherBtn = document.getElementById('request-another-btn');
  if (requestAnotherBtn) {
    requestAnotherBtn.addEventListener('click', () => {
      activeRide = null;
      stopActiveRidePolling();
      currentRideLayerGroup.clearLayers();
      currentRideContainer.innerHTML = `
        <p style="color: var(--color-text-tertiary); font-style: italic;">
          No active ride. Set a pickup and dropoff on the map to request one.
        </p>
      `;
      updateInstruction('Click the map to set your pickup location');
      resetMarkers();
    });
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

function stopActiveRidePolling() {
  if (activeRidePollInterval) {
    clearInterval(activeRidePollInterval);
    activeRidePollInterval = null;
  }
}

function startActiveRidePolling() {
  stopActiveRidePolling();

  activeRidePollInterval = setInterval(async () => {
    if (!activeRide) {
      stopActiveRidePolling();
      return;
    }

    try {
      const response = await fetch(`/api/rides/${activeRide._id}`);
      if (!response.ok) return;

      const ride = await response.json();

      if (ride.status !== activeRide.status) {
        activeRide = ride;
        showCurrentRide(ride);

        if (ride.status === 'completed' || ride.status === 'cancelled') {
          activeRide = null;
          stopActiveRidePolling();
          if (ride.status === 'completed') {
            updateInstruction(' Trip completed! Click "Request Another Ride" to book again.', 'success');
          } else {
            updateInstruction('Ride cancelled. Click the map to request a new one.', 'warning');
          }
        } else if (ride.status === 'accepted' || ride.status === 'arrived' || ride.status === 'in_progress') {
          updateInstruction(` ${getStatusLabel(ride.status)}`, 'success');
        }
      }
    } catch (err) {
      console.error('Error polling ride status:', err);
    }
  }, 3000);
}

function addRideToMap(ride) {
  currentRideLayerGroup.clearLayers();

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

  const dropoffMarker = L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 10,
    color: '#dc2626',
    fillColor: '#dc2626',
    fillOpacity: 0.8,
    weight: 2
  }).addTo(currentRideLayerGroup).bindPopup(`<strong>Destination</strong><br>Ride ${ride._id.slice(-4).toUpperCase()}`);

  getLocationName(ride.dropoff.lat, ride.dropoff.lng).then(name => {
    dropoffMarker.setPopupContent(`<strong>Destination</strong><br>${name}`);
  });

  const pickupLatLng = L.latLng(ride.pickup.lat, ride.pickup.lng);
  const dropoffLatLng = L.latLng(ride.dropoff.lat, ride.dropoff.lng);

  const placeholderLine = drawRoute(currentRideLayerGroup, pickupLatLng, dropoffLatLng, null, {
    color: '#7c3aed'
  });

  getRoute(pickupLatLng, dropoffLatLng).then(route => {
    if (!route) return;
    if (!currentRideLayerGroup.hasLayer(placeholderLine)) return;

    currentRideLayerGroup.removeLayer(placeholderLine);
    drawRoute(currentRideLayerGroup, pickupLatLng, dropoffLatLng, route, {
      color: '#7c3aed',
      weight: 4
    });
  });
}

function resetMarkers({ preserveActiveRideUI = false } = {}) {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);

  pickupMarker = null;
  dropoffMarker = null;
  clickState = 'pickup';
  currentRoute = null;

  const defaultTypeInput = document.querySelector('input[name="ride-type"][value="ride"]');
  if (defaultTypeInput) defaultTypeInput.checked = true;

  const pickupAddressEl = document.getElementById('pickup-address');
  const dropoffAddressEl = document.getElementById('dropoff-address');
  if (pickupAddressEl) pickupAddressEl.textContent = '—';
  if (dropoffAddressEl) dropoffAddressEl.textContent = '—';

  rideControls.classList.add('hidden');
  updateFareEstimate();
  previewRouteLayerGroup.clearLayers();
  const tripInfoEl = document.getElementById('ride-trip-distance');
  if (tripInfoEl) tripInfoEl.textContent = 'Calculating route…';

  // This runs both when the user truly backs out to an empty map (Reset
  // button, cancel, dismissing a completed ride) AND ~1.5s after a ride is
  // successfully requested, just to clear the pickup/dropoff pins. In the
  // second case there's now an active ride on screen, so the panel must
  // stay open and the instruction text must stay put — collapsing the
  // panel and reverting to "click the map" here used to yank the ride
  // ticket out from under the rider right after they saw it, and stomp
  // the "Searching for a driver…" message a moment after it appeared.
  if (!preserveActiveRideUI) {
    updateInstruction('Click the map to set your pickup location');
    setPanelExpanded(false);
  }
}

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
    updateInstruction('Now click to set your destination');
  }
}

// ==========================================
// "USE MY LOCATION" (GPS)
// ==========================================
const useLocationBtn = document.getElementById('use-location-btn');

function useCurrentLocation() {
  if (isRequestingRide) return;
  if (isBookingLocked()) {
    updateInstruction(' You already have an active ride. Cancel it first to request another.', 'warning');
    return;
  }

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
  if (isBookingLocked()) {
    updateInstruction(' You already have an active ride. Cancel it first to request another.', 'warning');
    return;
  }

  if (clickState === 'pickup') {
    setPickupLocation(e.latlng);

  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);

    dropoffMarker = L.marker(e.latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup(' Destination')
      .openPopup();

    const dropoffAddressEl = document.getElementById('dropoff-address');
    if (dropoffAddressEl) dropoffAddressEl.textContent = 'Loading…';

    getLocationName(e.latlng.lat, e.latlng.lng).then(name => {
      dropoffMarker.setPopupContent(` Destination: ${name}`);
      if (dropoffAddressEl) dropoffAddressEl.textContent = name;
    });

    clickState = 'done';
    updateInstruction(' Ready! Confirm your ride', 'success');
    rideControls.classList.remove('hidden');
    updateFareEstimate();
    updateRoutePreview();
    setPanelExpanded(true);
  }
});

requestBtn.addEventListener('click', async function () {
  if (!pickupMarker || !dropoffMarker) return;
  if (isRequestingRide) return;
  if (isBookingLocked()) {
    updateInstruction(' You already have an active ride. Cancel it first to request another.', 'warning');
    return;
  }

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
      rideType: rideTypeInput ? rideTypeInput.value : 'ride',
      riderUsername: session.username
    };

    const response = await fetch(`/api/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rideData)
    });

    if (response.status === 409) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.activeRide) {
        activeRide = errorData.activeRide;
        addRideToMap(activeRide);
        showCurrentRide(activeRide);
        startActiveRidePolling();
        setPanelExpanded(true);
        updateInstruction(' You already have an active ride.', 'warning');
      }
      throw new Error(errorData.error || 'You already have an active ride.');
    }

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const savedRide = await response.json();
    activeRide = savedRide;

    previewRouteLayerGroup.clearLayers();
    addRideToMap(savedRide);
    showCurrentRide(savedRide);
    startActiveRidePolling();
    setPanelExpanded(true);

    updateInstruction(' Searching for a driver...', 'success');
    showLoading(false);

    setTimeout(() => {
      resetMarkers({ preserveActiveRideUI: true });
    }, 1500);

  } catch (err) {
    console.error('Error requesting ride:', err);
    showLoading(false);
    updateInstruction(err.message && isBookingLocked() ? err.message : ' Failed to request ride. Please try again.', 'warning');
  } finally {
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

    activeRide = null;
    stopActiveRidePolling();

    showCurrentRide(cancelledRide);
    currentRideLayerGroup.clearLayers();
    updateInstruction('Ride cancelled. Click the map to request a new one.', 'warning');

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

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch(`/api/rides/active/${encodeURIComponent(session.username)}`);
    if (!response.ok) return;

    const ride = await response.json();
    if (!ride) return;

    activeRide = ride;
    addRideToMap(ride);
    showCurrentRide(ride);
    startActiveRidePolling();
    setPanelExpanded(true);

    const statusMessages = {
      'pending': ' Searching for a driver...',
      'accepted': ' Driver assigned! Tracking your ride...',
      'arrived': ' Your driver has arrived!',
      'in_progress': ' Trip in progress...',
      'completed': ' Trip completed!',
      'cancelled': ' Ride cancelled.'
    };

    updateInstruction(
      statusMessages[ride.status] || ' You have an active ride.',
      ride.status === 'pending' ? 'warning' : 'success'
    );
  } catch (err) {
    console.error('Error checking for an active ride:', err);
  }
});

console.log(' RideBook Rider App Loaded');
console.log(' Johannesburg, South Africa view');