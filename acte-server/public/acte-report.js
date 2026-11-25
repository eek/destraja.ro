// „Raportează o greșeală” pe paginile actelor: formularul de la finalul paginii, deschis și de butoanele
// „semnalează” de lângă legături. Turnstile se încarcă doar când formularul se deschide; raportul merge la
// https://destraja.ro/api/report/act (worker/act-report.ts). Servit de serverul actelor ca /_static/acte-report.js.
(function () {
  var box = document.getElementById('raporteaza');
  if (!box) return;
  var form = box.querySelector('form');
  var status = box.querySelector('[data-report-status]');
  var about = box.querySelector('[data-report-about]');
  var relInput = form.querySelector('input[name=relation]');
  var slot = box.querySelector('[data-turnstile]');
  var defaultAbout = about.textContent;
  var token = null;
  var widget = null;
  var loading = null;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () { window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')); };
      s.onerror = function () { loading = null; reject(new Error('turnstile')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function theme() {
    var a = document.documentElement.getAttribute('data-theme');
    return a === 'light' || a === 'dark' ? a : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function ensureWidget() {
    if (widget !== null) return;
    widget = '';
    loadTurnstile().then(function (ts) {
      widget = ts.render(slot, {
        sitekey: box.getAttribute('data-sitekey'),
        action: 'turnstile-spin-v2',
        theme: theme(),
        language: 'ro',
        callback: function (t) { token = t; },
        'expired-callback': function () { token = null; },
        'error-callback': function () { token = null; },
      });
    }).catch(function () {
      widget = null;
      status.textContent = 'Verificarea anti-roboți nu s-a putut încărca. Verifică dacă un blocant de reclame oprește challenges.cloudflare.com, sau scrie-ne la contact@destraja.ro.';
    });
  }

  box.addEventListener('toggle', function () { if (box.open) ensureWidget(); });

  [].forEach.call(document.querySelectorAll('[data-report-rel]'), function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      relInput.value = b.getAttribute('data-report-rel');
      about.textContent = 'Despre legătura: ' + b.getAttribute('data-report-label');
      box.open = true;
      ensureWidget();
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.querySelector('textarea').focus({ preventScroll: true });
    });
  });
  var reset = box.querySelector('[data-report-reset]');
  if (reset) reset.addEventListener('click', function () { relInput.value = ''; about.textContent = defaultAbout; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var comment = form.comment.value.trim();
    if (comment.length < 10) { status.textContent = 'Scrie măcar o propoziție (cel puțin 10 caractere).'; return; }
    if (!token) { status.textContent = 'Așteaptă verificarea anti-roboți de mai sus, apoi trimite din nou.'; return; }
    var body = {
      kind: relInput.value ? 'relatie' : 'act',
      act: box.getAttribute('data-act'),
      relation: relInput.value || undefined,
      generation: Number(box.getAttribute('data-generation')) || undefined,
      type: form.type.value || undefined,
      comment: comment,
      token: token,
    };
    var button = form.querySelector('button[type=submit]');
    button.disabled = true;
    status.textContent = 'Se trimite…';
    fetch('https://destraja.ro/api/report/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (r) {
        if (r.ok) {
          form.reset();
          relInput.value = '';
          about.textContent = defaultAbout;
          status.textContent = 'Mulțumim. Am primit raportul; până îl verificăm, legătura semnalată nu mai intră în numărătoarea modificărilor.';
        } else {
          var why = { rate_limited: 'Prea multe rapoarte într-un minut; încearcă puțin mai târziu.', captcha: 'Verificarea anti-roboți a expirat; încearcă din nou.', comment_length: 'Textul are între 10 și 1.000 de caractere.', busy: 'Avem prea multe rapoarte neverificate acum; încearcă mâine.' }[r.d.error];
          status.textContent = why || 'Raportul nu s-a putut trimite (' + r.status + '). Ne poți scrie la contact@destraja.ro.';
        }
      })
      .catch(function () { status.textContent = 'Raportul nu s-a putut trimite (rețea). Ne poți scrie la contact@destraja.ro.'; })
      .then(function () {
        button.disabled = false;
        token = null;
        if (window.turnstile && widget) window.turnstile.reset(widget);
      });
  });
})();
