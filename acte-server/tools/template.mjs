// out/acte-shell.html (pagina Next src/app/acte-shell) → template.html pentru serverul actelor, plus copiile
// CSS-ului și fonturilor pe care le folosește (design §2.3): fără scripturile Next, cu un script mic pentru antet
// (temă, meniul de pe mobil), cu legături absolute spre destraja.ro și cu /_next/static/ mutat la /acte/_static/ (copiile
// din versiune: CSS-ul site-ului de sub /_next se schimbă la fiecare publicare a site-ului, versiunea actelor nu).

import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://destraja.ro';
// Fișierele statice ale versiunii, sub prefixul paginilor (lib/render.mjs: BASE).
const STATIC = '/acte/_static/';

// Iconițele lucide pe care le desenează și React în antet (Sun, Moon, Menu, X), aceleași căi.
const svg = (cls, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${body}</svg>`;
const SUN = svg(
  'lucide lucide-sun h-[18px] w-[18px]',
  '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
);
const MOON = svg('lucide lucide-moon h-[18px] w-[18px]', '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>');
const XICON = svg('lucide lucide-x h-5 w-5', '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>');

/** Scriptul antetului: tema (buton și alegerea din subsol) și meniul de pe mobil. Fără dependențe, ~2 KB. */
export function headerScript(menuIcon) {
  const on = 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]';
  const off = 'text-muted hover:text-ink';
  return `(function(){var K='lastraja-theme',d=document.documentElement,S=${JSON.stringify(SUN)},M=${JSON.stringify(MOON)},X=${JSON.stringify(XICON)},B=${JSON.stringify(menuIcon)},ON=${JSON.stringify(on.split(' '))},OFF=${JSON.stringify(off.split(' '))};
function pref(){try{var t=localStorage.getItem(K);return t==='light'||t==='dark'?t:'system'}catch(e){return'system'}}
function res(){var a=d.getAttribute('data-theme');return a==='light'||a==='dark'?a:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
function set(p){if(p==='system')d.removeAttribute('data-theme');else d.setAttribute('data-theme',p);try{if(p==='system')localStorage.removeItem(K);else localStorage.setItem(K,p)}catch(e){}sync()}
function sync(){var dk=res()==='dark',p=pref();[].forEach.call(document.querySelectorAll('[data-acte-theme]'),function(b){b.innerHTML=dk?S:M;b.setAttribute('aria-label',dk?'Treci la tema luminoasă':'Treci la tema întunecată');b.title=dk?'Tema luminoasă':'Tema întunecată'});
[].forEach.call(document.querySelectorAll('[data-acte-pref]'),function(r){var c=r.getAttribute('data-acte-pref')===p;r.setAttribute('aria-checked',c?'true':'false');ON.forEach(function(x){r.classList.toggle(x,c)});OFF.forEach(function(x){r.classList.toggle(x,!c)})})}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-acte-theme],[data-acte-pref],[aria-controls="meniu-mobil"]');if(!t)return;
if(t.hasAttribute('data-acte-theme'))set(res()==='dark'?'light':'dark');else if(t.hasAttribute('data-acte-pref'))set(t.getAttribute('data-acte-pref'));
else{var n=document.getElementById('meniu-mobil'),o=n.hidden;n.hidden=!o;t.setAttribute('aria-expanded',o?'true':'false');t.setAttribute('aria-label',o?'Închide meniul':'Deschide meniul');t.innerHTML=o?X:B}});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',sync);sync()})();`;
}

/**
 * Transformă HTML-ul paginii-șablon. Întoarce { html, assets: [căi sub _next/static] }.
 * Aruncă o eroare dacă rezultatul nu are exact locurile așteptate sau mai conține scripturi Next.
 */
export function transformShell(src) {
  let h = src;
  // Scripturile Next și preîncărcările lor; rămâne doar scriptul temei (THEME_BOOT_SCRIPT), inline, din <head>.
  h = h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (m) => (/lastraja-theme/.test(m) && !/\bsrc=/.test(m) && !/__next_f/.test(m) ? m : ''));
  h = h.replace(/<link\b[^>]*\brel="(?:preload|modulepreload)"[^>]*\bas="script"[^>]*\/?>/g, '');
  h = h.replace(/<link\b[^>]*\bas="script"[^>]*\/?>/g, '');
  // Capul paginii vine de la server.
  h = h.replace(/<title>[\s\S]*?<\/title>/g, '');
  h = h.replace(/<meta\b[^>]*\b(?:name|property)="(?:description|robots|og:[^"]*|twitter:[^"]*)"[^>]*\/?>/g, '');
  h = h.replace(/<link\b[^>]*\brel="canonical"[^>]*\/?>/g, '');
  h = h.replace(/<meta name="next-size-adjust"[^>]*\/?>/g, '');
  h = h.replace('</head>', '<!--ACT:HEAD--></head>');
  // Fișierele statice: copiate în versiune, servite de VM.
  const assets = new Set();
  h = h.replace(/(["'(])\/_next\/static\/([A-Za-z0-9._/-]+)/g, (_, q, p) => {
    assets.add(p);
    return `${q}${STATIC}${p}`;
  });
  // Restul legăturilor relative duc pe site.
  h = h.replace(/\b(href|src)="\/(?!\/|acte\/_static\/)/g, `$1="${SITE}/`);
  h = h.replace(/\b(href|src)="\/"/g, `$1="${SITE}/"`);
  // Butoanele temei și ale meniului, pentru scriptul antetului.
  h = h.replace(/<button([^>]*aria-label="Treci la tema (?:întunecată|luminoasă)"[^>]*)>([\s\S]*?)<\/button>/g, (_, a) => `<button data-acte-theme=""${a}>${MOON}</button>`);
  const PREF = { Automată: 'system', Luminoasă: 'light', Întunecată: 'dark' };
  h = h.replace(/<button([^>]*role="radio"[^>]*)>(Automată|Luminoasă|Întunecată)<\/button>/g, (_, a, label) => `<button data-acte-pref="${PREF[label]}"${a}>${label}</button>`);
  const menu = /<button[^>]*aria-controls="meniu-mobil"[^>]*>([\s\S]*?)<\/button>/.exec(h);
  if (!menu) throw new Error('șablon: butonul meniului (aria-controls="meniu-mobil") lipsește');
  h = h.replace('</body>', `<script>${headerScript(menu[1])}</script></body>`);

  // Verificări.
  const count = (re) => (h.match(re) || []).length;
  if (count(/<!--ACT:HEAD-->/g) !== 1) throw new Error('șablon: <!--ACT:HEAD--> trebuie să apară o dată');
  if (count(/<!--ACT:MAIN-->/g) !== 1) throw new Error('șablon: <!--ACT:MAIN--> trebuie să apară o dată');
  if (/\/_next\//.test(h)) throw new Error('șablon: au rămas trimiteri la /_next/');
  if (/__next_f|self\.__next/.test(h)) throw new Error('șablon: a rămas încărcătura RSC');
  const scripts = h.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || [];
  if (scripts.length !== 2 || scripts.some((s) => /\bsrc=/.test(s))) throw new Error(`șablon: aștept exact 2 scripturi inline (tema, antetul), am ${scripts.length}`);
  const inline = scripts.reduce((n, s) => n + s.length, 0);
  if (inline > 8192) throw new Error(`șablon: scripturile inline au ${inline} octeți`);
  if (!h.includes('data-acte-theme')) throw new Error('șablon: butonul temei lipsește');
  return { html: h, assets: [...assets] };
}

/** Copiază CSS-ul și fonturile în outStatic; în CSS, /_next/static/ → /acte/_static/, restul adreselor de pe site → destraja.ro. */
export function copyAssets(assets, siteOut, outStatic) {
  const seen = new Set();
  const queue = [...assets];
  const copied = [];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = path.join(siteOut, '_next', 'static', rel);
    const dest = path.join(outStatic, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (rel.endsWith('.css')) {
      let css = fs.readFileSync(src, 'utf8');
      css = css.replace(/url\((["']?)\/_next\/static\/([^)"']+)\1\)/g, (_, q, p) => {
        queue.push(p);
        return `url(${q}${STATIC}${p}${q})`;
      });
      css = css.replace(/url\((["']?)\/(?!acte\/_static\/|\/)([^)"']+)\1\)/g, (_, q, p) => `url(${q}${SITE}/${p}${q})`);
      fs.writeFileSync(dest, css);
    } else fs.copyFileSync(src, dest);
    copied.push(rel);
  }
  return copied;
}

export function buildTemplate(siteOut, outDir) {
  const shell = path.join(siteOut, 'acte-shell.html');
  if (!fs.existsSync(shell)) throw new Error(`${shell} lipsește: rulează întâi next build (pagina src/app/acte-shell)`);
  const { html, assets } = transformShell(fs.readFileSync(shell, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'template.html'), html);
  const copied = copyAssets(assets, siteOut, path.join(outDir, 'static'));
  return { assets: copied, bytes: html.length };
}
