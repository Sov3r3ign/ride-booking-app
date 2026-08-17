const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

loginBtn.addEventListener('click', function (e) {
  e.preventDefault();
  handleLogin();
});

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

  // Disable button during submission
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

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

    // Store session in localStorage
    const session = {
      user: user.name,
      username: user.username,
      role: user.role,
      loginTime: new Date().toISOString()
    };
    localStorage.setItem('ridebook_session', JSON.stringify(session));

    // Redirect based on the role returned by the server
    const redirectUrl = user.role === 'driver' ? '/driver.html' : '/index.html';
    window.location.href = redirectUrl;

  } catch (err) {
    showError(err.message || 'Login failed. Please try again.');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
}

function showError(message) {
  loginError.textContent = message;
  loginError.classList.add('show');
}

// Allow Enter key to trigger login
loginForm.addEventListener('keypress', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
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