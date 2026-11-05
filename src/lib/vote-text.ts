// Cuvintele pentru voturi, comune paginilor proiectelor și ale parlamentarilor (fără acces la fișiere).
import type { PlenaryVote, VoteChoice } from './types';
import { countWord } from './format';

export const CHAMBER_NAME: Record<PlenaryVote['chamber'], string> = { cdep: 'Camera Deputaților', senat: 'Senatul' };
export const CHAMBER_SITE: Record<PlenaryVote['chamber'], string> = { cdep: 'cdep.ro', senat: 'senat.ro' };
export const MEMBER_WORD: Record<PlenaryVote['chamber'], [string, string]> = { cdep: ['deputat', 'deputați'], senat: ['senator', 'senatori'] };

/** Ordinea grupurilor de voturi în listă. */
export const CHOICES: VoteChoice[] = ['pentru', 'contra', 'abtinere', 'nu a votat', 'fără vot'];

/** „Pentru”, „Contra respingerii”…: votul citit împreună cu întrebarea pusă la vot. */
export function voteLabel(vote: VoteChoice, question: PlenaryVote['question']) {
  if (vote === 'pentru') return question === 'respingere' ? 'Pentru respingere' : 'Pentru';
  if (vote === 'contra') return question === 'respingere' ? 'Contra respingerii' : 'Contra';
  if (vote === 'abtinere') return 'Abținere';
  if (vote === 'nu a votat') return 'Prezent, n-a votat';
  return 'Fără vot înregistrat';
}

/** „Camera Deputaților l-a respins” / „Senatul l-a adoptat” / „… n-a întrunit majoritatea”. */
export function resultHeadline(v: PlenaryVote) {
  const who = CHAMBER_NAME[v.chamber];
  if (v.result === 'adoptat') return `${who} l-a adoptat`;
  if (v.result === 'respins') return `${who} l-a respins`;
  if (v.result === 'fara-majoritate') return `${who}: votul n-a întrunit majoritatea cerută`;
  return `${who}: vot în plen`;
}

/** „192 de voturi pentru respingere, 69 contra și nicio abținere; 261 de deputați prezenți.” */
export function totalsSentence(v: PlenaryVote) {
  const t = v.totals;
  const [one, many] = MEMBER_WORD[v.chamber];
  const parts = [
    `${countWord(t.pentru, 'vot', 'voturi')} ${v.question === 'respingere' ? 'pentru respingere' : 'pentru'}`,
    `${t.contra} contra`,
    t.abtineri ? countWord(t.abtineri, 'abținere', 'abțineri') : 'nicio abținere',
  ];
  const tail = [`${countWord(t.prezenti, `${one} prezent`, `${many} prezenți`)}`];
  if (t.nuAuVotat) tail.push(`${t.nuAuVotat} ${t.nuAuVotat === 1 ? 'n-a votat' : 'n-au votat'}`);
  return `${parts.slice(0, -1).join(', ')} și ${parts.at(-1)}; ${tail.join(', dintre care ')}.`;
}

/** Subiectul votului, cu majusculă: „Vot final, respingere”, „Raport de respingere”. */
export function subjectLabel(v: PlenaryVote) {
  const s = v.subject.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Vot în plen';
}
