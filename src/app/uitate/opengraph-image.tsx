import { ImageResponse } from 'next/og';
import { BANDS, getUitate } from '@/lib/uitate';
import { todayISO } from '@/lib/format';
import { Frame, OG, OG_SIZE, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Proiecte uitate, pe destrajă.ro: de cât timp n-au mai avut niciun pas procedural proiectele de lege aflate la Camera Deputaților';
export const size = OG_SIZE;
export const contentType = 'image/png';

// Rampa vechimii de pe pagină (--viz-age-1 … 4, tema deschisă): mai închis, mai vechi.
const AGE: Record<string, string> = { pana1: '#db91b4', ani1_2: '#c65b93', ani2_4: '#ac3273', peste4: '#851b55', necunoscut: '#8b93a1' };
const nr = (n: number) => n.toLocaleString('ro-RO');
const many = (n: number, one: string, more: string) => (n === 1 ? `1 ${one}` : `${nr(n)}${n % 100 === 0 || n % 100 >= 20 ? ' de' : ''} ${more}`);

export default async function Image() {
  const [d, fonts, logo] = await Promise.all([getUitate(todayISO()), ogFonts(), logoSrc()]);
  const bands = d ? BANDS.map((b) => ({ ...b, count: d.bands.find((x) => x.key === b.key)?.count ?? 0 })).filter((b) => b.key !== 'necunoscut' || b.count > 0) : [];
  const max = Math.max(1, ...bands.map((b) => b.count));

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Camera Deputaților" url="destraja.ro/uitate">
        <div style={{ display: 'flex', width: '100%', gap: 56, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 540 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 64, lineHeight: 1.02, color: OG.ink, fontWeight: 600, letterSpacing: -1.5 }}>Proiecte uitate</span>
            {d && (
              <span style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Serif', fontSize: 28, lineHeight: 1.25, marginTop: 20, letterSpacing: -0.3 }}>
                <span style={{ color: OG.muted }}>{many(d.total, 'proiect', 'proiecte')} în dezbatere la Cameră.</span>
                <span style={{ color: OG.ink }}>{nr(d.over1)} n-au mai avut niciun pas procedural de peste un an.</span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `2px solid ${OG.ink}`, paddingTop: 14 }}>
            <span style={{ fontSize: 19, fontWeight: 600, color: OG.ink, marginBottom: 6 }}>De când n-au mai avut un pas procedural</span>
            {bands.map((b) => (
              <div key={b.key} style={{ display: 'flex', flexDirection: 'column', padding: '9px 0', borderBottom: `1px solid ${OG.line}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, color: OG.body }}>
                  <span>{b.label}</span>
                  <span style={{ fontWeight: 600, color: OG.ink }}>{nr(b.count)}</span>
                </div>
                <div style={{ display: 'flex', marginTop: 6, height: 12, width: `${Math.max(2, (b.count / max) * 100)}%`, borderRadius: 3, background: AGE[b.key] }} />
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
