const session = getCurrentSession();
if (!session || session.role !== 'driver') {
  window.location.href = '/login.html';
}

const driverRides = document.getElementById('driver-rides');
const statPending = document.getElementById('stat-pending');
const statAccepted = document.getElementById('stat-accepted');
const statCompleted = document.getElementById('stat-completed');

let pollInterval = null;
let isProcessingRequest = false;
let currentRequestRideId = null;

// Single source of truth for ride-type display labels, fetched from the
// server (the same endpoint the rider app uses) so a fare/seat change on
// the backend can never silently drift out of sync with what the driver
// dashboard displays. Falls back to these defaults until the fetch
// resolves, or if it fails.
let RIDE_TYPE_LABELS = { ride: 'Ride', rideL: 'RideL', rideXL: 'RideXL' };

async function loadRideTypeLabels() {
  try {
    const response = await fetch('/api/ride-types');
    if (!response.ok) return;
    const data = await response.json();
    if (data && Object.keys(data).length) {
      RIDE_TYPE_LABELS = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value.label || key])
      );
    }
  } catch (err) {
    console.error('Could not load ride types, using local defaults:', err);
  }
}
loadRideTypeLabels();

// DOM elements for the ride request overlay
const rideRequestOverlay = document.getElementById('ride-request-overlay');
const acceptRideBtn = document.getElementById('accept-ride-btn');
const declineRideBtn = document.getElementById('decline-ride-btn');

// ==========================================
// MAP OF REQUESTED RIDES
// ==========================================
const driverMap = L.map('driver-map').setView([-26.2023, 28.0436], 12);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(driverMap);

const rideMarkersLayer = L.layerGroup().addTo(driverMap);
const routeLayerGroup = L.layerGroup().addTo(driverMap);

// Reverse-geocoding cache
const geocodeCache = new Map();

async function getLocationName(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  try {
    const response = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
    if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
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

// Get route info for the ride
async function getRouteInfo(pickup, dropoff) {
  const url = `https://router.project-osrm.org/route/v1/driving/` +
    `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}` +
    `?overview=false`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Routing failed: ${response.status}`);
    const data = await response.json();
    const route = data.routes && data.routes[0];
    if (!route) throw new Error('No route found');
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60
    };
  } catch (err) {
    console.error('Routing error:', err);
    return null;
  }
}

// Full route with geometry, used to draw the turn-by-turn path on the map
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
  const { color = '#7c3aed', weight = 4, dashArray = null } = options;

  const path = route
    ? route.coordinates
    : [[pickupLatLng.lat, pickupLatLng.lng], [dropoffLatLng.lat, dropoffLatLng.lng]];

  return L.polyline(path, {
    color,
    weight,
    opacity: route ? 0.85 : 0.6,
    dashArray: route ? dashArray : '5, 10',
    lineJoin: 'round'
  }).addTo(layerGroup);
}

// Draw pickup + dropoff markers and the driving route for an accepted ride
function showAcceptedRideRoute(ride) {
  routeLayerGroup.clearLayers();

  const pickupLatLng = L.latLng(ride.pickup.lat, ride.pickup.lng);
  const dropoffLatLng = L.latLng(ride.dropoff.lat, ride.dropoff.lng);

  L.circleMarker(pickupLatLng, {
    radius: 9,
    color: '#059669',
    fillColor: '#059669',
    fillOpacity: 0.85,
    weight: 2
  }).addTo(routeLayerGroup).bindPopup('<strong>Pickup</strong>');

  L.circleMarker(dropoffLatLng, {
    radius: 9,
    color: '#dc2626',
    fillColor: '#dc2626',
    fillOpacity: 0.85,
    weight: 2
  }).addTo(routeLayerGroup).bindPopup('<strong>Dropoff</strong>');

  // Draw a straight placeholder line immediately, then swap in the real
  // driving route once OSRM responds
  const placeholderLine = drawRoute(routeLayerGroup, pickupLatLng, dropoffLatLng, null);
  driverMap.fitBounds(placeholderLine.getBounds(), { padding: [80, 80], maxZoom: 15 });

  getRoute(pickupLatLng, dropoffLatLng).then(route => {
    if (!route) return;
    if (!routeLayerGroup.hasLayer(placeholderLine)) return; // ride changed while we were fetching

    routeLayerGroup.removeLayer(placeholderLine);
    drawRoute(routeLayerGroup, pickupLatLng, dropoffLatLng, route);
    driverMap.fitBounds(L.latLngBounds(route.coordinates), { padding: [80, 80], maxZoom: 15 });
  });
}

let hasFitBounds = false;

// Track which accepted ride's route is currently drawn so we don't
// re-fetch/re-draw it on every poll
let displayedAcceptedRideId = null;

function syncAcceptedRideRoute(rides) {
  const acceptedRide = rides.find(r => r.status === 'accepted');

  if (!acceptedRide) {
    if (displayedAcceptedRideId !== null) {
      routeLayerGroup.clearLayers();
      displayedAcceptedRideId = null;
    }
    return;
  }

  if (acceptedRide._id === displayedAcceptedRideId) return;

  displayedAcceptedRideId = acceptedRide._id;
  showAcceptedRideRoute(acceptedRide);
}

function popupContentFor(ride) {
  const rideTypeLabel = RIDE_TYPE_LABELS[ride.rideType] || 'Ride';

  let actionButton = '';
  if (ride.status === 'pending') {
    actionButton = `<button class="accept-btn" onclick="showRideRequest('${ride._id}')">✓ View & Accept</button>`;
  } else if (ride.status === 'accepted') {
    actionButton = `<button class="complete-btn" onclick="updateRide(this, '${ride._id}', 'completed')">✓ Complete Ride</button>`;
  }

  return `
    <div class="ride-popup">
      <span class="status ${ride.status}">${ride.status.toUpperCase()}</span><br>
      <strong>${rideTypeLabel}</strong> (${ride.seats || 2} seats)<br>
      Pickup: <span id="popup-pickup-${ride._id}">Loading location...</span><br>
      Fare: ${ride.fare != null ? 'R' + ride.fare.toFixed(2) : 'N/A'}
      ${actionButton}
    </div>
  `;
}

function updateMapMarkers(rides) {
  rideMarkersLayer.clearLayers();

  if (rides.length === 0) return;

  rides.forEach(ride => {
    const color = ride.status === 'accepted' ? '#059669' : '#d97706';

    const marker = L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
      radius: 10,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2
    }).addTo(rideMarkersLayer);

    marker.bindPopup(popupContentFor(ride));

    marker.on('popupopen', () => {
      getLocationName(ride.pickup.lat, ride.pickup.lng).then(name => {
        const el = document.getElementById(`popup-pickup-${ride._id}`);
        if (el) el.textContent = name;
      });
    });
  });

  if (!hasFitBounds) {
    const bounds = L.latLngBounds(rides.map(r => [r.pickup.lat, r.pickup.lng]));
    driverMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    hasFitBounds = true;
  }
}

function updateStats(rides) {
  const pending = rides.filter(r => r.status === 'pending').length;
  const accepted = rides.filter(r => r.status === 'accepted').length;
  const completed = rides.filter(r => r.status === 'completed').length;

  animateStat(statPending, pending);
  animateStat(statAccepted, accepted);
  animateStat(statCompleted, completed);
}

function animateStat(element, newValue) {
  const currentValue = parseInt(element.textContent);
  if (currentValue !== newValue) {
    element.style.transform = 'scale(1.2)';
    element.textContent = newValue;
    setTimeout(() => {
      element.style.transform = 'scale(1)';
    }, 100);
  }
}

function getTimeAgo(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ==========================================
// RIDE REQUEST OVERLAY FUNCTIONS
// ==========================================

// Show the ride request overlay with ride details
async function showRideRequest(rideId) {
  if (isProcessingRequest) return;
  
  try {
    const response = await fetch(`/api/rides/${rideId}`);
    if (!response.ok) throw new Error(`Failed to load ride: ${response.status}`);
    
    const ride = await response.json();
    
    // Only show pending rides
    if (ride.status !== 'pending') {
      return;
    }
    
    currentRequestRideId = rideId;
    
    // Get rider info (from the ride or a separate endpoint)
    // For now, we'll use the riderUsername from the ride
    const riderName = ride.riderUsername || 'Rider';
    const riderInitials = riderName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    
    // Set rider info
    document.getElementById('rider-avatar').textContent = riderInitials;
    document.getElementById('rider-name').textContent = riderName;
    document.getElementById('rider-username').textContent = `@${ride.riderUsername || 'rider'}`;
    document.getElementById('rider-rating').textContent = '4.8'; // Default rating
    
    // Get location names
    const pickupName = await getLocationName(ride.pickup.lat, ride.pickup.lng);
    const dropoffName = await getLocationName(ride.dropoff.lat, ride.dropoff.lng);
    
    document.getElementById('request-pickup').textContent = pickupName;
    document.getElementById('request-dropoff').textContent = dropoffName;
    
    // Get route info
    const routeInfo = await getRouteInfo(ride.pickup, ride.dropoff);
    
    if (routeInfo) {
      document.getElementById('request-distance').textContent = `${routeInfo.distanceKm.toFixed(1)} km`;
      document.getElementById('request-time').textContent = `${Math.round(routeInfo.durationMin)} min`;
    } else {
      document.getElementById('request-distance').textContent = '--';
      document.getElementById('request-time').textContent = '--';
    }
    
    // Set ride type
        document.getElementById('request-ride-type').textContent = RIDE_TYPE_LABELS[ride.rideType] || 'Ride';
    
    // Set fare
    document.getElementById('request-fare').textContent = ride.fare != null ? `R${ride.fare.toFixed(2)}` : 'R--.--';
    
    // Show the overlay
    rideRequestOverlay.classList.add('active');
    
    // Enable buttons
    acceptRideBtn.disabled = false;
    declineRideBtn.disabled = false;
    
  } catch (err) {
    console.error('Error showing ride request:', err);
  }
}

// Hide the ride request overlay
function hideRideRequest() {
  rideRequestOverlay.classList.remove('active');
  currentRequestRideId = null;
}

// Accept the ride
async function acceptRide() {
  if (isProcessingRequest || !currentRequestRideId) return;
  
  isProcessingRequest = true;
  acceptRideBtn.disabled = true;
  declineRideBtn.disabled = true;
  acceptRideBtn.textContent = 'Accepting...';
  
  try {
    const response = await fetch(`/api/rides/${currentRequestRideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to accept ride: ${response.status}`);
    }
    
    // Hide the overlay
    hideRideRequest();
    
    // Refresh the rides list
    await loadPendingRides();
    
    // Show success feedback
    const rideCard = document.querySelector(`[data-ride-id="${currentRequestRideId}"]`);
    if (rideCard) {
      rideCard.style.borderColor = 'var(--color-accent-success)';
      rideCard.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.2)';
      setTimeout(() => {
        rideCard.style.borderColor = '';
        rideCard.style.boxShadow = '';
      }, 3000);
    }
    
  } catch (err) {
    console.error('Error accepting ride:', err);
    alert(err.message || 'Failed to accept ride. Please try again.');
    acceptRideBtn.disabled = false;
    declineRideBtn.disabled = false;
    acceptRideBtn.textContent = '✓ Accept Ride';
  } finally {
    isProcessingRequest = false;
  }
}

// Decline the ride
function declineRide() {
  if (isProcessingRequest || !currentRequestRideId) return;
  
  // Just hide the overlay and return to available state
  hideRideRequest();
  
  // Show a brief notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    background: var(--color-card);
    color: var(--color-text-secondary);
    padding: 12px 20px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-lg);
    z-index: 2000;
    animation: slideUp 300ms ease-out;
    font-size: 0.9rem;
  `;
  notification.textContent = 'Ride declined. You are now available for new requests.';
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 300ms';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Event listeners for the ride request buttons
acceptRideBtn.addEventListener('click', acceptRide);
declineRideBtn.addEventListener('click', declineRide);

// Close overlay on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && rideRequestOverlay.classList.contains('active')) {
    declineRide();
  }
});

// ==========================================
// LOAD RIDES
// ==========================================

// Tracks pending ride IDs already seen, so the "New Request" overlay only
// pops for a ride that shows up *while the driver is already on the page*
// — not for the whole backlog that was already pending when the dashboard
// first loaded. Null until the first poll establishes that baseline.
let knownPendingRideIds = null;

function notifyNewPendingRides(rides) {
  const pendingIds = new Set(rides.filter(r => r.status === 'pending').map(r => r._id));

  if (knownPendingRideIds === null) {
    knownPendingRideIds = pendingIds;
    return;
  }

  const newIds = [...pendingIds].filter(id => !knownPendingRideIds.has(id));
  knownPendingRideIds = pendingIds;

  if (newIds.length === 0) return;
  // Don't interrupt a request the driver is already looking at, or mid-accept.
  if (isProcessingRequest || rideRequestOverlay.classList.contains('active')) return;

  showRideRequest(newIds[0]);
}

async function loadPendingRides() {
  try {
    const response = await fetch(`/api/rides`);
    
    if (!response.ok) {
      throw new Error(`Failed to load rides: ${response.status}`);
    }

    const allRides = await response.json();
    
    // FILTER: Driver should only see rides that are pending, accepted, or completed
    const driverRelevantRides = allRides.filter(r => 
      r.status === 'pending' || r.status === 'accepted' || r.status === 'completed'
    );
    
    updateStats(driverRelevantRides);
    notifyNewPendingRides(driverRelevantRides);
    
    // For the map, only show pending and accepted rides (not completed)
    const mapRides = driverRelevantRides.filter(r => 
      r.status === 'pending' || r.status === 'accepted'
    );
    updateMapMarkers(mapRides);
    syncAcceptedRideRoute(mapRides);

    // For the list, show all driver-relevant rides (pending, accepted, completed)
    if (driverRelevantRides.length === 0) {
      driverRides.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">📍</div>
          <p>No available rides. Waiting for riders...</p>
        </div>
      `;
      return;
    }

    driverRides.innerHTML = '';
    driverRelevantRides.forEach(ride => {
      const card = createRideCard(ride);
      driverRides.appendChild(card);
    });

  } catch (err) {
    console.error('Error loading rides:', err);
    driverRides.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p>Failed to load rides. <button onclick="loadPendingRides()" style="
          background: var(--color-accent-warning);
          color: var(--color-text-inverse);
          border: none;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-md);
          cursor: pointer;
          margin-top: 0.75rem;
          font-weight: 600;
        ">Retry</button></p>
      </div>
    `;
  }
}

function createRideCard(ride) {
  const card = document.createElement('div');
  card.className = 'ride-card';
  card.role = 'listitem';
  card.dataset.rideId = ride._id;
  
  const timeAgo = getTimeAgo(ride.createdAt);
  
  let actionButtons = '';
  if (ride.status === 'pending') {
    actionButtons = `
      <button 
        class="accept-btn" 
        onclick="showRideRequest('${ride._id}')"
        aria-label="View and accept this ride"
      >
        👁 View & Accept
      </button>
    `;
  } else if (ride.status === 'accepted') {
    actionButtons = `
      <button 
        class="complete-btn" 
        onclick="updateRide(this, '${ride._id}', 'completed')"
        aria-label="Mark ride as completed"
      >
        ✓ Complete Ride
      </button>
    `;
  }

  const statusBadge = `
    <div class="ride-status-badge" style="margin-bottom: 1rem;">
      <span class="status ${ride.status}">${ride.status.toUpperCase()}</span>
      <span class="ride-time" style="margin-left: auto;">
        <span class="status-pulse ${ride.status}"></span>
        ${timeAgo}
      </span>
    </div>
  `;

  const rideTypeLabel = RIDE_TYPE_LABELS[ride.rideType] || 'Ride';

  const detailsDisplay = `
    <div style="font-size: 0.8rem; color: var(--color-text-secondary); margin: 0.5rem 0;">
      <strong style="color: var(--color-text-primary);">${ride.riderUsername || 'Unknown rider'}</strong>
      · ${rideTypeLabel} · ${ride.seats || 2} seats
    </div>

    <div class="route-line">
      <div class="route-line-track" aria-hidden="true">
        <span class="route-stop-dot pickup"></span>
        <span class="route-thread"></span>
        <span class="route-stop-dot dropoff"></span>
      </div>
      <div class="route-line-stops">
        <div class="route-stop">
          <span class="route-stop-label">Pickup</span>
          <span class="route-stop-value" id="card-pickup-${ride._id}">Loading location…</span>
        </div>
        <div class="route-stop">
          <span class="route-stop-label">Dropoff</span>
          <span class="route-stop-value" id="card-dropoff-${ride._id}">Loading location…</span>
        </div>
      </div>
    </div>

    <div class="ride-fare-estimate" style="margin-top: 0.75rem;">
      <div class="ride-fare-row">
        <span class="ride-fare-label">ID #${ride._id.slice(-6).toUpperCase()}</span>
        <span class="ride-fare-trip">${ride.distance != null ? ride.distance.toFixed(2) + ' km' : 'N/A'}</span>
      </div>
      <div class="ride-fare-divider"></div>
      <div class="ride-fare-row ride-fare-row-total">
        <span class="ride-fare-label">Fare</span>
        <span class="ride-fare-value">${ride.fare != null ? 'R' + ride.fare.toFixed(2) : 'N/A'}</span>
      </div>
    </div>
  `;

  card.innerHTML = statusBadge + detailsDisplay + actionButtons;

  // Fill in human-readable addresses once geocoding resolves
  getLocationName(ride.pickup.lat, ride.pickup.lng).then(name => {
    const el = document.getElementById(`card-pickup-${ride._id}`);
    if (el) el.textContent = name;
  });
  getLocationName(ride.dropoff.lat, ride.dropoff.lng).then(name => {
    const el = document.getElementById(`card-dropoff-${ride._id}`);
    if (el) el.textContent = name;
  });

  return card;
}

async function updateRide(button, id, status) {
  try {
    button.disabled = true;
    button.textContent = 'Updating...';

    const response = await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      throw new Error(`Failed to update ride: ${response.status}`);
    }

    await loadPendingRides();
    
  } catch (err) {
    console.error('Error updating ride:', err);
    alert('Failed to update ride. Please try again.');
    loadPendingRides();
  }
}

function startPolling() {
  loadPendingRides();
  
  pollInterval = setInterval(() => {
    loadPendingRides();
  }, 5000);

  console.log(' Live polling started - 5 second intervals');
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    console.log(' Polling stopped');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  startPolling();
  
  // Stop polling when tab is hidden (save bandwidth)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling();
    }
  });

  // Clean up on page exit
  window.addEventListener('beforeunload', () => {
    stopPolling();
  });
});

// Manual refresh with Ctrl+R
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && e.ctrlKey) {
    e.preventDefault();
    loadPendingRides();
  }
});

console.log(' RideBook Driver Dashboard Loaded');
console.log(' Tip: Press Ctrl+R to manually refresh');