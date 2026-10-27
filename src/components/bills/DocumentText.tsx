import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { type Options as SanitizeSchema } from 'rehype-sanitize';

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
    <div className="my-3 overflow-x-auto first:mt-0 last:mb-0">
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
  '[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:leading-snug',
  '[&_td]:min-w-24 [&_td]:border [&_td]:border-line-strong [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
  '[&_th]:min-w-24 [&_th]:border [&_th]:border-line-strong [&_th]:bg-surface [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_th]:text-ink',
].join(' ');

export default function DocumentText({ markdown }: { markdown: string }) {
  return (
    <div className={doc}>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
