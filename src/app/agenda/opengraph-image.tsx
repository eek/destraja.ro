import { ImageResponse } from 'next/og';
import { agendaToday, dayLabel, getAgenda, weekOf } from '@/lib/agenda';
import { countWord } from '@/lib/format';
import { Frame, Glyph, OG, OG_SIZE, RiskMix, clip, logoSrc, ogFonts, type Counts } from '@/og/og';

export const dynamic = 'force-static';
export const alt = 'Agenda săptămânii pe destrajă.ro: ședințele comisiilor și ale plenului în care se discută proiectele urmărite';
export const size = OG_SIZE;
export const contentType = 'image/png';

const upper = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

// Săptămâna build-ului, ca pe pagină; în dreapta, următoarele ședințe de azi încolo.
export default async function Image() {
  const [{ appearances }, fonts, logo] = await Promise.all([getAgenda(), ogFonts(), logoSrc()]);
  const today = agendaToday();
  const week = weekOf(today);
  const thisWeek = appearances.filter((a) => a.zi >= week.start && a.zi <= week.end);
  const bills = new Map(thisWeek.map((a) => [a.bill.href, a.bill]));
  const counts: Counts = { red: 0, yellow: 0, green: 0 };
  for (const b of bills.values()) if (b.risk) counts[b.risk.level]++;
  const meetings = new Map<string, typeof appearances>();
  for (const a of appearances.filter((x) => x.zi >= today)) {
    const key = `${a.chamber}|${a.comisieId}|${a.zi}`;
    meetings.set(key, [...(meetings.get(key) ?? []), a]);
  }
  const next = [...meetings.values()].slice(0, 3);

  return new ImageResponse(
    (
      <Frame logo={logo} kicker="Agenda săptămânii" url="destraja.ro/agenda">
        <div style={{ display: 'flex', width: '100%', gap: 52, marginTop: 34, marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 440 }}>
            <span style={{ fontFamily: 'Serif', fontSize: 60, lineHeight: 1.04, color: OG.ink, fontWeight: 600, letterSpacing: -1.3 }}>Când se decide pe legile urmărite</span>
            <span style={{ fontSize: 23, lineHeight: 1.4, color: OG.body, marginTop: 18 }}>
              {bills.size
                ? `${countWord(bills.size, 'proiect', 'proiecte')} pe ordinea de zi a comisiilor și a plenului Senatului săptămâna aceasta.`
                : 'Ședințele comisiilor și ale plenului Senatului, cu ziua, ora și sala.'}
            </span>
            {bills.size > 0 && (
              <div style={{ display: 'flex', marginTop: 'auto' }}>
                <RiskMix counts={counts} fontSize={22} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `2px solid ${OG.ink}` }}>
            {next.map((items) => {
              const a = items[0];
              return (
                <div key={`${a.comisieId}-${a.zi}`} style={{ display: 'flex', flexDirection: 'column', padding: '15px 0', borderBottom: `1px solid ${OG.line}` }}>
                  <span style={{ fontSize: 18, color: OG.muted }}>
                    {upper(dayLabel(a.zi))}
                    {a.ora ? `, ora ${a.ora}` : ''}
                  </span>
                  <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 23, lineHeight: 1.25, color: OG.ink, marginTop: 4 }}>{clip(a.comisie, 64)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 18, color: OG.body }}>
                    {items.slice(0, 6).map((x) => (x.bill.risk ? <Glyph key={x.bill.href} level={x.bill.risk.level} size={14} /> : null))}
                    <span>{countWord(new Set(items.map((x) => x.bill.href)).size, 'proiect urmărit', 'proiecte urmărite')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts },
  );
}
