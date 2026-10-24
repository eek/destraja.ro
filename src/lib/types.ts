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
}

export interface EnrichedBill {
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
}
