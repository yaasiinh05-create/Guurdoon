import { api } from '../api.js';
import { avatarHtml, emptyState, escapeHtml, loading, maritalLabel } from '../ui.js';

function memberCard(member) {
  return `
    <article class="member-card">
      <a class="member-photo" href="#/member/${member.id}">
        ${avatarHtml(member, 'lg')}
      </a>
      <div class="member-body">
        <h3><a href="#/member/${member.id}">${escapeHtml(member.full_name)}</a></h3>
        <p class="meta">
          ${member.age ?? '—'} jir · ${escapeHtml(member.city || '')} · ${escapeHtml(member.country || '')}
        </p>
        <p class="meta">${escapeHtml(maritalLabel(member.marital_status))} · ${escapeHtml(member.occupation || '')}</p>
        <p class="muted member-bio">${escapeHtml((member.bio || '').slice(0, 120))}${(member.bio || '').length > 120 ? '…' : ''}</p>
        <a class="btn btn-outline btn-sm" href="#/member/${member.id}">Dabool</a>
      </div>
    </article>`;
}

export async function render(container, params) {
  const q = params.get('q') || '';
  container.innerHTML = `
    <section class="hero">
      <div class="container">
        <p class="hero-tag">Ku soo dhawoow Guurdoon</p>
        <h1>Hel lammaanaha noloshaada</h1>
        <p class="muted">Guurdoon waa goob lagu helo lammaanaha noloshaada si ammaan ah oo lagu kalsoocaado.
        Diiwaangelintaada waxaa maamulka ansixiyaa ka hor intaadan qofyaasha kale aragto.</p>
        <div class="hero-actions">
          <a class="btn btn-gold" href="#/register">Diiwaangeli</a>
          <a class="btn btn-outline" href="#/login">Soo Gal</a>
        </div>
      </div>
    </section>

    <section class="section section-alt" id="how-it-works">
      <div class="container">
        <h2 class="text-center">Sidee Guurdoon u shaqeeyaa?</h2>
        <div class="grid grid-4">
          <div class="step"><span class="step-num">1</span><h3>Diiwaangeli</h3>
            <p class="muted">Gali xogtaadaada oo sawirka hadda iyo kooxda.</p></div>
          <div class="step"><span class="step-num">2</span><h3>Ansixinta</h3>
            <p class="muted">Maamulku wuxuu eegayaa diiwaangelintaada oo wuxuu ansixiyaa.</p></div>
          <div class="step"><span class="step-num">3</span><h3>Raadi</h3>
            <p class="muted">Soo gal xogta xubinta la ansixiyay oo raadi magaca.</p></div>
          <div class="step"><span class="step-num">4</span><h3>Wada hadal</h3>
            <p class="muted">Dir codsasho oo qofka ku soo jeeda hadal kula sheeg.</p></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="member-actions" style="justify-content:space-between;flex-wrap:wrap;gap:1rem">
          <h2 style="margin:0">Xogta xubinta</h2>
          <form data-form="search" class="member-actions" role="search" style="gap:.5rem">
            <label class="skip-link" for="home-search">Raadi magaca</label>
            <input id="home-search" name="q" type="search" placeholder="Raadi magaca…" value="${escapeHtml(q)}" style="min-width:220px" />
            <button class="btn btn-green" type="submit">Raadi</button>
          </form>
        </div>
        <div data-role="members">${loading()}</div>
      </div>
    </section>`;

  const host = container.querySelector('[data-role="members"]');
  const form = container.querySelector('[data-form="search"]');

  async function load(query) {
    host.innerHTML = loading();
    try {
      const result = await api.get(`/api/members?q=${encodeURIComponent(query || '')}`);
      if (!result.members.length) {
        host.innerHTML = emptyState(
          'Cidna lama helin',
          query ? 'Magac kale tii raadi. Diiwaangelinta cusub ma qaari karo.' : 'Halkan ayuu hadda jiraa xog la ansixiyay.',
          '🔍',
        );
        return;
      }
      host.innerHTML = `<div class="grid grid-3">${result.members.map(memberCard).join('')}</div>`;
    } catch (err) {
      host.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = form.q.value.trim();
    window.location.hash = value ? `#/?q=${encodeURIComponent(value)}` : '#/';
    if (currentQuery() === value) load(value);
  });

  await load(q);
}

function currentQuery() {
  const hash = window.location.hash.replace(/^#/, '');
  const [, query] = hash.split('?');
  return new URLSearchParams(query || '').get('q') || '';
}
