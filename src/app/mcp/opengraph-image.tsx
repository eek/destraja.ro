import { ImageResponse } from 'next/og';
import { Frame, OG, OG_SIZE, logoSrc, ogFonts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Conectează-ți AI-ul la legislația României: adresa MCP a destrajă.ro, pe care o adaugi în Claude, ChatGPT sau alt asistent, gratuit și fără cont';
export const size = OG_SIZE;
export const contentType = 'image/png';

const CLIENTS = ['Claude', 'ChatGPT', 'Cursor', 'VS Code', 'Codex'];

export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), logoSrc()]);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="MCP · gratuit, fără cont" url="destraja.ro/mcp">
        <div style={{ display: 'flex', width: '100%', gap: 52, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 540 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 56, lineHeight: 1.05, color: OG.ink, fontWeight: 600, letterSpacing: -1.3 }}>Conectează-ți AI-ul la legislația României</span>
            <span style={{ fontSize: 23, lineHeight: 1.45, color: OG.body, marginTop: 20 }}>Întrebi despre legile în vigoare și despre proiectele din Parlament. Primești răspunsul cu sursa.</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 26, borderRadius: 22, background: OG.brand }}>
            <span style={{ fontSize: 18, color: '#c3cde0' }}>Adaugi o adresă în asistentul tău</span>
            <div style={{ display: 'flex', alignItems: 'center', height: 60, marginTop: 10, padding: '0 20px', borderRadius: 12, background: '#ffffff', fontSize: 25, fontWeight: 600, color: OG.ink }}>
              destraja.ro/api/mcp
            </div>
            <span style={{ fontSize: 18, color: '#c3cde0', marginTop: 22 }}>și îl întrebi, de exemplu:</span>
            <span style={{ fontFamily: 'Serif', fontSize: 25, lineHeight: 1.3, color: '#f3f5fa', marginTop: 8 }}>
              „Ce proiecte de lege din Parlament schimbă Codul muncii și cât de riscante sunt?”
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 22 }}>
              {CLIENTS.map((c) => (
                <span key={c} style={{ padding: '4px 10px', borderRadius: 999, border: '1.5px solid rgba(243,245,250,0.35)', fontSize: 16, color: '#f3f5fa' }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
