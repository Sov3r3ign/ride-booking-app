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
console.log(' Tip: Press Ctrl+R to manually refresh');