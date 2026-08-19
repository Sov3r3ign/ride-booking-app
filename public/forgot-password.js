const forgotForm = document.getElementById('forgot-form');
const usernameInput = document.getElementById('username');
const forgotBtn = document.getElementById('forgot-btn');
const forgotError = document.getElementById('forgot-error');
const forgotSuccess = document.getElementById('forgot-success');

forgotForm.addEventListener('submit', function (e) {
  e.preventDefault();
  handleForgotPassword();
});

async function handleForgotPassword() {
  clearMessages();

  const username = usernameInput.value.trim();

  if (!username) {
    showError('Please enter your username');
    return;
  }

  forgotBtn.disabled = true;
  forgotBtn.textContent = 'Sending...';

  try {
    const response = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }

    // This project has no email service wired up, so the server hands
    // back the reset link directly (see server.js) instead of emailing
    // it. In a real deployment, devResetUrl wouldn't exist — the message
    // below would be the only thing shown, and the link would arrive by
    // email instead.
    let message = data.message;
    if (data.devResetUrl) {
      message += ` <br><br><strong>Demo mode</strong> (no email service configured) —
        <a href="${data.devResetUrl}">click here to reset your password</a>.`;
    }

    showSuccess(message);
    forgotForm.reset();
    forgotBtn.disabled = false;
    forgotBtn.textContent = 'Send Reset Link';

  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
    forgotBtn.disabled = false;
    forgotBtn.textContent = 'Send Reset Link';
  }
}

function showError(message) {
  forgotError.textContent = message;
  forgotError.classList.add('show');
}

function showSuccess(html) {
  forgotSuccess.innerHTML = html;
  forgotSuccess.classList.add('show');
}

function clearMessages() {
  forgotError.classList.remove('show');
  forgotError.textContent = '';
  forgotSuccess.classList.remove('show');
  forgotSuccess.innerHTML = '';
}

console.log(' RideBook Forgot Password Page Loaded');