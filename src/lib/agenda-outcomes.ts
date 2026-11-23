// Ce s-a întâmplat cu un proiect într-o ședință din agendă, după ziua ei: doar din surse oficiale pe care le avem deja,
// potrivite după proiect și dată, fără nicio presupunere.
//
//   1. Ordinea de zi a Senatului, recitită după ședință (scripts/straja-agenda.mjs): la comisii, coloana „rezoluție”
//      („Raport de admitere”, „Aviz favorabil”, „Amânat”); la plen, „Adoptat” sau „Respins” în coloana scopului, goală
//      înainte de ședință.
//   2. Voturile nominale din plen (data/votes/<slug>.json): ziua votului, camera, rezultatul și cifrele.
//   3. Fișa Senatului (data/senat-bills.json, `timeline`): „Comisia … transmite avizul cu nr. …-FAVORABIL”, „… depune
//      raportul cu nr. …-NEGATIV”, „adoptat de Senat”, „respins de Senat rezultat vot pentru= 62 contra=46”.
//   4. Fișa Camerei (data/cdep/proiecte/<slug>.json sau data/camera/<slug>.json, `fisa.timeline`): „primire raport
//      favorabil … de la: Comisia …” și „primire aviz de la: Comisia …” (după numele comisiei; pe fișele citite înainte de
//      23 noiembrie 2026 rândul se termina în „de la:”, iar raportul se lega de comisiile raportului, după idc), „adoptat de
//      Camera Deputatilor … pentru=…”, „respinsa de catre Camera Deputatilor”, „vot final adoptare - nu a fost întrunită
//      majoritatea … s-a dispus retrimiterea la comisie”, „plenul … aproba retransmiterea la comisii”, „dezbatere în plenul
//      … ( retrimis comisiei )”; rândurile Senatului din fișă („adoptat de Senat”, „respinsa de catre Senat”).
//   5. Ședința de plen a Camerei, din înregistrările cdep.ro (data/cdep/plen/<zi>.json, scripts/straja-cdep-plen.mjs):
//      sumarul stenogramei spune ce puncte s-au dezbătut și ce s-a hotărât la fiecare („rămas pentru votul final”,
//      „retrimisă comisiei”, „adoptat”); un proiect de pe ordinea de zi care lipsește din sumar n-a fost dezbătut în ziua
//      aceea. Până apare stenograma (câteva zile), voturile electronice ale zilei arată măcar ce s-a votat.
//   6. Documentele comisiilor Camerei (data/cdep/comisii-documente/<idc>.json): avizele și rapoartele de pe pagina comisiei, cu data
//      lor; fișa proiectului nu spune de la ce comisie e un aviz, pagina comisiei da.
//
// Un pas din fișă se leagă de o apariție dacă e din aceeași ședință (aceeași comisie, același plen) și cade între ziua
// ei și următoarea apariție a proiectului la același organ, cel mult PLEN_DAYS (plen) sau COMMITTEE_DAYS (comisie) zile
// mai târziu. Avizele comisiilor Camerei vin din fișă („primire aviz de la: Comisia …”) și de pe pagina comisiei (6), care
// are și avizele încă netrimise comisiei raportoare. Fără niciun rând potrivit, apariția rămâne fără rezultat și pagina o spune; „nedezbătut” doar când
// sumarul stenogramei din ziua aceea există și proiectul nu e în el.
//
// Modulul importă doar tipuri, ca testul din scripts/lib să-l poată încărca direct cu Node.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgendaAppearance } from './agenda';
import type { PlenaryVote } from './types';

export type OutcomeKind = 'adoptat' | 'respins' | 'raport' | 'aviz' | 'retrimis' | 'amanat' | 'dezbatut' | 'alt' | 'nedezbatut';

export interface OutcomeSource {
  /** „Ordinea de zi pe senat.ro”, „Votul pe cdep.ro”, „Fișa proiectului pe senat.ro”. */
  label: string;
  url: string;
}

export interface AgendaOutcome {
  kind: OutcomeKind;
  /** „Adoptat de Senat”, „Raport de admitere cu amendamente”, „Retrimis la comisie”. */
  text: string;
  /** Cifrele votului, când le avem: „106 pentru, 0 contra, nicio abținere”. */
  detail: string | null;
  /** Ziua pasului (YYYY-MM-DD); poate fi după ziua ședinței (un raport primit peste câteva zile). */
  date: string;
  /**
   * Pasul e scris în ziua ședinței de chiar ședința (ordinea de zi recitită, votul din plen sau rândul din fișă din aceeași
   * zi); altfel e un pas ulterior din fișă, în fereastra ședinței, pe care pagina îl arată ca atare („Ulterior, pe …”).
   */
  later: boolean;
  sources: OutcomeSource[];
}

/** Fișa Senatului a proiectului, cum e în data/senat-bills.json. */
export interface SenateSheet {
  url: string | null;
  timeline: { date: string; action: string }[];
}

/** Fișa Camerei a proiectului: rândurile și comisiile sesizate pentru raport (idc). */
export interface ChamberSheet {
  url: string | null;
  timeline: { camera: string | null; data: string; actiune: string }[];
  raport: string[];
}

export interface OutcomeSources {
  senat: SenateSheet | null;
  camera: ChamberSheet | null;
  votes: Pick<PlenaryVote, 'chamber' | 'url' | 'date' | 'question' | 'result' | 'totals' | 'subject'>[];
}

/** Un punct din sumarul stenogramei unei zile de plen a Camerei (scripts/lib/cdep-plen.mjs, parseStenoDay). */
export interface StenoItem {
  ids: number;
  idm: string;
  nr: string;
  /** Cheile proiectelor din text: „PLX 488/2026”, „PHCD 74/2026” (chamberKey). */
  numere: string[];
  /** Ce scrie în italice la capăt, fără paranteze: „rămas pentru votul final”, „retrimisă comisiei”, „adoptat”. */
  nota: string;
  /** Punctul stă sub „Supunerea la votul final a:”. */
  votFinal: boolean;
  /** Stă sub declarații politice, interpelări sau întrebări: proiectul e doar pomenit, nu dezbătut. */
  mentiune?: boolean;
}

/** Un vot electronic din ziua unei ședințe de plen a Camerei (parseEvotDay). */
export interface DayVote {
  idv: number;
  descriere: string;
  detaliu: string;
  numar: string | null;
  idp: number | null;
  pentru: number | null;
  contra: number | null;
  abtineri: number | null;
}

/** O zi de plen a Camerei, cum o scrie scripts/straja-cdep-plen.mjs în data/cdep/plen/<zi>.json. */
export interface ChamberPlenDay {
  zi: string;
  /** `tip` 'comuna' e o ședință comună cu Senatul, nu plenul Camerei: nu spune nimic despre ordinea de zi a Camerei. */
  /** `complet` fals: vreun punct din pagină n-a putut fi citit, deci sumarul nu dovedește că un proiect lipsește. */
  stenograma?: { url: string; tip: 'camera' | 'comuna'; complet?: boolean; puncte: StenoItem[] } | null;
  voturi?: { url: string; voturi: DayVote[] } | null;
}

/** Un aviz sau raport de pe pagina de documente a unei comisii a Camerei (data/cdep/comisii-documente/<idc>.json). */
export interface CommitteeDoc {
  tip: 'aviz' | 'raport';
  data: string;
  pdf: string;
  idp: number;
  numar: string;
  /** La un raport comun, idc-urile comisiilor lui. */
  comune: string[];
}

/** Înregistrările Camerei, pe zile (plenul) și pe comisii (idc). */
export interface ChamberRecords {
  plen: Map<string, ChamberPlenDay>;
  comisii: Map<string, CommitteeDoc[]>;
}

export const PLEN_DAYS = 3;

// Ferestrele, cu ziua ședinței inclusă: plenul în ziua lui și în următoarele două zile, comisia în cel mult 14 zile după.
export const COMMITTEE_DAYS = 15;

// „02-11-2026” (Senat) sau „02.11.2026” (Camera) → „2026-11-02”.
const iso = (d: string) => {
  const m = d.trim().match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Fără diacritice (cu sedilă sau virgulă), fără punctuație, litere mici: ca să comparăm nume de comisii. */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Ca countWord din format.ts („20 de amendamente”, „115 amendamente”), copiat ca modulul să nu importe decât tipuri.
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n}${(n % 100 === 0 && n !== 0) || n % 100 >= 20 ? ' de' : ''} ${many}`);

/**
 * „106 pentru, 0 contra, nicio abținere” sau, la o întrebare de respingere, „72 pentru respingere, 22 contra, …”. Fără
 * abțineri în sursă nu scriem nimic despre ele (nu „nicio abținere”).
 */
export function totalsText(t: { pentru: number; contra: number; abtineri?: number | null }, question: 'adoptare' | 'respingere' = 'adoptare') {
  const head = `${t.pentru} ${question === 'respingere' ? 'pentru respingere' : 'pentru'}, ${t.contra} contra`;
  if (t.abtineri == null || !Number.isFinite(t.abtineri)) return head;
  return `${head}, ${t.abtineri ? plural(t.abtineri, 'abținere', 'abțineri') : 'nicio abținere'}`;
}

/** „pentru= 62 contra=46 abțineri=1”, „pentru=245, contra=0, abtineri=0” → cifrele, din rândul fișei. */
function rowTotals(action: string) {
  const n = (w: string) => Number(action.match(new RegExp(`${w}\\s*=\\s*(\\d+)`, 'i'))?.[1] ?? NaN);
  const t = { pentru: n('pentru'), contra: n('contra'), abtineri: n('ab[țţt]ineri') };
  return Number.isFinite(t.pentru) && Number.isFinite(t.contra) ? { ...t, abtineri: Number.isFinite(t.abtineri) ? t.abtineri : null } : null;
}

const CHAMBER_SITE = { senat: 'senat.ro', camera: 'cdep.ro' } as const;

/**
 * Rezoluția unei comisii a Senatului, scrisă pe ordinea de zi după ședință. E hotărârea comisiei, nu a Senatului: nu e
 * niciodată „adoptat” sau „respins” ca proiect. „Adoptat” înseamnă că și-a adoptat raportul sau avizul (rolul vine din
 * coloana scopului).
 */
export function senateResolution(rez: string, scop = ''): { kind: OutcomeKind; text: string } {
  const t = rez.replace(/\s+/g, ' ').trim();
  const n = norm(t);
  const role = norm(scop);
  const doc = role.startsWith('raport') ? 'Raport' : role.startsWith('aviz') ? 'Aviz' : null;
  if (n.startsWith('amanat')) return { kind: 'amanat', text: 'Amânat' };
  if (n.startsWith('raport')) return { kind: 'raport', text: upper(t) };
  if (n.startsWith('aviz')) return { kind: 'aviz', text: upper(t) };
  if (n.startsWith('adoptat')) {
    const rest = t.replace(/^adoptat[ăa]?\s*/i, '');
    return { kind: doc === 'Raport' ? 'raport' : doc === 'Aviz' ? 'aviz' : 'alt', text: `${doc ? `${doc} adoptat` : 'Adoptat'} în comisie${rest ? ` ${rest}` : ''}` };
  }
  if (n.startsWith('respins')) return { kind: 'alt', text: `${upper(t)} în comisie` };
  return { kind: 'alt', text: upper(t) };
}
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** „Comisia … transmite avizul cu nr. XIX/180-FAVORABIL cu amendamente”, „… depune raportul cu nr. …-NEGATIV”. */
function senateCommitteeRow(action: string, comisie: string): { kind: OutcomeKind; text: string } | null {
  const a = norm(action);
  if (!a.startsWith(norm(comisie))) return null;
  const m = action.match(/(transmite avizul|depune raportul)\s+cu\s+nr\.?\s*\S*?-(FAVORABIL|NEGATIV)(\s+cu\s+amendamente)?/i);
  if (!m) return null;
  const raport = /raport/i.test(m[1]);
  const fav = /favorabil/i.test(m[2]);
  return {
    kind: raport ? 'raport' : 'aviz',
    // „depus” / „transmis”: pasul din fișă (poate fi documentul hotărât în ședință, trimis după), nu hotărârea însăși.
    text: `${raport ? 'Raport' : 'Aviz'} ${fav ? 'favorabil' : 'negativ'}${m[3] ? ' cu amendamente' : ''} ${raport ? 'depus' : 'transmis'}`,
  };
}

/** Un rând de plen dintr-o fișă (a Senatului sau a Camerei): adoptat, respins, retrimis la comisie, dezbătut. */
function plenaryRow(action: string, chamber: 'senat' | 'camera'): { kind: OutcomeKind; text: string; detail: string | null } | null {
  const a = action.replace(/\s+/g, ' ');
  const who = chamber === 'senat' ? 'Senat' : 'Camera Deputa';
  const whoText = chamber === 'senat' ? 'Senat' : 'Camera Deputaților';
  const t = rowTotals(a);
  const respingere = /pentru respingere/i.test(a);
  if (new RegExp(`^(legea .*?)?adoptat[ăa]? de ${who}`, 'i').test(a) || new RegExp(`^legea .*adoptata de ${who}`, 'i').test(a)) {
    const tacit = /depasirii termenului|depășirii termenului/i.test(a);
    return { kind: 'adoptat', text: tacit ? `Adoptat tacit de ${whoText} (termenul a expirat)` : `Adoptat de ${whoText}`, detail: t ? totalsText(t) : null };
  }
  if (new RegExp(`^respins[ăa]? de (catre )?${who}`, 'i').test(a)) {
    return { kind: 'respins', text: `Respins de ${whoText}`, detail: t ? totalsText(t, respingere ? 'respingere' : 'adoptare') : null };
  }
  if (/^[îi]ncetarea procedurii legislative prin respingere definitiv/i.test(a) && (chamber === 'senat' || /de c[aă]tre Camer/i.test(a))) {
    return { kind: 'respins', text: `Respins definitiv de ${whoText}`, detail: null };
  }
  // Votul final fără majoritatea cerută nu e o respingere. Textul e al votului nominal (mai jos), ca rândurile să se unească;
  // când plenul l-a retrimis atunci comisiei, pasul e retrimiterea, cu cifrele votului.
  if (chamber === 'camera' && /^vot final (adoptare|respingere)\b/i.test(a)) {
    const detail = t ? totalsText(t, /^vot final respingere/i.test(a) ? 'respingere' : 'adoptare') : null;
    if (/retrimiterea la comisi/i.test(a)) return { kind: 'retrimis', text: 'Retrimis la comisie după votul final', detail };
    if (/nu a fost [îi]ntrunit[ăa] majoritatea|f[ăa]r[ăa] majoritate/i.test(a)) return { kind: 'alt', text: `Vot fără majoritatea cerută în ${whoText}`, detail };
  }
  // Doar retrimiterea aprobată de plen, nu o cerere de retrimitere.
  if (/^(plenul .*aprob[ăa] (retransmiterea|retrimiterea) la comisi|retrimis la comisi)/i.test(a)) {
    return { kind: 'retrimis', text: 'Retrimis la comisie', detail: null };
  }
  // „dezbatere în plenul Camerei … pentru ședințele … din zilele de 16 și 18 noiembrie” e doar programarea (stenograma
  // zilei de 16 noiembrie n-o are); dezbaterea propriu-zisă e rândul cu stenograma („consultati stenograma sedintei”).
  // Nota din paranteză e ca în sumarul stenogramei: „( retrimis comisiei )”, „( rămas pentru votul final )”.
  if (chamber === 'camera' && /^dezbatere [îi]n plenul Camerei/i.test(a) && !/\bpentru [șşs]edin/i.test(a)) {
    const nota = a.match(/^dezbatere [îi]n plenul Camerei Deputa\S*\s*\(\s*([^)]*?)\s*\)/i)?.[1];
    return nota ? { ...stenoNote(nota), detail: null } : { kind: 'dezbatut', text: 'Dezbătut în plen', detail: null };
  }
  return null;
}

/**
 * Comisiile scrise pe rândul fișei după „de la:” (parseSheet, din 23 noiembrie 2026): „primire aviz de la: Comisia A;
 * Comisia B — notă” → ['Comisia A', 'Comisia B']. Gol pe rândurile citite înainte, care se terminau în „de la:”.
 */
export function rowCommittees(action: string): string[] {
  const rest = action.match(/\bde la:\s*(.+)$/i)?.[1];
  return rest ? rest.split(' — ')[0].split(/;\s*/).map((c) => c.trim()).filter(Boolean) : [];
}

/** „primire raport favorabil (61 amend. admise) de la: Comisia …”, „primire raport de respingere de la:”. */
function chamberReportRow(action: string): { kind: OutcomeKind; text: string } | null {
  const a = action.replace(/\s+/g, ' ').trim();
  const m = a.match(/^primire raport (suplimentar |de înlocuire |de inlocuire )?(favorabil|de respingere|de adoptare)?(.*?)\s*de la:?(?:\s.*)?$/i);
  if (!m) return null;
  const extra = m[1] ? ` ${m[1].trim().toLowerCase()}` : '';
  const what = !m[2] ? '' : /respingere/i.test(m[2]) ? ' de respingere' : ' favorabil';
  const admise = m[3].match(/(\d+)\s+amend\.?\s+admise/i)?.[1];
  // „favorabil aprobarii ordonantei de urgenta”; o respingere a ordonanței rămâne „de respingere”, fără alt adaos.
  const ou = /aprob[aă]rii ordonan/i.test(m[3]) && !/resping/i.test(a) ? ' aprobării ordonanței' : '';
  return {
    kind: 'raport',
    text: `Raport${extra}${what}${ou}${admise ? `, cu ${plural(Number(admise), 'amendament admis', 'amendamente admise')}` : ''}, primit de Cameră`,
  };
}

// Ca numberKey din scripts/lib/cdep-plen.mjs (copiat, ca modulul să nu importe decât tipuri): „PL-x 488/2026” →
// 'PLX 488/2026', „PH CD 79/2026” → 'PHCD 79/2026'; PL, PL-x și Pl-x au același șir de numere la Cameră.
export function chamberKey(s: string | null | undefined): string | null {
  const m = /\b(PL\s*-?\s*[xX]|Pl\s*-?\s*[xX]|PL|Pl|PH\s*-?\s*CD|PHC)\s*(?:nr\.?\s*)?(\d{1,4})\s*\/\s*(\d{4})\b/.exec(s ?? '');
  if (!m) return null;
  const t = m[1].replace(/[\s-]/g, '').toUpperCase();
  return `${t === 'PL' ? 'PLX' : t === 'PHC' ? 'PHCD' : t} ${Number(m[2])}/${m[3]}`;
}

const STENO_SITE = 'https://www.cdep.ro/ords/pls/steno';
const stenoItemUrl = (p: StenoItem) => `${STENO_SITE}/steno2015.stenograma?ids=${p.ids}&idm=${p.idm}&idl=1`;
const dayVoteUrl = (v: DayVote) => `${STENO_SITE}/evot2015.Nominal?idv=${v.idv}`;

/**
 * Ce spune sumarul stenogramei despre un punct: nota în italice („rămas pentru votul final”, „retrimisă comisiei”,
 * „adoptat”, „respinsă”, „adoptată ca urmare a depășirii termenului constituțional”). Un punct fără notă a fost doar
 * dezbătut; o notă necunoscută rămâne „alt rezultat”, cu textul ei.
 */
export function stenoNote(nota: string): { kind: OutcomeKind; text: string } {
  const n = norm(nota);
  const who = 'Camera Deputaților';
  // „adoptată propunerea de respingere”, „respinsă cererea de retrimitere”: hotărâri despre o cerere, nu despre proiect.
  if (/\b(propunerea|propunere|cererea|cerere|solicitarea|solicitare|motiunea)\b/.test(n)) return { kind: 'alt', text: upper(nota) };
  if (/^adoptat/.test(n)) return /depasirii termenului/.test(n) ? { kind: 'adoptat', text: `Adoptat tacit de ${who} (termenul a expirat)` } : { kind: 'adoptat', text: `Adoptat de ${who}` };
  if (/^respins/.test(n)) return { kind: 'respins', text: `Respins de ${who}` };
  if (/retrimis|retransmis/.test(n)) return { kind: 'retrimis', text: 'Retrimis la comisie' };
  if (/ramas[ae]? pentru votul final/.test(n)) return { kind: 'dezbatut', text: 'Dezbătut, rămas pentru votul final' };
  if (/amanat|amanare/.test(n)) return { kind: 'amanat', text: upper(nota) };
  if (!n) return { kind: 'dezbatut', text: 'Luat în dezbatere, fără o hotărâre notată în sumar' };
  if (/^(retras|scos)/.test(n)) return { kind: 'alt', text: upper(nota) };
  return { kind: 'alt', text: upper(nota) };
}

/**
 * Rezultatele unei apariții.
 `until` e ziua următoarei apariții a proiectului la același organ (exclusiv), dacă există.
 * Nimic pentru zilele care n-au trecut: ședința de azi încă n-a avut loc la ora build-ului (dimineața).
 */
export function outcomesFor(
  a: AgendaAppearance,
  src: OutcomeSources,
  today: string,
  until: string | null = null,
  records: ChamberRecords | null = null,
): AgendaOutcome[] {
  if (a.zi >= today) return [];
  const cap = shift(a.zi, a.plen ? PLEN_DAYS : COMMITTEE_DAYS);
  const end = until && until < cap ? until : cap;
  const inWindow = (d: string) => !!d && d >= a.zi && d < end && d < today;
  const out: AgendaOutcome[] = [];
  const agendaSource: OutcomeSource | null = a.url ? { label: `Ordinea de zi pe ${CHAMBER_SITE[a.chamber]}`, url: a.url } : null;
  const senateSheet: OutcomeSource | null = src.senat?.url ? { label: 'Fișa proiectului pe senat.ro', url: src.senat.url } : null;
  const chamberSheet: OutcomeSource | null = src.camera?.url ? { label: 'Fișa proiectului pe cdep.ro', url: src.camera.url } : null;
  const push = (o: Omit<AgendaOutcome, 'sources' | 'later'> & { sources: (OutcomeSource | null)[] }) => {
    const sources = o.sources.filter((s): s is OutcomeSource => !!s);
    if (!sources.length) return;
    // Același pas din două surse (ordinea de zi și fișa, fișa și votul): un singur rând, cu toate sursele și cu cifrele.
    // Doar hotărârea plenului (adoptat, respins) se unește după fel și zi; ea păstrează formularea mai precisă („tacit”,
    // „definitiv”). Rapoartele și avizele se unesc doar cu același text.
    // Dezbaterea și retrimiterea din aceeași zi sunt tot un singur pas, oricum l-ar formula sursa; rămâne prima formulare
    // (stenograma, care vine întâi, e cea mai precisă).
    const plenary = o.kind === 'adoptat' || o.kind === 'respins' || o.kind === 'dezbatut' || o.kind === 'retrimis';
    const same = out.find((x) => x.kind === o.kind && x.date === o.date && (plenary || x.text === o.text));
    if (same) {
      if (plenary && /tacit|definitiv/.test(o.text) && !/tacit|definitiv/.test(same.text)) same.text = o.text;
      same.detail ??= o.detail;
      for (const s of sources) if (!same.sources.some((x) => x.url === s.url)) same.sources.push(s);
      return;
    }
    out.push({ ...o, sources, later: o.date > a.zi });
  };

  if (a.chamber === 'senat' && !a.plen) {
    if (a.punct.rezolutie) push({ ...senateResolution(a.punct.rezolutie, a.punct.scop), detail: null, date: a.zi, sources: [agendaSource] });
    for (const r of src.senat?.timeline ?? []) {
      const d = iso(r.date);
      const hit = inWindow(d) && senateCommitteeRow(r.action, a.comisie);
      if (hit) push({ ...hit, detail: null, date: d, sources: [senateSheet] });
    }
  }

  if (a.chamber === 'senat' && a.plen) {
    const scop = a.punct.scop.trim();
    if (/^(adoptat|respins)$/i.test(scop)) {
      const adoptat = /^adoptat/i.test(scop);
      push({ kind: adoptat ? 'adoptat' : 'respins', text: `${adoptat ? 'Adoptat' : 'Respins'} de Senat`, detail: null, date: a.zi, sources: [agendaSource] });
    }
    for (const r of src.senat?.timeline ?? []) {
      const d = iso(r.date);
      const hit = inWindow(d) && plenaryRow(r.action, 'senat');
      if (hit) push({ ...hit, date: d, sources: [senateSheet] });
    }
    for (const r of src.camera?.timeline ?? []) {
      if (!/senat/i.test(r.camera ?? '')) continue;
      const d = iso(r.data);
      const hit = inWindow(d) && plenaryRow(r.actiune, 'senat');
      if (hit) push({ ...hit, date: d, sources: [chamberSheet] });
    }
  }

  const key = a.chamber === 'camera' ? chamberKey(a.punct.numar) : null;
  // idp-ul e al fișei unei legi (upl_pck2015); hotărârile Camerei (PHCD) au alt șir de idp-uri, deci nu potrivim după el.
  const lawIdp = !key || key.startsWith('PLX ');
  const sameBill = (numar: string | null, idp: number | null) => (!!key && numar === key) || (lawIdp && !!idp && !!a.punct.cod && String(idp) === a.punct.cod);

  // Rapoartele și avizele din fișă: ale comisiei după numele ei de pe rând. Un rând fără nume (fișă citită înainte de
  // 23 noiembrie 2026) leagă raportul de comisiile raportului, după idc, ca până atunci; un aviz fără nume, de nimeni.
  if (a.chamber === 'camera' && !a.plen && src.camera) {
    const me = norm(a.comisie);
    for (const r of src.camera.timeline) {
      const d = iso(r.data);
      if (/senat/i.test(r.camera ?? '') || !inWindow(d)) continue;
      const names = rowCommittees(r.actiune).map(norm);
      const mine = names.length ? names.includes(me) : null;
      const report = chamberReportRow(r.actiune);
      if (report && (mine ?? src.camera.raport.includes(a.comisieId))) push({ ...report, detail: null, date: d, sources: [chamberSheet] });
      else if (mine && /^primire aviz de la:/i.test(r.actiune.trim())) push({ kind: 'aviz', text: 'Aviz al comisiei', detail: null, date: d, sources: [chamberSheet] });
    }
  }

  // Avizele și rapoartele de pe pagina comisiei: ale ei, pentru același proiect, datate în fereastra ședinței. Documentul
  // e de obicei și pe fișă („primire raport favorabil … de la:”, cu direcția lui; „primire aviz de la:”): atunci e încă o
  // sursă pentru rândul din fișă.
  if (a.chamber === 'camera' && !a.plen) {
    for (const d of records?.comisii.get(a.comisieId) ?? []) {
      if (!inWindow(d.data) || !sameBill(d.numar, d.idp)) continue;
      const doc: OutcomeSource = { label: d.tip === 'raport' ? 'Raportul comisiei pe cdep.ro' : 'Avizul comisiei pe cdep.ro', url: d.pdf };
      // Același document doar când rândul din fișă e la cel mult trei zile de data lui (raportul suplimentar e altul).
      const near = (x: AgendaOutcome) => Math.abs(Date.parse(x.date) - Date.parse(d.data)) <= 3 * 86_400_000;
      const fromSheet = out.find((x) => x.kind === d.tip && near(x) && x.sources.some((s) => s.url === chamberSheet?.url));
      if (fromSheet) {
        if (!fromSheet.sources.some((s) => s.url === doc.url)) fromSheet.sources.push(doc);
        continue;
      }
      // Lista comisiei spune doar că documentul e al ei și data lui, nu și când a fost trimis sau din ce ședință vine.
      const text = d.tip === 'aviz' ? 'Aviz al comisiei' : d.comune.length > 1 ? 'Raport comun al comisiilor' : 'Raport al comisiei';
      push({ kind: d.tip, text, detail: null, date: d.data, sources: [doc] });
    }
  }

  // Plenul Camerei: întâi sumarul stenogramei din ziua ședinței (formularea lui rămâne la pașii din aceeași zi).
  const plenDay = a.chamber === 'camera' && a.plen ? records?.plen.get(a.zi) : undefined;
  const steno = plenDay?.stenograma?.tip === 'camera' ? plenDay.stenograma : null;
  if (steno && key) {
    for (const p of steno.puncte.filter((p) => p.numere.includes(key) && !p.mentiune)) {
      push({ ...stenoNote(p.nota), detail: null, date: a.zi, sources: [{ label: 'Stenograma ședinței pe cdep.ro', url: stenoItemUrl(p) }] });
    }
  }

  if (a.chamber === 'camera' && a.plen) {
    for (const r of src.camera?.timeline ?? []) {

      if (/senat/i.test(r.camera ?? '')) continue;
      const d = iso(r.data);
      const hit = inWindow(d) && plenaryRow(r.actiune, 'camera');
      if (hit) push({ ...hit, date: d, sources: [chamberSheet] });
    }
  }

  // Votul nominal din plen: aceeași cameră, în fereastra ședinței; cifrele lui au întâietate (sunt cele oficiale ale votului).
  if (a.plen) {
    const chamber = a.chamber === 'senat' ? 'senat' : 'cdep';
    for (const v of src.votes) {
      if (v.chamber !== chamber || !inWindow(v.date) || !v.result) continue;
      const who = a.chamber === 'senat' ? 'Senat' : 'Camera Deputaților';
      // Un vot fără majoritatea cerută nu e o respingere: rămâne „alt rezultat”, cu textul lui.
      const kind: OutcomeKind = v.result === 'adoptat' ? 'adoptat' : v.result === 'respins' ? 'respins' : 'alt';
      const text = v.result === 'adoptat' ? `Adoptat de ${who}` : v.result === 'respins' ? `Respins de ${who}` : `Vot fără majoritatea cerută în ${who}`;
      const detail = totalsText(v.totals, v.question);
      const site = a.chamber === 'senat' ? 'senat.ro' : 'cdep.ro';
      const same = kind !== 'alt' && out.find((x) => x.kind === kind && x.date === v.date);
      if (same) same.detail = detail;
      push({ kind, text, detail, date: v.date, sources: [{ label: `Votul pe ${site}`, url: v.url }] });
    }
    // Până apare stenograma: voturile electronice ale zilei pentru proiect. Pagina nu spune dacă votul a trecut, deci
    // spunem doar ce s-a votat, cu cifrele. Când avem deja hotărârea din aceeași zi (din fișă sau din votul nominal),
    // votul zilei e doar încă o sursă pentru ea.
    if (a.chamber === 'camera' && !steno) {
      const numbers = (d: string | null) => d?.match(/^(\d+) pentru.*?, (\d+) contra/)?.slice(1).join('|') ?? null;
      for (const v of plenDay?.voturi?.voturi ?? []) {
        if (!sameBill(v.numar, v.idp) || v.pentru == null || v.contra == null) continue;
        const final = /^vot final/i.test(v.descriere);
        const sendBack = /retrimitere la comisie/i.test(v.descriere);
        if (!final && !sendBack) continue;
        // „adoptare” / „respingere” e primul cuvânt al detaliului; un titlu cu „respingerea OUG” nu e o întrebare de respingere.
        const respingere = /^\s*respingere\b/i.test(v.detaliu);
        const detail = totalsText({ pentru: v.pentru, contra: v.contra, abtineri: v.abtineri }, respingere ? 'respingere' : 'adoptare');
        const source: OutcomeSource = { label: 'Votul pe cdep.ro', url: dayVoteUrl(v) };
        const idv = new RegExp(`idv=${v.idv}(?!\\d)`);
        // Același vot: aceeași sursă (idv) sau, pentru votul final, hotărârea din aceeași zi cu aceleași cifre.
        const same =
          out.find((x) => x.sources.some((s) => idv.test(s.url))) ??
          out.find((x) => x.date === a.zi && (final ? x.kind === 'adoptat' || x.kind === 'respins' : x.kind === 'retrimis') && (!final || numbers(x.detail) === `${v.pentru}|${v.contra}`));
        if (same) {
          same.detail ??= detail;
          if (!same.sources.some((s) => idv.test(s.url))) same.sources.push(source);
          continue;
        }
        const text = final ? `Supus votului final${respingere ? ' (pentru respingere)' : ''}` : 'Vot asupra retrimiterii la comisie';
        out.push({ kind: 'alt', text, detail, date: a.zi, later: false, sources: [source] });
      }
    }
    // Un vot final face redundantă dezbaterea din aceeași zi.
    // Doar în aceeași zi: dezbaterea de luni rămâne lângă votul final de miercuri.
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].kind === 'dezbatut' && out.some((o) => (o.kind === 'adoptat' || o.kind === 'respins') && o.date === out[i].date)) out.splice(i, 1);
    }
  }

  // Nedezbătut: doar cu sumarul întreg al stenogramei din ziua aceea, fără proiect în el (nici pomenit) și fără niciun alt
  // pas din aceeași zi (un vot sau un rând din fișă ar contrazice sumarul: atunci nu spunem nimic).
  const inSteno = !!steno && !!key && steno.puncte.some((p) => p.numere.includes(key));
  const votedThatDay = (plenDay?.voturi?.voturi ?? []).some((v) => sameBill(v.numar, v.idp));
  if (steno && key && steno.complet !== false && !inSteno && !votedThatDay && !out.some((o) => o.date === a.zi)) {
    out.push({ kind: 'nedezbatut', text: 'Nu a fost dezbătut în această ședință', detail: null, date: a.zi, later: false, sources: [{ label: 'Sumarul ședinței pe cdep.ro', url: steno.url }] });
  }

  return out.sort((x, y) => x.date.localeCompare(y.date));
}


// —— Citirea surselor, la build ——

interface SenatRow {
  slug: string;
  sheetUrl?: string;
  timeline?: { date: string; action: string }[];
}
interface CdepFile {
  url?: string;
  fisa?: { timeline?: ChamberSheet['timeline']; comisii?: { raport?: { idc: number }[] } } | null;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

const chamberSheet = (f: CdepFile | null): ChamberSheet | null =>
  f?.fisa?.timeline
    ? { url: f.url ?? null, timeline: f.fisa.timeline, raport: (f.fisa.comisii?.raport ?? []).map((c) => String(c.idc)) }
    : null;

/** Sursele fiecărui proiect din agendă, după `href`. */
export async function loadOutcomeSources(hrefs: { chamber: 'senat' | 'camera'; slug: string; href: string }[], root = process.cwd()) {
  const data = path.join(root, 'data');
  const senat = (await readJson<SenatRow[] | { bills: SenatRow[] }>(path.join(data, 'senat-bills.json'))) ?? [];
  const senatBySlug = new Map((Array.isArray(senat) ? senat : senat.bills).map((b) => [b.slug, b]));
  const out = new Map<string, OutcomeSources>();
  for (const b of hrefs) {
    if (out.has(b.href)) continue;
    const s = b.chamber === 'senat' ? senatBySlug.get(b.slug) : undefined;
    const camera = chamberSheet(await readJson<CdepFile>(path.join(data, b.chamber === 'senat' ? 'camera' : path.join('cdep', 'proiecte'), `${b.slug}.json`)));
    const votes = (await readJson<{ votes?: OutcomeSources['votes'] }>(path.join(data, 'votes', `${b.slug}.json`)))?.votes ?? [];
    out.set(b.href, { senat: s?.timeline ? { url: s.sheetUrl ?? null, timeline: s.timeline } : null, camera, votes });
  }
  return out;
}

/** Zilele de plen ale Camerei și documentele comisiilor ei (scripts/straja-cdep-plen.mjs); goale fără fișiere. */
export async function loadChamberRecords(root = process.cwd()): Promise<ChamberRecords> {
  const dir = path.join(root, 'data', 'cdep');
  const list = async (d: string) => (await fs.readdir(path.join(dir, d)).catch(() => [] as string[])).filter((f) => f.endsWith('.json'));
  const plen = new Map<string, ChamberPlenDay>();
  for (const f of await list('plen')) {
    const day = await readJson<ChamberPlenDay>(path.join(dir, 'plen', f));
    if (day?.zi) plen.set(day.zi, day);
  }
  const comisii = new Map<string, CommitteeDoc[]>();
  for (const f of await list('comisii-documente')) {
    const c = await readJson<{ idc: string | number; documente?: CommitteeDoc[] }>(path.join(dir, 'comisii-documente', f));
    if (c?.idc != null) comisii.set(String(c.idc), c.documente ?? []);
  }
  return { plen, comisii };
}

/** Pentru fiecare apariție (în ordinea dată): ziua următoarei apariții
 a aceluiași proiect la același organ. */
export function nextAtSameBody(appearances: AgendaAppearance[]) {
  const key = (a: AgendaAppearance) => `${a.chamber}|${a.plen ? 'plen' : a.comisieId}|${a.bill.href}`;
  const days = new Map<string, string[]>();
  for (const a of appearances) days.set(key(a), [...(days.get(key(a)) ?? []), a.zi]);
  for (const list of days.values()) list.sort();
  return appearances.map((a) => days.get(key(a))!.find((d) => d > a.zi) ?? null);
}
