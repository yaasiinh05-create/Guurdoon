import { api, ApiError } from '../api.js';
import { emptyState, escapeHtml, formatTime, loading, relativeTime, toast } from '../ui.js';
import { state, refreshCounts } from '../app.js';

export async function render(container) {
  container.innerHTML = `
    <section class="section"><div class="container">
      <div class="member-actions" style="justify-content:space-between;flex-wrap:wrap;gap:1rem">
        <h1 style="margin:0">Ogaanshaha</h1>
        <button class="btn btn-outline btn-sm" data-role="read-all">Dhammaan waa la akhriyay</button>
      </div>
      <div data-role="list">${loading()}</div>
    </div></section>`;

  const host = container.querySelector('[data-role="list"]');

  async function load() {
    host.innerHTML = loading();
    try {
      const result = await api.get('/api/notifications');
      state.counts = result.counts || state.counts;
      if (!result.notifications.length) {
        host.innerHTML = emptyState('Ogaansho ma jiro', 'Weli wax fariin ah ogaansho ma jirto.', '🔔');
        return;
      }
      host.innerHTML = `<ul class="plain-list">${result.notifications.map((item) => `
        <li class="notification ${item.read_at ? '' : 'unread'}">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p class="muted" style="margin:.25rem 0">${escapeHtml(item.body || '')}</p>
            <span class="muted" title="${escapeHtml(formatTime(item.created_at))}">${escapeHtml(relativeTime(item.created_at))}</span>
          </div>
          <div class="row-actions">
            ${item.link ? `<a class="btn btn-outline btn-sm" href="${escapeHtml(item.link)}">Eeg</a>` : ''}
            ${item.read_at ? '' : `<button class="btn btn-ghost btn-sm" data-read="${item.id}">La akhriyay</button>`}
          </div>
        </li>`).join('')}</ul>`;

      host.querySelectorAll('[data-read]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api.post(`/api/notifications/${btn.dataset.read}/read`, {});
            await load();
            await refreshCounts();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
          }
        });
      });
    } catch (err) {
      host.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  container.querySelector('[data-role="read-all"]').addEventListener('click', async () => {
    try {
      const result = await api.post('/api/notifications/read-all', {});
      toast(result.message, 'success');
      await load();
      await refreshCounts();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
    }
  });

  await load();
}
