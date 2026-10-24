import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { getAllBillsLite } from '@/lib/bills';
import { byRiskDesc, computeStats } from '@/lib/stats';
import { partyFullName } from '@/lib/site';
import { RISK, RISK_LEVELS, levelFromScore } from '@/lib/risk';
import { countWord, fmt } from '@/lib/format';
import { Container, PartyTag, RiskDot, panel } from '@/components/ui';
import BillGrid from '@/components/bills/BillGrid';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

async function load(slug: string) {
  const bills = await getAllBillsLite();
  const { mpStats } = computeStats(bills);
  const mp = mpStats.find((m) => m.slug === slug);
  return { bills, mpStats, mp };
}

export async function generateStaticParams() {
  const { mpStats } = computeStats(await getAllBillsLite());
  return mpStats.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { mp } = await load((await params).slug);
  if (!mp) return { title: 'Parlamentar negăsit' };
  return {
    title: `${mp.name} (${mp.party})`,
    description: `${mp.name}, ${mp.role} ${mp.party}, a semnat ${countWord(mp.billsCount, 'proiect', 'proiecte')} aflate în consultare la Senat, dintre care ${mp.redCount} cu risc ridicat.`,
  };
}

export default async function MpPage({ params }: PageProps) {
  const { bills, mpStats, mp } = await load((await params).slug);
  if (!mp) notFound();

  const ids = new Set(mp.billIds);
  const own = bills.filter((b) => ids.has(b.id)).sort(byRiskDesc);

  const shared = new Map<string, number>();
  for (const b of own) for (const i of b.initiators) {
    const name = i.name.trim();
    if (name !== mp.name) shared.set(name, (shared.get(name) ?? 0) + 1);
  }
  const bySlug = new Map(mpStats.map((m) => [m.name, m]));
  const cosigners = [...shared.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ro'))
    .slice(0, 10)
    .map(([name, n]) => ({ mp: bySlug.get(name)!, n }))
    .filter((x) => x.mp);

  const role = mp.role === 'senator' ? 'Senator' : mp.role === 'deputat' ? 'Deputat' : mp.role;
  const levels = { red: mp.redCount, yellow: mp.yellowCount, green: mp.greenCount };

  return (
    <Container className="py-8 sm:py-12">
      <Link href="/parlamentari" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-body hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Toți parlamentarii
      </Link>

      <header className="mt-4 grid gap-8 border-b border-line pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] font-normal leading-[1.05]">{mp.name}</h1>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-base text-body">
            <PartyTag party={mp.party} />
            {role} · {partyFullName(mp.party)}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-x-8 gap-y-4 sm:grid-cols-5">
          <div className="flex flex-col-reverse">
            <dt className="text-sm text-muted">proiecte</dt>
            <dd className="text-3xl font-semibold tabular-nums text-ink">{mp.billsCount}</dd>
          </div>
          {RISK_LEVELS.map((l) => (
            <div key={l} className="flex flex-col-reverse">
              <dt className="text-sm text-muted">{RISK[l].short}</dt>
              <dd className={`flex items-center gap-2 text-3xl font-semibold tabular-nums ${RISK[l].text}`}>
                <RiskDot level={l} className="h-2.5 w-2.5" />
                {levels[l]}
              </dd>
            </div>
          ))}
          <div className="flex flex-col-reverse">
            <dt className="text-sm text-muted">scor mediu</dt>
            <dd className={`text-3xl font-semibold tabular-nums ${RISK[levelFromScore(mp.avgRiskScore)].text}`}>{fmt(mp.avgRiskScore)}</dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="proiecte-title" className="mt-10">
        <h2 id="proiecte-title" className="font-display text-3xl font-normal">
          Proiectele semnate
        </h2>
        <p className="mt-2 mb-6 text-sm text-muted">Ordonate după risc. Semnătura arată cine a inițiat proiectul, nu cum va vota.</p>
        <BillGrid bills={own} />
      </section>

      {cosigners.length > 0 && (
        <section aria-labelledby="cosemnatari-title" className={`${panel} mt-12 p-5 sm:p-7`}>
          <h2 id="cosemnatari-title" className="text-lg font-semibold text-ink">
            Semnează des împreună cu
          </h2>
          <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
            {cosigners.map(({ mp: c, n }) => (
              <li key={c.slug} className="border-b border-line last:border-0 sm:[&:nth-last-child(2)]:border-0">
                <Link href={`/parlamentari/${c.slug}`} className="group flex min-h-12 items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{c.name}</span>
                    <PartyTag party={c.party} />
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{countWord(n, 'proiect comun', 'proiecte comune')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
