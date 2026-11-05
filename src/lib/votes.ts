// Cum s-a votat: voturile nominale din plen ale proiectelor urmărite (data/votes, scris de scripts/straja-votes.mjs) și,
// pentru paginile parlamentarilor, votul fiecăruia.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BillVotes, PlenaryVote, RiskLevel, VoteChoice } from './types';

export { voteLabel } from './vote-text';
import { getCdepAnalysis, getCdepIndex } from './cdep';
import { getAllBillsLite } from './bills';

const DIR = path.join(process.cwd(), 'data', 'votes');

export async function getBillVotes(slug: string): Promise<BillVotes | null> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(DIR, `${slug}.json`), 'utf8')) as BillVotes;
    return data.votes.length || data.committee.length ? data : null;
  } catch {
    return null;
  }
}

export interface MpVote {
  slug: string;
  href: string;
  billNumber: string;
  title: string;
  risk: { level: RiskLevel; score: number } | null;
  chamber: PlenaryVote['chamber'];
  date: string;
  subject: string;
  question: PlenaryVote['question'];
  result: PlenaryVote['result'];
  vote: VoteChoice;
}

let byMp: Promise<Map<string, MpVote[]>> | null = null;
/** Voturile fiecărui parlamentar, după slug-ul paginii lui, cele mai noi întâi. Citite o singură dată pe build. */
export function getVotesByMp() {
  byMp ??= (async () => {
    const files = (await fs.readdir(DIR).catch(() => [])).filter((f) => f.endsWith('.json'));
    const [index, bills] = await Promise.all([getCdepIndex(), getAllBillsLite()]);
    const rows = new Map((index?.proiecte ?? []).map((r) => [r.slug, r]));
    const senat = new Map(bills.map((b) => [b.slug, b]));
    const out = new Map<string, MpVote[]>();
    for (const f of files) {
      const data = JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8')) as BillVotes;
      if (!data.votes.length) continue;
      const lite = senat.get(data.slug);
      const row = rows.get(data.slug);
      const c = lite ? lite.analysis.consensus : (await getCdepAnalysis(data.slug))?.consensus;
      const title = c?.plainTitle ?? row?.titlu ?? lite?.officialTitle ?? data.slug;
      const billNumber = lite?.id ?? row?.numar ?? data.slug;
      for (const v of data.votes) {
        for (const m of v.members) {
          const list = out.get(m.mp) ?? [];
          list.push({
            slug: data.slug,
            href: `${data.page}#voturi`,
            billNumber,
            title,
            risk: c ? { level: c.riskLevel, score: c.riskScore } : null,
            chamber: v.chamber,
            date: v.date,
            subject: v.subject,
            question: v.question,
            result: v.result,
            vote: m.vote,
          });
          out.set(m.mp, list);
        }
      }
    }
    for (const list of out.values()) list.sort((a, b) => b.date.localeCompare(a.date) || a.billNumber.localeCompare(b.billNumber, 'ro', { numeric: true }));
    return out;
  })();
  return byMp;
}
