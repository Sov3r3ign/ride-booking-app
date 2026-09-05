const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

loginForm.addEventListener('submit', function (e) {
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
    const response = await fetch('/api/login', {
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

// If user is already logged in, redirect them.
// Only trust a session that is fully valid (matches the same check auth.js
// uses) — a partial/corrupt session used to bounce the user endlessly
// between login.html and index.html/driver.html, since each page disagreed
// on whether it counted as "logged in". Now an invalid session is just
// wiped here, so the user lands cleanly on the login form instead.
function checkExistingSession() {
  const raw = localStorage.getItem('ridebook_session');
  if (!raw) return;

  try {
    const session = JSON.parse(raw);

    if (!session.user || !session.role || !session.username) {
      throw new Error('Incomplete session');
    }

    if (session.role !== 'rider' && session.role !== 'driver') {
      throw new Error('Unknown role');
    }

    const redirectUrl = session.role === 'driver' ? '/driver.html' : '/index.html';
    window.location.href = redirectUrl;
  } catch (err) {
    // Malformed session — clear it so it can't cause a redirect loop, and
    // just show the login form.
    localStorage.removeItem('ridebook_session');
  }
}

// Check on page load (but wait for DOM to be ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkExistingSession);
} else {
  checkExistingSession();
}

console.log(' RideBook Login Page Loaded');