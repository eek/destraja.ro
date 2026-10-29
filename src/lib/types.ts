export type RiskLevel = 'red' | 'yellow' | 'green';

export interface Initiator {
  name: string;
  role: string;
  party: string;
  note?: string;
}

export interface BillPdf {
  type: 'forma_initiatorului' | 'expunere_motive' | 'adresa_inaintare' | 'aviz' | 'other';
  label: string;
  url: string;
}

export interface TimelineItem {
  date: string;
  action: string;
}

export interface PublicOpinion {
  regNo: string;
  date: string;
  author: string;
  text: string;
}

export interface SenatFormKit {
  articleRef: string; // max 50 chars
  proposalContent: string; // max 400 chars
  argumentation: string; // max 400 chars
  otherComments: string; // max 400 chars
}

export interface AiVerdict {
  model: 'agy' | 'claude' | 'codex';
  modelName: string;
  cliCommand: string;
  status: 'ok' | 'error';
  riskScore: number;
  riskLevel: RiskLevel;
  verdictShort: string;
  keyFindings: string[];
  blindSpotsCaught: string;
  constitutionalityNote: string;
  euLawNote: string;
  senatForm?: SenatFormKit;
}

export interface ArticleChange {
  article: string;
  title: string;
  whatChanges: string;
  realWorldImpact: string;
  severity: RiskLevel;
}

export interface MythVsFact {
  claim: string;
  verdict: 'confirmat' | 'fals' | 'nuantat';
  explanation: string;
}

export interface InstitutionalEmail {
  id: string;
  targetName: string;
  badge: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  whyItMatters: string;
}

export interface DocxSection {
  heading: string;
  paragraphs: string[];
}

export interface BillAnalysis {
  billId: string;
  slug: string;
  updatedAt: string;
  consensus: {
    riskScore: number;
    riskLevel: RiskLevel;
    plainTitle: string;
    citizenOneLiner?: string;
    summaryTlDr: string;
    initiatorClaim: string;
    realityCheck: string;
    affectedGroups: string[];
    senatForm: SenatFormKit;
    articlesBreakdown?: ArticleChange[];
    mythsAndFacts?: MythVsFact[];
    institutionalEmails?: InstitutionalEmail[];
    docxTitle?: string;
    docxIntro?: string;
    docxSections?: DocxSection[];
    docxRequests?: string[];
  };
  council: {
    agy: AiVerdict;
    claude: AiVerdict;
    codex: AiVerdict;
  };
  // Analize refăcute după rapoarte de cititori confirmate de toate cele trei modele
  // (scripts/straja-reports.mjs). Nu conțin textul raportului.
  corrections?: AnalysisCorrection[];
}

export interface AnalysisCorrection {
  date: string;
  target: 'consensus' | 'agy' | 'claude' | 'codex';
  reportId: string;
  /** Pentru corecturile făcute de mână: ce s-a schimbat, afișat în locul textului standard. */
  note?: string;
}

/** Articole de presă găsite de scripts/straja-news.mjs și verificate pe pagina sursei. */
export interface BillNews {
  checkedAt: string;
  articles: PressArticle[];
}

/** Poziția articolului față de proiect, clasificată de Clef (scripts/straja-stance.mjs). */
export type PressStance = 'critical' | 'supportive' | 'neutral' | 'mixed';
export type PressSource =
  | 'national_news'
  | 'local_news'
  | 'trade_press'
  | 'party_or_politician'
  | 'aggregator'
  | 'opinion_blog'
  | 'ngo_or_institution';

export interface PressArticle {
  url: string;
  title: string;
  outlet: string;
  domain: string;
  publishedAt: string | null;
  /** Publicație din lista noastră (data/news-outlets.json); celelalte apar doar după clasificare. */
  listed: boolean;
  /** Null dacă nu e clasificat sau dacă modelul nu e destul de sigur. */
  stance: PressStance | null;
  source: PressSource | null;
  /** Comunicatul unui partid sau politician, publicat ca știre. */
  release: boolean;
}

/**
 * Presa pe scurt, pentru carduri și liste. Păstrăm datele de publicare, nu doar numărul celor noi, ca
 * browserul să recalculeze „nou” pentru ziua de azi între două build-uri.
 */
export interface PressSummary {
  count: number;
  dates: string[];
  recent: number;
  latest: PressArticle | null;
  stances: Record<PressStance, number>;
}

/** Avizul negativ CES: număr și dată din cronologia Senatului, PDF-ul și motivele pe scurt (scripts/straja-ces.mjs). */
export interface CesOpinion {
  number: string | null;
  date: string | null;
  pdfUrl: string | null;
  /** Fiecare motiv are un citat găsit, cuvânt cu cuvânt, în textul avizului. */
  reasons: { text: string; quote: string }[];
}

export type PositionStance = 'retragere' | 'respingere' | 'modificare' | 'sustinere';

/**
 * Poziția publică a unei organizații despre proiect (scripts/straja-positions.mjs): o scrisoare, o petiție, un
 * punct de vedere. Verificată pe documentul original: pomenește proiectul și conține citatul.
 */
export interface CivicPosition {
  issuer: string;
  stance: PositionStance;
  /** Cere eliminarea unor prevederi, nu doar schimbarea lor (reiese din citat). */
  removesProvisions?: boolean;
  documentType: string | null;
  title: string | null;
  quote: string;
  date: string | null;
  pageUrl: string | null;
  documentUrl: string | null;
  domain: string;
  /** Sursa e o publicație din lista de presă urmărită. */
  viaPress: boolean;
  /** Pagina e pe site-ul emitentului (domeniul e numele, acronimul sau inițialele lui); altfel e o relatare. */
  ownSite: boolean;
  /** Din lista numerotată a documentului: doar organizațiile cu nume, persoanele fizice doar numărate. */
  signatories: { organizations: number; individuals: number; names: string[] } | null;
  verifiedAt: string;
}

export interface BillPositions {
  checkedAt: string | null;
  positions: CivicPosition[];
}

/** Pozițiile pe scurt, pentru carduri și /presa: câte organizații distincte cer ce, și propoziția de afișat. */
export interface PositionsSummary {
  count: number;
  /** Cer retragerea, respingerea sau modificarea, fiecare organizație o singură dată. */
  against: number;
  /** Cer retragerea sau respingerea. */
  oppose: number;
  /** Cer modificări sau eliminarea unor prevederi. */
  amend: number;
  support: number;
  line: string | null;
}

export interface EnrichedBill {
  cesNegative: boolean;
  ces: CesOpinion | null;
  positions: BillPositions | null;
  id: string;
  slug: string;
  cod: string;
  officialTitle: string;
  consultationDeadline: string;
  /** Termenul afișat inițial de Senat, când proiectul a ieșit din consultare înainte de el (vezi leftListAt). */
  announcedDeadline?: string;
  /** Ziua în care proiectul nu mai era în lista de consultare, înainte de termenul anunțat. */
  leftListAt?: string;
  daysRemaining: number;
  opinionsCount: number;
  sheetUrl: string;
  opinionsUrl: string;
  initiators: Initiator[];
  parties: string[];
  isCrossParty: boolean;
  emergencyRequested: boolean;
  emergencyApproved: boolean;
  stage: string;
  pdfs: BillPdf[];
  timeline: TimelineItem[];
  publicOpinions: PublicOpinion[];
  analysis: BillAnalysis;
  news: BillNews | null;
  /** Numărul de la Senat (B… sau, după prezentarea în Biroul permanent, L…), din antetul fișei. */
  senatNr?: string | null;
  /** „Senat” pentru toate proiectele din consultare: Camera Deputaților decide la final. */
  firstChamber?: string | null;
  lawType?: string | null;
  /** Fișa aceluiași proiect la Camera Deputaților, legată și verificată de scripts/straja-camera.mjs. */
  camera: CameraLink | null;
}

export interface CameraLink {
  idp: number;
  /** „BP760/2026” (propunere a deputaților, trimisă întâi la Senat) sau „PL-x 691/2026”. */
  numar: string;
  tip: string;
  /** Data înregistrării la Cameră (YYYY-MM-DD). */
  inregistrat: string;
  url: string;
  cameraDecizionala: string | null;
  stadiu: string;
  stadiuData: string | null;
}

type ModelKey = 'agy' | 'claude' | 'codex';

/** Cât trebuie dintr-un proiect pentru statisticile parlamentarilor; BillLite (Senat) și CdepSigned (Cameră) se potrivesc. */
export interface Signed {
  id: string;
  initiators: Initiator[];
  analysis: { consensus: Pick<BillAnalysis['consensus'], 'riskScore' | 'riskLevel'> };
}

/** Un proiect de la Camera Deputaților cu analiză, cu inițiatorii lui, pentru paginile parlamentarilor. */
export interface CdepSigned extends Signed {
  slug: string;
  officialTitle: string;
  stadiu: string;
  analysis: { consensus: Pick<BillAnalysis['consensus'], 'riskScore' | 'riskLevel' | 'plainTitle'> };
}

/** O formă a textului unui proiect (a inițiatorului, adoptată de Senat, adoptată de Cameră), cu analiza ei. */
export interface BillVersion {
  key: 'initiator' | 'senat' | 'camera';
  label: string;
  url: string;
  source: string;
  riskScore: number;
  riskLevel: RiskLevel;
  plainTitle: string;
  summaryTlDr: string;
  scores: Record<ModelKey, number | null>;
}

/** Comparația a două forme la rând, făcută de un model pe diferențele de text. */
export interface VersionChange {
  from: BillVersion['key'];
  to: BillVersion['key'];
  direction: 'mai_riscant' | 'mai_putin_riscant' | 'la_fel';
  summary: string;
  changes: { text: string; effect: 'mai_bine' | 'mai_rau' | 'neutru' }[];
  diff: { added: number; removed: number; same: number };
  model: string;
  updatedAt: string;
}

/** data/analyses/versions/<slug>.json (scripts/straja-council.mjs --versions). */
export interface BillVersions {
  slug: string;
  billId: string;
  updatedAt: string;
  versions: BillVersion[];
  changes: VersionChange[];
}

/** Ce ajunge în browser pe paginile de listă: fără PDF-uri, cronologie, opinii și kitul de acțiune. */
export interface BillLite {
  id: string;
  slug: string;
  cod: string;
  officialTitle: string;
  consultationDeadline: string;
  daysRemaining: number;
  opinionsCount: number;
  sheetUrl: string;
  initiators: Initiator[];
  parties: string[];
  isCrossParty: boolean;
  emergencyRequested: boolean;
  emergencyApproved: boolean;
  cesNegative: boolean;
  ces: CesOpinion | null;
  press: PressSummary;
  positions: PositionsSummary;
  analysis: {
    consensus: Pick<
      BillAnalysis['consensus'],
      'riskScore' | 'riskLevel' | 'plainTitle' | 'citizenOneLiner' | 'summaryTlDr' | 'affectedGroups'
    >;
    council: Record<ModelKey, Pick<AiVerdict, 'riskScore' | 'riskLevel' | 'verdictShort'>>;
  };
}
