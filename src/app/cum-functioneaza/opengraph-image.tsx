import { ImageResponse } from 'next/og';
import { OG, OG_SIZE, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Cum funcționează destrajă.ro: în fiecare dimineață, la 8, un Mac citește Senatul.';
export const size = OG_SIZE;
export const contentType = 'image/png';

// Aceeași linie ca pe pagină, simplificată: pornirea, Senatul, cele trei modele, presa, verificarea, publicarea.
// Desenul e un SVG fără text (satori nu are fonturi în imagini); etichetele sunt elemente separate.
const W = 1072;
const H = 112;
const Y = 56;
const STOPS = [
  { x: 150, label: 'Senatul' },
  { x: 480, label: 'Consens' },
  { x: 640, label: 'Presa' },
  { x: 900, label: 'Publicare' },
];

function lineSvg() {
  const navy = OG.brand;
  const circle = (x: number) => `<circle cx="${x}" cy="${Y}" r="15" fill="#ffffff" stroke="${navy}" stroke-width="6"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <g fill="none" stroke="${navy}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16,${Y} L230,${Y}" stroke-width="12"/>
      <path d="M230,${Y} L270,${Y - 40} L410,${Y - 40} L450,${Y}" stroke-width="7"/>
      <path d="M230,${Y} L450,${Y}" stroke-width="7"/>
      <path d="M230,${Y} L270,${Y + 40} L410,${Y + 40} L450,${Y}" stroke-width="7"/>
      <path d="M450,${Y} L1056,${Y}" stroke-width="12"/>
    </g>
    <circle cx="16" cy="${Y}" r="16" fill="${navy}"/>
    <circle cx="16" cy="${Y}" r="6" fill="#ffffff"/>
    ${circle(150)}
    ${circle(230)}
    <rect x="466" y="${Y - 24}" width="28" height="48" rx="14" fill="#ffffff" stroke="${navy}" stroke-width="6"/>
    ${circle(640)}
    <rect x="762" y="${Y - 19}" width="38" height="38" rx="9" fill="#ffffff" stroke="${navy}" stroke-width="6"/>
    <path d="M771,${Y} l7,7 l13,-14" fill="none" stroke="${OG.ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${circle(900)}
    <rect x="1050" y="${Y - 22}" width="12" height="44" rx="6" fill="${navy}"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), logoSrc()]);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: OG.bg, fontFamily: 'Sans', padding: '52px 64px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src={logo} width={180} height={65} alt="" />
          <span style={{ fontSize: 24, color: OG.muted }}>Cum funcționează</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, fontFamily: 'Serif', fontSize: 62, lineHeight: 1.08, letterSpacing: -1.2 }}>
          <span style={{ color: OG.muted }}>În fiecare dimineață, la 8,</span>
          <span style={{ color: OG.ink, fontWeight: 600 }}>un Mac citește Senatul.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 46, position: 'relative', width: W, height: H + 40 }}>
          <img src={lineSvg()} width={W} height={H} alt="" />
          <span style={{ position: 'absolute', left: 196, top: -40, fontSize: 21, fontWeight: 600, color: OG.ink }}>Gemini · Claude · ChatGPT</span>
          {STOPS.map((s) => (
            <span key={s.label} style={{ position: 'absolute', left: s.x - 80, top: H + 4, width: 160, display: 'flex', justifyContent: 'center', fontSize: 23, fontWeight: 600, color: OG.ink }}>
              {s.label}
            </span>
          ))}
          <span style={{ position: 'absolute', left: 781 - 80, top: H + 4, width: 160, display: 'flex', justifyContent: 'center', fontSize: 23, fontWeight: 600, color: OG.ink }}>
            Verificări
          </span>
          <span style={{ position: 'absolute', left: -2, top: H + 4, fontSize: 23, color: OG.muted }}>08:00</span>
          <span style={{ position: 'absolute', right: -6, top: H + 4, fontSize: 23, fontWeight: 600, color: OG.ink }}>GitHub</span>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: OG.brand }} />
      </div>
    ),
    { ...size, fonts },
  );
}
