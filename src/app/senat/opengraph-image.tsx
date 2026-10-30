import { ImageResponse } from 'next/og';
import { RISK } from '@/lib/risk';
import { countWord, fmt, formatDeadline } from '@/lib/format';
import { Frame, Glyph, OG, OG_SIZE, RiskLine, RiskMix, clip, logoSrc, ogFonts, parliamentNow } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'La Senat: proiectele de lege aflate în consultare publică, cu scorul de risc al fiecăruia, pe destrajă.ro';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const [{ senat }, fonts, logo] = await Promise.all([parliamentNow(), ogFonts(), logoSrc()]);
  const top = [...senat.open].sort((a, b) => b.analysis.consensus.riskScore - a.analysis.consensus.riskScore).slice(0, 3);
  const n = senat.open.length;

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Senatul · consultare publică" url="destraja.ro/senat">
        <div style={{ display: 'flex', width: '100%', gap: 48, marginTop: 30, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 440 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 50, lineHeight: 1.08, color: OG.ink, fontWeight: 600, letterSpacing: -1 }}>Spune-ți părerea cât e deschisă consultarea</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 'auto' }}>
              <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 64, color: OG.ink }}>{n}</span>
              <span style={{ fontSize: 23, color: OG.body }}>{countWord(n, 'proiect', 'proiecte').replace(/^\d+ /, '')} în consultare</span>
            </div>
            <div style={{ display: 'flex', marginTop: 12 }}>
              <RiskLine counts={senat.counts} width={420} height={12} />
            </div>
            <div style={{ display: 'flex', marginTop: 12 }}>
              <RiskMix counts={senat.counts} fontSize={20} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `2px solid ${OG.ink}` }}>
            <span style={{ display: 'flex', fontSize: 19, fontWeight: 600, color: OG.muted, marginTop: 14, marginBottom: 4 }}>CELE MAI RISCANTE ÎN CONSULTARE</span>
            {top.map((b) => (
              <div key={b.id} style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: `1px solid ${OG.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 84, fontSize: 26, fontWeight: 600, color: OG.ink }}>
                  <Glyph level={b.analysis.consensus.riskLevel} size={18} />
                  {fmt(b.analysis.consensus.riskScore)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 23, lineHeight: 1.25, color: OG.ink }}>{clip(b.analysis.consensus.plainTitle, 92)}</span>
                  <span style={{ fontSize: 17, color: OG.muted, marginTop: 4 }}>
                    {b.id} · {RISK[b.analysis.consensus.riskLevel].label.toLowerCase()} · până pe {formatDeadline(b.consultationDeadline)}
                  </span>
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
