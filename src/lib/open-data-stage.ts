import type { BillStatus, StatusKey } from './bill-status';
import type { CdepBill } from './cdep';
import type { EnrichedBill } from './types';
import { foldText, normalizeId, normalizeIdExact, parseIsoDate, shortSenateNumber } from './bill-ids';
import { SENAT_URL } from './site';

export type DeadlineType = 'public_consultation' | 'amendments' | 'committee_report' | 'plenary_scheduled';
export type DeadlineAudience = 'citizens' | 'parliament';
export type SubmissionWindowStatus = 'open' | 'closed' | 'unknown';

export interface Deadline {
  type: DeadlineType;
  audience: DeadlineAudience;
  /** Ce înseamnă termenul, pe scurt, în română. */
  label: string;
  /** YYYY-MM-DD (dată calendaristică validată). */
  date: string;
  /** Pagina oficială de unde provine termenul. */
  source: string;
}

export interface HistoricalConsultation {
  date: string;
  closed_early_on: string | null;
  source: string;
}

export interface SubmissionChannel {
  kind: 'senate_form' | 'chamber_form' | 'committee_email' | 'none';
  url: string | null;
  label: string;
}

export interface StageResolution {
  chamber: 'senat' | 'camera';
  status: string;
  stage_key: string;
  in_debate: boolean;
  submission_window: SubmissionWindowStatus;
  deadlines: Deadline[];
  status_detail: {
    title: string;
    detail: string | null;
    next: string | null;
    note: string | null;
    overdue: string | null;
    chamber: 'senat' | 'camera';
    role: string | null;
  };
  submission_how: string;
  channel: SubmissionChannel;
  /** Termenul deschis de consultare publică pentru cetățeni; null dacă nu există o fereastră deschisă. */
  citizen_deadline: Deadline | null;
  /** Termenul istoric al consultării publice, păstrat și după încheiere. */
  historical_consultation_deadline: HistoricalConsultation | null;
  /** Termene parlamentare (amendamente deputați, raport, plen). */
  parliamentary_deadlines: Deadline[];
}

export const CHAMBER_IN_DEBATE = new Set<StatusKey>([
  'avize',
  'comisii',
  'raport',
  'plen',
  'adoptat_prima',
  'respins_prima',
  'reexaminare',
]);

const SENATE_FORM_URL = 'https://online.senat.ro/portal/serviciu/initiative-legislative-aflate-in-consultare-publica';

function extractLawRefs(title: string): string[] {
  const f = foldText(title);
  const refs: string[] = [];
  const re = /\b(?:legea|legii|oug|ordonantei(?:\s+de\s+urgenta)?|og)\s*(?:nr\.?\s*)?(\d+\s*\/\s*\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f)) !== null) refs.push(m[1].replace(/\s+/g, ''));
  return [...new Set(refs)];
}

function titleTokens(title: string): Set<string> {
  const stop = new Set(['proiect', 'propunere', 'legislativa', 'lege', 'legea', 'legii', 'pentru', 'privind', 'modificarea', 'completarea', 'unor', 'acte', 'normative', 'cu', 'si', 'din', 'de', 'la', 'in', 'a', 'al', 'ale', 'nr']);
  return new Set(
    foldText(title)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !stop.has(w)),
  );
}

/**
 * Verifică dacă un proiect de la Cameră (CdepBill) este cu adevărat același proiect ca unul urmărit de la Senat.
 * Previne legături false din index (ex. erori de an pe cdep.ro la `numarSenat` precum Pl-x 182/2026 vs B549/2026).
 */
export function isVerifiedBillLink(
  senate: Pick<EnrichedBill, 'slug' | 'officialTitle' | 'camera'>,
  cdep: Pick<CdepBill, 'idp' | 'senat' | 'titlu'>,
): boolean {
  if (senate.camera?.idp != null && senate.camera.idp === cdep.idp) return true;
  if (cdep.senat !== senate.slug) return false;
  const sRefs = extractLawRefs(senate.officialTitle);
  const cRefs = extractLawRefs(cdep.titlu);
  if (sRefs.length > 0 && cRefs.length > 0 && !sRefs.some((r) => cRefs.includes(r))) return false;
  const sTok = titleTokens(senate.officialTitle);
  const cTok = titleTokens(cdep.titlu);
  if (sTok.size === 0 || cTok.size === 0) return false;
  let shared = 0;
  for (const t of sTok) if (cTok.has(t)) shared++;
  return shared / Math.min(sTok.size, cTok.size) >= 0.65;
}

/**
 * Determină stadiul parlamentar și starea ferestrei de consultare publică pentru un proiect aflat la Senat
 * (sau încă nelegat de o fișă activă la Camera Deputaților).
 */
export function resolveSenateStage(
  bill: Pick<EnrichedBill, 'stage' | 'consultationDeadline' | 'announcedDeadline' | 'leftListAt' | 'sheetUrl' | 'firstChamber'>,
  today: string,
): StageResolution {
  const stageNorm = foldText(bill.stage ?? '').trim();
  const consultationDate = parseIsoDate(bill.consultationDeadline);
  const leftEarly = parseIsoDate(bill.leftListAt);

  const isWithdrawn = /\bretras\b/.test(stageNorm);
  const isRejectedFinal = /respingere\s+definitiv|respins[a]?\s+definitiv/.test(stageNorm);
  const isLaw = /\bpromulgat|^lege\b|devenit\s+lege/.test(stageNorm);
  const isClosed = /\bclasat\b|procedura\s+legislativa\s+incetat|\bincetat\b/.test(stageNorm);
  const terminal = isWithdrawn || isRejectedFinal || isLaw || isClosed;

  const historicalConsultation: HistoricalConsultation | null = consultationDate
    ? { date: consultationDate, closed_early_on: leftEarly, source: bill.sheetUrl }
    : null;

  if (terminal) {
    const stage_key = isWithdrawn ? 'withdrawn' : isRejectedFinal ? 'rejected_final' : isLaw ? 'law' : 'closed';
    const title = isWithdrawn ? 'Retras de inițiator' : isRejectedFinal ? 'Respins definitiv' : isLaw ? bill.stage : 'Procedură încheiată';
    return {
      chamber: 'senat',
      status: title,
      stage_key,
      in_debate: false,
      submission_window: 'closed',
      deadlines: [],
      status_detail: {
        title,
        detail: bill.stage || null,
        next: null,
        note: null,
        overdue: null,
        chamber: 'senat',
        role: null,
      },
      submission_how: isWithdrawn
        ? 'Proiectul a fost retras de inițiator; nu mai este în dezbatere și nu mai primește puncte de vedere.'
        : 'Procedura parlamentară s-a încheiat; proiectul nu mai este în dezbatere.',
      channel: { kind: 'none', url: null, label: 'Procedură încheiată' },
      citizen_deadline: null,
      historical_consultation_deadline: historicalConsultation,
      parliamentary_deadlines: [],
    };
  }

  const sentToChamber = /trimis\s+la\s+camer/.test(stageNorm);
  const hasReport = /depus\s+raport/.test(stageNorm);
  const inCommittees = /in\s+lucru.*comisi|la\s+comisi/.test(stageNorm);
  const forInfo = /pt\.?\s*informare|pentru\s+informare/.test(stageNorm);

  // Consultarea publică formală e deschisă doar dacă proiectul nu a ieșit deja din lista de consultare,
  // nu a plecat deja la Cameră și termenul calendaristic validat nu a trecut.
  const consultationOpen = !sentToChamber && !leftEarly && consultationDate !== null && consultationDate >= today;
  const submission_window: SubmissionWindowStatus = consultationOpen ? 'open' : consultationDate !== null || leftEarly !== null || sentToChamber ? 'closed' : 'unknown';

  const citizenDeadline: Deadline | null = consultationOpen && consultationDate
    ? {
        type: 'public_consultation',
        audience: 'citizens',
        label: 'Termenul consultării publice la Senat (opinii prin formularul Senatului)',
        date: consultationDate,
        source: bill.sheetUrl,
      }
    : null;

  let stage_key: string;
  let title: string;
  let next: string | null;
  let submission_how: string;
  let channel: SubmissionChannel;
  const chamber: 'senat' | 'camera' = sentToChamber ? 'camera' : 'senat';

  if (sentToChamber) {
    stage_key = 'sent_to_chamber';
    title = 'Trimis la Camera Deputaților pentru dezbatere';
    next = 'Dezbaterea în comisiile și plenul Camerei Deputaților.';
    submission_how =
      'Proiectul a trecut de Senat și a fost trimis la Camera Deputaților; consultarea publică de la Senat s-a încheiat. Verifică stadiul actual și comisiile de raport la Camera Deputaților.';
    channel = { kind: 'committee_email', url: null, label: 'Comisiile de raport (Camera Deputaților)' };
  } else if (hasReport) {
    stage_key = 'senate_report';
    title = 'Raport depus la comisia Senatului';
    next = 'Votul în plenul Senatului, apoi transmiterea la Camera Deputaților.';
    submission_how = consultationOpen
      ? `Consultarea publică de pe senat.ro este încă deschisă până la termen; comisia de fond a depus deja raportul. Poți depune opinia prin formularul Senatului (${SENAT_URL}).`
      : 'Consultarea publică de pe senat.ro s-a încheiat și comisia de fond a depus raportul. Proiectul urmează să intre la vot în plenul Senatului; poți scrie senatorilor, dar procedura formală de consultare s-a încheiat.';
    channel = consultationOpen
      ? { kind: 'senate_form', url: SENATE_FORM_URL, label: 'Formularul de consultare publică al Senatului' }
      : { kind: 'committee_email', url: SENAT_URL, label: 'E-mail către comisiile Senatului (fără procedură formală garantată)' };
  } else if (inCommittees) {
    stage_key = 'senate_committees';
    title = 'În lucru la comisiile Senatului';
    next = 'Avizele și raportul comisiei de fond a Senatului, apoi votul în plen.';
    submission_how = consultationOpen
      ? `Consultarea publică este deschisă până la termen. Opinia se depune prin formularul de pe senat.ro (cont pe online.senat.ro) și poate fi trimisă și pe e-mail comisiilor Senatului.`
      : 'Consultarea publică formală de pe senat.ro s-a încheiat, dar proiectul este încă în dezbatere la comisiile Senatului. Un punct de vedere motivat se mai poate trimite pe e-mail comisiilor sesizate, fără garanția preluării.';
    channel = consultationOpen
      ? { kind: 'senate_form', url: SENATE_FORM_URL, label: 'Formularul de consultare publică al Senatului' }
      : { kind: 'committee_email', url: SENAT_URL, label: 'E-mail către comisiile Senatului' };
  } else if (forInfo) {
    stage_key = 'senate_informare';
    title = 'Înregistrat la Senat pentru informare';
    next = 'Stabilirea competenței primei camere sesizate, apoi dezbaterea în comisii.';
    submission_how = consultationOpen
      ? 'Consultarea publică este deschisă până la termen prin formularul Senatului.'
      : 'Consultarea publică de pe senat.ro s-a încheiat; proiectul este în procedură de stabilire a competenței la Senat. Poți trimite un punct de vedere motivat comisiilor pe e-mail, fără garanția preluării.';
    channel = consultationOpen
      ? { kind: 'senate_form', url: SENATE_FORM_URL, label: 'Formularul de consultare publică al Senatului' }
      : { kind: 'committee_email', url: SENAT_URL, label: 'E-mail către comisiile Senatului' };
  } else if (consultationOpen) {
    stage_key = 'public_consultation';
    title = 'În consultare publică la Senat';
    next = 'După consultarea publică, proiectul merge la comisiile Senatului, apoi la vot în plen.';
    submission_how =
      'Consultarea publică este deschisă până la termen. Opinia se depune prin formularul de pe senat.ro (necesită cont pe online.senat.ro); e-mailul către comisiile Senatului o completează.';
    channel = { kind: 'senate_form', url: SENATE_FORM_URL, label: 'Formularul de consultare publică al Senatului' };
  } else {
    stage_key = 'senate_registered';
    title = 'Înregistrat la Senat pentru dezbatere';
    next = 'Dezbaterea în comisiile Senatului, apoi votul în plen.';
    submission_how =
      submission_window === 'closed'
        ? 'Consultarea publică formală de pe senat.ro s-a încheiat, dar proiectul este încă în parcurs parlamentar la Senat. Un punct de vedere motivat se mai poate trimite pe e-mail comisiilor Senatului, fără garanția preluării.'
        : 'Termenul consultării publice nu este cunoscut. Verifică fișa oficială pe senat.ro; poți trimite un punct de vedere motivat comisiilor Senatului pe e-mail.';
    channel = { kind: 'committee_email', url: SENAT_URL, label: 'E-mail către comisiile Senatului' };
  }

  return {
    chamber,
    status: title,
    stage_key,
    in_debate: true,
    submission_window,
    deadlines: citizenDeadline ? [citizenDeadline] : [],
    status_detail: {
      title,
      detail: bill.stage && bill.stage !== title ? bill.stage : null,
      next,
      note: leftEarly && bill.announcedDeadline ? `Ieșit din lista de consultare pe ${leftEarly} (înainte de termenul anunțat inițial, ${bill.announcedDeadline}).` : null,
      overdue: null,
      chamber,
      role: bill.firstChamber ? `Prima cameră sesizată: ${bill.firstChamber}.` : null,
    },
    submission_how,
    channel,
    citizen_deadline: citizenDeadline,
    historical_consultation_deadline: consultationOpen ? null : historicalConsultation,
    parliamentary_deadlines: [],
  };
}

/**
 * Determină stadiul, termenele (cu audiență și sursă distincte) și instrucțiunile specifice fiecărui stadiu
 * pentru un proiect a cărui procedură curentă este la Camera Deputaților (inclusiv proiecte pornite de la Senat).
 */
export function resolveChamberStage(
  bill: Pick<CdepBill, 'url' | 'fisa'>,
  st: BillStatus,
  today: string,
  senateHistorical: HistoricalConsultation | null = null,
): StageResolution {
  const in_debate = CHAMBER_IN_DEBATE.has(st.key);

  // 1. Termenul de consultare publică de pe cdep.ro (când Camera este prima cameră sesizată).
  const consultDate = parseIsoDate(bill.fisa.consultare?.termen);
  const consultOpen = in_debate && consultDate !== null && consultDate >= today;
  const citizenDeadline: Deadline | null = consultOpen && consultDate
    ? {
        type: 'public_consultation',
        audience: 'citizens',
        label: 'Termenul consultării publice la Camera Deputaților (sugestii prin formularul Camerei)',
        date: consultDate,
        source: bill.fisa.consultare?.formular ?? bill.url,
      }
    : null;

  const historicalConsultation: HistoricalConsultation | null = !consultOpen && consultDate
    ? { date: consultDate, closed_early_on: null, source: bill.fisa.consultare?.formular ?? bill.url }
    : !consultOpen
      ? senateHistorical
      : null;

  // 2. Termene parlamentare din resolveStatus (validate calendaristic și etichetate explicit ca audience='parliament').
  const parliamentaryDeadlines: Deadline[] = [];
  for (const d of st.deadlines) {
    const validDate = parseIsoDate(d.date);
    if (!validDate) continue;
    if (d.kind === 'programat') {
      parliamentaryDeadlines.push({
        type: 'plenary_scheduled',
        audience: 'parliament',
        label: `${d.label} (programare de plen, nu termen de consultare publică; se poate schimba)`,
        date: validDate,
        source: bill.url,
      });
    } else if (/amendamente/i.test(d.label)) {
      parliamentaryDeadlines.push({
        type: 'amendments',
        audience: 'parliament',
        label: 'Termen pentru amendamente ale deputaților (cetățenii pot trimite propuneri comisiei de raport înainte de această dată)',
        date: validDate,
        source: bill.url,
      });
    } else {
      parliamentaryDeadlines.push({
        type: 'committee_report',
        audience: 'parliament',
        label: `${d.label} (termen intern al comisiei)`,
        date: validDate,
        source: bill.url,
      });
    }
  }

  const deadlines: Deadline[] = [...(citizenDeadline ? [citizenDeadline] : []), ...parliamentaryDeadlines];

  // 3. Starea ferestrei de consultare/trimitere cetățenească — niciodată confundată cu in_debate!
  let submission_window: SubmissionWindowStatus;
  if (consultOpen) submission_window = 'open';
  else if (!in_debate || st.key === 'raport' || st.key === 'plen') submission_window = 'closed';
  else if (consultDate !== null || senateHistorical !== null) submission_window = 'closed';
  else submission_window = 'unknown';

  // 4. Instrucțiuni specifice fiecărui stadiu parlamentar.
  let submission_how: string;
  let channel: SubmissionChannel;
  switch (st.key) {
    case 'avize':
    case 'comisii':
      if (consultOpen) {
        submission_how = bill.fisa.consultare?.formular
          ? 'Consultarea publică la Camera Deputaților este deschisă până la termen; sugestiile se pot trimite prin formularul Camerei și pe e-mail comisiei care face raportul.'
          : 'Consultarea publică la Camera Deputaților este deschisă până la termen; propunerile motivate se pot trimite pe e-mail comisiei care face raportul.';
        channel = bill.fisa.consultare?.formular
          ? { kind: 'chamber_form', url: bill.fisa.consultare.formular, label: 'Formularul de sugestii al Camerei Deputaților' }
          : { kind: 'committee_email', url: bill.url, label: 'Comisia care face raportul (Camera Deputaților)' };
      } else {
        submission_how =
          'Nu există o fereastră formală de consultare publică deschisă pe cdep.ro; amendamentele oficiale le depun deputații. Un cetățean poate trimite comisiei care face raportul o propunere motivată pe e-mail (de preferat înainte de termenul de amendamente), iar un deputat o poate prelua.';
        channel = { kind: 'committee_email', url: bill.url, label: 'E-mail către comisia care face raportul (Camera Deputaților)' };
      }
      break;
    case 'raport':
    case 'plen':
      submission_how =
        'Comisia a depus raportul; fereastra de propuneri la comisie s-a încheiat. Un punct de vedere se mai poate trimite deputaților din comisie sau celor din județul tău înainte de votul în plen, fără o procedură care să o garanteze.';
      channel = { kind: 'committee_email', url: bill.url, label: 'Deputați din comisie / circumscripție (fără procedură formală)' };
      break;
    case 'adoptat_prima':
    case 'respins_prima':
      submission_how =
        'Prima cameră a votat deja; proiectul urmează să fie dezbătut în camera decizională. Propunerile motivate se pot trimite comisiilor de raport ale camerei decizionale odată ce proiectul este înregistrat acolo.';
      channel = { kind: 'committee_email', url: bill.url, label: 'Comisiile camerei decizionale' };
      break;
    case 'reexaminare':
      submission_how =
        'Proiectul este în reexaminare (la cererea Președintelui sau după o decizie a Curții Constituționale). Propunerile motivate pot fi trimise comisiilor de raport ale camerei în care se reexaminează.';
      channel = { kind: 'committee_email', url: bill.url, label: 'Comisiile de raport (reexaminare)' };
      break;
    case 'adoptat_parlament':
    case 'depus_ccr':
    case 'la_presedinte':
    case 'sesizat_ccr':
    case 'ccr_respins':
      submission_how =
        'Parlamentul a adoptat deja legea; dezbaterea parlamentară s-a încheiat (proiectul este în etapa de control de constituționalitate sau promulgare).';
      channel = { kind: 'none', url: null, label: 'Dezbaterea parlamentară s-a încheiat' };
      break;
    case 'ccr_admis':
      submission_how =
        'Curtea Constituțională a admis obiecții de neconstituționalitate; dacă neconstituționalitatea este parțială, proiectul va reveni în Parlament pentru reexaminare.';
      channel = { kind: 'none', url: null, label: 'În așteptarea reexaminării după decizia CCR' };
      break;
    case 'promulgat':
    case 'lege':
    case 'respins_definitiv':
    case 'incheiat':
      submission_how = 'Procedura parlamentară s-a încheiat; proiectul nu mai este în dezbatere.';
      channel = { kind: 'none', url: null, label: 'Procedură încheiată' };
      break;
  }

  // Dacă proiectul e încă în Senat (ex. adoptat/respins prima cameră = Camera, acum la Senat)
  const chamber: 'senat' | 'camera' = st.stage === 'senat' ? 'senat' : 'camera';

  return {
    chamber,
    status: st.title,
    stage_key: st.key,
    in_debate,
    submission_window,
    deadlines,
    status_detail: {
      title: st.title,
      detail: st.detail,
      next: st.next,
      note: st.note,
      overdue: st.overdue,
      chamber,
      role: st.role,
    },
    submission_how,
    channel,
    citizen_deadline: citizenDeadline,
    historical_consultation_deadline: historicalConsultation,
    parliamentary_deadlines: parliamentaryDeadlines,
  };
}

export interface AliasEntry {
  slug: string;
  /** Identificatori primari proprii ai proiectului canonic: nu au voie să se ciocnească între două proiecte. */
  primaryNumbers: (string | null | undefined)[];
  /** Identificatori secundari (ex. numarSenat de pe o fișă CDEP nelegată, BP de pe o fișă BP): pot fi ambigui. */
  secondaryNumbers: (string | null | undefined)[];
  /** Chei cu namespace proprii (cod:..., idp:... pentru procedura proprie). */
  primaryKeys: string[];
  /** Chei cu namespace secundare (ex. idp:... al unei legături BP neconfirmate unic). */
  secondaryKeys: string[];
}

/**
 * Construiește și validează indexul de aliasuri (index-id.json) din același snapshot ca summaries/dossiers.
 * Eșuează la build dacă:
 *   - două proiecte canonice împart același identificator primar;
 *   - orice alias indică un slug care nu există în snapshot.
 * Aliasurile secundare care indică mai multe proiecte (ex. numere L refolosite în același an) sunt salvate
 * ca array sortat de slug-uri, ca MCP-ul să semnaleze ambiguitatea în loc să aleagă tăcut proiectul greșit.
 */
export function buildIdIndex(entries: AliasEntry[], validSlugs: Set<string>): Record<string, string | string[]> {
  const primary = new Map<string, string>();
  const secondary = new Map<string, Set<string>>();

  const addPrimary = (key: string, slug: string) => {
    if (!key) return;
    if (!validSlugs.has(slug)) throw new Error(`[open-data] Alias primar "${key}" indică un dosar lipsă: ${slug}`);
    const existing = primary.get(key);
    if (existing && existing !== slug) {
      throw new Error(`[open-data] Coliziune de identificator primar "${key}": ${existing} vs ${slug}`);
    }
    primary.set(key, slug);
  };

  const addSecondary = (key: string, slug: string) => {
    if (!key) return;
    if (!validSlugs.has(slug)) throw new Error(`[open-data] Alias secundar "${key}" indică un dosar lipsă: ${slug}`);
    let set = secondary.get(key);
    if (!set) {
      set = new Set();
      secondary.set(key, set);
    }
    set.add(slug);
  };

  for (const e of entries) {
    addPrimary(normalizeId(e.slug), e.slug);
    for (const raw of e.primaryNumbers) {
      if (!raw) continue;
      const exact = normalizeIdExact(raw);
      const short = normalizeId(raw);
      if (exact && exact !== short) addPrimary(exact, e.slug);
      addPrimary(short, e.slug);
      const shortSen = shortSenateNumber(raw);
      if (shortSen) addPrimary(normalizeId(shortSen), e.slug);
    }
    for (const k of e.primaryKeys) addPrimary(k, e.slug);
  }

  for (const e of entries) {
    for (const raw of e.secondaryNumbers) {
      if (!raw) continue;
      const exact = normalizeIdExact(raw);
      const short = normalizeId(raw);
      if (exact && exact !== short) addSecondary(exact, e.slug);
      addSecondary(short, e.slug);
      const shortSen = shortSenateNumber(raw);
      if (shortSen) addSecondary(normalizeId(shortSen), e.slug);
    }
    for (const k of e.secondaryKeys) addSecondary(k, e.slug);
  }

  const out: Record<string, string | string[]> = Object.create(null);
  for (const [k, slug] of primary) out[k] = slug;
  for (const [k, set] of secondary) {
    if (Object.hasOwn(out, k)) continue;
    const list = [...set].sort();
    out[k] = list.length === 1 ? list[0] : list;
  }

  // Verificare finală: niciun alias nu poate indica un dosar lipsă.
  for (const [k, v] of Object.entries(out)) {
    const slugs = Array.isArray(v) ? v : [v];
    for (const s of slugs) {
      if (!validSlugs.has(s)) throw new Error(`[open-data] Alias "${k}" indică un dosar inexistent: ${s}`);
    }
  }
  return out;
}
