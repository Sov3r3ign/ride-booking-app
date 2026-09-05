function requireLogin() {
  const session = localStorage.getItem('ridebook_session');

  if (!session) {
    window.location.href = '/login.html';
    return null;
  }

  try {
    const parsedSession = JSON.parse(session);

    if (!parsedSession.user || !parsedSession.role || !parsedSession.username) {
      throw new Error('Invalid session data');
    }

    return parsedSession;
  } catch (err) {
    localStorage.removeItem('ridebook_session');
    window.location.href = '/login.html';
    return null;
  }
}

function verifyRole(requiredRole) {
  const session = requireLogin();
  if (!session) return null;

  if (session.role !== requiredRole) {
    const redirectUrl = session.role === 'driver' ? '/driver.html' : '/index.html';
    window.location.href = redirectUrl;
    return null;
  }

  return session;
}

function displayUserInfo() {
  const session = requireLogin();
  if (!session) return;

  const userBadge = document.getElementById('user-badge');
  const userName = document.getElementById('user-name');
  const logoutBtn = document.getElementById('logout-btn');

  if (userBadge && userName && logoutBtn) {
    userName.textContent = session.user;
    userBadge.style.display = 'flex';

    logoutBtn.addEventListener('click', logout);
  }
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('ridebook_session');
    window.location.href = '/login.html';
  }
}

function getCurrentSession() {
  const session = localStorage.getItem('ridebook_session');
  if (!session) return null;

  try {
    return JSON.parse(session);
  } catch (err) {
    // Corrupt value — treat it the same as no session instead of throwing.
    localStorage.removeItem('ridebook_session');
    return null;
  }
}

function initAuth() {
  const session = requireLogin();
  if (session) {
    displayUserInfo();
  }
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', displayUserInfo);
} else {
  displayUserInfo();
}

console.log(' Authentication system loaded');