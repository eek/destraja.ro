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
    socialShare?: {
      facebookPost: string;
      firstCommentLinks: string;
    };
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
}

/** Articole de presă găsite de scripts/straja-news.mjs și verificate pe pagina sursei. */
export interface BillNews {
  checkedAt: string;
  articles: PressArticle[];
}

export interface PressArticle {
  url: string;
  title: string;
  outlet: string;
  domain: string;
  publishedAt: string | null;
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
}

/** Avizul negativ CES: număr și dată din cronologia Senatului, PDF-ul și motivele pe scurt (scripts/straja-ces.mjs). */
export interface CesOpinion {
  number: string | null;
  date: string | null;
  pdfUrl: string | null;
  /** Fiecare motiv are un citat găsit, cuvânt cu cuvânt, în textul avizului. */
  reasons: { text: string; quote: string }[];
}

export interface EnrichedBill {
  cesNegative: boolean;
  ces: CesOpinion | null;
  id: string;
  slug: string;
  cod: string;
  officialTitle: string;
  consultationDeadline: string;
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
}

type ModelKey = 'agy' | 'claude' | 'codex';

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
  analysis: {
    consensus: Pick<
      BillAnalysis['consensus'],
      'riskScore' | 'riskLevel' | 'plainTitle' | 'citizenOneLiner' | 'summaryTlDr' | 'affectedGroups'
    >;
    council: Record<ModelKey, Pick<AiVerdict, 'riskScore' | 'riskLevel' | 'verdictShort'>>;
  };
}
