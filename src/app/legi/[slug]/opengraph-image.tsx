import { ImageResponse } from 'next/og';
import { getAllBills, getBillBySlug, toLite } from '@/lib/bills';
import { oneLiner } from '@/lib/stats';
import { RISK } from '@/lib/risk';
import { fmt, formatDeadline } from '@/lib/format';
import { OG, OG_SIZE, clip, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Proiectul de lege pe destrajă.ro: scorul de risc, ce schimbă și termenul de consultare';

export async function generateStaticParams() {
  return (await getAllBills()).map((b) => ({ slug: b.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bill = await getBillBySlug(slug);
  const [fonts, logo] = await Promise.all([ogFonts(), logoSrc()]);
  if (!bill) return new ImageResponse(<div style={{ width: '100%', height: '100%', background: OG.bg }} />, { ...size, fonts });

  const c = bill.analysis.consensus;
  const tone = OG.risk[c.riskLevel];
  const title = clip(c.plainTitle, 118);
  const line = clip(oneLiner(toLite(bill)), 190);
  const flags = [bill.emergencyRequested && (bill.emergencyApproved ? 'Urgență aprobată' : 'Urgență cerută'), bill.cesNegative && 'Aviz negativ CES'].filter(
    Boolean,
  ) as string[];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: OG.bg, fontFamily: 'Sans' }}>
        <div style={{ height: 14, background: tone.bar }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '44px 64px 44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, background: tone.soft, color: tone.text, fontWeight: 600, borderRadius: 999, padding: '8px 20px' }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, background: tone.bar }} />
              {RISK[c.riskLevel].label} {fmt(c.riskScore)}/10
            </span>
            {flags.map((f) => (
              <span key={f} style={{ border: `2px solid ${OG.line}`, color: OG.ink, borderRadius: 999, padding: '6px 18px', fontSize: 22, fontWeight: 600 }}>
                {f}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', color: OG.muted, fontSize: 24 }}>{bill.id}</span>
          </div>
          <div style={{ marginTop: 30, fontFamily: 'Serif', fontSize: title.length > 80 ? 52 : 60, lineHeight: 1.12, color: OG.ink, letterSpacing: -1 }}>{title}</div>
          <div style={{ marginTop: 22, fontSize: 27, lineHeight: 1.4, color: OG.body }}>{line}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 24, borderTop: `2px solid ${OG.line}` }}>
            <img src={logo} width={178} height={60} alt="" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 22, color: OG.muted, lineHeight: 1.4 }}>
              <span style={{ color: OG.ink, fontWeight: 600 }}>Consultare până pe {formatDeadline(bill.consultationDeadline)}</span>
              <span>Evaluat de Gemini, Claude și ChatGPT</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
