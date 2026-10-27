import { api, ApiError } from '../api.js';
import {
  avatarHtml, escapeHtml, fieldError, loading, maritalLabel, setLoading, toast,
  MARITAL_OPTIONS,
} from '../ui.js';
import { state, navigate, refreshCounts } from '../app.js';

const GENDER_LABELS = { Male: 'Nin', Female: 'Naftimo' };

export async function render(container) {
  const user = state.user;
  if (!user) { navigate('/login'); return; }

  const status = user.approval_status;

  if (user.role === 'admin') {
    container.innerHTML = `
      <section class="section"><div class="container">
        <div class="card"><h1>Maamulka Guurdoon</h1>
          <p class="muted">Ku soo gal bogga maamulka si aad xogtaada u ansixiso.</p>
          <a class="btn btn-green" href="#/admin">Bogga maamulka</a>
        </div>
      </div></section>`;
    return;
  }

  if (status === 'PENDING') {
    container.innerHTML = `
      <section class="section"><div class="container">
        <div class="card centered">
          <div class="waiting-graphic" aria-hidden="true">⏳</div>
          <h1>Diiwaangelintaada waa la helay. Fadlan sug ansixinta maamulka.</h1>
          <p class="muted">Maamulku wuxuu eegayaa diiwaangelintaada. Marka la ansixiyo
             ayaad ku soo gal kartaa xogta xubinta.</p>
          <div class="member-actions" style="justify-content:center">
            <button class="btn btn-outline" data-role="refresh">Hubi xaaladda</button>
            <button class="btn btn-ghost" data-role="logout">Soo bax</button>
          </div>
          <div data-role="status-note" style="margin-top:1rem"></div>
        </div>
      </div></section>`;
    container.querySelector('[data-role="refresh"]').addEventListener('click', async () => {
      await refreshCounts();
      try {
        const result = await api.get('/api/auth/me');
        if (result.user?.approval_status !== 'PENDING') {
          state.user = result.user;
          toast('Akoonkaaga waa la ansixiyay!', 'success');
          navigate('/dashboard');
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } else {
          toast('Weli ma jiro ansixin.', 'info');
        }
      } catch { toast('Wax qalab ah ayaa jaba.', 'error'); }
    });
    container.querySelector('[data-role="logout"]').addEventListener('click', () => {
      document.getElementById('logout-btn')?.click();
    });
    return;
  }

  if (status === 'REJECTED' || status === 'SUSPENDED') {
    container.innerHTML = `
      <section class="section"><div class="container">
        <div class="card centered">
          <h1>${status === 'SUSPENDED' ? 'Akoonkaaga waa la istaagay' : 'Diiwaangelintaada waa la diiday'}</h1>
          <p class="muted">${status === 'SUSPENDED'
            ? 'Xogtaadaada waa la istaagay. Fadlan la xiriir maamulka Guurdoon.'
            : 'Waxaad soo xogtaada ka beddeli kartaa oo dib u soo codsataa ansixin.'}</p>
          ${user.admin_note ? `<p class="alert alert-warn">${escapeHtml(user.admin_note)}</p>` : ''}
          <div class="member-actions" style="justify-content:center">
            ${status === 'REJECTED' ? '<a class="btn btn-green" href="#/dashboard">Wax ka beddel xogtaada</a>' : ''}
            <button class="btn btn-ghost" data-role="logout">Soo bax</button>
          </div>
        </div>
      </div></section>`;
    container.querySelector('[data-role="logout"]').addEventListener('click', () => {
      document.getElementById('logout-btn')?.click();
    });
    return;
  }

  // Approved member → profile management.
  container.innerHTML = `
    <section class="section"><div class="container">
      <h1>Aqoonkayga</h1>
      <div class="grid grid-2">
        <div class="card">
          <h2>Sawirka</h2>
          <div data-role="photo">${loading()}</div>
        </div>
        <div class="card">
          <h2>Xogtaada</h2>
          <p class="muted">Magacaada: ${escapeHtml(user.full_name)} · ${escapeHtml(user.email || user.phone || '')}</p>
          <p class="muted">Xaaladda: <span class="badge badge-success">La ansixiyay</span></p>
        </div>
      </div>

      <div class="card" style="margin-top:1.5rem">
        <h2>Wax ka beddel xogtaada</h2>
        <form data-form="profile" novalidate>
          <div class="form-grid">
            <div class="field">
              <label for="full_name">Magaca oo dhan</label>
              <input id="full_name" name="full_name" required />
              <div data-error="full_name"></div>
            </div>
            <div class="field">
              <label for="date_of_birth">Taariikhda dhalashada</label>
              <input id="date_of_birth" name="date_of_birth" type="date" required />
              <div data-error="date_of_birth"></div>
            </div>
            <div class="field">
              <label for="gender">Jinsi</label>
              <select id="gender" name="gender" required>
                <option value="">Door</option>
                <option value="Male">Nin</option>
                <option value="Female">Naftimo</option>
              </select>
              <div data-error="gender"></div>
            </div>
            <div class="field">
              <label for="marital_status">Xaaladda qaabka noloshaada</label>
              <select id="marital_status" name="marital_status" required>
                <option value="">Door</option>
                ${MARITAL_OPTIONS.map((o) => `<option value="${o}">${escapeHtml(maritalLabel(o))}</option>`).join('')}
              </select>
              <div data-error="marital_status"></div>
            </div>
            <div class="field">
              <label for="country">Dalka</label>
              <input id="country" name="country" required />
              <div data-error="country"></div>
            </div>
            <div class="field">
              <label for="city">Magaalada</label>
              <input id="city" name="city" required />
              <div data-error="city"></div>
            </div>
            <div class="field">
              <label for="education">Waxbarasho</label>
              <input id="education" name="education" required />
              <div data-error="education"></div>
            </div>
            <div class="field">
              <label for="occupation">Shaqo</label>
              <input id="occupation" name="occupation" required />
              <div data-error="occupation"></div>
            </div>
          </div>
          <div class="field">
            <label for="bio">Hordhac</label>
            <textarea id="bio" name="bio" rows="4" required></textarea>
            <div data-error="bio"></div>
          </div>
          <div class="field">
            <label for="partner_preferences">Waxaad raadinayso</label>
            <textarea id="partner_preferences" name="partner_preferences" rows="3"></textarea>
          </div>
          <div data-role="form-error"></div>
          <button class="btn btn-green" type="submit">Kaydi</button>
        </form>
      </div>

      <div class="card" style="margin-top:1.5rem">
        <h2>Beddel erayada sirta</h2>
        <form data-form="password" novalidate>
          <div class="form-grid">
            <div class="field">
              <label for="current_password">Eraya sirta hadda</label>
              <input id="current_password" name="current_password" type="password" required />
            </div>
            <div class="field">
              <label for="new_password">Eraya sirta cusub</label>
              <input id="new_password" name="new_password" type="password" required />
            </div>
          </div>
          <div data-role="pw-error"></div>
          <button class="btn btn-outline" type="submit">Beddel erayada sirta</button>
        </form>
      </div>

      <div class="card" style="margin-top:1.5rem">
        <h2>Liiska xannibay</h2>
        <div data-role="blocks">${loading()}</div>
      </div>
    </div></section>`;

  const form = container.querySelector('[data-form="profile"]');
  const photoHost = container.querySelector('[data-role="photo"]');
  const blocksHost = container.querySelector('[data-role="blocks"]');

  async function loadProfile() {
    const result = await api.get('/api/profile');
    const me = result.user;
    state.user = me;
    form.full_name.value = me.full_name || '';
    form.date_of_birth.value = me.date_of_birth || '';
    form.gender.value = me.gender || '';
    form.marital_status.value = me.marital_status || '';
    form.country.value = me.country || '';
    form.city.value = me.city || '';
    form.education.value = me.education || '';
    form.occupation.value = me.occupation || '';
    form.bio.value = me.bio || '';
    form.partner_preferences.value = me.partner_preferences || '';

    photoHost.innerHTML = `
      <div class="photo-row">
        ${avatarHtml(me, 'xl')}
        <div>
          <input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
          <button class="btn btn-outline btn-sm" data-role="choose-photo">Beddel sawirka</button>
          ${me.profile_photo_url ? '<button class="btn btn-ghost btn-sm" data-role="remove-photo">Ka saar sawirka</button>' : ''}
          <p class="muted" style="margin-top:.5rem">JPG, PNG ama WEBP (4MB ilaa).</p>
        </div>
      </div>`;
    photoHost.querySelector('[data-role="choose-photo"]').addEventListener('click', () => {
      photoHost.querySelector('#photo-input').click();
    });
    photoHost.querySelector('#photo-input').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const data = new FormData();
      data.append('photo', file);
      try {
        const result2 = await api.post('/api/profile/photo', data);
        state.user = result2.user;
        toast(result2.message, 'success');
        await loadProfile();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Sawirka ma uu dheemin.', 'error');
      }
    });
    const removeBtn = photoHost.querySelector('[data-role="remove-photo"]');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        try {
          const result2 = await api.del('/api/profile/photo');
          state.user = result2.user;
          toast(result2.message, 'success');
          await loadProfile();
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Sawirka ma la saarin.', 'error');
        }
      });
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const errorHost = container.querySelector('[data-role="form-error"]');
    form.querySelectorAll('[data-error]').forEach((el) => { el.innerHTML = ''; });
    errorHost.innerHTML = '';
    setLoading(button, true, 'Waa la kaydiyayaa…');
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const result = await api.put('/api/profile', body);
      state.user = result.user;
      toast(result.message, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        Object.entries(err.errors).forEach(([key, message]) => {
          const host = form.querySelector(`[data-error="${key}"]`);
          if (host) host.innerHTML = fieldError(err.errors, key);
        });
      }
      errorHost.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    } finally {
      setLoading(button, false);
    }
  });

  const pwForm = container.querySelector('[data-form="password"]');
  pwForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = pwForm.querySelector('button[type="submit"]');
    const errorHost = container.querySelector('[data-role="pw-error"]');
    errorHost.innerHTML = '';
    setLoading(button, true, 'Waa la beddelay…');
    try {
      const body = Object.fromEntries(new FormData(pwForm).entries());
      const result = await api.post('/api/auth/password', body);
      toast(result.message, 'success');
      pwForm.reset();
    } catch (err) {
      errorHost.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    } finally {
      setLoading(button, false);
    }
  });

  async function loadBlocks() {
    try {
      const result = await api.get('/api/notifications/blocks');
      if (!result.blocked.length) {
        blocksHost.innerHTML = '<p class="muted">Ma jiro cidna oo aad xannibayso.</p>';
        return;
      }
      blocksHost.innerHTML = `<ul class="plain-list">${result.blocked.map((row) => `
        <li class="list-row">
          <span>${escapeHtml(row.full_name)}</span>
          <button class="btn btn-ghost btn-sm" data-unblock="${row.id}">Xannibadda ka saar</button>
        </li>`).join('')}</ul>`;
      blocksHost.querySelectorAll('[data-unblock]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            const result2 = await api.del(`/api/notifications/blocks/${btn.dataset.unblock}`);
            toast(result2.message, 'success');
            loadBlocks();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
          }
        });
      });
    } catch (err) {
      blocksHost.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  await loadProfile();
  await loadBlocks();
  void GENDER_LABELS;
}
