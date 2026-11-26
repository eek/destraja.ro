// Mesajul gata scris când cineva trimite pagina unui proiect (ShareBill, pe /legi/[slug] și /camera/[slug]): din datele
// proiectului, fără nimic inventat. Cu analiză: titlul pe înțeles, numărul, nivelul și scorul „după analiza a trei modele
// AI”; fără analiză: titlul, numărul și stadiul; cu analiza principală de refăcut (src/lib/fresh.ts): fără nivel și scor,
// ca un verdict vechi să nu circule mai departe. Consultarea deschisă se socotește în ziua trimiterii, nu a build-ului.
// Fără importuri, ca testul (scripts/lib/share.test.mjs) să-l poată încărca direct în node.

export type ShareRisk = 'red' | 'yellow' | 'green';

export interface ShareInput {
  /** Titlul pe înțeles al analizei; fără analiză, titlul oficial. */
  title: string;
  /** „B660/2026”, „PL-x 17/2026”. */
  number: string;
  /** Adresa paginii, fără parametri. */
  url: string;
  /** null: proiectul nu are încă analiza noastră. */
  risk: { level: ShareRisk; score: number } | null;
  /** Analiza principală se reface (FreshnessStatus): fără nivel și scor. */
  stale?: boolean;
  /** Stadiul, pentru proiectele fără analiză („Raportul comisiei e gata”). */
  stage?: string | null;
  /** Ultima zi a consultării publice (ISO); null când nu e sau s-a încheiat înainte de termen. */
  consultationEnd?: string | null;
  /** Pagina arată cum trimiți o opinie (kitul Senatului, „Ce poți face” la Cameră, consultarea deschisă). */
  canAct?: boolean;
}

/** Cât poate avea mesajul înainte de link (un tweet, o previzualizare de notificare). */
export const SHARE_TEXT_MAX = 280;

/** Eticheta din statisticile site-ului (doar cu acordul vizitatorului), ca la linkurile din e-mail (utm_source=alerte). */
export const shareUrl = (url: string) => `${url}${url.includes('?') ? '&' : '?'}utm_source=share`;

const LEVEL: Record<ShareRisk, string> = { red: 'risc ridicat', yellow: 'risc moderat', green: 'risc redus' };
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

/** 7.7 → „7,7”, 7 → „7”. */
const score = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** „2026-12-24” → „24 decembrie” (cu anul doar când nu e anul de azi). */
function day(iso: string, today: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? '' : ` ${y}`}`;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.;:,]+$/, '');

/** Scurtează la cuvânt întreg, cu „…”. */
function cut(s: string, max: number) {
  if (s.length <= max) return s;
  const at = s.lastIndexOf(' ', max - 1);
  return `${s.slice(0, at > max * 0.6 ? at : max - 1).replace(/[\s,;:–-]+$/, '')}…`;
}

/**
 * Mesajul, fără link (`text`, pentru foaia de partajare a telefonului, care pune linkul separat) și cu link (`full`,
 * pentru WhatsApp). `today` e ziua trimiterii (ISO, ora României).
 */
export function shareMessage(input: ShareInput, today: string) {
  const url = shareUrl(input.url);
  const open = Boolean(input.consultationEnd && input.consultationEnd >= today);
  const tail: string[] = [];
  let lead: string;
  if (input.risk && !input.stale) lead = `: ${LEVEL[input.risk.level]}, ${score(input.risk.score)}/10, după analiza a trei modele AI.`;
  else if (input.risk) lead = '. Analiza celor trei modele AI se reface după schimbări recente.';
  else lead = input.stage ? `. Stadiul: ${lowerFirst(clean(input.stage))}.` : '.';
  if (open) tail.push(`Consultarea publică e deschisă până pe ${day(input.consultationEnd!, today)}.`);
  tail.push(!input.risk ? 'Vezi unde a ajuns:' : input.canAct || open ? 'Vezi ce schimbă și cum trimiți o opinie:' : 'Vezi ce schimbă:');

  const after = ` (${input.number})${lead} ${tail.join(' ')}`;
  const text = `${cut(clean(input.title), SHARE_TEXT_MAX - after.length)}${after}`;
  return { text, url, full: `${text} ${url}` };
}

/** Linkul care deschide WhatsApp (aplicația pe telefon, WhatsApp Web sau aplicația pe calculator) cu mesajul scris. */
export const whatsappHref = (full: string) => `https://wa.me/?text=${encodeURIComponent(full)}`;
