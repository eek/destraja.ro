import { ImageResponse } from 'next/og';
import { getMoStats } from '@/lib/mo';
import { countWord } from '@/lib/format';
import { DAY_BINS, binOf } from '@/components/mo/wall-geometry';
import { Frame, OG, OG_SIZE, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Monitorul Oficial, în cifre, pe destrajă.ro: fiecare zi din 1990 încoace ca un rând de pătrățele, mai închise în zilele cu mai multe acte';
export const size = OG_SIZE;
export const contentType = 'image/png';

// Rampa bleumarin a zidului de pe pagină (--mo-0 … --mo-5, tema deschisă).
const RAMP = ['#ece8de', '#d3dbe9', '#a9b9d4', '#7790b8', '#4a6697', '#172c54'];
const LABEL = 46;
const WIDTH = 1072;
const PITCH = 6.5;
const ROW = 5;

/** Zidul zilelor: un rând pe an, o linie verticală pe zi, colorată după câte acte au apărut în ziua aceea. */
function Wall({ calendar }: { calendar: { year: number; values: (number | null)[] }[] }) {
  const col = (WIDTH - LABEL) / 366;
  const paths: string[][] = RAMP.map(() => []);
  calendar.forEach((c, r) => {
    const y = r * PITCH;
    c.values.forEach((v, d) => {
      if (v === null) return;
      paths[binOf(v, DAY_BINS)].push(`M${(LABEL + d * col + col / 2).toFixed(2)} ${y}v${ROW}`);
    });
  });
  const h = calendar.length * PITCH;
  // Anii rotunzi și cel curent, ca etichete; textul stă în afara SVG-ului, unde satori are fonturile.
  return (
    <div style={{ display: 'flex', position: 'relative', width: WIDTH, height: h }}>
      {calendar.map((c, r) =>
        c.year % 10 === 0 || r === calendar.length - 1 ? (
          <span key={c.year} style={{ position: 'absolute', left: 0, top: r * PITCH - 6, fontSize: 14, lineHeight: 1, color: OG.muted }}>
            {c.year}
          </span>
        ) : null,
      )}
      <svg width={WIDTH} height={h} viewBox={`0 0 ${WIDTH} ${h}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {paths.map((p, i) => (p.length ? <path key={i} d={p.join('')} stroke={RAMP[i]} strokeWidth={col - 0.4} fill="none" /> : null))}
      </svg>
    </div>
  );
}

export default async function Image() {
  const [stats, fonts, logo] = await Promise.all([getMoStats(), ogFonts(), logoSrc()]);
  const median = Math.round(stats?.medianActsPerPublishingDay ?? 0);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Monitorul Oficial, Partea I" url="destraja.ro/monitorul-oficial">
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Serif', fontSize: 50, lineHeight: 1.06, letterSpacing: -1.1 }}>
            <span style={{ color: OG.muted }}>Monitorul Oficial, în cifre.</span>
            <span style={{ color: OG.ink, fontWeight: 600 }}>{countWord(median, 'act', 'acte')} într-o zi obișnuită.</span>
          </div>
          {stats && (
            <div style={{ display: 'flex', marginTop: 'auto' }}>
              <Wall calendar={stats.calendar} />
            </div>
          )}
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
