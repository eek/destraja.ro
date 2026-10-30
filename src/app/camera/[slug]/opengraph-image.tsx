import { ImageResponse } from 'next/og';
import { getBillVersions, getCdepAnalysis, getCdepBill, getCdepSlugs } from '@/lib/cdep';
import { dayDiff, shortCommittee, stageLabel, stageOf } from '@/lib/cdep-text';
import { RISK } from '@/lib/risk';
import { fmt, formatDateRo, todayISO } from '@/lib/format';
import { Glyph, OG, OG_SIZE, clip, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Proiectul de lege de la Camera Deputaților pe destrajă.ro: scorul de risc, ce schimbă și termenul pentru amendamente';

export async function generateStaticParams() {
  return (await getCdepSlugs()).map((slug) => ({ slug }));
}

// La fel ca imaginea proiectelor de la Senat, cu ce e propriu Camerei: etapa, comisia și termenul pentru amendamente.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [bill, analysis, versions, fonts, logo] = await Promise.all([getCdepBill(slug), getCdepAnalysis(slug), getBillVersions(slug), ogFonts(), logoSrc()]);
  if (!bill) return new ImageResponse(<div style={{ width: '100%', height: '100%', background: OG.bg }} />, { ...size, fonts });

  const c = analysis?.consensus;
  const tone = c ? OG.risk[c.riskLevel] : null;
  const title = clip(c?.plainTitle ?? bill.titlu.replace(/^(Proiect de Lege|Propunere legislativă) /i, ''), 118);
  const line = c ? clip(c.citizenOneLiner || c.summaryTlDr, 190) : null;
  const last = versions?.changes.at(-1);
  const change = last && last.direction !== 'la_fel' && last.to !== 'initiator' ? `${last.direction === 'mai_riscant' ? 'Mai riscant' : 'Mai puțin riscant'} după ${last.to === 'senat' ? 'Senat' : 'Cameră'}` : null;
  const deadline = bill.fisa.comisii?.termenAmendamente;
  const open = deadline && dayDiff(deadline, todayISO()) >= 0;
  const committee = bill.fisa.comisii?.raport[0]?.nume;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: OG.bg, fontFamily: 'Sans' }}>
        <div style={{ height: 14, background: tone?.bar ?? OG.brand }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '44px 64px 44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26 }}>
            {c && tone && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, background: tone.soft, color: tone.text, fontWeight: 600, borderRadius: 999, padding: '8px 20px' }}>
                <Glyph level={c.riskLevel} size={16} />
                {RISK[c.riskLevel].label} {fmt(c.riskScore)}/10
              </span>
            )}
            {change && (
              <span style={{ border: `2px solid ${OG.line}`, color: last?.direction === 'mai_riscant' ? OG.risk.red.text : OG.risk.green.text, borderRadius: 999, padding: '6px 18px', fontSize: 22, fontWeight: 600 }}>
                {change}
              </span>
            )}
            <span style={{ marginLeft: 'auto', color: OG.muted, fontSize: 24 }}>{bill.numar}</span>
          </div>
          <div style={{ marginTop: 30, fontFamily: 'Serif', fontSize: title.length > 80 ? 52 : 60, lineHeight: 1.12, color: OG.ink, letterSpacing: -1 }}>{title}</div>
          {line && <div style={{ marginTop: 22, fontSize: 27, lineHeight: 1.4, color: OG.body }}>{line}</div>}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 24, borderTop: `2px solid ${OG.line}` }}>
            <img src={logo} width={178} height={60} alt="" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 22, color: OG.muted, lineHeight: 1.4 }}>
              <span style={{ color: OG.ink, fontWeight: 600 }}>
                Camera Deputaților · {open ? `amendamente până pe ${formatDateRo(deadline)}` : stageLabel(stageOf(bill.stadiu))}
              </span>
              <span>{committee ? clip(shortCommittee(committee), 60) : c ? 'Evaluat de Gemini, Claude și ChatGPT' : 'Fișa de pe cdep.ro'}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
