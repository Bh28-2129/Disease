/**
 * auth.js — Shared authentication helpers
 * Included in all pages to manage login state in the navbar and provide
 * a getAuthHeaders() helper for API calls.
 */

const AUTH_TOKEN_KEY = "medai_token";
const AUTH_USER_KEY  = "medai_user";

/** Returns the stored JWT token or null */
function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Returns the stored user object or null */
function getUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/** Returns Authorization header object if logged in, else empty object */
function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Clears all auth data and redirects to login */
function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.location.href = "login.html";
}

/**
 * Renders the auth section in the navbar.
 * Expects a <ul id="navLinks"> or appends to the nav's ul.
 */
function renderNavAuth() {
  const navLinks = document.getElementById("navLinks");
  if (!navLinks) return;

  const user = getUser();

  if (user) {
    // Logged-in state: show user name + logout button
    navLinks.insertAdjacentHTML("beforeend", `
      <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button"
           data-bs-toggle="dropdown" aria-expanded="false">
          <i class="bi bi-person-circle me-1"></i>${escapeHtml(user.name || user.email)}
        </a>
        <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
          <li><span class="dropdown-item-text small text-muted">${escapeHtml(user.email)}</span></li>
          <li><hr class="dropdown-divider" /></li>
          <li>
            <button class="dropdown-item text-danger" onclick="logout()">
              <i class="bi bi-box-arrow-right me-2"></i>Sign Out
            </button>
          </li>
        </ul>
      </li>
    `);
  } else {
    // Guest state: show Login / Register buttons
    navLinks.insertAdjacentHTML("beforeend", `
      <li class="nav-item">
        <a class="nav-link" href="login.html"><i class="bi bi-box-arrow-in-right me-1"></i>Login</a>
      </li>
      <li class="nav-item">
        <a class="nav-link btn btn-outline-light btn-sm ms-1 px-3" href="register.html">
          <i class="bi bi-person-plus me-1"></i>Sign Up
        </a>
      </li>
    `);
  }
}

// XSS-safe HTML escaping
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Auto-render auth section when DOM is ready
document.addEventListener("DOMContentLoaded", renderNavAuth);
