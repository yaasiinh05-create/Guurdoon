import { api, ApiError } from '../api.js';
import { escapeHtml, fieldError, setLoading, toast } from '../ui.js';

const COUNTRIES = ['Somalia', 'Kenya', 'Ethiopia', 'Djibouti', 'Uganda', 'Yemen', 'USA', 'UK', 'Canada', 'UAE', 'Qatar', 'Saudi Arabia', 'Other'];

function countryOptions(selected) {
  return COUNTRIES.map((c) => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`).join('');
}

export function renderLogin(container) {
  container.innerHTML = `
    <section class="section">
      <div class="container">
        <div class="form-card" style="max-width:480px;margin:0 auto">
          <h1>Soo Gal</h1>
          <p class="muted">Ku soo gal si aad qofyaasha kale u aragto.</p>
          <div class="alert alert-error hidden" data-role="form-error"></div>
          <form data-form="login" novalidate>
            <div class="field">
              <label for="login-identifier">Email ama telefoon</label>
              <input id="login-identifier" name="identifier" type="text" autocomplete="username" required />
            </div>
            <div class="field">
              <label for="login-password">Eray sirta</label>
              <input id="login-password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <button type="submit" class="btn btn-green btn-block">Soo Gal</button>
          </form>
          <p class="muted" style="margin-top:1rem">
            <a href="#/forgot-password">Erayada sirta maad iloobtid?</a><br />
            Akoon ma jirto? <a href="#/register">Diiwaangeli</a>
          </p>
        </div>
      </div>
    </section>`;

  const form = container.querySelector('[data-form="login"]');
  const errorBox = container.querySelector('[data-role="form-error"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Waa la soo galayaa…');
    try {
      const result = await api.post('/api/auth/login', {
        identifier: form.identifier.value.trim(),
        password: form.password.value,
      });
      toast(result.message, 'success');
      window.location.hash = '#/dashboard';
      window.location.reload();
    } catch (err) {
      setLoading(button, false);
      errorBox.textContent = err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.';
      errorBox.classList.remove('hidden');
    }
  });
}

export function renderRegister(container) {
  const maxDob = new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  container.innerHTML = `
    <section class="section">
      <div class="container">
        <div class="form-card" style="max-width:760px;margin:0 auto">
          <h1>Diiwaangeli</h1>
          <p class="muted">Buugga waxaad qorto waa la ansixiyo maamulka ka hor intaadan qofyaasha kale aragto.</p>
          <div class="alert alert-error hidden" data-role="form-error"></div>
          <form data-form="register" novalidate>
            <div class="form-row">
              <div class="field">
                <label for="r-name">Magaca oo dhan *</label>
                <input id="r-name" name="full_name" type="text" required />
                <div data-error="full_name"></div>
              </div>
              <div class="field">
                <label for="r-contact">Email ama telefoon *</label>
                <input id="r-contact" name="contact" type="text" placeholder="name@example.com" required />
                <div data-error="contact"></div>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="r-pass">Eray sirta *</label>
                <input id="r-pass" name="password" type="password" autocomplete="new-password" required />
                <div data-error="password"></div>
              </div>
              <div class="field">
                <label for="r-pass2">Xaqiiji eray sirta *</label>
                <input id="r-pass2" name="password_confirm" type="password" autocomplete="new-password" required />
                <div data-error="password_confirm"></div>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="r-gender">Jinsi *</label>
                <select id="r-gender" name="gender" required>
                  <option value="">Door</option>
                  <option value="Male">Nin</option>
                  <option value="Female">Naftimo</option>
                </select>
                <div data-error="gender"></div>
              </div>
              <div class="field">
                <label for="r-dob">Taariikhda dhalashada *</label>
                <input id="r-dob" name="date_of_birth" type="date" max="${maxDob}" required />
                <div data-error="date_of_birth"></div>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="r-marital">Xaalada qaabka noloshaada *</label>
                <select id="r-marital" name="marital_status" required>
                  <option value="">Door</option>
                  <option value="Single">Single (Gogos)</option>
                  <option value="Gabar">Gabar</option>
                  <option value="Garoob">Garoob</option>
                  <option value="Xaasle">Xaasle</option>
                </select>
                <div data-error="marital_status"></div>
              </div>
              <div class="field">
                <label for="r-country">Dalka *</label>
                <select id="r-country" name="country" required>${countryOptions('')}</select>
                <div data-error="country"></div>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="r-city">Magaalada *</label>
                <input id="r-city" name="city" type="text" required />
                <div data-error="city"></div>
              </div>
              <div class="field">
                <label for="r-education">Heerka waxbarashada *</label>
                <input id="r-education" name="education" type="text" placeholder="Tusaale: Baccalaureate / Jaamacad" required />
                <div data-error="education"></div>
              </div>
            </div>
            <div class="field">
              <label for="r-occupation">Shaqada *</label>
              <input id="r-occupation" name="occupation" type="text" required />
              <div data-error="occupation"></div>
            </div>
            <div class="field">
              <label for="r-bio">Hordhac gaaban *</label>
              <textarea id="r-bio" name="bio" rows="3" required></textarea>
              <div data-error="bio"></div>
            </div>
            <div class="field">
              <label for="r-prefs">Qaabka aad raadinayso (ikhtiyaari)</label>
              <textarea id="r-prefs" name="partner_preferences" rows="2"></textarea>
            </div>
            <div class="field">
              <label for="r-photo">Sawirka (ikhtiyaari)</label>
              <input id="r-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
              <p class="muted">Sawirka waxaa la soo rarayaa kadibna xogtaada la ansixiyo.</p>
            </div>
            <button type="submit" class="btn btn-gold btn-block">Soo Diiwaangeli</button>
          </form>
        </div>
      </div>
    </section>`;

  const form = container.querySelector('[data-form="register"]');
  const errorBox = container.querySelector('[data-role="form-error"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    form.querySelectorAll('[data-error]').forEach((node) => { node.innerHTML = ''; });

    const payload = {
      full_name: form.full_name.value.trim(),
      contact: form.contact.value.trim(),
      password: form.password.value,
      password_confirm: form.password_confirm.value,
      gender: form.gender.value,
      date_of_birth: form.date_of_birth.value,
      marital_status: form.marital_status.value,
      country: form.country.value,
      city: form.city.value.trim(),
      education: form.education.value.trim(),
      occupation: form.occupation.value.trim(),
      bio: form.bio.value.trim(),
      partner_preferences: form.partner_preferences.value.trim(),
    };

    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Waa la diiwangeliyaa…');
    try {
      const result = await api.post('/api/auth/register', payload);
      const photo = form.photo.files[0];
      if (photo) {
        const data = new FormData();
        data.append('photo', photo);
        try { await api.post('/api/profile/photo', data); } catch { /* non-fatal */ }
      }
      toast(result.message, 'success');
      window.location.hash = '#/dashboard';
      window.location.reload();
    } catch (err) {
      setLoading(button, false);
      const errors = err instanceof ApiError ? err.errors : {};
      Object.entries(errors).forEach(([key, message]) => {
        const node = form.querySelector(`[data-error="${key}"]`);
        if (node) node.innerHTML = fieldError(errors, key);
      });
      errorBox.textContent = err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.';
      errorBox.classList.remove('hidden');
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

export function renderForgotPassword(container) {
  container.innerHTML = `
    <section class="section">
      <div class="container">
        <div class="form-card" style="max-width:520px;margin:0 auto">
          <h1>Diiwaangelin eray sirta</h1>
          <p class="muted">Gali email/telefoon. Haddii lacaggu jiro, hab lagu soo galo waa lagu soo xerolayaa.</p>
          <div class="alert alert-error hidden" data-role="form-error"></div>
          <div class="alert alert-success hidden" data-role="form-ok"></div>
          <form data-form="forgot" novalidate>
            <div class="field">
              <label for="f-id">Email ama telefoon</label>
              <input id="f-id" name="identifier" type="text" required />
            </div>
            <button type="submit" class="btn btn-green btn-block">Dir</button>
          </form>
          <p class="muted" style="margin-top:1rem"><a href="#/login">← Dib u soo gal</a></p>
        </div>
      </div>
    </section>`;

  const form = container.querySelector('[data-form="forgot"]');
  const errorBox = container.querySelector('[data-role="form-error"]');
  const okBox = container.querySelector('[data-role="form-ok"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    okBox.classList.add('hidden');
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Waa la dirayaa…');
    try {
      const result = await api.post('/api/auth/password-reset/request', { identifier: form.identifier.value.trim() });
      okBox.textContent = `${result.message}${result.admin_note ? ` ${result.admin_note}` : ''}`;
      okBox.classList.remove('hidden');
      form.reset();
    } catch (err) {
      errorBox.textContent = err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.';
      errorBox.classList.remove('hidden');
    } finally {
      setLoading(button, false);
    }
  });
}

export { escapeHtml };
