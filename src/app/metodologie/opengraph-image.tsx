import { ImageResponse } from 'next/og';
import { MODELS } from '@/lib/site';
import { Frame, Glyph, OG, OG_SIZE, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Metodologia destrajă.ro: trei modele AI citesc fiecare proiect de lege și dau un scor de risc de la 0 la 10';
export const size = OG_SIZE;
export const contentType = 'image/png';

const W = 1072;

export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), logoSrc()]);
  const at = (x: number) => Math.round((x / 10) * W);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Metodologie" url="destraja.ro/metodologie">
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 30 }}>
          <span style={{ fontFamily: 'Serif', fontSize: 58, lineHeight: 1.05, color: OG.ink, fontWeight: 600, letterSpacing: -1.2 }}>Trei modele citesc fiecare proiect</span>
          <div style={{ display: 'flex', gap: 14, marginTop: 24 }}>
            {MODELS.map((m) => (
              <div key={m.key} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '14px 18px', borderRadius: 14, border: `1.5px solid ${OG.line}`, background: '#ffffff' }}>
                <span style={{ fontSize: 24, fontWeight: 600, color: OG.ink }}>{m.fullName}</span>
                <span style={{ fontSize: 17, color: OG.muted, marginTop: 4 }}>{m.role}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 22, color: OG.body, marginTop: 26 }}>Scorul comun e media celor trei, de la 0 la 10. Nu e un verdict juridic.</span>
          <div style={{ display: 'flex', position: 'relative', width: W, height: 16, marginTop: 16, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', width: at(3.8), background: OG.risk.green.soft }} />
            <div style={{ display: 'flex', width: at(6.8) - at(3.8), background: OG.risk.yellow.soft }} />
            <div style={{ display: 'flex', flex: 1, background: OG.risk.red.soft }} />
          </div>
          <div style={{ display: 'flex', position: 'relative', width: W, height: 34, marginTop: 8, fontSize: 19, color: OG.body }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'absolute', left: 0 }}>
              <Glyph level="green" size={15} /> redus: sub 3,8
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'absolute', left: at(3.8) }}>
              <Glyph level="yellow" size={15} /> moderat: de la 3,8
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'absolute', left: at(6.8) }}>
              <Glyph level="red" size={15} /> ridicat: de la 6,8
            </div>
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
