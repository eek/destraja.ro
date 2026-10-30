import { ImageResponse } from 'next/og';
import { OG, OG_SIZE, RiskLine, RiskMix, logoSrc, ogFonts, parliamentNow, villageSrc, type Counts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'destrajă.ro: Stăm de strajă. Să știi ce se pregătește. Proiectele de lege din Senat și din Camera Deputaților, pe înțelesul tuturor.';
export const size = OG_SIZE;
export const contentType = 'image/png';

function Chamber({ name, n, what, counts }: { name: string; n: number; what: string; counts: Counts }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 30, color: OG.ink }}>{name}</span>
        <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 30, color: OG.ink }}>{n}</span>
        <span style={{ fontSize: 22, color: OG.body }}>{what}</span>
      </div>
      <RiskLine counts={counts} width={540} height={12} />
      <RiskMix counts={counts} fontSize={20} />
    </div>
  );
}

export default async function Image() {
  const [{ senat, camera }, fonts, logo, village] = await Promise.all([parliamentNow(), ogFonts(), logoSrc(), villageSrc()]);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: OG.bg, fontFamily: 'Sans', position: 'relative' }}>
        <img src={village} width={600} height={480} style={{ position: 'absolute', right: -40, top: 40 }} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '48px 0 44px 64px', width: 640, height: '100%' }}>
          <img src={logo} width={196} height={66} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, fontFamily: 'Serif', fontSize: 60, lineHeight: 1.04, letterSpacing: -1.4 }}>
            <span style={{ color: OG.muted }}>Stăm de strajă.</span>
            <span style={{ color: OG.ink, fontWeight: 600 }}>Să știi ce se pregătește.</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 'auto' }}>
            <Chamber name="Senatul" n={senat.open.length} what="în consultare publică" counts={senat.counts} />
            <Chamber name="Camera" n={camera.list.length} what="în dezbatere" counts={camera.counts} />
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: OG.brand }} />
      </div>
    ),
    { ...size, fonts },
  );
}
