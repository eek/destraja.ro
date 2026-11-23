import type { CdepSheet } from './cdep';
import { stageOf, type StageKey } from './cdep-text';

/**
 * Unde e un proiect de la Cameră și ce urmează, din pașii datați ai fișei și din stadiul scris pe ea (fișa e citită
 * zilnic; lista Camerei rămâne uneori în urmă: Pl-x 110/2026 era „raport” în listă după ce fusese adoptat). Pașii dau
 * datele și detaliile; stadiul fișei prinde și ce nu apare ca pas (un raport, o retrimitere la comisii), dar nu poate
 * întoarce un vot înregistrat (o respingere nu devine adoptare, o decizie a Curții nu se pierde). Fiecare termen spune
 * ce fel de termen e. Nu calculăm termene fără data de la care curg (primirea la Președinte, adoptarea tacită, care se
 * suspendă în vacanțe) și nu spunem că un pas nu s-a întâmplat, ci că nu apare încă în fișă.
 * Designul și verificarea: destraja-eval/status-card (Carbon și Sol, 18 noiembrie 2026).
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
  /** Stadiul din lista site-ului (pasul curent din traseu, filtrele din /camera). */
  stage: StageKey;
  /** Eticheta scurtă din capul paginii. */
  chip: string;
  title: string;
  /** Rolul camerei unde e acum („Camera Deputaților decide la final.”), cât e în dezbatere. */
  role: string | null;
  /** Ultimul pas dovedit, cu data. */
  detail: string | null;
  /** Eticheta pasului următor („Urmează”) și pasul; lipsesc când procedura s-a încheiat. */
  nextLabel: string | null;
  next: string | null;
  deadlines: StatusDeadline[];
  /** Un termen afișat care a trecut fără pasul așteptat. */
  overdue: string | null;
  /** La aprobarea unei ordonanțe de urgență: ordonanța se aplică deja. */
  note: string | null;
  /** A primit un raport de comisie (pentru traseu: „raport depus”). */
  hasReport: boolean;
  /** Stadiul de pe fișă, fără titlul votat lipit la coadă. */
  sheetStage: string;
}

type Chamber = 'Camera Deputaților' | 'Senatul';

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
// Fișele scriu când cu diacritice, când fără („Constitutionala”, „abtineri”): comparăm pe text fără diacritice.
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const iso = (d: string) => d.split('.').reverse().join('-');
const ro = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const other = (c: Chamber): Chamber => (c === 'Senatul' ? 'Camera Deputaților' : 'Senatul');
const chamberOf = (s: string | null): Chamber | null => {
  const p = plain(s ?? '');
  return /camer/.test(p) && !/senat/.test(p) ? 'Camera Deputaților' : /senat/.test(p) && !/camer/.test(p) ? 'Senatul' : null;
};
// „adoptat de Senat”, „respinsa de catre Camera Deputatilor”: camera e cea din text.
const chamberInText = (p: string): Chamber | null => (/de (catre )?senat/.test(p) ? 'Senatul' : /de (catre )?camera/.test(p) ? 'Camera Deputaților' : null);
const loc = (c: Chamber) => (c === 'Senatul' ? 'la Senat' : 'la Cameră');

/**
 * Zilele din „înscris pe ordinea de zi … din zilele de 16 și 18 noiembrie 2026” (și „din data de 18 noiembrie 2026”,
 * „16-18 noiembrie”, „30 noiembrie și 2 decembrie 2026”) → ['2026-11-16', '2026-11-18'].
 */
export function agendaDates(text: string): string[] {
  const p = plain(text);
  const at = p.search(/\bdin\b/);
  if (at < 0) return [];
  const tokens = p.slice(at).match(/\d{4}|\d{1,2}\s*[-–]\s*\d{1,2}|\d{1,2}|[a-z]+/g) ?? [];
  const pending: number[] = [];
  const dated: [number, number][] = [];
  let year: number | null = null;
  for (const tok of tokens) {
    if (/^\d{4}$/.test(tok)) year = Number(tok);
    else if (/[-–]/.test(tok)) {
      const [a, b] = tok.split(/\s*[-–]\s*/).map(Number);
      for (let d = a; d <= b && b - a < 7; d++) pending.push(d);
    } else if (/^\d{1,2}$/.test(tok)) pending.push(Number(tok));
    else if (MONTHS.includes(tok)) {
      for (const d of pending.splice(0)) dated.push([MONTHS.indexOf(tok) + 1, d]);
    }
  }
  if (!year || !dated.length) return [];
  // „30 decembrie 2026 și 4 ianuarie 2027”: anul scris e al ultimei zile; lunile dinaintea unei scăderi sunt din anul trecut.
  const wraps = dated.some(([m], i) => i > 0 && m < dated[i - 1][0]);
  const pad = (n: number) => String(n).padStart(2, '0');
  let crossed = false;
  return dated.map(([m, d], i) => {
    if (i > 0 && m < dated[i - 1][0]) crossed = true;
    const y = wraps && !crossed ? year! - 1 : year!;
    return `${y}-${pad(m)}-${pad(d)}`;
  });
}

function votes(p: string): string {
  const n = (k: string) => p.match(new RegExp(`${k}=(\\d+)`))?.[1];
  const parts = [
    [n('pentru'), 'pentru'],
    [n('contra'), 'contra'],
    [n('abtineri'), 'abțineri'],
  ].filter(([v]) => v != null);
  return parts.length ? ` (${parts.map(([v, w]) => `${v} ${w}`).join(', ')})` : '';
}

type SheetRead =
  | { key: Exclude<StatusKey, 'adoptat_prima' | 'respins_prima'>; at?: Chamber; supplementary?: boolean; by?: 'presedinte' | 'ccr' }
  | { key: 'adoptat' | 'respins'; at: Chamber }
  | { key: 'la_senat' };

/** Stadiul scris pe fișă („raport depus; urmeaza sa intre pe ordinea de zi”, „adoptata de catre Camera Deputatilor”). */
function readSheet(s: string): SheetRead | null {
  const p = plain(s);
  if (!p) return null;
  if (/^lege \d+\/\d+/.test(p)) return { key: 'lege' };
  if (/respingere definitiv/.test(p)) return { key: 'respins_definitiv' };
  if (/procedura legislativa incetat|^retras/.test(p)) return { key: 'incheiat' };
  if (/trimisa? la promulgare|^la promulgare/.test(p)) return { key: 'la_presedinte' };
  if (/secretarul general/.test(p)) return { key: 'depus_ccr' };
  if (/^sesizare de neconstitu/.test(p)) return { key: 'sesizat_ccr' };
  if (/reexaminare/.test(p)) return { key: 'reexaminare', at: chamberOf(s) ?? undefined, by: /presedinte/.test(p) ? 'presedinte' : /curtii|decizi/.test(p) ? 'ccr' : undefined };
  if (/^adoptat[a]? de (catre )?(senat|camera)/.test(p)) return { key: 'adoptat', at: chamberInText(p)! };
  if (/^respins[a]? de (catre )?(senat|camera)/.test(p)) return { key: 'respins', at: chamberInText(p)! };
  if (/^la senat/.test(p)) return { key: 'la_senat' };
  if (/^pe ordinea de zi/.test(p)) return { key: 'plen', at: 'Camera Deputaților' };
  if (/^raport depus/.test(p)) return { key: 'raport', at: 'Camera Deputaților' };
  if (/raport suplimentar/.test(p)) return { key: 'comisii', at: 'Camera Deputaților', supplementary: true };
  if (/^trimis pentru raport/.test(p)) return { key: 'comisii', at: 'Camera Deputaților' };
  if (/termenul acordat pentru avize/.test(p)) return { key: 'avize', at: 'Camera Deputaților' };
  return null;
}

// Stările de după votul final al Parlamentului, în ordine: stadiul fișei nu le poate da înapoi.
const AFTER_VOTE: StatusKey[] = ['adoptat_parlament', 'depus_ccr', 'la_presedinte', 'sesizat_ccr', 'ccr_admis', 'ccr_respins', 'promulgat'];

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
  ccr_admis: 'Neconstituțional',
  ccr_respins: 'Constituțional, la promulgare',
  reexaminare: 'În reexaminare',
  promulgat: 'Promulgat',
  lege: 'Lege',
  respins_definitiv: 'Respins definitiv',
  incheiat: 'Încheiat',
};

export function resolveStatus(bill: { stadiu: string; fisa: CdepSheet; titlu?: string }, today: string): BillStatus {
  const f = bill.fisa;
  const decisional = chamberOf(f.cameraDecizionala);
  // „Camera Deputaților + Senatul” (fiecare decide pe partea ei) sau o lege votată de camerele reunite: nu există o
  // singură cameră decizională; votul e final când au adoptat-o amândouă.
  const split = !decisional && /camer/.test(plain(f.cameraDecizionala ?? '')) && /senat/.test(plain(f.cameraDecizionala ?? ''));
  const urgent = /^da/i.test(f.urgenta ?? '');
  const sheetStage = (f.stadiu ?? '').replace(/\s*titlu votat:[\s\S]*$/i, '').trim();

  let folded: StatusKey | null = null;
  let at: Chamber = 'Camera Deputaților';
  const details: Partial<Record<StatusKey, string>> = {};
  const set = (k: StatusKey, d: string | null, c: Chamber = at) => {
    folded = k;
    at = c;
    if (d) details[k] = d;
    else delete details[k];
  };
  const adoptedBy = new Set<Chamber>();
  let agenda: string[] = [];
  let hasReport = false;
  let supplementary = false;
  let reexamBy: 'presedinte' | 'ccr' | null = null;
  // După o reexaminare cerută de Președinte sau după o decizie a Curții care respinge obiecțiile, Președintele are 10
  // zile de la primire, nu 20, și nu mai poate cere încă o reexaminare (art. 77 alin. 3 din Constituție).
  let tenDays = false;
  let ccrWhole = false;
  let lawNr: string | null = null;

  for (const t of f.timeline) {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(t.data)) continue;
    const date = iso(t.data);
    const evChamber = chamberOf(t.camera);
    const p = plain(t.actiune);
    if (/^(prezentare in birou|inregistrat la (camera|senat))/.test(p)) {
      if (!folded || folded === 'adoptat_prima' || folded === 'respins_prima') {
        const c = evChamber ?? at;
        set('comisii', `Ajuns ${loc(c)} pe ${ro(date)}.`, c);
        delete details.raport;
        delete details.plen;
        agenda = [];
        hasReport = false;
        supplementary = false;
      }
    } else if (/^trimis pentru (un nou )?raport/.test(p)) {
      if (/suplimentar|un nou raport/.test(p) && folded && ['raport', 'plen'].includes(folded)) {
        supplementary = true;
        set('comisii', `Retrimis la comisii pentru un raport suplimentar, pe ${ro(date)}.`);
        agenda = [];
      } else if (!folded || folded === 'adoptat_prima' || folded === 'respins_prima') set('comisii', `Trimis la comisii pe ${ro(date)}.`, evChamber ?? at);
    } else if (/^primire raport/.test(p) && (!folded || ['avize', 'comisii', 'raport', 'plen', 'reexaminare'].includes(folded))) {
      const amend = Number(p.match(/\((\d+) amend\. admise/)?.[1] ?? 0);
      const kind = /respingere/.test(p) ? ' de respingere' : /favorabil/.test(p) ? ' favorabil' : '';
      const d = `Raport${supplementary ? ' suplimentar' : ''}${kind}${amend ? `, cu ${amend === 1 ? 'un amendament admis' : `${amend} amendamente admise`}` : ''}, primit pe ${ro(date)}.`;
      hasReport = true;
      supplementary = false;
      agenda = [];
      if (folded !== 'reexaminare') set('raport', d);
      details.plen = d;
    } else if (/^inscris pe ordinea de zi/.test(p) && (!folded || ['avize', 'comisii', 'raport', 'plen', 'reexaminare'].includes(folded))) {
      agenda = agendaDates(t.actiune);
      if (folded === 'raport' || (folded !== 'reexaminare' && !/sub rezerva/.test(p))) set('plen', details.plen ?? null);
    } else if (
      /retrimiterea la comisi|^dezbatere in plen.*\(\s*retrimis|^plenul camerei deputatilor aproba retransmiterea/.test(p) &&
      folded &&
      ['comisii', 'raport', 'plen'].includes(folded)
    ) {
      // Plenul l-a întors la comisii: după dezbatere sau după un vot final fără majoritate („s-a dispus retrimiterea la
      // comisie pentru un nou raport”, PL-x 429/2026). Rândurile acestea au de obicei celula datei goală, deci până pe
      // 23 noiembrie 2026 lipseau din fișele noastre.
      supplementary = true;
      agenda = [];
      const failed = /^vot final/.test(p) ? `, după un vot final fără majoritate${votes(p)}` : '';
      set('comisii', `Retrimis de plen la comisii pentru un nou raport${failed}, pe ${ro(date)}.`);
    } else if (/(^|\s)adoptat[a]? de (catre )?(senat|camera)/.test(p)) {
      const both = /camera deputatilor si (de )?senat/.test(p);
      const c = chamberInText(p) ?? evChamber ?? at;
      adoptedBy.add(c);
      const final = both || (split ? adoptedBy.size === 2 : decisional ? c === decisional : adoptedBy.size === 2);
      agenda = [];
      const d = /depasirii termenului/.test(p)
        ? `${c} l-a adoptat tacit pe ${ro(date)}: termenul constituțional a trecut fără vot.`
        : `${both ? 'Camerele reunite l-au' : `${c} l-a`} adoptat pe ${ro(date)}${votes(p)}.`;
      set(final ? 'adoptat_parlament' : 'adoptat_prima', d, c);
    } else if (/(^|\s)respins[a]? de (catre )?(senat|camera)/.test(p)) {
      const c = chamberInText(p) ?? evChamber ?? at;
      const final = !split && decisional ? c === decisional : false;
      agenda = [];
      set(final ? 'respins_definitiv' : 'respins_prima', `${c} l-a respins pe ${ro(date)}${votes(p)}.`, c);
    } else if (/^depunere la secretarul general/.test(p)) {
      set('depus_ccr', `Depusă pe ${ro(date)} la secretarii generali ai Camerelor, pentru eventuale sesizări la Curtea Constituțională.`);
    } else if (/^trimitere la presedintele/.test(p)) {
      // Legea pleacă la Președinte la capătul celor 5 (2) zile chiar dacă a fost contestată: promulgarea așteaptă decizia.
      if (folded === 'sesizat_ccr') details.sesizat_ccr = `${details.sesizat_ccr ?? ''} Trimisă Președintelui pe ${ro(date)}.`.trim();
      else set('la_presedinte', `Trimisă Președintelui pe ${ro(date)}.`);
    } else if (/^sesizare de neconstitu/.test(p)) {
      const by = t.actiune.match(/\(formulat[aă] de ([^)]+)\)/)?.[1];
      set('sesizat_ccr', `Contestată la Curtea Constituțională${by ? ` de ${by.trim()}` : ''}, pe ${ro(date)}.`);
    } else if (/^curtea constitutionala decide/.test(p)) {
      // Deciziile pe legea votată (în fișe: „respinge obiecțiunile”, „acceptă obiecțiunile; declară legea în ansamblul
      // său ca fiind neconstituțională”, „constată că prevederi din lege sunt neconstituționale”). Cele despre ordonanța
      // aprobată nu schimbă drumul proiectului; un rezultat nerecunoscut nu e ghicit.
      const nr = p.match(/d\.?c\.?c\.? (?:nr\.?\s*)?([\d/]+)/)?.[1];
      const ref = nr ? ` (Decizia nr. ${nr})` : '';
      if (/ordonant/.test(p)) {
        // nimic: e despre ordonanță
      } else if (/respinge obiect/.test(p)) {
        tenDays = true;
        set('ccr_respins', `Curtea Constituțională a respins obiecțiile${ref}, pe ${ro(date)}.`);
      } else if (/in ansamblu/.test(p) && /(accepta|admite)/.test(p)) {
        ccrWhole = true;
        set('ccr_admis', `Curtea Constituțională a constatat că legea e neconstituțională în întregime${ref}, pe ${ro(date)}.`);
      } else if (/prevederi din lege sunt neconstitu|accepta obiect|admite obiect/.test(p)) {
        ccrWhole = false;
        set('ccr_admis', `Curtea Constituțională a constatat că unele prevederi ale legii sunt neconstituționale${ref}, pe ${ro(date)}.`);
      }
    } else if (/solicita reexaminarea|reexaminare la (senat|camer)/.test(p)) {
      const c = chamberOf(t.actiune) ?? evChamber ?? at;
      if (/presedinte/.test(p)) reexamBy = 'presedinte';
      else if (/curtii constitutionale|decizi/.test(p)) reexamBy = 'ccr';
      if (reexamBy === 'presedinte') tenDays = true;
      adoptedBy.clear();
      agenda = [];
      set(
        'reexaminare',
        `Întoarsă ${loc(c)} ${reexamBy === 'presedinte' ? 'la cererea Președintelui' : reexamBy === 'ccr' ? 'după decizia Curții Constituționale' : 'pentru reexaminare'}, pe ${ro(date)}.`,
        c,
      );
    } else if (/promulgat[a]? prin decret/.test(p)) {
      const nr = p.match(/decret(?:ul)? nr\.?\s*([\d/]+)/)?.[1];
      set('promulgat', `Promulgată${nr ? ` prin Decretul nr. ${nr}` : ''}, pe ${ro(date)}.`);
    }
    const law = p.match(/devine legea nr\.?\s*([\d/]+)/)?.[1];
    if (law) lawNr = law;
  }

  // Stadiul fișei peste pași, fără să întoarcă un vot înregistrat.
  const sheet = readSheet(sheetStage);
  lawNr = lawNr ?? (sheetStage.match(/^Lege (\d+\/\d+)/) ?? bill.stadiu.match(/^Lege (\d+\/\d+)/))?.[1] ?? null;
  const foldedNow = folded as StatusKey | null;
  const laterThan = (k: StatusKey) => foldedNow !== null && AFTER_VOTE.indexOf(foldedNow) > AFTER_VOTE.indexOf(k);
  let key: StatusKey;
  if (!sheet) {
    if (foldedNow) key = foldedNow;
    else {
      const s = stageOf(bill.stadiu);
      const fromList: Record<StageKey, StatusKey> = { comisii: 'comisii', raport: 'raport', plen: 'plen', altele: 'avize', senat: 'adoptat_prima', promulgare: 'la_presedinte', lege: 'lege', incheiat: 'incheiat' };
      key = fromList[s];
    }
  } else if (sheet.key === 'adoptat' || sheet.key === 'respins') {
    const c = sheet.at;
    if (foldedNow && AFTER_VOTE.includes(foldedNow) && foldedNow !== 'adoptat_parlament') key = foldedNow;
    else if (sheet.key === 'adoptat') key = foldedNow === 'adoptat_parlament' || (!split && decisional === c) ? 'adoptat_parlament' : 'adoptat_prima';
    else key = !split && decisional === c ? 'respins_definitiv' : 'respins_prima';
    at = c;
  } else if (sheet.key === 'la_senat') {
    key = foldedNow === 'adoptat_prima' || foldedNow === 'respins_prima' ? foldedNow : 'adoptat_prima';
    if (key !== foldedNow) at = 'Camera Deputaților';
  } else if (sheet.key === 'depus_ccr' || sheet.key === 'la_presedinte' || sheet.key === 'sesizat_ccr') {
    key = foldedNow && (laterThan(sheet.key) || (foldedNow === 'sesizat_ccr' && sheet.key === 'la_presedinte')) ? foldedNow : sheet.key;
  } else if (sheet.key === 'reexaminare') {
    key = 'reexaminare';
    at = sheet.at ?? at;
    reexamBy = reexamBy ?? sheet.by ?? null;
    if (reexamBy === 'presedinte') tenDays = true;
  } else if ((sheet.key === 'raport' || sheet.key === 'plen') && foldedNow === 'comisii' && supplementary) {
    // Fișa rămâne la „raport depus” după ce plenul îl retrimite comisiei (PL-x 429/2026): pasul de după raport are
    // ultimul cuvânt, până la raportul nou.
    key = 'comisii';
  } else {
    key = sheet.key;
    if (sheet.at) at = sheet.at;
    if ('supplementary' in sheet && sheet.supplementary) supplementary = true;
  }
  let detail: string | null = details[key] ?? null;
  if (key === 'lege') detail = details.promulgat ?? null;

  const deadlines: StatusDeadline[] = [];
  let overdue: string | null = null;
  let title = '';
  let nextLabel: string | null = 'Urmează';
  let next: string | null = null;
  let stage: StageKey = 'comisii';
  const role = split
    ? 'Fiecare cameră decide la final pentru partea ei.'
    : decisional
      ? decisional === at
        ? `${at} decide la final.`
        : `${at} e prima cameră; decide la final ${other(at)}.`
      : null;
  const future = agenda.filter((d) => d >= today);
  const atSenate = at === 'Senatul';

  switch (key) {
    case 'avize':
      stage = 'altele';
      title = 'Așteaptă avizele, la Cameră';
      next = 'Avizele și punctele de vedere cerute (de regulă avizul Consiliului Legislativ și, după caz, al Consiliului Economic și Social și punctul de vedere al Guvernului); apoi comisiile.';
      break;
    case 'comisii': {
      stage = atSenate ? 'senat' : 'comisii';
      title = supplementary ? 'Retrimis la comisii pentru un raport suplimentar' : atSenate ? 'La comisiile Senatului' : 'La comisiile Camerei';
      next = `${supplementary ? 'Raportul suplimentar' : 'Raportul comisiei'}, apoi votul în plen.`;
      const c = f.comisii;
      if (!atSenate && c?.termenAmendamente && c.termenAmendamente >= today && !supplementary)
        deadlines.push({ kind: 'procedural', label: 'Termen pentru amendamente', date: c.termenAmendamente });
      if (!atSenate && c?.termenRaport) {
        if (c.termenRaport >= today) deadlines.push({ kind: 'procedural', label: 'Termen pentru raport', date: c.termenRaport });
        else if (!supplementary) overdue = `Termenul pentru raport a trecut pe ${ro(c.termenRaport)}. Raportul nu apare încă în fișă.`;
      }
      if (future.length) deadlines.push({ kind: 'programat', label: 'Pe ordinea de zi a plenului, sub rezerva raportului', date: future[0] });
      break;
    }
    case 'raport':
    case 'plen': {
      stage = atSenate ? 'senat' : key;
      title = key === 'plen' ? `Pe ordinea de zi a plenului ${atSenate ? 'Senatului' : 'Camerei'}` : 'Raportul comisiei e gata';
      if (future.length) {
        next = 'Dezbaterea e programată; votul final nu e confirmat.';
        deadlines.push({ kind: 'programat', label: `Programat în plen${future.length > 1 ? ' (prima ședință)' : ''}`, date: future[0] });
      } else if (agenda.length) {
        next = 'Votul în plen.';
        overdue = `Era programat în plen pe ${ro(agenda.at(-1)!)}. Rezultatul nu apare încă în fișă.`;
      } else next = 'Votul în plen. Data nu apare în fișă.';
      break;
    }
    case 'adoptat_prima':
      stage = atSenate ? 'comisii' : 'senat';
      title = `Adoptat de ${at}, prima cameră`;
      next = split ? `${other(at)}, pentru partea ei.` : `${other(at)}, care decide la final. Pentru votul final nu există un termen constituțional.`;
      break;
    case 'respins_prima':
      stage = atSenate ? 'comisii' : 'senat';
      title = `Respins de ${at}, prima cameră`;
      next = `Proiectul merge mai departe: ${other(at)} decide la final și îl poate adopta.`;
      break;
    case 'adoptat_parlament':
      stage = 'promulgare';
      title = 'Adoptat de Parlament';
      next = 'Legea e depusă la secretarii generali, pentru eventuale sesizări la Curtea Constituțională, apoi trimisă Președintelui spre promulgare.';
      break;
    case 'depus_ccr':
      stage = 'promulgare';
      title = 'Adoptată, înainte de promulgare';
      next = `După ${urgent ? '2 zile (procedură de urgență)' : '5 zile'} legea se trimite Președintelui. Dacă între timp e sesizată Curtea Constituțională, promulgarea așteaptă decizia ei.`;
      break;
    case 'la_presedinte':
      stage = 'promulgare';
      title = 'La Președinte, pentru promulgare';
      next = tenDays
        ? 'Președintele are 10 zile de la primire să promulge legea. Data primirii nu apare în fișă.'
        : 'Președintele are 20 de zile de la primire să promulge legea, să o retrimită o singură dată Parlamentului sau să sesizeze Curtea Constituțională. Data primirii nu apare în fișă.';
      break;
    case 'sesizat_ccr':
      stage = 'promulgare';
      title = 'Contestată la Curtea Constituțională';
      next = 'Promulgarea așteaptă decizia Curții. Pentru decizie nu există o dată fixă.';
      break;
    case 'ccr_admis':
      stage = ccrWhole ? 'incheiat' : 'altele';
      title = ccrWhole ? 'Neconstituțională în întregime' : 'Unele prevederi sunt neconstituționale';
      next = ccrWhole
        ? 'Legea nu poate fi promulgată în această formă.'
        : 'Parlamentul reexaminează prevederile declarate neconstituționale, ca să le pună de acord cu decizia.';
      break;
    case 'ccr_respins':
      stage = 'promulgare';
      title = 'Curtea Constituțională a respins obiecțiile';
      next = 'Președintele are 10 zile de la primirea deciziei să promulge legea.';
      break;
    case 'reexaminare':
      stage = 'altele';
      title = `În reexaminare ${loc(at)}`;
      next =
        reexamBy === 'ccr'
          ? 'Parlamentul reexaminează prevederile declarate neconstituționale.'
          : 'Parlamentul votează din nou legea și o poate adopta, modifica sau respinge. Dacă o adoptă, Președintele are 10 zile de la primire s-o promulge.';
      if (future.length) deadlines.push({ kind: 'programat', label: 'Programat în plen', date: future[0] });
      break;
    case 'promulgat':
    case 'lege':
      stage = 'lege';
      title = lawNr ? `Legea nr. ${lawNr}` : 'Promulgată';
      nextLabel = 'Intrarea în vigoare';
      next = 'La 3 zile de la publicarea în Monitorul Oficial, dacă textul legii nu prevede o dată ulterioară. Data publicării nu apare încă la noi.';
      break;
    case 'respins_definitiv':
      stage = 'incheiat';
      title = 'Respins definitiv';
      nextLabel = null;
      break;
    case 'incheiat':
      stage = 'incheiat';
      title = 'Procedură încheiată';
      detail = detail ?? (sheetStage ? `Pe fișa Camerei: ${sheetStage}.` : null);
      nextLabel = null;
      break;
  }

  const oug = /aprobarea ordonantei de urgenta/.test(plain(bill.titlu ?? ''));
  const beforeVote: StatusKey[] = ['avize', 'comisii', 'raport', 'plen', 'adoptat_prima', 'respins_prima', 'reexaminare'];
  const afterVote: StatusKey[] = ['adoptat_parlament', 'depus_ccr', 'la_presedinte', 'sesizat_ccr', 'ccr_respins'];
  const note = !oug
    ? null
    : beforeVote.includes(key)
      ? 'Ordonanța de urgență se aplică deja, înainte de votul Parlamentului. Parlamentul decide dacă o aprobă, o modifică sau o respinge.'
      : afterVote.includes(key)
        ? 'Ordonanța de urgență se aplică în continuare; legea votată acum o aprobă, o modifică sau o respinge după ce e promulgată și publicată.'
        : null;
  return {
    key,
    stage,
    chip: key === 'ccr_admis' && !ccrWhole ? 'De reexaminat după CCR' : CHIP[key],
    title,
    role: beforeVote.includes(key) ? role : null,
    detail,
    nextLabel,
    next: nextLabel ? next : null,
    deadlines,
    overdue,
    note,
    hasReport,
    sheetStage,
  };
}
