import { ImageResponse } from 'next/og';
import { getAllBills, toLite } from '@/lib/bills';
import { riskCounts } from '@/lib/stats';
import { OG, OG_SIZE, logoSrc, ogFonts, villageSrc } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'destrajă.ro: Stăm de strajă. Să știi ce se pregătește.';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const counts = riskCounts((await getAllBills()).map(toLite));
  const [fonts, logo, village] = await Promise.all([ogFonts(), logoSrc(), villageSrc()]);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: OG.bg, fontFamily: 'Sans', position: 'relative' }}>
        <img src={village} width={640} height={512} style={{ position: 'absolute', right: -24, top: 70 }} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '56px 0 52px 64px', width: 640, height: '100%' }}>
          <img src={logo} width={210} height={76} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48, fontFamily: 'Serif', fontSize: 68, lineHeight: 1.04, letterSpacing: -1.5 }}>
            <span style={{ color: OG.muted }}>Stăm de strajă.</span>
            <span style={{ color: OG.ink, fontWeight: 600 }}>Să știi ce se pregătește.</span>
          </div>
          <p style={{ marginTop: 28, fontSize: 27, lineHeight: 1.4, color: OG.body, width: 540 }}>
            Proiectele de lege, citite de Gemini, Claude și ChatGPT. Pe înțelesul tuturor.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto', fontSize: 23, color: OG.body }}>
            <span style={{ fontWeight: 600, color: OG.ink }}>{counts.open} proiecte în consultare</span>
            <span style={{ color: OG.muted }}>·</span>
            <span style={{ width: 13, height: 13, borderRadius: 999, background: OG.risk.red.bar }} />
            <span style={{ fontWeight: 600, color: OG.risk.red.text }}>{counts.red} cu risc ridicat</span>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: OG.brand }} />
      </div>
    ),
    { ...size, fonts },
  );
}
