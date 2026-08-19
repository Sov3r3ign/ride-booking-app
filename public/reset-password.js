const resetForm = document.getElementById('reset-form');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const resetBtn = document.getElementById('reset-btn');
const resetError = document.getElementById('reset-error');
const resetSuccess = document.getElementById('reset-success');

const token = new URLSearchParams(window.location.search).get('token');

if (!token) {
  resetForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
  showError('This reset link is missing its token. Please request a new one from the forgot password page.');
}

resetForm.addEventListener('submit', function (e) {
  e.preventDefault();
  handleResetPassword();
});

async function handleResetPassword() {
  clearMessages();

  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!newPassword || !confirmPassword) {
    showError('Please fill in both fields');
    return;
  }

  if (newPassword.length < 6) {
    showError('Password must be at least 6 characters');
    return;
  }

  if (newPassword !== confirmPassword) {
    showError('Passwords do not match');
    return;
  }

  resetBtn.disabled = true;
  resetBtn.textContent = 'Resetting...';

  try {
    const response = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not reset password. The link may have expired.');
    }

    showSuccess('Password updated! Redirecting you to login…');
    resetForm.reset();
    resetForm.querySelectorAll('input, button').forEach(el => el.disabled = true);

    setTimeout(() => {
      window.location.href = '/login.html';
    }, 1800);

  } catch (err) {
    showError(err.message || 'Could not reset password. Please try again.');
    resetBtn.disabled = false;
    resetBtn.textContent = 'Reset Password';
  }
}

function showError(message) {
  resetError.textContent = message;
  resetError.classList.add('show');
}

function showSuccess(message) {
  resetSuccess.textContent = message;
  resetSuccess.classList.add('show');
}

function clearMessages() {
  resetError.classList.remove('show');
  resetError.textContent = '';
  resetSuccess.classList.remove('show');
  resetSuccess.textContent = '';
}

console.log(' RideBook Reset Password Page Loaded');