// Ordinile de zi ale comisiilor Senatului (și ale plenului), citite din paginile publice:
//   ExportData.asmx/GetCalendarOdz?ComisieID=…&Data=YYYY-MM-DD   zilele cu ordine de zi (XML, un an înapoi plus viitorul publicat)
//   ProgramLucruZi.aspx?Zi=YYYY-MM-DD&ComisieID=…                ordinea de zi a unei zile (HTML: ședințe și puncte)
// Fiecare punct cu proiect trimite la Legis/Lista.aspx?cod=NNNNN, același `cod` ca în data/senat-bills.json.

export const SENAT = 'https://www.senat.ro';
export const calendarUrl = (id, day) => `${SENAT}/ExportData.asmx/GetCalendarOdz?ComisieID=${id}&Data=${day}`;
export const dayUrl = (id, day) => `${SENAT}/ProgramLucruZi.aspx?Zi=${day}&ComisieID=${id}`;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** Text curat dintr-o bucată de HTML, cu rândurile păstrate. Diacriticele cu sedilă devin cu virgulă. */
export function text(html = '') {
  return decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/ /g, ' ')
    .replace(/ş/g, 'ș')
    .replace(/Ş/g, 'Ș')
    .replace(/ţ/g, 'ț')
    .replace(/Ţ/g, 'Ț')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Zilele (YYYY-MM-DD) din răspunsul GetCalendarOdz. */
export function parseCalendar(xml) {
  return [...xml.matchAll(/<string>(\d{4}-\d{2}-\d{2})<\/string>/g)].map((m) => m[1]);
}

/** O pagină ProgramLucruZi: antetul, ședințele (oră, etaj, sală) și punctele, pe capitole. */
export function parseDay(html) {
  const out = { organ: null, data: null, sedinte: [], puncte: [] };
  const center = html.indexOf('B_Center');
  const head = text(html.slice(html.indexOf('Ordinea de zi', center)).slice(0, 3000)).split('\n');
  if (head.length > 3) [out.organ, out.data] = [head[1], head[3]];
  const start = html.search(/<div id="OdzDiv"/);
  const body = start >= 0 ? html.slice(start) : html;

  // Tabelul ședințelor: Descriere | De la | Până la | Etaj | Sala
  const sed = body.match(/Pana la<\/th>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (sed) {
    for (const [, row] of sed[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
      const [descriere = '', deLa = '', panaLa = '', etaj = '', sala = ''] = cells;
      out.sedinte.push({ descriere, deLa, panaLa, etaj, sala });
    }
  }

  // Capitolele: <h3>titlu</h3> urmat de tabelul punctelor.
  for (const cap of body.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<input[^>]*hdCapitolID[^>]*\/>\s*([\s\S]*?)(?=<h3>|<div class="footer|$)/g)) {
    const capitol = text(cap[1]);
    const tb = cap[2].match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tb) continue;
    for (const row of tb[1].split(/<tr>\s*<td>/).slice(1)) {
      const cells = [...`<td>${row}`.matchAll(/([\s\S]*?)<\/td>\s*(?:<td[^>]*>|<\/tr>)/g)].map((c) => c[1].replace(/^<td[^>]*>/, ''));
      if (cells.length < 3) continue;
      const link = cells[1].match(/href="Legis\/Lista\.aspx\?cod=(\d+)">([^<]+)<\/a>/);
      const desc = text(cells[2]);
      out.puncte.push({
        capitol,
        nr: text(cells[0]),
        numar: link ? link[2].trim() : text(cells[1]),
        cod: link ? link[1] : null,
        b: desc.match(/[Îî]nregistrat la Senat pentru dezbatere cu nr\.(b\d+)/)?.[1] ?? null,
        titlu: desc.split('\n')[0] ?? '',
        scop: text(cells[3] ?? ''),
        termen: text(cells[4] ?? ''),
        rezolutie: text(cells[8] ?? ''),
      });
    }
  }
  return out;
}
