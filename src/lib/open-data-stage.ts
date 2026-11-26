import type { BillStatus, StatusKey } from './bill-status';
import { isoDate } from './bill-ids';

/**
 * Unde e acum un proiect și ce poate face un cetățean, pentru datele deschise și MCP (src/lib/open-data.ts). Funcții pure,
 * testate în scripts/lib/mcp.test.mjs.
 *
 * Trei lucruri ținute separat, după recenzia din destraja-eval/mcp (Sol și Carbon, 19 noiembrie 2026):
 * - stadiul vine din cea mai nouă evidență oficială: fișa Camerei când proiectul a ajuns acolo (legătura verificată),
 *   altfel stadiul scris de Senat; consultarea Senatului încheiată nu scoate proiectul din dezbatere;
 * - fereastra de consultare publică (canalul dedicat cetățenilor) e altceva decât termenele parlamentare
 *   (amendamentele le depun deputații, raportul îl face comisia, ședința de plen e doar programată);
 * - fiecare termen spune pentru cine e (audience) și la ce cameră.
 */

export type Chamber = 'senat' | 'camera';
export type DeadlineType = 'public_consultation' | 'amendments' | 'committee_report' | 'plenary_scheduled';
/** public: cetățenii pot trimite ceva până atunci; deputies: doar deputații depun amendamente; committee/plenary: pași ai Parlamentului. */
export type Audience = 'public' | 'deputies' | 'committee' | 'plenary';

export interface Deadline {
  type: DeadlineType;
  audience: Audience;
  chamber: Chamber;
  /** Ce înseamnă termenul, pe scurt, în română. */
  label: string;
  /** YYYY-MM-DD */
  date: string;
}

export type Phase =
  | 'public_consultation'
  | 'committees'
  | 'report'
  | 'plenary'
  | 'sent_to_other_chamber'
  | 'reexamination'
  | 'after_final_vote'
  | 'constitutional_court'
  | 'law'
  | 'rejected'
  | 'withdrawn'
  | 'closed';

export interface SubmissionWindow {
  /** open: consultarea publică e deschisă; closed: nu e (s-a încheiat sau n-a existat); unknown: termenul nu se poate citi. */
  status: 'open' | 'closed' | 'unknown';
  kind: 'senate_public_consultation' | 'chamber_public_consultation' | null;
  /** Ultima zi (inclusiv) a consultării, dacă e cunoscută. */
  closes_on: string | null;
  /** Unde se depune formal o opinie, când fereastra e deschisă. */
  channel: string | null;
  channel_url: string | null;
}

export interface Stage {
  current_chamber: Chamber | null;
  phase: Phase;
  /** Titlul stadiului, în română. */
  status: string;
  /** Proiectul se mai poate influența: e în dezbatere la una dintre camere. */
  in_debate: boolean;
  deadlines: Deadline[];
  window: SubmissionWindow;
  /** Ce poate face un cetățean acum, în română. */
  guidance: string;
  /** Evidența oficială din care vine stadiul. */
  stage_source: 'senat.ro' | 'cdep.ro';
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const SENATE_PORTAL = 'https://online.senat.ro/portal/serviciu/initiative-legislative-aflate-in-consultare-publica';
const SENATE_CHANNEL =
  'Formularul de consultare publică de pe online.senat.ro (cere cont), sau formularul completat trimis pe e-mail la infopub@senat.ro.';
const CLOSED: SubmissionWindow = { status: 'closed', kind: null, closes_on: null, channel: null, channel_url: null };

const NOT_GUARANTEED = 'Nu există o procedură care să garanteze că propunerea e luată în considerare.';

export interface SenateInput {
  /** Stadiul scris pe fișa Senatului („în lucru, la comisiile permanente ale Senatului”, „Retras de către iniţiator”). */
  stage: string;
  /** Ultima zi a consultării publice, YYYY-MM-DD, sau null dacă nu se poate citi. */
  consultationDeadline: string | null;
  /** Comisiile sesizate în fond (una sau mai multe, pentru raport comun) și termenul raportului, din fișa Senatului. */
  reportCommittees?: ReportCommittees | null;
}

/** Comisiile sesizate în fond la Senat, fără dubluri, în ordinea din fișă; mai multe înseamnă raport comun. */
export interface ReportCommittees {
  names: string[];
  /** Cel mai târziu termen al raportului, YYYY-MM-DD, sau null dacă fișa nu-l scrie. */
  deadline: string | null;
}

/** Numele comisiilor, despărțite prin „;” (numele lor au virgule: „Comisia juridică, de numiri, …”). */
const committeesText = (rc: ReportCommittees) => rc.names.join('; ');

/** Stadiul unui proiect din consultarea Senatului care n-a ajuns (verificat) la Cameră. */
export function senateStage(b: SenateInput, today: string): Stage {
  const s = fold(b.stage);
  const base = { stage_source: 'senat.ro' as const, deadlines: [] as Deadline[], window: CLOSED };
  if (/retras/.test(s)) return { ...base, current_chamber: null, phase: 'withdrawn', status: 'Retras de inițiator', in_debate: false, guidance: 'Proiectul a fost retras; nu mai e nimic de trimis.' };
  if (/clasat|incetat/.test(s)) return { ...base, current_chamber: null, phase: 'closed', status: 'Procedură încheiată la Senat', in_debate: false, guidance: 'Procedura s-a încheiat; nu mai e nimic de trimis.' };
  if (/promulgat|\blege(a)? nr/.test(s)) return { ...base, current_chamber: null, phase: 'law', status: 'Lege', in_debate: false, guidance: 'Proiectul a devenit lege.' };
  if (/promulgare|secretarul general|curtea constitutional/.test(s))
    return { ...base, current_chamber: null, phase: 'after_final_vote', status: 'Adoptat de Parlament, înainte de promulgare', in_debate: false, guidance: 'Parlamentul a terminat votul; cetățenii nu mai au un canal în procedură.' };
  if (/respins(a)? definitiv/.test(s)) return { ...base, current_chamber: null, phase: 'rejected', status: 'Respins definitiv', in_debate: false, guidance: 'Proiectul a fost respins definitiv; nu mai e nimic de trimis.' };
  if (/trimis la camer|adoptat|respins/.test(s))
    return {
      ...base,
      current_chamber: 'camera',
      phase: 'sent_to_other_chamber',
      status: 'Trimis la Camera Deputaților, care decide la final',
      in_debate: true,
      guidance: `Senatul a votat; proiectul merge la Camera Deputaților. Comisia care face raportul acolo apare pe fișa Camerei după înregistrare; îi poți trimite atunci o propunere motivată pe e-mail. ${NOT_GUARANTEED}`,
    };
  if (/informare/.test(s))
    return {
      ...base,
      current_chamber: 'camera',
      phase: 'committees',
      status: 'La Camera Deputaților, prima cameră (Senatul e doar informat)',
      in_debate: true,
      guidance: `Proiectul se dezbate întâi la Camera Deputaților. Poți trimite o propunere motivată comisiei care face raportul acolo. ${NOT_GUARANTEED}`,
    };

  const deadline = b.consultationDeadline;
  if (!deadline && !/comisi|raport|ordinea de zi/.test(s)) {
    return {
      ...base,
      current_chamber: 'senat',
      phase: 'public_consultation',
      status: 'La Senat; termenul consultării publice nu se poate citi',
      in_debate: true,
      window: { status: 'unknown', kind: 'senate_public_consultation', closes_on: null, channel: SENATE_CHANNEL, channel_url: SENATE_PORTAL },
      guidance: 'Verifică termenul consultării pe fișa proiectului de pe senat.ro înainte să trimiți.',
    };
  }
  if (deadline && deadline >= today) {
    return {
      ...base,
      current_chamber: 'senat',
      phase: 'public_consultation',
      status: 'În consultare publică la Senat',
      in_debate: true,
      deadlines: [{ type: 'public_consultation', audience: 'public', chamber: 'senat', label: 'Ultima zi a consultării publice la Senat (opinii prin formularul Senatului)', date: deadline }],
      window: { status: 'open', kind: 'senate_public_consultation', closes_on: deadline, channel: SENATE_CHANNEL, channel_url: SENATE_PORTAL },
      guidance: `Până pe ${deadline} inclusiv, opinia se depune prin formularul de consultare publică al Senatului; un e-mail către comisia sesizată o completează, dar nu o înlocuiește.`,
    };
  }
  const rc = b.reportCommittees?.names.length ? b.reportCommittees : null;
  const joint = (rc?.names.length ?? 0) > 1;
  const deadlines: Deadline[] =
    rc?.deadline && rc.deadline >= today
      ? [{ type: 'committee_report', audience: 'committee', chamber: 'senat', label: `${joint ? 'Termenul raportului comun' : 'Termenul raportului'} (${committeesText(rc)})`, date: rc.deadline }]
      : [];
  const phase: Phase = /ordinea de zi|plen/.test(s) ? 'plenary' : /raport/.test(s) ? 'report' : 'committees';
  return {
    ...base,
    current_chamber: 'senat',
    phase,
    status:
      phase === 'plenary'
        ? 'Pe ordinea de zi a plenului Senatului'
        : phase === 'report'
          ? 'La Senat, cu raportul comisiei depus'
          : rc || /comisi/.test(s)
            ? 'La comisiile Senatului'
            : 'La Senat, după consultarea publică (comisia sesizată nu apare încă pe fișă)',
    in_debate: true,
    deadlines,
    window: deadline ? { ...CLOSED, kind: 'senate_public_consultation', closes_on: deadline } : CLOSED,
    guidance: `Consultarea publică s-a încheiat${deadline ? ` pe ${deadline}` : ''}. ${
      phase !== 'committees'
        ? `Poți scrie senatorilor din ${joint ? 'comisiile sesizate' : 'comisia sesizată'} sau celor din județul tău.`
        : rc
          ? joint
            ? `Poți trimite o propunere motivată, pe e-mail, comisiilor sesizate în fond, care fac raport comun (${committeesText(rc)}).`
            : `Poți trimite o propunere motivată, pe e-mail, comisiei sesizate în fond (${committeesText(rc)}).`
          : 'Comisia sesizată în fond nu apare încă pe fișa Senatului; până atunci, o propunere motivată se poate trimite registraturii Senatului (infopub@senat.ro).'
    } ${NOT_GUARANTEED}`,
  };
}

const BEFORE_VOTE: StatusKey[] = ['avize', 'comisii', 'raport', 'plen', 'adoptat_prima', 'respins_prima', 'reexaminare'];

export interface ChamberInput {
  status: BillStatus;
  /** Consultarea publică de la Cameră (când e prima sesizată): ultima zi și formularul. */
  consultation: { deadline: string | null; form: string | null } | null;
}

/** Stadiul din fișa Camerei (resolveStatus), cu fereastra de consultare a Camerei, dacă există. */
export function chamberStage({ status: st, consultation }: ChamberInput, today: string): Stage {
  const key = st.key;
  const inDebate = BEFORE_VOTE.includes(key);
  // resolveStatus pune stage = 'senat' când proiectul e acum la Senat (la comisii, cu raport, în plen) și, după votul
  // primei camere, stage = 'senat' dacă a votat Camera (urmează Senatul), 'comisii' dacă a votat Senatul (urmează Camera).
  const atSenate =
    key === 'reexaminare' ? /senat/i.test(st.title) : ['comisii', 'raport', 'plen', 'adoptat_prima', 'respins_prima'].includes(key) ? st.stage === 'senat' : false;
  const current: Chamber | null = inDebate ? (atSenate ? 'senat' : 'camera') : null;
  const deadlines: Deadline[] = (inDebate ? st.deadlines : []).map((d) =>
    d.kind === 'programat'
      ? { type: 'plenary_scheduled', audience: 'plenary', chamber: 'camera', label: `${d.label} (programat, se poate schimba)`, date: d.date }
      : /amendamente/i.test(d.label)
        ? { type: 'amendments', audience: 'deputies', chamber: 'camera', label: `${d.label} (le depun deputații)`, date: d.date }
        : { type: 'committee_report', audience: 'committee', chamber: 'camera', label: d.label, date: d.date },
  );
  let window: SubmissionWindow = CLOSED;
  // Consultarea de pe fișa Camerei contează doar cât proiectul e la Cameră: după ce pleacă la Senat, fereastra e închisă.
  if (consultation && inDebate && !atSenate) {
    if (!consultation.deadline) window = { status: 'unknown', kind: 'chamber_public_consultation', closes_on: null, channel: 'Formularul de consultare publică de pe cdep.ro', channel_url: consultation.form };
    else if (consultation.deadline >= today) {
      window = { status: 'open', kind: 'chamber_public_consultation', closes_on: consultation.deadline, channel: 'Formularul de consultare publică de pe cdep.ro', channel_url: consultation.form };
      deadlines.unshift({ type: 'public_consultation', audience: 'public', chamber: 'camera', label: 'Ultima zi a consultării publice la Camera Deputaților', date: consultation.deadline });
    } else window = { ...CLOSED, kind: 'chamber_public_consultation', closes_on: consultation.deadline };
  } else if (consultation?.deadline) window = { ...CLOSED, kind: 'chamber_public_consultation', closes_on: consultation.deadline };
  const phase: Phase = (
    {
      avize: 'committees',
      comisii: 'committees',
      raport: 'report',
      plen: 'plenary',
      adoptat_prima: 'sent_to_other_chamber',
      respins_prima: 'sent_to_other_chamber',
      reexaminare: 'reexamination',
      adoptat_parlament: 'after_final_vote',
      depus_ccr: 'after_final_vote',
      la_presedinte: 'after_final_vote',
      sesizat_ccr: 'constitutional_court',
      ccr_admis: 'constitutional_court',
      ccr_respins: 'after_final_vote',
      promulgat: 'law',
      lege: 'law',
      respins_definitiv: 'rejected',
      incheiat: 'closed',
    } as Record<StatusKey, Phase>
  )[key];
  const open = window.status === 'open' ? `Consultarea publică a Camerei e deschisă până pe ${window.closes_on} inclusiv: acolo se trimite formal o propunere. ` : '';
  let guidance: string;
  if (!inDebate) guidance = key === 'ccr_admis' ? 'Legea e la Curtea Constituțională sau în urma deciziei ei; cetățenii nu mai au un canal în procedură.' : 'Proiectul nu mai e în dezbatere în Parlament; nu mai e nimic de trimis.';
  else if (atSenate)
    guidance = `${open}Proiectul e acum la Senat. Poți trimite o propunere motivată, pe e-mail, comisiei sesizate de la Senat (o găsești pe fișa Senatului). ${NOT_GUARANTEED}`;
  else if (key === 'avize' || key === 'comisii')
    guidance = `${open}Amendamentele oficiale le depun deputații. Poți trimite comisiei care face raportul o propunere motivată, pe e-mail, iar un deputat o poate prelua. ${NOT_GUARANTEED}`;
  else if (key === 'raport' || key === 'plen')
    guidance = `${open}Comisia a depus raportul; urmează votul în plen. Poți scrie deputaților din comisie sau celor din județul tău. ${NOT_GUARANTEED}`;
  else if (key === 'reexaminare') guidance = `Parlamentul reexaminează legea. Poți scrie comisiei care face raportul de reexaminare. ${NOT_GUARANTEED}`;
  else guidance = `Prima cameră a votat; proiectul merge la cealaltă cameră, care decide la final. Comisia sesizată acolo apare după înregistrare. ${NOT_GUARANTEED}`;
  return { current_chamber: current, phase, status: st.title, in_debate: inDebate, deadlines, window, guidance, stage_source: 'cdep.ro' };
}

/**
 * „trimis pentru raport la Comisia juridică, … (TERMEN: 10/11/2026)” → comisiile sesizate în fond și termenul. Senatul
 * scrie câte un rând pentru fiecare comisie a unui raport comun (B563/2026: comisia economică și cea juridică), uneori de
 * două ori, când Biroul permanent reface repartizarea (B553/2026); „raport suplimentar” cere un termen nou aceleiași
 * comisii (B582/2026). Toate comisiile rămân, o singură dată fiecare, cu cel mai târziu termen.
 */
export function senateReportCommittees(timeline: { action: string }[]): ReportCommittees | null {
  const names = new Map<string, string>();
  let deadline: string | null = null;
  for (const t of timeline) {
    // După termen poate urma o notă („adresa de resesizare a comisiei pentru raport suplimentar”, B582/2026): nu e parte din nume.
    const m = t.action.match(/trimis pentru raport (?:suplimentar )?la (comisia .+?)\s*(?:\(termen:\s*(\d{1,2})[/.](\d{1,2})[/.](\d{4})\)(?:\s.*)?)?\s*$/i);
    if (!m) continue;
    const name = m[1].replace(/^c/, 'C').replace(/ş/g, 'ș').replace(/ţ/g, 'ț');
    const key = fold(name).replace(/\s+/g, ' ').trim();
    if (!names.has(key)) names.set(key, name);
    const d = m[2] ? isoDate(`${m[2]}.${m[3]}.${m[4]}`) : null;
    if (d && (!deadline || d > deadline)) deadline = d;
  }
  return names.size ? { names: [...names.values()], deadline } : null;
}

/** Proiectul Camerei cu `senat` setat e chiar proiectul Senatului doar dacă a fost înregistrat la Cameră după Senat. */
export function plausibleLink(link: {
  senateRegistered: string | null;
  /** Stadiul de pe fișa Senatului. */
  senateStage: string;
  chamberRegistered: string | null;
  chamberNumber: string;
  /** Pașii de pe fișa Camerei (care are și pașii de la Senat), cu data ZZ.LL.AAAA. */
  chamberTimeline: { camera: string | null; data: string; actiune: string }[];
}): boolean {
  if (!/^pl-?x/i.test(link.chamberNumber.trim())) return false;
  if (!link.senateRegistered || !link.chamberRegistered || link.chamberRegistered < link.senateRegistered) return false;
  // Dovada că a plecat de la Senat: stadiul Senatului o spune, sau fișa Camerei are votul Senatului de după înregistrare.
  if (/trimis la camer|adoptat|respins/.test(fold(link.senateStage))) return true;
  return link.chamberTimeline.some((t) => {
    const d = t.data.split('.').reverse().join('-');
    return /senat/i.test(t.camera ?? '') && /(adoptat|respins)[a]? de (catre )?senat/.test(fold(t.actiune)) && d >= link.senateRegistered!;
  });
}
