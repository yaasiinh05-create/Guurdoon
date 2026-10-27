/** Shared UI helpers: escaping, toasts, modals, formatting. */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function avatarHtml(person, size = '') {
  const name = escapeHtml(person?.full_name || 'Guurdoon');
  if (person?.profile_photo_url) {
    return `<img class="avatar ${size}" src="${escapeHtml(person.profile_photo_url)}" alt="${name}" loading="lazy" />`;
  }
  return `<span class="avatar ${size}" aria-hidden="true">${escapeHtml(initials(person?.full_name))}</span>`;
}

export function toast(message, type = 'info') {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 250);
  }, 3800);
}

export function confirmModal({ title, message, confirmText = 'Haa, hadda', cancelText = 'Maya' }) {
  return new Promise((resolve) => {
    const host = document.getElementById('modal-host');
    host.classList.remove('hidden');
    host.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="member-actions" style="justify-content:flex-end">
          <button type="button" class="btn btn-outline" data-modal="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn btn-green" data-modal="ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const close = (value) => {
      host.classList.add('hidden');
      host.innerHTML = '';
      resolve(value);
    };
    host.querySelector('[data-modal="cancel"]').addEventListener('click', () => close(false));
    host.querySelector('[data-modal="ok"]').addEventListener('click', () => close(true));
    host.addEventListener('click', (event) => {
      if (event.target === host) close(false);
    });
  });
}

export function formatTime(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('so-SO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDay(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('so-SO', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'hadda';
  if (minutes < 60) return `${minutes} daq`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} saac`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} maalmood`;
  return formatDay(value);
}

export const MARITAL_LABELS = {
  Single: 'Gogos',
  Gabar: 'Gabar',
  Garoob: 'Garoob',
  Xaasle: 'Xaasle',
};

export const MARITAL_OPTIONS = ['Single', 'Gabar', 'Garoob', 'Xaasle'];

export function maritalLabel(value) {
  return MARITAL_LABELS[value] || value || '—';
}

export function loading(text = 'Waa la soo rarayaa…') {
  return `<div class="loading"><span class="spinner" aria-hidden="true"></span><span>${escapeHtml(text)}</span></div>`;
}

export function emptyState(title, message, icon = '🕊️') {
  return `<div class="empty-state"><div class="icon" aria-hidden="true">${icon}</div>
    <h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`;
}

export function fieldError(errors, key) {
  return errors?.[key] ? `<div class="field-error">${escapeHtml(errors[key])}</div>` : '';
}

export function setLoading(button, isLoading, label = 'Waa la dirayaa…') {
  if (!button) return;
  if (isLoading) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${escapeHtml(label)}`;
  } else {
    button.disabled = false;
    if (button.dataset.original) button.innerHTML = button.dataset.original;
  }
}
