import { ImageResponse } from 'next/og';
import { Frame, Glyph, OG, OG_SIZE, logoSrc, ogFonts, type Level } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Alerte pe e-mail de la destrajă.ro: un e-mail dimineața, doar când apare ceva nou, pe nivelul de risc ales';
export const size = OG_SIZE;
export const contentType = 'image/png';

const OPTIONS: { text: string; levels: Level[] }[] = [
  { text: 'Toate proiectele', levels: ['red', 'yellow', 'green'] },
  { text: 'Risc moderat și ridicat', levels: ['red', 'yellow'] },
  { text: 'Doar risc ridicat', levels: ['red'] },
];

export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), logoSrc()]);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Alerte pe e-mail" url="destraja.ro/abonare">
        <div style={{ display: 'flex', width: '100%', gap: 56, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 520 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 58, lineHeight: 1.05, color: OG.ink, fontWeight: 600, letterSpacing: -1.2 }}>Nu vrei să verifici în fiecare zi? Îți scriem noi.</span>
            <span style={{ fontSize: 23, lineHeight: 1.45, color: OG.body, marginTop: 20 }}>
              Un e-mail dimineața, doar când un proiect intră în consultare, se apropie un termen sau scrie presa despre el.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 12, padding: 26, borderRadius: 22, background: OG.brand }}>
            {OPTIONS.map((o, i) => (
              <div
                key={o.text}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 62,
                  padding: '0 20px',
                  borderRadius: 14,
                  border: `1.5px solid ${i === 1 ? '#f3f5fa' : 'rgba(243,245,250,0.3)'}`,
                  background: i === 1 ? 'rgba(243,245,250,0.12)' : 'transparent',
                  fontSize: 23,
                  color: '#f3f5fa',
                }}
              >
                {o.text}
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  {o.levels.map((l) => (
                    <Glyph key={l} level={l} size={18} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
