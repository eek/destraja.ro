// Șabloane HTML cu escapare implicită: html`<p>${text}</p>` escapează orice valoare, în afară de cele marcate raw()
// sau produse de alt html``. Liste: elementele sunt unite fără separator.

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function value(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(value).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += value(values[i]) + strings[i + 1];
  return new Raw(out);
}

/** JSON pentru <script type="application/ld+json">: fără „</script>”, „<!--” sau separatoare de rând care să-l rupă. */
export const jsonForScript = (o) =>
  raw(JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));

/** Text simplu cu exponenți scriși „5^1” → „5<sup>1</sup>”; rândurile noi devin <br>. Escapat. */
export function richText(s) {
  if (s == null) return raw('');
  const parts = String(s).split(/(\^[0-9a-z]+)/i);
  let out = '';
  for (const p of parts) {
    if (/^\^[0-9a-z]+$/i.test(p)) out += `<sup>${esc(p.slice(1))}</sup>`;
    else out += esc(p).replace(/\n/g, '<br>');
  }
  return raw(out);
}

/** Legături externe doar spre gazde cunoscute, doar pe https. Cele spre fosta adresă acte.destraja.ro trec la destraja.ro/acte. */
const LINK_HOSTS = new Set(['legislatie.just.ro', 'destraja.ro', 'www.ccr.ro', 'www.scj.ro', 'monitoruloficial.ro']);
export function safeUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol === 'https:' && x.hostname === 'acte.destraja.ro') return `https://destraja.ro/acte${x.pathname === '/' ? '' : x.pathname}${x.search}${x.hash}`;
    return x.protocol === 'https:' && LINK_HOSTS.has(x.hostname) ? x.href : null;
  } catch {
    return null;
  }
}
