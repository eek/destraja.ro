import type { CdepSheet } from './cdep';
import { stageOf, type StageKey } from './cdep-text';

/**
 * Unde e un proiect de la Cameră și ce urmează, din pașii datați ai fișei (fișa e citită zilnic, lista Camerei rămâne
 * uneori în urmă: Pl-x 110/2026 era „raport” în listă după ce fusese adoptat). Ultimul pas de procedură dovedit
 * stabilește stadiul; pașii necunoscuți (avize, documente) nu-l schimbă. Fiecare termen spune ce fel de termen e:
 * constituțional, de procedură sau doar programat. Nu calculăm termene fără data de la care curg (primirea la
 * Președinte, termenul de adoptare tacită, care se suspendă în vacanțe), și nu spunem că un pas nu s-a întâmplat, ci
 * că nu apare încă în fișă. Designul: destraja-eval/status-card (Carbon și Sol, 18 noiembrie 2026).
 */
export type StatusKey =
  | 'avize'
  | 'comisii'
  | 'raport'
  | 'plen'
  | 'adoptat_prima'
  | 'respins_prima'
  | 'adoptat_parlament'
  | 'depus_ccr'
  | 'la_presedinte'
  | 'sesizat_ccr'
  | 'ccr_admis'
  | 'ccr_respins'
  | 'reexaminare'
  | 'promulgat'
  | 'lege'
  | 'respins_definitiv'
  | 'incheiat';

export interface StatusDeadline {
  kind: 'procedural' | 'programat';
  label: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface BillStatus {
  key: StatusKey;
  /** Stadiul din lista site-ului (eticheta de pe card și pasul curent din traseu). */
  stage: StageKey;
  /** Eticheta scurtă din capul paginii. */
  chip: string;
  title: string;
  /** Rolul camerei unde e acum („Camera Deputaților decide la final.”), cât e în dezbatere. */
  role: string | null;
  /** Ultimul pas dovedit, cu data. */
  detail: string | null;
  next: string;
  deadlines: StatusDeadline[];
  /** Un termen afișat care a trecut fără pasul așteptat. */
  overdue: string | null;
  /** La aprobarea unei ordonanțe de urgență: ordonanța e deja în vigoare. */
  note: string | null;
}

type Chamber = 'Camera Deputaților' | 'Senatul';
type Event = { date: string; chamber: Chamber | null; text: string };

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const iso = (d: string) => d.split('.').reverse().join('-');
const ro = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const other = (c: Chamber): Chamber => (c === 'Senatul' ? 'Camera Deputaților' : 'Senatul');
const chamberOf = (s: string | null): Chamber | null => (!s ? null : /senat/i.test(s) ? 'Senatul' : /camer/i.test(s) ? 'Camera Deputaților' : null);
// „adoptat de Senat”, „adoptata de Camera Deputatilor”, „respinsa de catre Senat”: camera e cea din text.
const chamberInText = (t: string): Chamber | null => (/de (c[aă]tre )?senat/i.test(t) ? 'Senatul' : /de (c[aă]tre )?camera/i.test(t) ? 'Camera Deputaților' : null);
const acc = (c: Chamber) => (c === 'Senatul' ? 'Senatul' : 'Camera Deputaților');
const loc = (c: Chamber) => (c === 'Senatul' ? 'la Senat' : 'la Cameră');

/** „pentru ședințele … din zilele de 16 și 18 noiembrie 2026” → ['2026-11-16', '2026-11-18']. */
export function agendaDates(text: string): string[] {
  const m = text.match(/din (?:zilele de )?((?:\d{1,2}\s*(?:,|și|si|-)?\s*)+)\s+([a-zăâî]+)\s+(\d{4})/i);
  if (!m) return [];
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (!month) return [];
  return [...m[1].matchAll(/\d{1,2}/g)].map((d) => `${m[3]}-${String(month).padStart(2, '0')}-${d[0].padStart(2, '0')}`);
}

function votes(text: string): string {
  const n = (k: string) => text.match(new RegExp(`${k}=(\\d+)`))?.[1];
  const [p, c, a] = [n('pentru'), n('contra'), n('abtineri')];
  return p ? ` (${p} pentru, ${c ?? 0} contra, ${a ?? 0} abțineri)` : '';
}

/** Stadiul scris pe fișă („raport depus; urmeaza sa intre pe ordinea de zi”, „adoptata de catre Camera Deputatilor”). */
function sheetKey(s: string, decisional: Chamber | null): { key: StatusKey; at?: Chamber } | null {
  if (/^Lege \d+\/\d+/i.test(s)) return { key: 'lege' };
  if (/respingere definitiv/i.test(s)) return { key: 'respins_definitiv' };
  if (/procedura legislativa încetat|^retras/i.test(s)) return { key: 'incheiat' };
  if (/^(lege )?trimis[aă] la promulgare|^la promulgare/i.test(s)) return { key: 'la_presedinte' };
  if (/secretarul general/i.test(s)) return { key: 'depus_ccr' };
  if (/^sesizare de neconstitu/i.test(s)) return { key: 'sesizat_ccr' };
  if (/reexaminare/i.test(s)) return { key: 'reexaminare', at: chamberOf(s) ?? undefined };
  const adopted = s.match(/^adoptat[aă]? de (c[aă]tre )?(senat|camera)/i);
  if (adopted) {
    const c = chamberInText(s)!;
    return { key: decisional && c === decisional ? 'adoptat_parlament' : 'adoptat_prima', at: c };
  }
  if (/^la senat/i.test(s)) return { key: 'adoptat_prima', at: 'Camera Deputaților' };
  if (/^pe ordinea de zi/i.test(s)) return { key: 'plen', at: 'Camera Deputaților' };
  if (/^raport depus/i.test(s)) return { key: 'raport', at: 'Camera Deputaților' };
  if (/termenul acordat pentru avize/i.test(s)) return { key: 'avize', at: 'Camera Deputaților' };
  if (/^trimis pentru raport/i.test(s)) return { key: 'comisii', at: 'Camera Deputaților' };
  return null;
}

const CHIP: Record<StatusKey, string> = {
  avize: 'Avize',
  comisii: 'La comisii',
  raport: 'Cu raport',
  plen: 'Pe ordinea de zi',
  adoptat_prima: 'Adoptat de prima cameră',
  respins_prima: 'Respins de prima cameră',
  adoptat_parlament: 'Adoptat de Parlament',
  depus_ccr: 'Înainte de promulgare',
  la_presedinte: 'La promulgare',
  sesizat_ccr: 'La Curtea Constituțională',
  ccr_admis: 'De reexaminat după CCR',
  ccr_respins: 'La promulgare, după CCR',
  reexaminare: 'În reexaminare',
  promulgat: 'Promulgat',
  lege: 'Lege',
  respins_definitiv: 'Respins definitiv',
  incheiat: 'Încheiat',
};

export function resolveStatus(bill: { stadiu: string; fisa: CdepSheet; titlu?: string }, today: string): BillStatus {
  const f = bill.fisa;
  const decisional = chamberOf(f.cameraDecizionala);
  // „Camera Deputaților + Senatul”: fiecare decide pe partea ei; votul final e al doilea vot de adoptare.
  const split = /\+/.test(f.cameraDecizionala ?? '');
  const events: Event[] = f.timeline.filter((t) => /^\d{2}\.\d{2}\.\d{4}$/.test(t.data)).map((t) => ({ date: iso(t.data), chamber: chamberOf(t.camera), text: t.actiune }));
  const urgent = /^da/i.test(f.urgenta ?? '');

  // Pașii fișei, în ordine: ultimul pas de procedură dovedit și, pentru fiecare fel de pas, ultima lui descriere.
  let folded: StatusKey | null = null;
  let at: Chamber = 'Camera Deputaților';
  const details: Partial<Record<StatusKey, string>> = {};
  const atOf: Partial<Record<StatusKey, Chamber>> = {};
  const set = (k: StatusKey, d: string | null, c: Chamber = at) => {
    folded = k;
    at = c;
    atOf[k] = c;
    if (d) details[k] = d;
  };
  let adoptions = 0;
  let agenda: string[] = [];
  let reexamBy = '';

  for (const e of events) {
    const t = e.text;
    if (/^(prezentare în Birou|înregistrat la (Camera|Senat)|trimis pentru raport)/i.test(t)) {
      // „trimis pentru raport suplimentar”: plenul l-a întors la comisii.
      if (!folded || folded === 'adoptat_prima' || folded === 'respins_prima' || (/suplimentar/i.test(t) && ['raport', 'plen'].includes(folded))) {
        set('comisii', null, e.chamber ?? at);
        agenda = [];
      }
    } else if (/^primire raport/i.test(t) && (!folded || ['comisii', 'raport', 'plen', 'reexaminare'].includes(folded))) {
      const amend = t.match(/\((\d+) amend\. admise/)?.[1];
      const kind = /respingere/i.test(t) ? ' de respingere' : /favorabil/i.test(t) ? ' favorabil' : '';
      const d = `Raport${kind}${amend ? `, cu ${amend} amendamente admise` : ''}, primit pe ${ro(e.date)}.`;
      if (folded === 'reexaminare') details.reexaminare = d;
      else set('raport', d);
      details.plen = d;
    } else if (/^înscris pe ordinea de zi/i.test(t) && (!folded || ['comisii', 'raport', 'plen', 'reexaminare'].includes(folded))) {
      agenda = agendaDates(t);
      if (folded === 'raport' || (folded !== 'reexaminare' && !/sub rezerva/i.test(t))) set('plen', null);
    } else if (/(^|\s)adoptat[aă]? de (c[aă]tre )?(senat|camera)/i.test(t)) {
      const c = chamberInText(t) ?? e.chamber ?? at;
      adoptions++;
      const final = split ? adoptions >= 2 : decisional ? c === decisional : adoptions >= 2;
      agenda = [];
      const d = /dep[aă]sirii termenului/i.test(t)
        ? `${acc(c)} l-a adoptat tacit pe ${ro(e.date)}: termenul constituțional a trecut fără vot.`
        : `${acc(c)} l-a adoptat pe ${ro(e.date)}${votes(t)}.`;
      set(final ? 'adoptat_parlament' : 'adoptat_prima', d, c);
    } else if (/respins[aă]? de c[aă]tre (senat|camera)/i.test(t)) {
      const c = chamberInText(t) ?? e.chamber ?? at;
      const final = decisional ? c === decisional && !split : false;
      agenda = [];
      set(final ? 'respins_definitiv' : 'respins_prima', `${acc(c)} l-a respins pe ${ro(e.date)}${votes(t)}.`, c);
    } else if (/^depunere la Secretarul general/i.test(t)) {
      set('depus_ccr', `Depus pe ${ro(e.date)} la secretarii generali ai Camerelor, pentru eventuale sesizări la Curtea Constituțională.`);
    } else if (/^trimitere la Pre[sș]edintele/i.test(t)) {
      set('la_presedinte', `Trimis Președintelui pe ${ro(e.date)}.`);
    } else if (/^sesizare de neconstitu/i.test(t)) {
      const by = t.match(/\(formulat[aă] de ([^)]+)\)/)?.[1];
      set('sesizat_ccr', `Sesizare la Curtea Constituțională${by ? ` (${by.trim()})` : ''}, pe ${ro(e.date)}.`);
    } else if (/^Curtea Constitutionala decide/i.test(t)) {
      const admitted = /accept[aă] obiec/i.test(t);
      const nr = t.match(/D\.C\.C\. nr\.\s*([\d/]+)/)?.[1];
      set(admitted ? 'ccr_admis' : 'ccr_respins', `Curtea Constituțională ${admitted ? 'a admis' : 'a respins'} obiecțiile${nr ? ` (Decizia nr. ${nr})` : ''}, pe ${ro(e.date)}.`);
    } else if (/solicit[aă] reexaminarea|reexaminare la (senat|camer)/i.test(t)) {
      const c = chamberOf(t) ?? e.chamber ?? at;
      reexamBy = /pre[sș]edinte/i.test(t) ? 'la cererea Președintelui' : /curtii constitutionale/i.test(t) ? 'după decizia Curții Constituționale' : '';
      set('reexaminare', `Întors ${loc(c)} ${reexamBy || 'pentru reexaminare'}, pe ${ro(e.date)}.`, c);
      agenda = [];
    } else if (/promulgat[aă] prin Decret/i.test(t)) {
      const nr = t.match(/Decret nr\.\s*([\d/]+)/)?.[1];
      set('promulgat', `Promulgat${nr ? ` prin Decretul nr. ${nr}` : ''}, pe ${ro(e.date)}.`);
    }
  }

  // Stadiul scris pe fișă e citit în aceeași zi cu pașii și prinde și ce nu apare ca pas (un raport, o retrimitere la
  // comisii); lista Camerei rămâne uneori în urmă, așa că vine ultima. Pașii dau datele și detaliile.
  const sheet = f.stadiu ?? '';
  const law = (sheet.match(/^Lege (\d+\/\d+)/) ?? bill.stadiu.match(/^Lege (\d+\/\d+)/))?.[1];
  const fromSheet = sheetKey(sheet, split ? null : decisional);
  let key: StatusKey;
  if (fromSheet && !(fromSheet.key === 'lege' && folded === 'promulgat')) {
    key = fromSheet.key;
    at = fromSheet.at ?? atOf[key] ?? at;
  } else if (folded) key = folded;
  else {
    const s = stageOf(bill.stadiu);
    key = s === 'raport' ? 'raport' : s === 'plen' ? 'plen' : s === 'lege' ? 'lege' : s === 'promulgare' ? 'la_presedinte' : s === 'incheiat' ? 'incheiat' : 'comisii';
  }
  let detail: string | null = details[key] ?? null;
  if (key === 'lege') detail = details.promulgat ?? null;

  const deadlines: StatusDeadline[] = [];
  let overdue: string | null = null;
  let title = '';
  let next = '';
  let stage: StageKey = 'comisii';
  const role =
    decisional && !split
      ? decisional === at
        ? `${acc(at)} decide la final.`
        : `${acc(at)} e prima cameră; decide la final ${acc(other(at))}.`
      : split
        ? 'Fiecare cameră decide la final pentru partea ei de competență.'
        : null;
  const future = agenda.filter((d) => d >= today);

  switch (key) {
    case 'avize':
      stage = 'altele';
      title = 'Așteaptă avizele, la Cameră';
      next = 'Avizele Consiliului Legislativ, ale Guvernului și, după caz, ale Consiliului Economic și Social; apoi comisiile.';
      break;
    case 'comisii': {
      stage = at === 'Senatul' ? 'senat' : 'comisii';
      title = at === 'Senatul' ? 'La comisiile Senatului' : 'La comisiile Camerei';
      next = 'Raportul comisiei, apoi votul în plen.';
      const c = f.comisii;
      if (at === 'Camera Deputaților' && c?.termenAmendamente && c.termenAmendamente >= today) deadlines.push({ kind: 'procedural', label: 'Termen pentru amendamente', date: c.termenAmendamente });
      if (at === 'Camera Deputaților' && c?.termenRaport) {
        if (c.termenRaport >= today) deadlines.push({ kind: 'procedural', label: 'Termen pentru raport', date: c.termenRaport });
        else overdue = `Termenul pentru raport a trecut pe ${ro(c.termenRaport)}. Raportul nu apare încă în fișă.`;
      }
      if (future.length) deadlines.push({ kind: 'programat', label: 'Pe ordinea de zi a plenului, sub rezerva raportului', date: future[0] });
      break;
    }
    case 'raport':
    case 'plen': {
      stage = at === 'Senatul' ? 'senat' : key;
      title = key === 'plen' ? `Pe ordinea de zi a plenului ${at === 'Senatul' ? 'Senatului' : 'Camerei'}` : 'Raportul comisiei e gata';
      if (future.length) {
        next = 'Dezbaterea e programată; votul final nu e confirmat.';
        deadlines.push({ kind: 'programat', label: `Programat în plen${future.length > 1 ? ' (prima ședință)' : ''}`, date: future[0] });
      } else if (agenda.length) {
        next = 'Votul în plen.';
        overdue = `Era programat în plen pe ${ro(agenda.at(-1)!)}. Rezultatul nu apare încă în fișă.`;
      } else next = 'Votul în plen. Data nu e stabilită încă.';
      break;
    }
    case 'adoptat_prima':
      stage = at === 'Senatul' ? 'comisii' : 'senat';
      title = `Adoptat de ${acc(at)}, prima cameră`;
      next = `${acc(other(at))}, care decide la final. Pentru votul final nu există un termen constituțional.`;
      break;
    case 'respins_prima':
      stage = at === 'Senatul' ? 'comisii' : 'senat';
      title = `Respins de ${acc(at)}, prima cameră`;
      next = `Proiectul merge mai departe: ${acc(other(at))} decide la final și îl poate adopta.`;
      break;
    case 'adoptat_parlament':
      stage = 'promulgare';
      title = 'Adoptat de Parlament';
      next = 'Promulgarea: legea e depusă întâi la secretarii generali, pentru eventuale sesizări la Curtea Constituțională, apoi trimisă Președintelui.';
      break;
    case 'depus_ccr':
      stage = 'promulgare';
      title = 'Adoptat, înainte de promulgare';
      next = `Poate fi trimis Președintelui după ${urgent ? '2 zile (procedură de urgență)' : '5 zile'}, dacă nu e sesizată Curtea Constituțională.`;
      break;
    case 'la_presedinte':
      stage = 'promulgare';
      title = 'La Președinte, pentru promulgare';
      next = 'Președintele are 20 de zile de la primire să promulge legea, să o retrimită o singură dată Parlamentului sau să sesizeze Curtea Constituțională. Data primirii nu apare în fișă.';
      break;
    case 'sesizat_ccr':
      stage = 'promulgare';
      title = 'Contestat la Curtea Constituțională';
      next = 'Promulgarea așteaptă decizia Curții. Pentru decizie nu există o dată fixă.';
      break;
    case 'ccr_admis':
      stage = 'altele';
      title = 'Curtea Constituțională a admis obiecțiile';
      next = 'Parlamentul trebuie să reexamineze prevederile neconstituționale și să le pună de acord cu decizia.';
      break;
    case 'ccr_respins':
      stage = 'promulgare';
      title = 'Curtea Constituțională a respins obiecțiile';
      next = 'Președintele are 10 zile de la primirea deciziei să promulge legea.';
      break;
    case 'reexaminare':
      stage = 'altele';
      title = `În reexaminare ${loc(at)}`;
      next = reexamBy === 'la cererea Președintelui' ? 'Parlamentul votează din nou legea; după vot, Președintele are 10 zile s-o promulge.' : 'Parlamentul votează din nou prevederile vizate.';
      if (future.length) deadlines.push({ kind: 'programat', label: 'Programat în plen', date: future[0] });
      break;
    case 'promulgat':
    case 'lege':
      stage = 'lege';
      title = law ? `Lege: Legea nr. ${law}` : 'Promulgat';
      next = 'Legea intră în vigoare la 3 zile de la publicarea în Monitorul Oficial, dacă textul ei nu prevede altă dată. Data publicării nu apare încă la noi.';
      break;
    case 'respins_definitiv':
      stage = 'incheiat';
      title = 'Respins definitiv';
      next = 'Procedura s-a încheiat.';
      break;
    case 'incheiat':
      stage = 'incheiat';
      title = 'Procedură încheiată';
      detail = detail ?? (sheet ? `Pe fișa Camerei: ${sheet}.` : null);
      next = 'Proiectul nu mai e în dezbatere.';
      break;
  }

  const oug = /aprobarea Ordonan[țt]ei de urgen[țt][aă]/i.test(bill.titlu ?? '') && !['promulgat', 'lege', 'respins_definitiv', 'incheiat'].includes(key);
  return {
    key,
    stage,
    chip: CHIP[key],
    title,
    role: ['avize', 'comisii', 'raport', 'plen', 'reexaminare'].includes(key) ? role : null,
    detail,
    next,
    deadlines,
    overdue,
    note: oug ? 'Ordonanța de urgență e deja în vigoare de la publicare. Parlamentul decide acum dacă o aprobă, o modifică sau o respinge.' : null,
  };
}
