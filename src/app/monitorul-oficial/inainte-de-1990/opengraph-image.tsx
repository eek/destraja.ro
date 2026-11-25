import { ImageResponse } from 'next/og';
import { getMoPre1990 } from '@/lib/mo';
import { countWord } from '@/lib/format';
import { Frame, OG, OG_SIZE, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Înainte de 1990, pe destrajă.ro: actele din Buletinul Oficial și din vechiul Monitor păstrate în Portalul Legislativ, an de an, din 1837 până în 1989';
export const size = OG_SIZE;
export const contentType = 'image/png';

const NAVY = '#172c54';
const ro = (n: number) => n.toLocaleString('ro-RO');
const WIDTH = 1072;
const HEIGHT = 196;

/** Câte o bară pe an, grupate pe decenii; deasupra deceniilor cu cel puțin 100 de acte, totalul lor. */
function Years({ decades }: { decades: { decade: number; acts: number; years: number[] }[] }) {
  const gap = 10;
  const groupW = (WIDTH - gap * (decades.length - 1)) / decades.length;
  const barW = groupW / 10;
  const max = Math.max(1, ...decades.flatMap((d) => d.years));
  const bars: string[] = [];
  const ticks: string[] = [];
  decades.forEach((d, i) => {
    const x0 = i * (groupW + gap);
    d.years.forEach((n, j) => {
      const x = (x0 + j * barW).toFixed(2);
      if (n > 0) {
        const h = Math.max(2, (n / max) * HEIGHT);
        bars.push(`M${x} ${(HEIGHT - h).toFixed(2)}h${(barW - 1).toFixed(2)}v${h.toFixed(2)}h${(-(barW - 1)).toFixed(2)}z`);
      }
    });
    ticks.push(`M${x0.toFixed(2)} ${HEIGHT + 0.5}h${groupW.toFixed(2)}`);
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: WIDTH }}>
      <div style={{ display: 'flex', position: 'relative', width: WIDTH, height: HEIGHT + 2 }}>
        <svg width={WIDTH} height={HEIGHT + 2} viewBox={`0 0 ${WIDTH} ${HEIGHT + 2}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          <path d={ticks.join('')} stroke={OG.line} strokeWidth={1} fill="none" />
          <path d={bars.join('')} fill={NAVY} />
        </svg>
        {decades.map((d, i) =>
          d.acts >= 100 ? (
            <span
              key={d.decade}
              style={{
                position: 'absolute',
                left: i * (groupW + gap),
                width: groupW,
                top: HEIGHT - (Math.max(...d.years) / max) * HEIGHT - 26,
                justifyContent: 'center',
                display: 'flex',
                fontSize: 17,
                fontWeight: 600,
                color: OG.ink,
              }}
            >
              {ro(d.acts)}
            </span>
          ) : null,
        )}
      </div>
      <div style={{ display: 'flex', gap, marginTop: 8 }}>
        {decades.map((d) => (
          <span key={d.decade} style={{ display: 'flex', justifyContent: 'center', width: groupW, fontSize: 15, color: d.acts ? OG.body : OG.muted }}>
            {d.decade}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function Image() {
  const [data, fonts, logo] = await Promise.all([getMoPre1990(), ogFonts(), logoSrc()]);
  const first = data?.totals.first?.slice(0, 4);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Monitorul Oficial, înainte de 1990" url="destraja.ro/monitorul-oficial/inainte-de-1990">
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Serif', fontSize: 50, lineHeight: 1.06, letterSpacing: -1.1 }}>
            <span style={{ color: OG.muted }}>Înainte de 1990.</span>
            <span style={{ color: OG.ink, fontWeight: 600 }}>
              {data ? `${countWord(data.totals.acts, 'act păstrat', 'acte păstrate').replace(/^\d+/, ro(data.totals.acts))}, din ${first}.` : 'Actele din Buletinul Oficial.'}
            </span>
          </div>
          {data && (
            <div style={{ display: 'flex', marginTop: 'auto' }}>
              <Years decades={data.decades} />
            </div>
          )}
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
