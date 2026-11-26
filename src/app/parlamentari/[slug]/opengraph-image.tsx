import { ImageResponse } from 'next/og';
import { getAllBillsLite } from '@/lib/bills';
import { getCdepSigned } from '@/lib/cdep';
import { computeMpStats, type MpStat } from '@/lib/stats';
import { getSignedByMp } from '@/lib/signed';
import { levelFromScore } from '@/lib/risk';
import { partyFullName } from '@/lib/site';
import { countWord, fmt } from '@/lib/format';
import { Frame, LEVELS, OG, OG_SIZE, RiskMix, fitGrid, logoSrc, ogFonts, type Counts } from '@/og/og';

export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Pagina parlamentarului pe destrajă.ro: ce proiecte de lege a semnat și cât de riscante sunt cele analizate';

// O singură listă pe build pentru toate cele ~470 de imagini (la fel ca paginile).
let mps: Promise<MpStat[]> | null = null;
const getMps = () => (mps ??= Promise.all([getAllBillsLite(), getCdepSigned()]).then(([bills, chamber]) => computeMpStats([...bills, ...chamber])));

export async function generateStaticParams() {
  return (await getMps()).map((m) => ({ slug: m.slug }));
}

const ROLE: Record<string, string> = { senator: 'Senator', deputat: 'Deputat' };
const ro = (n: number) => n.toLocaleString('ro-RO');

function Figure({ n, label, color = OG.ink }: { n: string; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 44, fontWeight: 600, lineHeight: 1, color, letterSpacing: -0.5 }}>{n}</span>
      <span style={{ fontSize: 19, color: OG.muted, marginTop: 8 }}>{label}</span>
    </div>
  );
}

const NONE = '#c9c2b2';
const BOX = { w: 430, h: 236 };

/** Câte un pătrățel pentru fiecare proiect semnat: cele analizate în culoarea riscului, celelalte neutre. */
function Signed({ counts, rest }: { counts: Counts; rest: number }) {
  const cells = [...LEVELS.flatMap((l) => Array.from({ length: counts[l] }, () => OG.risk[l].bar)), ...Array.from({ length: rest }, () => NONE)];
  const n = Math.max(1, cells.length);
  const { pitch, cols } = fitGrid(n, BOX.w, BOX.h);
  const gap = Math.max(2, Math.round(pitch * 0.16));
  const rows = Math.ceil(n / cols);
  const w = cols * pitch - gap;
  const h = rows * pitch - gap;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {cells.map((fill, i) => (
        <rect key={i} x={(i % cols) * pitch} y={Math.floor(i / cols) * pitch} width={pitch - gap} height={pitch - gap} rx={Math.min(4, (pitch - gap) / 4)} fill={fill} />
      ))}
    </svg>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [list, signed, fonts, logo] = await Promise.all([getMps(), getSignedByMp(), ogFonts(), logoSrc()]);
  const mp = list.find((m) => m.slug === slug);
  if (!mp) return new ImageResponse(<div style={{ width: '100%', height: '100%', background: OG.bg }} />, { ...size, fonts });

  const role = ROLE[mp.role] ?? mp.role;
  // Ca pe pagină: cifrele din cap numără proiectele analizate; lista „Toate proiectele semnate” le are pe toate.
  const total = Math.max(signed.byMp.get(mp.slug)?.length ?? 0, mp.billsCount);
  const rest = total - mp.billsCount;
  const counts: Counts = { red: mp.redCount, yellow: mp.yellowCount, green: mp.greenCount };
  const level = levelFromScore(mp.avgRiskScore);
  // Pe un rând când încape la cel puțin 50 px (coloana are ~590 px), altfel pe două rânduri, la 54 px.
  const oneLine = Math.floor(590 / (0.53 * mp.name.length));
  const nameSize = oneLine >= 50 ? Math.min(64, oneLine) : 54;
  const word = (n: number, one: string, more: string) => countWord(n, one, more).replace(/^\d+ (de )?/, '');

  return new ImageResponse(
    (
      <Frame logo={logo} kicker={[role, mp.party].filter(Boolean).join(' · ')} url={`destraja.ro/parlamentari/${mp.slug}`}>
        <div style={{ display: 'flex', width: '100%', gap: 48, marginTop: 30, marginBottom: 26 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontFamily: 'Serif', fontSize: nameSize, lineHeight: 1.04, color: OG.ink, fontWeight: 600, letterSpacing: -1.3 }}>{mp.name}</span>
            <span style={{ fontSize: 24, color: OG.body, marginTop: 12 }}>{partyFullName(mp.party)}</span>
            <div style={{ display: 'flex', gap: 40, marginTop: 'auto' }}>
              {rest > 0 && <Figure n={ro(total)} label={word(total, 'proiect semnat', 'proiecte semnate')} />}
              <Figure n={ro(mp.billsCount)} label={rest > 0 ? 'analizate de noi' : word(mp.billsCount, 'proiect analizat', 'proiecte analizate')} />
              <Figure n={fmt(mp.avgRiskScore)} label="scor mediu" color={OG.risk[level].text} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: BOX.w }}>
            <Signed counts={counts} rest={rest} />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginTop: 16 }}>
              <RiskMix counts={counts} fontSize={19} />
              {rest > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 19, color: OG.body }}>
                  <div style={{ display: 'flex', width: 13, height: 13, borderRadius: 3, background: NONE }} />
                  <span style={{ fontWeight: 600, color: OG.ink }}>{ro(rest)}</span>
                  <span>fără analiză</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
