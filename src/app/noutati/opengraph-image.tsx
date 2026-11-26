import { ImageResponse } from 'next/og';
import { CHANGELOG, type ChangeKind } from '@/lib/changelog';
import { formatDateRo } from '@/lib/format';
import { Frame, OG, OG_SIZE, clip, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Ce e nou pe destrajă.ro: ce am adăugat, schimbat și corectat pe site, cel mai nou întâi';
export const size = OG_SIZE;
export const contentType = 'image/png';

// Etichetele neutre de pe pagină: roșul, galbenul și verdele înseamnă doar riscul.
const KIND: Record<ChangeKind, { label: string; bg: string; fg: string; border?: string }> = {
  nou: { label: 'Nou', bg: OG.brand, fg: '#ffffff' },
  schimbat: { label: 'Schimbat', bg: '#e3e8f1', fg: OG.ink },
  corectat: { label: 'Corectat', bg: OG.bg, fg: OG.body, border: '#c9c2b2' },
};

export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), logoSrc()]);
  const items = CHANGELOG.flatMap((d) => d.items.map((c) => ({ ...c, date: d.date })));
  const since = CHANGELOG.at(-1)?.date;

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Jurnalul schimbărilor" url="destraja.ro/noutati">
        <div style={{ display: 'flex', width: '100%', gap: 52, marginTop: 34, marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 400 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 60, lineHeight: 1.04, color: OG.ink, fontWeight: 600, letterSpacing: -1.3 }}>Ce e nou</span>
            <span style={{ fontSize: 23, lineHeight: 1.4, color: OG.body, marginTop: 18 }}>Ce am adăugat, schimbat și corectat, spus pe scurt, cel mai nou întâi.</span>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
              <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 46, lineHeight: 1, color: OG.ink }}>{items.length}</span>
              <span style={{ fontSize: 19, color: OG.muted, marginTop: 6 }}>
                schimbări{since ? ` de la ${formatDateRo(since)}` : ''}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `2px solid ${OG.ink}` }}>
            {items.slice(0, 3).map((c, i, top) => (
              <div key={c.title} style={{ display: 'flex', flexDirection: 'column', padding: '15px 0', borderBottom: `1px solid ${OG.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, color: OG.muted }}>
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: 999,
                      fontSize: 15,
                      fontWeight: 600,
                      background: KIND[c.kind].bg,
                      color: KIND[c.kind].fg,
                      border: `1.5px solid ${KIND[c.kind].border ?? KIND[c.kind].bg}`,
                    }}
                  >
                    {KIND[c.kind].label}
                  </span>
                  {i === 0 || top[i - 1].date !== c.date ? formatDateRo(c.date) : ''}
                </div>
                <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 24, lineHeight: 1.25, color: OG.ink, marginTop: 7 }}>{clip(c.title, 70)}</span>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
