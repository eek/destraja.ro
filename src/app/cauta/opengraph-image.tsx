import { ImageResponse } from 'next/og';
import { Frame, OG, OG_SIZE, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Caută pe destrajă.ro: un proiect de lege după număr, un senator sau un deputat după nume ori, cu vorbele tale, ce te interesează';
export const size = OG_SIZE;
export const contentType = 'image/png';

// Aceleași exemple ca sub căutarea de pe pagină (SearchResults): un subiect, un număr de proiect, o lege.
const EXAMPLES = ['B598/2026', 'Codul fiscal', 'pensii speciale'];

export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), logoSrc()]);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Caută" url="destraja.ro/cauta">
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', marginBottom: 20 }}>
          <span style={{ fontFamily: 'Serif', fontSize: 64, lineHeight: 1.04, color: OG.ink, fontWeight: 600, letterSpacing: -1.4 }}>Caută cu vorbele tale</span>
          <span style={{ fontSize: 25, lineHeight: 1.4, color: OG.body, marginTop: 16 }}>
            Un număr de proiect, numele unui senator sau deputat ori ce te interesează, la Senat și la Camera Deputaților.
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 30, width: 860, height: 72, padding: '0 24px', borderRadius: 14, border: `2px solid ${OG.brand}`, background: '#ffffff', fontSize: 27, color: OG.ink }}>
            <svg width="28" height="28" viewBox="0 0 24 24">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke={OG.muted} strokeWidth="2.4" />
              <path d="M15.5 15.5 L21 21" stroke={OG.muted} strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            chirii pentru tineri
            <div style={{ display: 'flex', width: 2, height: 32, background: OG.ink, marginLeft: -12 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, fontSize: 21, color: OG.muted }}>
            <span>sau</span>
            {EXAMPLES.map((e) => (
              <span key={e} style={{ display: 'flex', padding: '7px 16px', borderRadius: 999, background: '#efece4', color: OG.ink, fontWeight: 600 }}>
                {e}
              </span>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
