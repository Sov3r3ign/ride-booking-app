//NAYII
/*const session = getCurrentSession();
if (!session || session.role !== 'driver') {
  window.location.href = '/login.html';
}

const driverRides = document.getElementById('driver-rides');
const statPending = document.getElementById('stat-pending');
const statAccepted = document.getElementById('stat-accepted');
const statCompleted = document.getElementById('stat-completed');

let pollInterval = null;

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

async function loadPendingRides() {
  try {
    const response = await fetch(`/api/rides`);
    
    if (!response.ok) {
      throw new Error(`Failed to load rides: ${response.status}`);
    }

    const rides = await response.json();
    
    updateStats(rides);
    
    const activeRides = rides.filter(r => r.status !== 'completed');

    if (activeRides.length === 0) {
      driverRides.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">📍</div>
          <p>No active rides. Waiting for riders...</p>
        </div>
      `;
      return;
    }

    driverRides.innerHTML = '';
    activeRides.forEach(ride => {
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
  
  const timeAgo = getTimeAgo(ride.createdAt);
  
  let actionButtons = '';
  if (ride.status === 'pending') {
    actionButtons = `
      <button 
        class="accept-btn" 
        onclick="updateRide('${ride._id}', 'accepted')"
        aria-label="Accept this ride"
      >
        ✓ Accept Ride
      </button>
    `;
  } else if (ride.status === 'accepted') {
    actionButtons = `
      <button 
        class="complete-btn" 
        onclick="updateRide('${ride._id}', 'completed')"
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

  const rideTypeLabels = { ride: 'Ride', rideL: 'RideL', rideXL: 'RideXL' };
  const rideTypeLabel = rideTypeLabels[ride.rideType] || 'Ride';

  const coordsDisplay = `
    <div class="coords">
      <strong> Ride Type</strong> ${rideTypeLabel} (${ride.seats || 2} seats)<br>
      <strong> Pickup</strong><br>
      ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
      <br>
      <strong> Dropoff</strong><br>
      ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}<br>
      <br>
      <strong> Distance</strong> ${ride.distance != null ? ride.distance.toFixed(2) + ' km' : 'N/A'}<br>
      <strong> Fare</strong> ${ride.fare != null ? 'R' + ride.fare.toFixed(2) : 'N/A'}<br>
      <br>
      <small style="color: var(--color-text-tertiary); display: block; margin-top: 0.75rem;">
        ID: ${ride._id.slice(-6).toUpperCase()}
      </small>
    </div>
  `;

  card.innerHTML = statusBadge + coordsDisplay + actionButtons;
  return card;
}

async function updateRide(id, status) {
  try {
    const button = event.target;
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
console.log(' Tip: Press Ctrl+R to manually refresh');*/

//NAYII
const session = getCurrentSession();
if (!session || session.role !== 'driver') {
  window.location.href = '/login.html';
}

const driverRides = document.getElementById('driver-rides');
const statPending = document.getElementById('stat-pending');
const statAccepted = document.getElementById('stat-accepted');
const statCompleted = document.getElementById('stat-completed');

let pollInterval = null;

// ==========================================
// MAP OF REQUESTED RIDES
// ==========================================
// Centered on Johannesburg by default, same starting view as the rider page.
const driverMap = L.map('driver-map').setView([-26.2023, 28.0436], 12);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(driverMap);

const rideMarkersLayer = L.layerGroup().addTo(driverMap);

// Reverse-geocoding cache shared across marker popups (mirrors app.js)
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

// Only auto-fit the map bounds once, on the first load — after that the
// driver may have panned/zoomed manually and repeated polling shouldn't
// yank the view back.
let hasFitBounds = false;

function popupContentFor(ride) {
  const rideTypeLabels = { ride: 'Ride', rideL: 'RideL', rideXL: 'RideXL' };
  const rideTypeLabel = rideTypeLabels[ride.rideType] || 'Ride';

  let actionButton = '';
  if (ride.status === 'pending') {
    actionButton = `<button class="accept-btn" onclick="updateRide('${ride._id}', 'accepted')">✓ Accept Ride</button>`;
  } else if (ride.status === 'accepted') {
    actionButton = `<button class="complete-btn" onclick="updateRide('${ride._id}', 'completed')">✓ Complete Ride</button>`;
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

    // Fill in a human-readable pickup address once the popup is opened
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

async function loadPendingRides() {
  try {
    const response = await fetch(`/api/rides`);
    
    if (!response.ok) {
      throw new Error(`Failed to load rides: ${response.status}`);
    }

    const rides = await response.json();
    
    updateStats(rides);
    
    const activeRides = rides.filter(r => r.status !== 'completed');

    updateMapMarkers(activeRides);

    if (activeRides.length === 0) {
      driverRides.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">📍</div>
          <p>No active rides. Waiting for riders...</p>
        </div>
      `;
      return;
    }

    driverRides.innerHTML = '';
    activeRides.forEach(ride => {
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
  
  const timeAgo = getTimeAgo(ride.createdAt);
  
  let actionButtons = '';
  if (ride.status === 'pending') {
    actionButtons = `
      <button 
        class="accept-btn" 
        onclick="updateRide('${ride._id}', 'accepted')"
        aria-label="Accept this ride"
      >
        ✓ Accept Ride
      </button>
    `;
  } else if (ride.status === 'accepted') {
    actionButtons = `
      <button 
        class="complete-btn" 
        onclick="updateRide('${ride._id}', 'completed')"
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

  const rideTypeLabels = { ride: 'Ride', rideL: 'RideL', rideXL: 'RideXL' };
  const rideTypeLabel = rideTypeLabels[ride.rideType] || 'Ride';

  const coordsDisplay = `
    <div class="coords">
      <strong> Ride Type</strong> ${rideTypeLabel} (${ride.seats || 2} seats)<br>
      <strong> Pickup</strong><br>
      ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
      <br>
      <strong> Dropoff</strong><br>
      ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}<br>
      <br>
      <strong> Distance</strong> ${ride.distance != null ? ride.distance.toFixed(2) + ' km' : 'N/A'}<br>
      <strong> Fare</strong> ${ride.fare != null ? 'R' + ride.fare.toFixed(2) : 'N/A'}<br>
      <br>
      <small style="color: var(--color-text-tertiary); display: block; margin-top: 0.75rem;">
        ID: ${ride._id.slice(-6).toUpperCase()}
      </small>
    </div>
  `;

  card.innerHTML = statusBadge + coordsDisplay + actionButtons;
  return card;
}

async function updateRide(id, status) {
  try {
    const button = event.target;
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