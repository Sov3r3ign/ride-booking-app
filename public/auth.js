/** function requireLogin() {
  const session = localStorage.getItem('ridebook_session');
  
  if (!session) {
    // No session, redirect to login
    window.location.href = '/login.html';
    return null;
  }

  try {
    const parsedSession = JSON.parse(session);
    
    // Validate session structure
    if (!parsedSession.user || !parsedSession.role || !parsedSession.username) {
      throw new Error('Invalid session data');
    }

    return parsedSession;
  } catch (err) {
    // Invalid session, clear and redirect
    localStorage.removeItem('ridebook_session');
    window.location.href = '/login.html';
    return null;
  }
}

/**
 * Verify user has correct role for current page
 /
function verifyRole(requiredRole) {
  const session = requireLogin();
  if (!session) return null;

  if (session.role !== requiredRole) {
    // User has wrong role, redirect to their appropriate page
    const redirectUrl = session.role === 'driver' ? '/driver.html' : '/index.html';
    window.location.href = redirectUrl;
    return null;
  }

  return session;
}

/**
 * Display user info in page header
 /
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

/**
 * Logout and clear session
 /
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('ridebook_session');
    window.location.href = '/login.html';
  }
}

/**
 * Get current user session
 /
function getCurrentSession() {
  const session = localStorage.getItem('ridebook_session');
  return session ? JSON.parse(session) : null;
}

/**
 * Initialize auth on page load
 /
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

console.log(' Authentication system loaded');*/

function requireLogin() {
  const session = localStorage.getItem('ridebook_session');
  
  if (!session) {
    // No session, redirect to login
    window.location.href = '/login.html';
    return null;
  }

  try {
    const parsedSession = JSON.parse(session);
    
    // Validate session structure
    if (!parsedSession.user || !parsedSession.role || !parsedSession.username) {
      throw new Error('Invalid session data');
    }

    return parsedSession;
  } catch (err) {
    // Invalid session, clear and redirect
    localStorage.removeItem('ridebook_session');
    window.location.href = '/login.html';
    return null;
  }
}

/**
 * Verify user has correct role for current page
 */
function verifyRole(requiredRole) {
  const session = requireLogin();
  if (!session) return null;

  if (session.role !== requiredRole) {
    // User has wrong role, redirect to their appropriate page
    const redirectUrl = session.role === 'driver' ? '/driver.html' : '/index.html';
    window.location.href = redirectUrl;
    return null;
  }

  return session;
}

/**
 * Display user info in page header
 */
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

/**
 * Logout and clear session
 */
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('ridebook_session');
    window.location.href = '/login.html';
  }
}

/**
 * Get current user session
 */
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

/**
 * Initialize auth on page load
 */
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