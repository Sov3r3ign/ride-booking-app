const session = getCurrentSession();
if (!session || session.role !== 'rider') {
  window.location.href = '/login.html';
}

const historyList = document.getElementById('history-list');

// Local cache so repeat coordinates on this page don't re-request
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

function addRideToHistory(ride) {
  const li = document.createElement('li');
  li.role = 'listitem';

  const statusEmoji = ride.status === 'pending' ? '🟠' : ride.status === 'accepted' ? '🟢' : '✓';
  const pickupId = `pickup-${ride._id}`;
  const dropoffId = `dropoff-${ride._id}`;
  const rideTypeLabels = { ride: 'Ride', rideL: 'RideL', rideXL: 'RideXL' };
  const rideTypeLabel = rideTypeLabels[ride.rideType] || 'Ride';

  li.innerHTML = `
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
  `;

  historyList.appendChild(li);

  getLocationName(ride.pickup.lat, ride.pickup.lng).then(name => {
    const el = document.getElementById(pickupId);
    if (el) el.textContent = name;
  });

  getLocationName(ride.dropoff.lat, ride.dropoff.lng).then(name => {
    const el = document.getElementById(dropoffId);
    if (el) el.textContent = name;
  });
}

async function loadHistory() {
  try {
    const response = await fetch('/api/rides');

    if (!response.ok) {
      throw new Error(`Failed to load rides: ${response.status}`);
    }

    const rides = await response.json();

    historyList.innerHTML = '';

    if (rides.length === 0) {
      historyList.innerHTML = `
        <li style="color: var(--color-text-tertiary); font-style: italic;">
          No rides requested yet
        </li>
      `;
      return;
    }

    rides.forEach(addRideToHistory);

  } catch (err) {
    console.error('Error loading ride history:', err);
    historyList.innerHTML = `
      <li style="color: var(--color-text-tertiary); font-style: italic;">
        Could not load ride history. Check your connection.
      </li>
    `;
  }
}

document.addEventListener('DOMContentLoaded', loadHistory);

console.log(' RideBook History Page Loaded');