// ==========================================
// RIDEBOOK — LOGIN HANDLER
// Session management & role-based routing
// ==========================================

const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const riderLoginBtn = document.getElementById('rider-login');
const driverLoginBtn = document.getElementById('driver-login');
const loginError = document.getElementById('login-error');

let selectedRole = null;

// ==========================================
// ROLE SELECTION
// ==========================================

riderLoginBtn.addEventListener('click', function (e) {
  e.preventDefault();
  selectedRole = 'rider';
  handleLogin();
});

driverLoginBtn.addEventListener('click', function (e) {
  e.preventDefault();
  selectedRole = 'driver';
  handleLogin();
});

// ==========================================
// LOGIN HANDLER
// ==========================================

async function handleLogin() {
  // Clear previous errors
  loginError.classList.remove('show');
  loginError.textContent = '';

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  // Validation
  if (!username || !password) {
    showError('Please enter both username and password');
    return;
  }

  if (!selectedRole) {
    showError('Please select a role (Rider or Driver)');
    return;
  }

  // Disable buttons during submission
  riderLoginBtn.disabled = true;
  driverLoginBtn.disabled = true;
  riderLoginBtn.textContent = 'Logging in...';
  driverLoginBtn.textContent = 'Logging in...';

  try {
    // Send login request
    const API_URL = 'https://ridebook-api.onrender.com';
    const response = await fetch(API_URL + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error('Invalid username or password');
    }

    const user = await response.json();

    // Verify role matches
    if (user.role !== selectedRole) {
      throw new Error(`${username} is registered as a ${user.role}, not a ${selectedRole}`);
    }

    // Store session in localStorage
    const session = {
      user: user.name,
      username: user.username,
      role: user.role,
      loginTime: new Date().toISOString()
    };
    localStorage.setItem('ridebook_session', JSON.stringify(session));

    // Redirect based on role
    const redirectUrl = user.role === 'driver' ? '/driver.html' : '/index.html';
    window.location.href = redirectUrl;

  } catch (err) {
    showError(err.message || 'Login failed. Please try again.');
    riderLoginBtn.disabled = false;
    driverLoginBtn.disabled = false;
    riderLoginBtn.textContent = 'Login as Rider';
    driverLoginBtn.textContent = 'Login as Driver';
    selectedRole = null;
  }
}

function showError(message) {
  loginError.textContent = message;
  loginError.classList.add('show');
}

// Allow Enter key to trigger login (with role defaulting to rider)
loginForm.addEventListener('keypress', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!selectedRole) {
      selectedRole = 'rider'; // Default to rider
    }
    handleLogin();
  }
});

// If user is already logged in, redirect them
function checkExistingSession() {
  const session = localStorage.getItem('ridebook_session');
  if (session) {
    const { role } = JSON.parse(session);
    const redirectUrl = role === 'driver' ? '/driver.html' : '/index.html';
    window.location.href = redirectUrl;
  }
}

// Check on page load (but wait for DOM to be ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkExistingSession);
} else {
  checkExistingSession();
}

console.log(' RideBook Login Page Loaded');