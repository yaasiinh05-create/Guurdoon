import { api, ApiError } from '../api.js';
import {
  avatarHtml, emptyState, escapeHtml, loading, maritalLabel, toast, confirmModal,
} from '../ui.js';
import { state } from '../app.js';

function memberCard(member) {
  return `
    <article class="member-card">
      <a class="member-photo" href="#/member/${member.id}">${avatarHtml(member, 'lg')}</a>
      <div class="member-body">
        <h3><a href="#/member/${member.id}">${escapeHtml(member.full_name)}</a></h3>
        <p class="meta">${member.age ?? '—'} jir · ${escapeHtml(member.city || '')} · ${escapeHtml(member.country || '')}</p>
        <p class="meta">${escapeHtml(maritalLabel(member.marital_status))} · ${escapeHtml(member.education || '')}</p>
        <p class="muted member-bio">${escapeHtml((member.bio || '').slice(0, 110))}${(member.bio || '').length > 110 ? '…' : ''}</p>
        <a class="btn btn-outline btn-sm" href="#/member/${member.id}">Dabool</a>
      </div>
    </article>`;
}

export async function render(container, params) {
  const path = window.location.hash.replace(/^#/, '').split('?')[0];
  if (path === '/member') {
    const id = params.get('id');
    if (id) return renderDetail(container, id);
  }
  await renderDirectory(container, params);
}

async function renderDirectory(container, params) {
  const q = params.get('q') || '';
  container.innerHTML = `
    <section class="section">
      <div class="container">
        <h1>Xogta xubinta</h1>
        <p class="muted">Halkan ku waa xubinta la ansixiyay. Waxaad raadi kartaa magaca.</p>
        <form data-form="search" role="search" class="member-actions" style="margin-bottom:1.5rem">
          <label class="skip-link" for="member-search">Raadi magaca</label>
          <input id="member-search" name="q" type="search" placeholder="Raadi magaca…" value="${escapeHtml(q)}" style="min-width:240px" />
          <button class="btn btn-green" type="submit">Raadi</button>
        </form>
        <div data-role="list">${loading()}</div>
      </div>
    </section>`;

  const host = container.querySelector('[data-role="list"]');
  const form = container.querySelector('[data-form="search"]');

  async function load(query) {
    host.innerHTML = loading();
    try {
      const result = await api.get(`/api/members?q=${encodeURIComponent(query || '')}`);
      host.innerHTML = result.members.length
        ? `<div class="grid grid-3">${result.members.map(memberCard).join('')}</div>`
        : emptyState('Cidna lama helin', 'Wax qof oo magacaas la mid ah ma jiro.', '🔍');
    } catch (err) {
      host.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = form.q.value.trim();
    window.location.hash = value ? `#/members?q=${encodeURIComponent(value)}` : '#/members';
    const current = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('q') || '';
    if (current === value) load(value);
  });

  await load(q);
}

async function renderDetail(container, id) {
  container.innerHTML = `<section class="section"><div class="container">${loading()}</div></section>`;
  let member;
  try {
    const result = await api.get(`/api/members/${encodeURIComponent(id)}`);
    member = result.member;
  } catch (err) {
    container.innerHTML = `<section class="section"><div class="container">
      <div class="alert alert-error">${escapeHtml(err.message)}</div>
      <p><a href="#/members">← Dib u soo gal liiska</a></p></div></section>`;
    return;
  }

  const isSelf = state.user && Number(state.user.id) === Number(member.id);
  const rel = member.relationship || {};

  container.innerHTML = `
    <section class="section">
      <div class="container">
        <p><a href="#/members">← Dib u soo gal liiska</a></p>
        <div class="card profile-head">
          ${avatarHtml(member, 'xl')}
          <div>
            <h1 style="margin:0">${escapeHtml(member.full_name)}</h1>
            <p class="meta">${member.age ?? '—'} jir · ${escapeHtml(maritalLabel(member.marital_status))} · ${escapeHtml(member.gender === 'Male' ? 'Nin' : 'Naftimo')}</p>
            <p class="meta">${escapeHtml(member.city || '')}, ${escapeHtml(member.country || '')}</p>
          </div>
        </div>

        <div class="grid grid-2" style="margin-top:1.5rem">
          <div class="card">
            <h2>Xogta</h2>
            <ul class="detail-list">
              <li><strong>Waxbarasho:</strong> ${escapeHtml(member.education || '—')}</li>
              <li><strong>Shaqo:</strong> ${escapeHtml(member.occupation || '—')}</li>
              <li><strong>Magaalo:</strong> ${escapeHtml(member.city || '—')}</li>
              <li><strong>Dal:</strong> ${escapeHtml(member.country || '—')}</li>
              <li><strong>Xaalad:</strong> ${escapeHtml(maritalLabel(member.marital_status))}</li>
            </ul>
          </div>
          <div class="card">
            <h2>Hordhac</h2>
            <p>${escapeHtml(member.bio || '—')}</p>
            ${member.partner_preferences ? `<h3 style="margin-top:1rem">Waxaad raadinayso</h3>
              <p class="muted">${escapeHtml(member.partner_preferences)}</p>` : ''}
          </div>
        </div>

        <div class="member-actions" style="margin-top:1.5rem">
          <a class="btn btn-outline" href="#/members">Dib u soo gal liiska</a>
          ${isSelf ? '<a class="btn btn-green" href="#/dashboard">Xogtaada wax ka beddel</a>' : ''}
          ${!isSelf && state.user && state.user.role !== 'admin' ? `
            <button class="btn btn-green" data-role="chat-request">Dir codsasho wadat ah</button>
            <button class="btn btn-danger btn-sm" data-role="report">Warbixin</button>
          ` : ''}
        </div>
        <div data-role="feedback" style="margin-top:1rem"></div>
      </div>
    </section>`;

  const feedback = container.querySelector('[data-role="feedback"]');
  const chatBtn = container.querySelector('[data-role="chat-request"]');
  const reportBtn = container.querySelector('[data-role="report"]');

  if (chatBtn) {
    chatBtn.addEventListener('click', async () => {
      chatBtn.disabled = true;
      try {
        const result = await api.post('/api/chat-requests', { recipient_id: Number(member.id) });
        feedback.innerHTML = `<div class="alert alert-success">${escapeHtml(result.message)}</div>`;
        chatBtn.remove();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.';
        feedback.innerHTML = `<div class="alert alert-warn">${escapeHtml(message)}</div>`;
        chatBtn.disabled = false;
      }
    });
  }

  if (reportBtn) {
    reportBtn.addEventListener('click', async () => {
      const reason = window.prompt('Sababta warbixinta? (Tusaale: Fariin aan wanaagsanayn)');
      if (!reason) return;
      const details = window.prompt('Faadhin faahfaahin (ikhtiyaari):') || '';
      try {
        const result = await api.post('/api/notifications/reports', {
          reported_user_id: Number(member.id),
          reason: reason.trim(),
          details: details.trim(),
        });
        toast(result.message, 'success');
        reportBtn.remove();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
      }
    });
  }

  if (rel.blocked_me) {
    feedback.innerHTML = '<div class="alert alert-warn">Xogtaadan waa la xannibay, sidaas darteed codsasho ma dir karo.</div>';
  }
  void confirmModal;
}
