import { ImageResponse } from 'next/og';
import { getAllBillsLite } from '@/lib/bills';
import { getCdepSigned } from '@/lib/cdep';
import { computeMpStats } from '@/lib/stats';
import { Frame, OG, OG_SIZE, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Parlamentari pe destrajă.ro: ce proiecte de lege a semnat fiecare senator și deputat și cât de riscante sunt';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const [mps, fonts, logo] = await Promise.all([
    Promise.all([getAllBillsLite(), getCdepSigned()]).then(([bills, chamber]) => computeMpStats([...bills, ...chamber])),
    ogFonts(),
    logoSrc(),
  ]);
  const parties = Object.entries(
    mps.reduce<Record<string, number>>((acc, m) => {
      acc[m.party] = (acc[m.party] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Parlamentari" url="destraja.ro/parlamentari">
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 34 }}>
          <span style={{ fontFamily: 'Serif', fontSize: 64, lineHeight: 1.04, color: OG.ink, fontWeight: 600, letterSpacing: -1.4 }}>Cine propune legile?</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 18 }}>
            <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 56, color: OG.ink }}>{mps.length}</span>
            <span style={{ fontSize: 26, color: OG.body }}>de senatori și deputați, cu fiecare proiect semnat și riscul lui</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28, width: 760, height: 64, padding: '0 22px', borderRadius: 14, border: `2px solid ${OG.line}`, background: '#ffffff', fontSize: 24, color: OG.muted }}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke={OG.muted} strokeWidth="2.4" />
              <path d="M15.5 15.5 L21 21" stroke={OG.muted} strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Caută-ți senatorul sau deputatul
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 34 }}>
            {parties.map(([p, n]) => (
              <span key={p} style={{ display: 'flex', gap: 8, padding: '8px 16px', borderRadius: 999, background: '#efece4', fontSize: 21, color: OG.body }}>
                <span style={{ fontWeight: 600, color: OG.ink }}>{p}</span>
                {n}
              </span>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
