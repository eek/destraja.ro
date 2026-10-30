import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { getAllBillsLite } from '@/lib/bills';
import { byRiskDesc, computeMpStats, mpKey } from '@/lib/stats';
import { getAmendmentsByMp, getCdepSigned } from '@/lib/cdep';
import { partyFullName } from '@/lib/site';
import { RISK, RISK_LEVELS, levelFromScore } from '@/lib/risk';
import { countWord, fmt } from '@/lib/format';
import { Container, PartyTag, RiskChip, RiskDot, panel } from '@/components/ui';
import BillGrid from '@/components/bills/BillGrid';
import MpContactPanel from '@/components/mps/MpContactPanel';
import { getMpContact } from '@/lib/mp-contacts';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

async function load(slug: string) {
  const bills = await getAllBillsLite();
  const chamber = await getCdepSigned();
  const mpStats = computeMpStats([...bills, ...chamber]);
  const mp = mpStats.find((m) => m.slug === slug);
  return { bills, chamber, mpStats, mp };
}

export async function generateStaticParams() {
  const mpStats = computeMpStats([...(await getAllBillsLite()), ...(await getCdepSigned())]);
  return mpStats.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { mp } = await load((await params).slug);
  if (!mp) return { title: 'Parlamentar negăsit' };
  return {
    title: `${mp.name} (${mp.party})`,
    description: `${mp.name}${mp.role ? `, ${mp.role}` : ''} ${mp.party}, a semnat ${countWord(mp.billsCount, 'proiect analizat', 'proiecte analizate')} de noi la Senat și la Camera Deputaților: ${mp.redCount} cu risc ridicat, ${mp.yellowCount} moderat și ${mp.greenCount} redus.`,
  };
}

export default async function MpPage({ params }: PageProps) {
  const { bills, chamber, mpStats, mp } = await load((await params).slug);
  if (!mp) notFound();

  const ids = new Set(mp.billIds);
  const own = bills.filter((b) => ids.has(b.id)).sort(byRiskDesc);
  const ownChamber = chamber.filter((b) => ids.has(b.id)).sort(byRiskDesc);
  const contact = await getMpContact(mp.name);
  const admitted = ((await getAmendmentsByMp()).get(mp.slug) ?? []).filter((a) => a.status === 'admis');

  const shared = new Map<string, number>();
  for (const b of [...own, ...ownChamber]) {
    for (const key of new Set(b.initiators.map((i) => mpKey(i.name)))) {
      if (key !== mp.slug) shared.set(key, (shared.get(key) ?? 0) + 1);
    }
  }
  const bySlug = new Map(mpStats.map((m) => [m.slug, m]));
  const cosigners = [...shared.entries()]
    .map(([key, n]) => ({ mp: bySlug.get(key)!, n }))
    .filter((x) => x.mp)
    .sort((a, b) => b.n - a.n || a.mp.name.localeCompare(b.mp.name, 'ro'))
    .slice(0, 10);

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
            {role ? `${role} · ` : ''}{partyFullName(mp.party)}
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

      <WentWell
        amended={admitted.map((a) => ({ id: a.billId, href: `/camera/${a.slug}#amendamente`, title: a.summary, better: a.effects.includes('mai_bine') }))}
        green={[
          ...own.filter((b) => b.analysis.consensus.riskLevel === 'green').map((b) => ({ id: b.id, href: `/legi/${b.slug}`, title: b.analysis.consensus.plainTitle })),
          ...ownChamber.filter((b) => b.analysis.consensus.riskLevel === 'green').map((b) => ({ id: b.id, href: `/camera/${b.slug}`, title: b.analysis.consensus.plainTitle })),
        ]}
        passed={ownChamber.filter((b) => b.passed).map((b) => ({ id: b.id, href: `/camera/${b.slug}`, title: b.analysis.consensus.plainTitle }))}
        improved={ownChamber
          .filter((b) => b.textChange?.direction === 'mai_putin_riscant')
          .map((b) => ({ id: b.id, href: `/camera/${b.slug}`, title: b.analysis.consensus.plainTitle }))}
      />

      <MpContactPanel mp={mp} contact={contact} topBill={own[0]} />

      <section aria-labelledby="proiecte-title" className="mt-12">
        <h2 id="proiecte-title" className="font-display text-3xl font-normal">
          Proiectele semnate
        </h2>
        <p className="mt-2 mb-6 text-sm text-muted">Ordonate după risc. Semnătura arată cine a inițiat proiectul, nu cum va vota.</p>
        {own.length > 0 && (
          <>
            {ownChamber.length > 0 && <h3 className="mb-4 text-lg font-semibold text-ink">În consultare la Senat</h3>}
            <BillGrid bills={own} />
          </>
        )}
        {ownChamber.length > 0 && (
          <>
            {own.length > 0 && <h3 className="mt-10 mb-4 text-lg font-semibold text-ink">La Camera Deputaților</h3>}
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {ownChamber.map((b) => (
                <li key={b.slug}>
                  <Link
                    href={`/camera/${b.slug}`}
                    className="group block px-4 py-4 transition-colors hover:bg-sunken/50 sm:px-6"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-semibold tabular-nums text-ink">{b.id}</span>
                      <RiskChip level={b.analysis.consensus.riskLevel} score={b.analysis.consensus.riskScore} />
                      <span className="text-muted">{b.stadiu}</span>
                      {b.textChange && (
                        <span className={`font-semibold ${b.textChange.direction === 'mai_putin_riscant' ? 'text-risk-green-text' : 'text-risk-red-text'}`}>
                          {b.textChange.direction === 'mai_putin_riscant' ? '↘ mai puțin riscant' : '↗ mai riscant'} după {b.textChange.after === 'senat' ? 'Senat' : 'Cameră'}
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 block text-[15px] font-semibold leading-6 text-ink group-hover:underline group-hover:underline-offset-4">
                      {b.analysis.consensus.plainTitle}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-xs leading-5 text-muted">{b.officialTitle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {cosigners.length > 0 && (
        <section aria-labelledby="cosemnatari-title" className={`${panel} mt-12 p-5 sm:p-7`}>
          <h2 id="cosemnatari-title" className="text-lg font-semibold text-ink">
            Semnează des împreună cu
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
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

type Pick = { id: string; href: string; title: string };

/**
 * Ce a mers bine: proiectele cu risc redus, cele devenite lege și cele care au ieșit mai bune de la Senat sau de la Cameră.
 * Pagina unui parlamentar nu trebuie să arate doar riscurile din ce a semnat.
 */
function WentWell({ amended, green, passed, improved }: { amended: (Pick & { better: boolean })[]; green: Pick[]; passed: Pick[]; improved: Pick[] }) {
  const better = amended.filter((a) => a.better).length;
  // „24 de proiecte”, dar „3 proiecte”: cifra stă mare, separat, așa că „de” trece în etichetă.
  const de = (n: number) => (n % 100 >= 20 || (n >= 100 && n % 100 === 0) ? 'de ' : '');
  const tiles = [
    {
      n: amended.length,
      label: `${de(amended.length)}${amended.length === 1 ? 'amendament admis' : 'amendamente admise'}`,
      note: better
        ? `Propuse de el sau de ea și acceptate de comisie; ${better === 1 ? 'unul a făcut' : `${better} au făcut`} textul mai bun.`
        : 'Propuse de el sau de ea și acceptate de comisie.',
      items: [...amended].sort((a, b) => Number(b.better) - Number(a.better)),
      // Amendamentele nu sunt în lista proiectelor semnate de dedesubt; le găsești pe pagina fiecărui proiect.
      more: 'pe paginile proiectelor',
    },
    { n: green.length, label: `${de(green.length)}${green.length === 1 ? 'proiect' : 'proiecte'} cu risc redus`, note: 'Semnate de el sau de ea; cele trei modele le văd cu risc redus.', items: green },
    { n: passed.length, label: `${de(passed.length)}${passed.length === 1 ? 'proiect devenit' : 'proiecte devenite'} lege`, note: 'Sau ajunse la promulgare.', items: passed },
    { n: improved.length, label: `${de(improved.length)}${improved.length === 1 ? 'proiect ieșit mai bun' : 'proiecte ieșite mai bune'}`, note: 'Textul adoptat de Senat sau de Cameră e mai puțin riscant decât cel inițial.', items: improved },
  ].filter((t) => t.n > 0);
  if (!tiles.length) return null;
  return (
    <section aria-labelledby="bine-title" className="mt-10">
      <h2 id="bine-title" className="font-display text-3xl font-normal">
        Ce a mers bine
      </h2>
      <ul className={`mt-5 grid gap-4 ${tiles.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
        {tiles.map((t) => (
          <li key={t.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-semibold tabular-nums text-risk-green-text">{t.n}</span>
              <span className="font-semibold text-ink">{t.label}</span>
            </p>
            <p className="mt-1 text-sm text-muted">{t.note}</p>
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
              {t.items.slice(0, 3).map((b, i) => (
                <li key={`${b.href}-${i}`}>
                  <Link href={b.href} className="line-clamp-2 text-sm font-semibold leading-snug text-ink underline-offset-4 hover:underline">
                    {b.title}
                  </Link>
                </li>
              ))}
              {t.items.length > 3 && <li className="text-xs text-muted">și încă {t.items.length - 3}, {'more' in t ? t.more : 'în lista de mai jos'}</li>}
            </ul>
          </li>
        ))}
      </ul>
      {improved.length > 0 && (
        <p className="mt-3 max-w-[70ch] text-xs leading-5 text-muted">
          Când un proiect iese mai bun de la Senat sau de la Cameră, schimbarea o fac de obicei comisiile, prin amendamente. La proiectele de la
          Cameră, pe pagina fiecăruia vezi cine a propus fiecare amendament.
        </p>
      )}
    </section>
  );
}
