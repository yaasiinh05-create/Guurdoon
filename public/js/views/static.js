import { escapeHtml } from '../ui.js';

export async function render(container) {
  const hash = window.location.hash.replace(/^#/, '');
  const isContact = hash.startsWith('/contact');

  container.innerHTML = `
    <section class="section"><div class="container narrow">
      <div class="card">
        ${isContact ? contactHtml() : privacyHtml()}
      </div>
    </div></section>`;
  void escapeHtml;
}

function contactHtml() {
  return `
    <h1>Naga soo hadal</h1>
    <p class="muted">Wixii su'aal, talo, ama cabbir ah oo aad haysato, halkan ka qor.</p>
    <dl class="detail-list">
      <dt>Imayl</dt><dd>hello@guurdoon.example</dd>
      <dt>Telefoon</dt><dd>+252 00 000 0000</dd>
      <dt>Waqtiyada xidhmada</dt><dd>Sabti – Khamiista, 09:00 – 17:00 (EET)</dd>
      <dt>Goobta</dt><dd>Muqdisho, Soomaaliya</dd>
    </dl>
    <div class="alert alert-info">
      <strong>Ogolaansho:</strong> Annaga ha ka sheegino ciyaaraha ama xogtaada gaarka ah ee
      xubinta kale — sidaan e-mail ama fariin gaarka ah. Ma jiraan "guurdoon@example"
      oo rasmiga ah sidoo kale, soo hadal adigoo aad admiinka ka shaqeeysan.
    </div>
    <p><a class="btn btn-outline" href="#/privacy">Siyaasadda Asturnaanta</a></p>`;
}

function privacyHtml() {
  return `
    <h1>Siyaasadda Asturnaanta</h1>
    <p class="muted">Guurdoon wuxuu ilaaliyaa xogtaadaada sida ku habboon.</p>

    <h2>1. Xogta aan ka ururinno</h2>
    <p>Magaca oo dhan, taariikhda dhalashada, jinsi, xaaladda qaabka noloshaada, dalka, magaalada,
       waxbarashada, shaqada, hordhaca, sawirka, iyo xogta la xiriirka ah.</p>

    <h2>2. Eeraya sirta</h2>
    <p>Erayada sirta waxaa lagu keydiyaa hashed (scrypt) — marnaba farri kasta oo daabac ah.
       Ma sharqaan, ma iimaylna aanu xiriirinayno xogtaadaada kadib.</p>

    <h2>3. Wada hadallada</h2>
    <p>Wada hadalladu waa kaliya labada qof ee codsiga wadat ah ayay yeeshaan.
       Maamulku akoon ma leh, haddii aanad u sheegin, wuxuu arki karo oo keliya
       tirakoobka (tirinta, taariikhda) — marnaba fariinka.</p>

    <h2>4. Xannibadda iyo warbixinta</h2>
    <p>Waad xannibaa qof, waadna warbixi kartaa. Warbixintu waxay gaartaa maamulka si uu u eego.</p>

    <h2>5. Xogtaada aan la sheegin</h2>
    <p>Ma ahaanno koor, adeeg kale, ama dalxiir. Sidee xogtaada oo la daabaco.</p>

    <h2>6. Ka saaridda xogtaadaada</h2>
    <p>Waad codsan kartaa in xogtaada la tirtiro. Xiriir naga la xiriir adigoo ka shaqeeysan.</p>

    <h2>7. Isbeddelka siyaasadda</h2>
    <p>Waxaan yeelay inaan cusubaan ku qorno, markii aan ka beddelno waxaan ku qoraynaa bogga.</p>

    <p class="muted" style="margin-top:1.5rem">La xiriir: <a href="#/contact">Naga soo hadal</a></p>`;
}
