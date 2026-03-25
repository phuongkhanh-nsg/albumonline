// Hiển thị menu admin nếu là admin
function showAdminMenuLink() {
  try {
    const token = getToken();
    if (!token) return;
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    const payload = JSON.parse(jsonPayload);
    if (payload && payload.role === 'admin') {
      const adminMenu = document.getElementById('adminMenuLink');
      if (adminMenu) adminMenu.style.display = '';
      const adminSettings = document.getElementById('adminSettingsLink');
      if (adminSettings) adminSettings.style.display = '';
    }
  } catch {}
}

document.addEventListener('DOMContentLoaded', showAdminMenuLink);
// Toast Notification System
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Client ID for tracking selections
function getClientId() {
  let clientId = localStorage.getItem('albumonline_client_id');
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('albumonline_client_id', clientId);
  }
  return clientId;
}

// Copy to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Đã sao chép link!', 'success');
  } catch {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('Đã sao chép link!', 'success');
  }
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Auth helpers
function getToken() {
  return localStorage.getItem('albumonline_token');
}

function setToken(token) {
  localStorage.setItem('albumonline_token', token);
}

function removeToken() {
  localStorage.removeItem('albumonline_token');
  localStorage.removeItem('albumonline_user');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('albumonline_user'));
  } catch { return null; }
}

function setUser(user) {
  localStorage.setItem('albumonline_user', JSON.stringify(user));
}

function isLoggedIn() {
  return !!getToken();
}

function logout() {
  removeToken();
  window.location.href = '/';
}

// API helper with auth
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers, ...options });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && token) {
      removeToken();
    }
    const err = new Error(data.error || 'Có lỗi xảy ra');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Update navbar auth state
function updateNavbar() {
  const navLinks = document.querySelector('.navbar-links');
  if (!navLinks) return;
  const user = getUser();
  const authHtml = user
    ? `<a href="/account" class="nav-user">👤 ${escapeHtmlUtil(user.displayName || user.username)}</a>
       <a href="#" onclick="logout(); return false;">Đăng xuất</a>`
    : `<a href="/login">Đăng nhập</a>`;

  // Remove old auth links
  navLinks.querySelectorAll('.nav-auth').forEach(el => el.remove());
  const authContainer = document.createElement('span');
  authContainer.className = 'nav-auth';
  authContainer.innerHTML = authHtml;
  navLinks.appendChild(authContainer);
}

function escapeHtmlUtil(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-update navbar on load
document.addEventListener('DOMContentLoaded', updateNavbar);
