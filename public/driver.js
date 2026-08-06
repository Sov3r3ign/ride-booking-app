// ==========================================
// RIDEBOOK - DRIVER DASHBOARD
// Professional driver management interface
// ==========================================

const driverRides = document.getElementById('driver-rides');
const statPending = document.getElementById('stat-pending');
const statAccepted = document.getElementById('stat-accepted');
const statCompleted = document.getElementById('stat-completed');

let pollInterval = null;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Update statistics display
 */
function updateStats(rides) {
  const pending = rides.filter(r => r.status === 'pending').length;
  const accepted = rides.filter(r => r.status === 'accepted').length;
  const completed = rides.filter(r => r.status === 'completed').length;

  // Animate stat updates
  animateStat(statPending, pending);
  animateStat(statAccepted, accepted);
  animateStat(statCompleted, completed);
}

/**
 * Animate stat number change with visual feedback
 */
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

/**
 * Format time relative to now (e.g., "2 minutes ago")
 */
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
// RIDE DISPLAY
// ==========================================

/**
 * Fetch and display active rides
 */
async function loadPendingRides() {
  try {
    const response = await fetch('/api/rides');
    
    if (!response.ok) {
      throw new Error(`Failed to load rides: ${response.status}`);
    }

    const rides = await response.json();
    
    // Update stats
    updateStats(rides);
    
    // Filter out completed rides for display
    const activeRides = rides.filter(r => r.status !== 'completed');

    // Show empty state if no active rides
    if (activeRides.length === 0) {
      driverRides.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">📍</div>
          <p>No active rides right now. Waiting for riders...</p>
        </div>
      `;
      return;
    }

    // Clear previous content and render rides
    driverRides.innerHTML = '';
    
    activeRides.forEach(ride => {
      const card = createRideCard(ride);
      driverRides.appendChild(card);
    });

  } catch (err) {
    console.error('Error loading rides:', err);
    driverRides.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">⚠️</div>
        <p>Failed to load rides. <button onclick="location.reload()" style="
          background: var(--color-accent-orange);
          color: var(--color-primary);
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          cursor: pointer;
          margin-top: 1rem;
          font-weight: 600;
        ">Refresh</button></p>
      </div>
    `;
  }
}

/**
 * Create a ride card element
 */
function createRideCard(ride) {
  const card = document.createElement('div');
  card.className = 'ride-card';
  card.role = 'listitem';
  
  const timeAgo = getTimeAgo(ride.createdAt);
  
  // Determine button content based on status
  let actionButtons = '';
  if (ride.status === 'pending') {
    actionButtons = `
      <button 
        class="accept-btn" 
        onclick="updateRide('${ride._id}', 'accepted')"
        aria-label="Accept this ride"
      >
        Accept Ride
      </button>
    `;
  } else if (ride.status === 'accepted') {
    actionButtons = `
      <button 
        class="complete-btn" 
        onclick="updateRide('${ride._id}', 'completed')"
        aria-label="Mark this ride as completed"
      >
        Complete Ride
      </button>
    `;
  }

  // Status badge with pulse indicator
  const statusBadge = `
    <div class="ride-status-badge" style="margin-bottom: 1rem;">
      <span class="status ${ride.status}">${ride.status.toUpperCase()}</span>
      <span class="ride-time" style="margin-left: auto;">
        <span class="status-pulse ${ride.status}"></span>
        ${timeAgo}
      </span>
    </div>
  `;

  // Build coordinates display
  const coordsDisplay = `
    <div class="coords">
      <strong>📍 Pickup</strong><br>
      ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
      <br>
      <strong>🏁 Dropoff</strong><br>
      ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}<br>
      <br>
      <small style="color: var(--color-text-tertiary); display: block; margin-top: 0.75rem;">
        Ride ID: ${ride._id.slice(-6).toUpperCase()}
      </small>
    </div>
  `;

  card.innerHTML = statusBadge + coordsDisplay + actionButtons;
  return card;
}

// ==========================================
// RIDE UPDATES
// ==========================================

/**
 * Update a ride's status via API
 */
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

    // Re-fetch rides to show updated state
    await loadPendingRides();
    
  } catch (err) {
    console.error('Error updating ride:', err);
    alert('Failed to update ride status. Please try again.');
    loadPendingRides(); // Reload to restore UI state
  }
}

// ==========================================
// POLLING / LIVE UPDATES
// ==========================================

/**
 * Start auto-refresh of rides (every 5 seconds)
 */
function startPolling() {
  // Initial load
  loadPendingRides();
  
  // Poll every 5 seconds
  pollInterval = setInterval(() => {
    loadPendingRides();
  }, 5000);

  console.log('🔄 Live polling started - updates every 5 seconds');
}

/**
 * Stop auto-refresh
 */
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    console.log('⏸ Live polling stopped');
  }
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  startPolling();
  
  // Stop polling when user leaves the page (save resources)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling();
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopPolling();
  });
});

document.addEventListener('keydown', (e) => {
  // Press 'R' to manually refresh
  if (e.key.toLowerCase() === 'r' && e.ctrlKey) {
    e.preventDefault();
    loadPendingRides();
  }
});

console.log('🚗 RideBook Driver Dashboard Loaded');
console.log('Tip: Press Ctrl+R to manually refresh rides');