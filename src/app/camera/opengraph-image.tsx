import { ImageResponse } from 'next/og';
import { countWord } from '@/lib/format';
import { Frame, OG, OG_SIZE, RiskMix, Waffle, logoSrc, ogFonts, parliamentNow } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'La Camera Deputaților: proiectele de lege în dezbatere, câte un pătrățel pentru fiecare, colorat după risc, pe destrajă.ro';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const [{ camera }, fonts, logo] = await Promise.all([parliamentNow(), ogFonts(), logoSrc()]);
  const n = camera.list.length;
  const share = n ? Math.round((camera.counts.red / n) * 100) : 0;

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Camera Deputaților · 2026" url="destraja.ro/camera">
        <div style={{ display: 'flex', width: '100%', gap: 44, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 470 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 66, lineHeight: 1.02, color: OG.ink, fontWeight: 600, letterSpacing: -1.5 }}>{share} din 100 au risc ridicat</span>
            <span style={{ fontSize: 24, lineHeight: 1.4, color: OG.body, marginTop: 20 }}>
              {countWord(n, 'proiect', 'proiecte')} în dezbatere la Cameră, fiecare citit de Gemini, Claude și ChatGPT.
            </span>
            <div style={{ display: 'flex', marginTop: 22 }}>
              <RiskMix counts={camera.counts} fontSize={22} />
            </div>
          </div>
          <Waffle counts={camera.counts} cols={27} cell={17} gap={3} />
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
