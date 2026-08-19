const signupForm = document.getElementById('signup-form');
const nameInput = document.getElementById('name');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const signupBtn = document.getElementById('signup-btn');
const signupError = document.getElementById('signup-error');

signupForm.addEventListener('submit', function (e) {
  e.preventDefault();
  handleSignup();
});

async function handleSignup() {
  clearError();

  const name = nameInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const roleInput = document.querySelector('input[name="role"]:checked');
  const role = roleInput ? roleInput.value : 'rider';

  if (!name || !username || !password || !confirmPassword) {
    showError('Please fill in all fields');
    return;
  }

  if (password.length < 6) {
    showError('Password must be at least 6 characters');
    return;
  }

  if (password !== confirmPassword) {
    showError('Passwords do not match');
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = 'Creating account...';

  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password, role })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not create account');
    }

    // Log the new user straight in, same session shape login.js uses.
    const session = {
      user: data.name,
      username: data.username,
      role: data.role,
      loginTime: new Date().toISOString()
    };
    localStorage.setItem('ridebook_session', JSON.stringify(session));

    const redirectUrl = data.role === 'driver' ? '/driver.html' : '/index.html';
    window.location.href = redirectUrl;

  } catch (err) {
    showError(err.message || 'Signup failed. Please try again.');
    signupBtn.disabled = false;
    signupBtn.textContent = 'Create Account';
  }
}

function showError(message) {
  signupError.textContent = message;
  signupError.classList.add('show');
}

function clearError() {
  signupError.classList.remove('show');
  signupError.textContent = '';
}

// If already logged in, skip signup and go straight to the app
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
    window.location.href = session.role === 'driver' ? '/driver.html' : '/index.html';
  } catch (err) {
    localStorage.removeItem('ridebook_session');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkExistingSession);
} else {
  checkExistingSession();
}

console.log(' RideBook Signup Page Loaded');