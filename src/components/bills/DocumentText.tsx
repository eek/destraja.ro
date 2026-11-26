import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeTidyTables, { fixPipeTables, type KnownName, type SignatureInfo } from '@/lib/tidy-tables';

// Textul recunoscut dintr-un PDF scanat, în Markdown (scripts/lib/pdf-text.mjs). Se randează la build, fără JS în
// pagină. HTML brut ajunge aici doar pentru tabelele cu celule unite pe care GFM nu le poate scrie; filtrul de mai
// jos lasă să treacă numai elementele de text și de tabel, iar la celule doar colspan și rowspan.
const schema: SanitizeSchema = {
  tagNames: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  attributes: { th: ['colSpan', 'rowSpan'], td: ['colSpan', 'rowSpan'] },
  ancestors: { thead: ['table'], tbody: ['table'], tr: ['table'], th: ['table'], td: ['table'] },
  strip: ['script', 'style'],
  clobber: [],
  protocols: {},
};

// În caseta documentului titlurile sunt mici: h1 devine h4, restul h5. Stilul stă pe container, nu pe fiecare
// paragraf: documentele lungi (sute de paragrafe) ar căra altfel aceleași clase de două ori (HTML și payload RSC).
const components: Components = {
  h1: 'h4',
  h2: 'h5',
  h3: 'h5',
  h4: 'h5',
  h5: 'h5',
  h6: 'h5',
  table: ({ node: _, ...p }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-line bg-paper first:mt-0 last:mb-0">
      <table {...p} />
    </div>
  ),
};

const doc = [
  '[&_p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0',
  '[&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:leading-snug [&_h4]:text-ink',
  '[&_h5]:mb-1 [&_h5]:mt-3 [&_h5]:text-[13px] [&_h5]:font-semibold [&_h5]:leading-snug [&_h5]:text-ink',
  '[&>h4:first-child]:mt-0 [&>h5:first-child]:mt-0',
  '[&_strong]:font-semibold [&_strong]:text-ink',
  // Tabelele: rânduri cu linii subțiri doar între ele, antet pe fond, text de 13px ca restul documentului; coloanele cu
  // text au o lățime minimă (pe telefon tabelul se derulează lateral în chenarul lui), cele scurte („narrow”) nu.
  '[&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_table]:leading-snug [&_table]:tabular-nums',
  '[&_td]:min-w-32 [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
  '[&_th]:min-w-32 [&_th]:border-b [&_th]:border-line-strong [&_th]:bg-surface [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-bottom [&_th]:font-semibold [&_th]:text-ink',
  '[&_.narrow]:min-w-0 [&_.narrow]:w-px [&_.narrow]:whitespace-nowrap',
  '[&_tr:last-child>td]:border-b-0 [&_tr.repeat>th]:border-t [&_tr.repeat>th]:border-line-strong',
  '[&_.unsure]:italic [&_.unsure]:text-muted [&_.table-note]:-mt-1 [&_.table-note]:text-xs [&_.table-note]:text-muted',
  // Legătura spre pagina tabelului de semnături din PDF-ul oficial („Tabelul semnat, în PDF: pagina 10”).
  '[&_.table-note_a]:font-semibold [&_.table-note_a]:text-link [&_.table-note_a]:underline-offset-4 [&_.table-note_a:hover]:underline',
  '[&_td+td]:border-l [&_th+th]:border-l [&_td+td]:border-l-line [&_th+th]:border-l-line',
].join(' ');

/**
 * `names`: inițiatorii oficiali ai proiectului, ca numele din tabelele de semnături să fie corectate după ei;
 * `signatures`: pagina din PDF a fiecărui tabel și rândurile citite pe imagine (scripts/straja-tabel-semnaturi.mjs).
 */
export default function DocumentText({ markdown, names, signatures }: { markdown: string; names?: KnownName[]; signatures?: SignatureInfo }) {
  return (
    <div className={doc}>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], [rehypeTidyTables, { names, signatures }]]} components={components}>
        {fixPipeTables(markdown)}
      </Markdown>
    </div>
  );
}
