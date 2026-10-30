import { getAllBills, getDataSyncedAt, toLite } from '@/lib/bills';
import { getCdepIndex, getCdepList, getCdepSigned, getVersionsStatus } from '@/lib/cdep';
import { STAGES } from '@/lib/cdep-text';
import { computeMpStats } from '@/lib/stats';
import { formatDateRo, todayISO } from '@/lib/format';
import type { RiskLevel } from '@/lib/types';
import HomeClient, { type HomeCamItem, type HomePress } from '@/components/home/HomeClient';

const AT_CHAMBER = new Set(STAGES.filter((s) => s.atChamber).map((s) => s.key));

// Pagina principală adună Senatul (consultarea publică) și Camera (dezbaterea). Lista completă a Senatului e pe /senat.
export default async function HomePage() {
  const [syncedAt, full, cdep, index, versionsStatus] = await Promise.all([getDataSyncedAt(), getAllBills(), getCdepList(), getCdepIndex(), getVersionsStatus()]);
  const bills = full.map(toLite);
  const mpCount = computeMpStats([...bills, ...(await getCdepSigned())]).length;
  const builtOn = todayISO();

  const rated: HomeCamItem[] = cdep.flatMap((p) =>
    p.risk && AT_CHAMBER.has(p.stage)
      ? [
          {
            slug: p.slug,
            numar: p.numar,
            title: p.risk.plainTitle,
            level: p.risk.level,
            score: p.risk.score,
            stage: STAGES.find((s) => s.key === p.stage)!.label,
            deadline: p.termenAmendamente,
            change: p.textChange?.direction ?? null,
            after: p.textChange?.after ?? null,
          },
        ]
      : [],
  );
  const byScore = (a: HomeCamItem, b: HomeCamItem) => b.score - a.score;
  const counts: Record<RiskLevel, number> = { red: 0, yellow: 0, green: 0 };
  for (const p of rated) counts[p.level] += 1;
  const worse = rated.filter((p) => p.change === 'mai_riscant').sort(byScore);

  const press: HomePress[] = full
    .flatMap((b) =>
      (b.news?.articles ?? []).map((a) => ({
        url: a.url,
        title: a.title,
        outlet: a.outlet,
        date: a.publishedAt,
        billId: b.id,
        slug: b.slug,
        plainTitle: b.analysis.consensus.plainTitle,
      })),
    )
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return (
    <HomeClient
      bills={bills}
      builtOn={builtOn}
      syncedLabel={syncedAt ? formatDateRo(syncedAt) : null}
      mpCount={mpCount}
      cam={{
        total: rated.length,
        registered: index?.proiecte.length ?? cdep.length,
        counts,
        // Termenele trecute nu mai pot reveni; restul se filtrează în browser, după ziua de azi.
        amend: rated.filter((p) => p.deadline && p.deadline >= builtOn).sort((a, b) => a.deadline!.localeCompare(b.deadline!) || byScore(a, b)),
        riskiest: rated.filter((p) => p.level === 'red').sort(byScore).slice(0, 6),
        worse: worse.slice(0, 4),
        worseCount: worse.length,
        compared: versionsStatus?.compared ?? 0,
      }}
      press={{ total: press.length, latest: press.slice(0, 6) }}
    />
  );
}
