import { api } from './api.js';
import { escapeHtml, toast, avatarHtml } from './ui.js';

export const state = {
  user: null,
  counts: { notifications: 0, messages: 0, chat_requests: 0, total: 0 },
  events: null,
};

const main = document.getElementById('main');
const nav = document.getElementById('main-nav');
const navToggle = document.getElementById('nav-toggle');

/* ------------------------------------------------------------------ routing */

const routes = {
  '/': () => import('./views/home.js'),
  '/members': () => import('./views/members.js'),
  '/member': () => import('./views/members.js'),
  '/login': () => import('./views/auth.js'),
  '/register': () => import('./views/auth.js'),
  '/forgot-password': () => import('./views/auth.js'),
  '/dashboard': () => import('./views/dashboard.js'),
  '/chats': () => import('./views/chat.js'),
  '/notifications': () => import('./views/notifications.js'),
  '/admin': () => import('./views/admin.js'),
  '/privacy': () => import('./views/static.js'),
  '/contact': () => import('./views/static.js'),
};

function currentRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  return { path: path || '/', params: new URLSearchParams(query || '') };
}

export function navigate(path) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}

/* --------------------------------------------------------------------- nav */

function updateNav() {
  const user = state.user;
  document.querySelectorAll('.guest-only').forEach((el) => el.classList.toggle('hidden', !!user));
  document.querySelectorAll('.member-only').forEach((el) => el.classList.toggle('hidden', !user));
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.classList.toggle('hidden', !user || user.role !== 'admin');
  });
  const route = currentRoute().path;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const target = link.getAttribute('data-nav');
    const active = target === route.replace(/^\//, '') || (route === '/' && target === 'home');
    link.classList.toggle('active', active);
  });
  updateBadges();
}

export function updateBadges(counts) {
  if (counts) state.counts = counts;
  const setBadge = (name, value) => {
    const el = document.querySelector(`[data-badge="${name}"]`);
    if (!el) return;
    const total = Number(value || 0);
    el.textContent = total > 99 ? '99+' : String(total);
    el.classList.toggle('hidden', total === 0);
  };
  setBadge('notifications', state.counts.notifications);
  setBadge('chats', state.counts.messages + state.counts.chat_requests);
}

function closeNav() {
  nav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}

navToggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});

nav?.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeNav();
});

/* ----------------------------------------------------------------- session */

export async function loadSession() {
  try {
    const result = await api.get('/api/auth/me');
    state.user = result.user || null;
  } catch {
    state.user = null;
  }
  updateNav();
  return state.user;
}

export async function refreshCounts() {
  if (!state.user) return;
  try {
    const result = await api.get('/api/notifications/unread-count');
    updateBadges(result);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------- realtime SSE */

export function connectEvents() {
  if (!state.user || state.events) return;
  const source = new EventSource('/api/events');
  state.events = source;

  const onNotification = (event) => {
    const data = JSON.parse(event.data);
    toast(data.title || 'Ogaansho cusub', 'info');
    refreshCounts();
    if (window.location.hash.startsWith('#/notifications')) renderRoute();
  };

  source.addEventListener('notification', onNotification);
  source.addEventListener('message', () => {
    refreshCounts();
    if (window.location.hash.startsWith('#/chats')) renderRoute();
  });
  source.addEventListener('chat_request', () => {
    refreshCounts();
    if (window.location.hash.startsWith('#/chats')) renderRoute();
  });
  source.addEventListener('unread_update', (event) => {
    updateBadges(JSON.parse(event.data));
  });
  source.addEventListener('ready', () => { refreshCounts(); });
  source.onerror = () => {
    // The browser retries automatically; refresh counts as a fallback.
    refreshCounts();
  };
}

export function disconnectEvents() {
  state.events?.close();
  state.events = null;
}

/* -------------------------------------------------------------- rendering */

let renderToken = 0;

export async function renderRoute() {
  const token = ++renderToken;
  const { path, params } = currentRoute();
  const loader = routes[path] || routes['/'];

  // Guard client-only areas.
  const needsAuth = ['/dashboard', '/chats', '/notifications'].includes(path);
  const needsAdmin = path === '/admin';
  if (needsAuth && !state.user) {
    navigate('/login');
    return;
  }
  if (needsAdmin && (!state.user || state.user.role !== 'admin')) {
    main.innerHTML = '<section class="section"><div class="container">'
      + '<div class="alert alert-error">Ogolaansho ma jiro. Bogga maamulka waa si sir ah u xiran yahay.</div>'
      + '</div></section>';
    return;
  }

  main.innerHTML = '<div class="section"><div class="container">'
    + '<div class="loading"><span class="spinner" aria-hidden="true"></span><span>Waa la soo rarayaa…</span></div>'
    + '</div></div>';

  try {
    const module = await loader();
    if (token !== renderToken) return;
    await module.render(main, params);
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    main.innerHTML = '<section class="section"><div class="container">'
      + `<div class="alert alert-error">${escapeHtml(err.message || 'Wax qalab ah ayaa jaba.')}</div>`
      + '</div></section>';
  }
  updateNav();
}

/* -------------------------------------------------------------------- boot */

const logoutBtn = document.getElementById('logout-btn');
logoutBtn?.addEventListener('click', async () => {
  try {
    await api.post('/api/auth/logout', {});
  } catch { /* ignore */ }
  state.user = null;
  disconnectEvents();
  updateNav();
  toast('Waad ka baxday.', 'success');
  navigate('/');
  renderRoute();
});

document.getElementById('year').textContent = String(new Date().getFullYear());

window.addEventListener('hashchange', () => {
  renderRoute();
});

(async function boot() {
  await loadSession();
  if (state.user) {
    connectEvents();
    refreshCounts();
  }
  await renderRoute();
})();

export { avatarHtml };
