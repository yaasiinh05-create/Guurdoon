import { api, ApiError } from '../api.js';
import {
  avatarHtml, emptyState, escapeHtml, formatDay, formatTime, loading, maritalLabel, toast,
} from '../ui.js';
import { confirmModal } from '../ui.js';
import { state } from '../app.js';

const STATUS_LABELS = {
  PENDING: 'Wixii ansixin',
  APPROVED: 'La ansixiyay',
  REJECTED: 'La diiday',
  SUSPENDED: 'La istaagay',
};

const STATUS_CLASS = {
  PENDING: 'badge-warn',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  SUSPENDED: 'badge-muted',
};

export async function render(container, params) {
  container.innerHTML = `
    <section class="section"><div class="container">
      <h1>Bogga maamulka</h1>
      <div class="stat-grid" data-role="stats">${loading()}</div>

      <div class="card" style="margin-top:1.5rem">
        <h2>Xubinta diiwaangeley</h2>
        <form class="admin-search" data-role="search-form">
          <input name="q" placeholder="Raadi magac…" />
          <select name="status">
            <option value="">Xaalad kasta</option>
            <option value="PENDING">Wixii ansixin</option>
            <option value="APPROVED">La ansixiyay</option>
            <option value="REJECTED">La diiday</option>
            <option value="SUSPENDED">La istaagay</option>
          </select>
          <button class="btn btn-green" type="submit">Raadi</button>
        </form>
        <div data-role="members">${loading()}</div>
      </div>

      <div class="card" style="margin-top:1.5rem">
        <h2>Warbixinta ku saabsan abuse-ka</h2>
        <div data-role="reports">${loading()}</div>
      </div>
    </div></section>`;

  const statsHost = container.querySelector('[data-role="stats"]');
  const membersHost = container.querySelector('[data-role="members"]');
  const reportsHost = container.querySelector('[data-role="reports"]');
  const searchForm = container.querySelector('[data-role="search-form"]');

  async function loadStats() {
    const stats = await api.get('/api/admin/stats');
    statsHost.innerHTML = `
      ${[
        ['Xubinta diiwaangeley', stats.total, '👥'],
        ['Wixii ansixin', stats.pending, '⏳'],
        ['La ansixiyay', stats.approved, '✅'],
        ['La diiday', stats.rejected, '❌'],
        ['La istaagay', stats.suspended, '⏸️'],
        ['Warbixin furan', stats.open_reports, '🚨'],
        ['Wada hadallada', stats.conversations, '💬'],
      ].map(([label, value, icon]) => `
        <div class="stat-card">
          <span class="stat-icon" aria-hidden="true">${icon}</span>
          <strong class="stat-value">${value}</strong>
          <span class="stat-label">${escapeHtml(label)}</span>
        </div>`).join('')}`;
  }

  async function loadMembers() {
    membersHost.innerHTML = loading();
    const query = new URLSearchParams();
    if (searchForm.q.value.trim()) query.set('q', searchForm.q.value.trim());
    if (searchForm.status.value) query.set('status', searchForm.status.value);
    const result = await api.get(`/api/admin/members?${query.toString()}`);
    if (!result.members.length) {
      membersHost.innerHTML = emptyState('Xubin ma jiro', 'Qofoyinka la raadiyay waa la helay.', '🔍');
      return;
    }
    membersHost.innerHTML = `
      <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Magaca</th><th>Contact</th><th>Magaalada</th><th>Taariikhda diiwaangelinta</th>
          <th>Xaaladda</th><th>Hawl</th>
        </tr></thead>
        <tbody>
          ${result.members.map((m) => `
            <tr data-id="${m.id}">
              <td>
                <button class="link-btn" data-view="${m.id}">${escapeHtml(m.full_name)}</button>
              </td>
              <td class="muted">${escapeHtml(m.email || m.phone || '—')}</td>
              <td>${escapeHtml(m.city || '—')}, ${escapeHtml(m.country || '')}</td>
              <td class="muted">${escapeHtml(formatDay(m.created_at))}</td>
              <td><span class="badge ${STATUS_CLASS[m.approval_status] || ''}">${STATUS_LABELS[m.approval_status] || m.approval_status}</span></td>
              <td class="row-actions">
                <button class="btn btn-outline btn-sm" data-view="${m.id}">Eeg</button>
                ${m.approval_status === 'PENDING' ? `
                  <button class="btn btn-green btn-sm" data-approve="${m.id}">Ansixi</button>
                  <button class="btn btn-danger btn-sm" data-reject="${m.id}">Diid</button>` : ''}
                ${m.approval_status === 'APPROVED' ? `
                  <button class="btn btn-outline btn-sm" data-suspend="${m.id}">Istaag</button>` : ''}
                ${['REJECTED', 'SUSPENDED'].includes(m.approval_status) ? `
                  <button class="btn btn-green btn-sm" data-reactivate="${m.id}">Dib u bandhig</button>` : ''}
                <button class="btn btn-ghost btn-sm" data-remove="${m.id}">Tirtiri</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>`;

    membersHost.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => showMember(Number(btn.dataset.view)));
    });
    membersHost.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => act(`/api/admin/members/${btn.dataset.approve}/approve`, {}, 'Xogtaada waa la ansixiyay.', loadMembers));
    });
    membersHost.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => act(`/api/admin/members/${btn.dataset.reject}/reject`, { note: 'Xogtaada kuma jiraan shuruudihii maamulka.' }, 'Diiwaangelinta waa la diiday.', loadMembers));
    });
    membersHost.querySelectorAll('[data-suspend]').forEach((btn) => {
      btn.addEventListener('click', () => act(`/api/admin/members/${btn.dataset.suspend}/suspend`, { note: 'Akoonka waa la istaagay.' }, 'Akoonka waa la istaagay.', loadMembers));
    });
    membersHost.querySelectorAll('[data-reactivate]').forEach((btn) => {
      btn.addEventListener('click', () => act(`/api/admin/members/${btn.dataset.reactivate}/reactivate`, {}, 'Akoonka waa la dib u soo bandhigay.', loadMembers));
    });
    membersHost.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmModal({
          title: 'Xogtaada oo tirtiri',
          message: 'Akoonkan ayaa si buuxda loo tirtiri doonaa. Ma xaqiiqaynaysaa?',
          confirmText: 'Haa, tirtiri',
        });
        if (!ok) return;
        try {
          const result = await api.del(`/api/admin/members/${btn.dataset.remove}`);
          toast(result.message, 'success');
          loadMembers();
          loadStats();
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
        }
      });
    });
  }

  async function act(url, body, successMessage, reload) {
    try {
      const result = await api.post(url, body);
      toast(result.message || successMessage, 'success');
      await reload();
      await loadStats();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
    }
  }

  async function showMember(id) {
    try {
      const result = await api.get(`/api/admin/members/${id}`);
      const m = result.member;
      const host = document.getElementById('modal-host');
      host.classList.remove('hidden');
      host.innerHTML = `
        <div class="modal">
          <div class="photo-row">
            ${avatarHtml(m, 'lg')}
            <div>
              <h3>${escapeHtml(m.full_name)}</h3>
              <p class="muted" style="margin:0">${escapeHtml(m.email || '')} ${m.phone ? '· ' + escapeHtml(m.phone) : ''}</p>
              <span class="badge ${STATUS_CLASS[m.approval_status] || ''}">${STATUS_LABELS[m.approval_status] || m.approval_status}</span>
            </div>
          </div>
          <dl class="detail-list">
            <dt>Dabadeed</dt><dd>${escapeHtml(formatDay(m.date_of_birth))} (${m.age ?? '—'} jir)</dd>
            <dt>Jinsi</dt><dd>${escapeHtml(m.gender || '—')}</dd>
            <dt>Xaaladda noloshaada</dt><dd>${escapeHtml(maritalLabel(m.marital_status))}</dd>
            <dt>Magaalada</dt><dd>${escapeHtml(m.city || '—')}, ${escapeHtml(m.country || '')}</dd>
            <dt>Waxbarasho</dt><dd>${escapeHtml(m.education || '—')}</dd>
            <dt>Shaqo</dt><dd>${escapeHtml(m.occupation || '—')}</dd>
            <dt>Hordhac</dt><dd>${escapeHtml(m.bio || '—')}</dd>
            <dt>Waxaad raadinayso</dt><dd>${escapeHtml(m.partner_preferences || '—')}</dd>
            <dt>Diiwaangelinta</dt><dd>${escapeHtml(formatTime(m.created_at))}</dd>
            <dt>Soo galiddii ugu dambeeyay</dt><dd>${escapeHtml(m.last_login_at ? formatTime(m.last_login_at) : '—')}</dd>
          </dl>
          ${m.admin_note ? `<p class="alert alert-warn">Note: ${escapeHtml(m.admin_note)}</p>` : ''}
          <div class="member-actions" style="justify-content:flex-end">
            <button class="btn btn-outline" data-modal="close">Xir</button>
          </div>
        </div>`;
      host.querySelector('[data-modal="close"]').addEventListener('click', () => {
        host.classList.add('hidden');
        host.innerHTML = '';
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
    }
  }

  async function loadReports() {
    reportsHost.innerHTML = loading();
    try {
      const result = await api.get('/api/admin/reports?status=OPEN');
      if (!result.reports.length) {
        reportsHost.innerHTML = '<p class="muted">Warbixin furan ma jirto.</p>';
        return;
      }
      reportsHost.innerHTML = `<ul class="plain-list">${result.reports.map((r) => `
        <li class="list-row">
          <div>
            <strong>${escapeHtml(r.reported_name)}</strong> waa la wariiyay
            <span class="muted">by ${escapeHtml(r.reporter_name)}</span>
            <p class="muted" style="margin:.25rem 0">${escapeHtml(r.reason)} — ${escapeHtml(r.details || '')}</p>
            <span class="muted">${escapeHtml(formatTime(r.created_at))}</span>
          </div>
          <span class="row-actions">
            <button class="btn btn-green btn-sm" data-review="${r.id}" data-status="REVIEWED">La eegay</button>
            <button class="btn btn-ghost btn-sm" data-review="${r.id}" data-status="DISMISSED">Iska dhufey</button>
          </span>
        </li>`).join('')}</ul>`;
      reportsHost.querySelectorAll('[data-review]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            const result2 = await api.post(`/api/admin/reports/${btn.dataset.review}/review`, {
              status: btn.dataset.status,
            });
            toast(result2.message, 'success');
            await loadReports();
            await loadStats();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
          }
        });
      });
    } catch (err) {
      reportsHost.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadMembers();
  });

  await Promise.all([loadStats(), loadMembers(), loadReports()]);

  const reportId = params?.get?.('report');
  const memberId = params?.get?.('member');
  if (reportId) reportsHost.scrollIntoView({ behavior: 'smooth' });
  if (memberId) showMember(Number(memberId));
  void state;
}
