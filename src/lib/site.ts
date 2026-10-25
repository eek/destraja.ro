export const SITE_URL = 'https://lastraja.ro';
export const SITE_NAME = 'lastraja.ro';
export const SENAT_URL = 'https://www.senat.ro/LegiProiect.aspx';

// Proiectul pus în față pe prima pagină cât timp consultarea lui e deschisă.
export const FEATURED_ID = 'B563/2026';

export const MODELS = [
  { key: 'agy', name: 'Gemini', fullName: 'Gemini 4 Argon', vendor: 'Google DeepMind', role: 'Tehnică legislativă, sancțiuni și impact cetățenesc' },
  { key: 'claude', name: 'Claude', fullName: 'Claude Opus 5.5', vendor: 'Anthropic', role: 'Constituționalitate și drept UE' },
  { key: 'codex', name: 'ChatGPT', fullName: 'ChatGPT (GPT-6.1)', vendor: 'OpenAI', role: 'Impact economic, IT/AI, IMM și fiscalitate' },
] as const;

export type ModelKey = (typeof MODELS)[number]['key'];

export const PARTY_NAMES: Record<string, string> = {
  PSD: 'Partidul Social Democrat',
  PNL: 'Partidul Național Liberal',
  USR: 'Uniunea Salvați România',
  AUR: 'Alianța pentru Unirea Românilor',
  SOS: 'Partidul S.O.S. România',
  UDMR: 'Uniunea Democrată Maghiară din România',
  POT: 'Partidul Oamenilor Tineri',
  UPR: 'Grupul Parlamentar Uniți pentru România',
  PACE: 'Grupul Parlamentar PACE — Întâi România',
  Minorități: 'Grupul Parlamentar al Minorităților Naționale',
  Neafiliați: 'Parlamentari neafiliați',
};

export const PARTY_ORDER = ['PSD', 'PNL', 'USR', 'UDMR', 'Minorități', 'AUR', 'SOS', 'POT', 'PACE', 'UPR', 'Neafiliați'];

// Arcul guvernamental la data datelor (octombrie 2026). Se folosește doar ca să marcăm
// proiectele semnate împreună de putere și opoziție; de revizuit când se schimbă coaliția.
export const ARC_DATE = 'octombrie 2026';
export const PUTERE = new Set(['PSD', 'PNL', 'USR', 'UDMR', 'Minorități']);
export const OPOZITIE = new Set(['AUR', 'SOS', 'POT', 'PACE']);

export function partyFullName(party: string) {
  return PARTY_NAMES[party] ?? party;
}

// Cine administrează site-ul și unde pot scrie vizitatorii despre datele lor (politica de cookies).
// Necompletate până le confirmă operatorul; pagina afișează vizibil „de completat”.
export const OPERATOR_NAME: string | null = 'Radu-Sebastian Amarie (persoană fizică)';
export const CONTACT_EMAIL: string | null = 'contact@lastraja.ro';
export const POLICY_UPDATED = '25 octombrie 2026';
