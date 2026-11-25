// Formate și etichete în română pentru paginile actelor.

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

export function dateRo(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return String(iso);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** „1 modificare”, „5 modificări”, „20 de modificări”. */
export function countWord(n, one, many) {
  if (n === 1) return `1 ${one}`;
  const rest = Math.abs(n) % 100;
  return `${n.toLocaleString('ro-RO')}${(rest === 0 && n !== 0) || rest >= 20 ? ' de' : ''} ${many}`;
}

/** Eticheta tipului se termină în -a (Legea, Decizia, Hotărârea) → feminin. */
export const feminine = (act) => /a$/.test((act.kind_label || '').split(' ')[0]);
export const agree = (act, m, f) => (feminine(act) ? f : m);

const PART = { I: 'Partea I', V: 'Partea a V-a' };

/** „Publicată în Monitorul Oficial, Partea I, nr. 372 din 28 aprilie 2006”. */
export function moLine(act, mo = act) {
  const pub = agree(act, 'Publicat', 'Publicată');
  const part = mo.mo_part;
  if (mo.mo_number === 0) return `${pub} fără număr de Monitor (Portalul Legislativ îl trece la „nr. 0”: nu a apărut în Monitorul Oficial)`;
  const nr = mo.mo_number != null ? `nr. ${mo.mo_number}${mo.mo_bis ? ' bis' : ''}` : '';
  const din = mo.mo_date ? `din ${dateRo(mo.mo_date)}` : '';
  if (part === 'BO') return `${pub} în Buletinul Oficial ${[nr, din].filter(Boolean).join(' ')}`.trim();
  if (part === 'Broșură') return `${pub} într-o broșură${din ? `, ${din}` : ''}`;
  if (!nr && !din) return null;
  return `${pub} în Monitorul Oficial${PART[part] ? `, ${PART[part]}` : ''}${nr ? `, ${nr}` : ''}${din ? ` ${din}` : ''}`;
}

export const EFFECT = {
  modifica: { verb: 'modifică', past: 'modificat', noun: 'modificare' },
  completeaza: { verb: 'completează', past: 'completat', noun: 'completare' },
  abroga: { verb: 'abrogă', past: 'abrogat', noun: 'abrogare' },
  suspenda: { verb: 'suspendă', past: 'suspendat', noun: 'suspendare' },
  proroga: { verb: 'prorogă', past: 'prorogat', noun: 'prorogare' },
  deroga: { verb: 'derogă de la', past: 'derogat', noun: 'derogare' },
  rectifica: { verb: 'rectifică', past: 'rectificat', noun: 'rectificare' },
  republica: { verb: 'republică', past: 'republicat', noun: 'republicare' },
  aproba: { verb: 'aprobă', past: 'aprobat', noun: 'aprobare' },
  aproba_cu_modificari: { verb: 'aprobă cu modificări', past: 'aprobat cu modificări', noun: 'aprobare cu modificări' },
  respinge: { verb: 'respinge', past: 'respins', noun: 'respingere' },
  ccr_admite: { verb: 'admite o excepție de neconstituționalitate privind', past: 'declarat neconstituțional', noun: 'decizie CCR' },
  ccr_interpretativa: { verb: 'interpretează (decizie CCR)', past: 'interpretat', noun: 'decizie CCR interpretativă' },
  interpreteaza: { verb: 'interpretează', past: 'interpretat', noun: 'interpretare' },
  pune_in_aplicare: { verb: 'pune în aplicare', past: 'pus în aplicare', noun: 'punere în aplicare' },
  alta: { verb: 'privește', past: 'legat', noun: 'legătură' },
};
export const effectVerb = (e) => (EFFECT[e] || EFFECT.alta).verb;

export const STATUS = {
  in_vigoare: { label: 'În vigoare', note: 'după Portalul Legislativ', tone: 'green' },
  abrogat: { label: 'Abrogat', labelF: 'Abrogată', tone: 'red' },
  suspendat: { label: 'Suspendat', labelF: 'Suspendată', tone: 'amber' },
  respins: { label: 'Respins', labelF: 'Respinsă', tone: 'red' },
  necunoscut: { label: 'Stare necunoscută', tone: 'muted' },
};

export const FOOTER_NOTE =
  'Copie informativă, după Portalul Legislativ (Ministerul Justiției). Textul oficial este cel publicat în Monitorul Oficial. destrajă.ro nu oferă consultanță juridică.';

export const portalUrl = (pid) => `https://legislatie.just.ro/Public/DetaliiDocument/${pid}`;
