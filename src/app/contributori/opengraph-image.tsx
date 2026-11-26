import { ImageResponse } from 'next/og';
import { CONTRIBUTIONS } from '@/lib/contributors';
import { Frame, OG, OG_SIZE, clip, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Mulțumiri: oamenii care au ajutat la destrajă.ro cu cod, propuneri și observații';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), logoSrc()]);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Mulțumiri" url="destraja.ro/contributori">
        <div style={{ display: 'flex', width: '100%', gap: 52, marginTop: 34, marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 420 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 60, lineHeight: 1.04, color: OG.ink, fontWeight: 600, letterSpacing: -1.3 }}>Mulțumiri</span>
            <span style={{ fontSize: 23, lineHeight: 1.45, color: OG.body, marginTop: 18 }}>
              destrajă.ro e un proiect civic cu codul deschis. E mai bun datorită oamenilor care au trimis cod, propuneri și observații.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `2px solid ${OG.ink}` }}>
            {CONTRIBUTIONS.slice(0, 4).map((c) => (
              <div key={c.github} style={{ display: 'flex', flexDirection: 'column', padding: '15px 0', borderBottom: `1px solid ${OG.line}` }}>
                <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 25, color: OG.ink }}>{c.name}</span>
                <span style={{ fontSize: 18, lineHeight: 1.4, color: OG.body, marginTop: 4 }}>{clip(c.what, 96)}</span>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
