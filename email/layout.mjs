// Șablonul comun al e-mailurilor destrajă.ro: confirmarea abonării (worker/subscribe.ts) și ediția
// zilnică (scripts/straja-digest.mjs). HTML de e-mail: tabele, stiluri inline, fonturi de sistem,
// fără scripturi, fără pixeli de urmărire și fără fonturi sau imagini de la terți.
//
// Culorile sunt cele din DESIGN.md. Tema întunecată (Apple Mail, Outlook.com) re-valorează aceleași
// roluri prin clasele lt-*; clienții care nu citesc <style> rămân pe varianta deschisă.

export const SITE = 'https://destraja.ro';
export const FROM = { email: 'alerte@destraja.ro', name: 'destrajă.ro' };
export const REPLY_TO = 'contact@destraja.ro';

export const LEVELS = {
  all: { label: 'Tot', long: 'toate noutățile, cu rezumatul zilei' },
  yellow: { label: 'Risc moderat și ridicat', long: 'proiectele cu risc moderat și ridicat' },
  red: { label: 'Doar risc ridicat', long: 'doar proiectele cu risc ridicat' },
};

export const C = {
  paper: '#f6f4ee',
  surface: '#fffefb',
  sunken: '#eeebe3',
  line: '#e0dbcf',
  ink: '#121a2b',
  body: '#2c3546',
  muted: '#5b6475',
  brand: '#172c54',
  onBrand: '#ffffff',
  link: '#1f3b70',
  band: '#172c54',
  onBand: '#f3f5fa',
  onBandMuted: '#c3cde0',
};

export const RISK = {
  red: { fill: '#d0372b', text: '#a8261b', soft: '#fbe8e5', label: 'Risc ridicat' },
  yellow: { fill: '#dd9c12', text: '#855700', soft: '#f9efd6', label: 'Risc moderat' },
  green: { fill: '#3b8a52', text: '#2b6a3c', soft: '#e4f1e7', label: 'Risc redus' },
};

export const SERIF = "Georgia, 'Times New Roman', Times, serif";
export const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Buton plin, navy, cu text alb; tabel ca să arate la fel și în Outlook. */
export function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0">
<tr><td class="lt-btn" bgcolor="${C.brand}" style="border-radius:8px;background:${C.brand}">
<a href="${esc(href)}" class="lt-btn-a" style="display:inline-block;padding:14px 22px;font-family:${SANS};font-size:15px;font-weight:600;line-height:20px;color:${C.onBrand};text-decoration:none;border-radius:8px">${esc(label)}</a>
</td></tr></table>`;
}

export function riskChip(level, score) {
  const r = RISK[level];
  const value = typeof score === 'number' ? ` · ${score.toFixed(1).replace('.', ',')}` : '';
  return `<span class="lt-chip-${level}" style="display:inline-block;padding:3px 10px;border-radius:999px;background:${r.soft};color:${r.text};font-family:${SANS};font-size:12px;font-weight:600;line-height:18px;white-space:nowrap">${r.label}${value}</span>`;
}

const DARK_CSS = `
@media (prefers-color-scheme: dark) {
  .lt-paper { background:#1b2230 !important; }
  .lt-surface { background:#222a39 !important; border-color:#333d51 !important; }
  .lt-sunken { background:#283143 !important; }
  .lt-line { border-color:#333d51 !important; }
  .lt-ink { color:#eef0f5 !important; }
  .lt-body { color:#cdd3de !important; }
  .lt-muted { color:#9ca5b5 !important; }
  .lt-link { color:#aac0f2 !important; }
  .lt-band { background:#2a3754 !important; }
  .lt-btn { background:#bccaee !important; }
  .lt-btn-a { color:#13203d !important; }
  .lt-chip-red { background:#43272a !important; color:#ff9e93 !important; }
  .lt-chip-yellow { background:#3f3624 !important; color:#f2c76d !important; }
  .lt-chip-green { background:#24392f !important; color:#93d6a4 !important; }
  .lt-text-red { color:#ff9e93 !important; }
  .lt-text-yellow { color:#f2c76d !important; }
  .lt-text-green { color:#93d6a4 !important; }
}
@media (max-width: 620px) {
  .lt-pad { padding-left:20px !important; padding-right:20px !important; }
  .lt-h1 { font-size:24px !important; line-height:30px !important; }
  .lt-stack { display:block !important; width:100% !important; }
}`;

/**
 * Pagina întreagă: banda navy cu sigla, conținutul și subsolul.
 * @param {{ title: string, preheader: string, eyebrow: string, body: string, footer: string }} p
 */
export function emailLayout({ title, preheader, eyebrow, body, footer }) {
  // Spațiile invizibile țin previzualizarea din inbox la textul nostru, nu la primele linkuri.
  const spacer = '&#8199;&#65279;&#847;'.repeat(60);
  return `<!doctype html>
<html lang="ro" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(title)}</title>
<style>${DARK_CSS}</style>
</head>
<body class="lt-paper" style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(preheader)}${spacer}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lt-paper" bgcolor="${C.paper}" style="background:${C.paper}">
<tr><td align="center" style="padding:24px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td class="lt-band lt-pad" bgcolor="${C.band}" style="background:${C.band};border-radius:16px 16px 0 0;padding:26px 32px 22px">
<a href="${SITE}/?utm_source=alerte&amp;utm_medium=email" style="text-decoration:none"><img src="${SITE}/email/logo-light.png" width="150" height="54" alt="destrajă.ro" style="display:block;border:0;width:150px;height:54px;color:${C.onBand};font-family:${SERIF};font-size:24px"></a>
<p style="margin:14px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.onBandMuted}">${eyebrow}</p>
</td></tr>
<tr><td class="lt-surface lt-pad" bgcolor="${C.surface}" style="background:${C.surface};border:1px solid ${C.line};border-top:0;border-radius:0 0 16px 16px;padding:30px 32px 34px">
${body}
</td></tr>
<tr><td class="lt-pad" style="padding:24px 32px 0">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Subsolul comun: de ce primești mesajul și cum oprești alertele. */
export function footerHtml({ reason, links = [] }) {
  const linkHtml = links
    .map(([href, label]) => `<a href="${esc(href)}" class="lt-link" style="color:${C.link};text-decoration:underline">${esc(label)}</a>`)
    .join(' &nbsp;·&nbsp; ');
  return `<p class="lt-muted" style="margin:0;font-family:${SANS};font-size:12px;line-height:19px;color:${C.muted}">${reason}</p>
${linkHtml ? `<p class="lt-muted" style="margin:10px 0 0;font-family:${SANS};font-size:12px;line-height:19px;color:${C.muted}">${linkHtml}</p>` : ''}
<p class="lt-muted" style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:19px;color:${C.muted}">Analizele sunt făcute cu AI și pot conține erori. Nu sunt consultanță juridică; verifică textul oficial pe senat.ro.<br>destrajă.ro · proiect civic independent, administrat de Radu-Sebastian Amarie · ${REPLY_TO}</p>`;
}
