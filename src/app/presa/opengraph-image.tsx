import { ImageResponse } from 'next/og';
import { getAllBills } from '@/lib/bills';
import { Frame, OG, OG_SIZE, clip, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Presă și date pe destrajă.ro: ce scrie presa despre proiectele de lege urmărite și datele deschise';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const [bills, fonts, logo] = await Promise.all([getAllBills(), ogFonts(), logoSrc()]);
  const articles = bills.flatMap((b) => (b.news?.articles ?? []).map((a) => ({ ...a, billId: b.id }))).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const stats = [
    { n: articles.length, label: 'articole' },
    { n: new Set(articles.map((a) => a.outlet)).size, label: 'publicații' },
    { n: bills.filter((b) => b.news?.articles?.length).length, label: 'proiecte în presă' },
  ];

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Presă și date" url="destraja.ro/presa">
        <div style={{ display: 'flex', width: '100%', gap: 52, marginTop: 34, marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 430 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 58, lineHeight: 1.05, color: OG.ink, fontWeight: 600, letterSpacing: -1.2 }}>Ce scrie presa despre legile urmărite</span>
            <div style={{ display: 'flex', gap: 30, marginTop: 'auto' }}>
              {stats.map((s) => (
                <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 46, color: OG.ink }}>{s.n}</span>
                  <span style={{ fontSize: 19, color: OG.muted }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `2px solid ${OG.ink}` }}>
            {articles.slice(0, 3).map((a) => (
              <div key={a.url} style={{ display: 'flex', flexDirection: 'column', padding: '16px 0', borderBottom: `1px solid ${OG.line}` }}>
                <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 23, lineHeight: 1.25, color: OG.ink }}>{clip(a.title, 96)}</span>
                <span style={{ fontSize: 17, color: OG.muted, marginTop: 5 }}>
                  {a.outlet} · despre {a.billId}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
