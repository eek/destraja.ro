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

// În caseta documentului titlurile sunt mici: h1 devine h4, restul h5.
const h4 = 'mb-1 mt-4 text-sm font-semibold leading-snug text-ink first:mt-0';
const h5 = 'mb-1 mt-3 text-[13px] font-semibold leading-snug text-ink first:mt-0';
const cell = 'min-w-24 border border-line-strong px-2 py-1.5 text-left align-top';

const components: Components = {
  h1: ({ node: _, ...p }) => <h4 {...p} className={h4} />,
  h2: ({ node: _, ...p }) => <h5 {...p} className={h5} />,
  h3: ({ node: _, ...p }) => <h5 {...p} className={h5} />,
  h4: ({ node: _, ...p }) => <h5 {...p} className={h5} />,
  h5: ({ node: _, ...p }) => <h5 {...p} className={h5} />,
  h6: ({ node: _, ...p }) => <h5 {...p} className={h5} />,
  p: ({ node: _, ...p }) => <p {...p} className="my-2 first:mt-0 last:mb-0" />,
  strong: ({ node: _, ...p }) => <strong {...p} className="font-semibold text-ink" />,
  table: ({ node: _, ...p }) => (
    <div className="my-3 overflow-x-auto first:mt-0 last:mb-0">
      <table {...p} className="w-full border-collapse text-xs leading-snug" />
    </div>
  ),
  th: ({ node: _, ...p }) => <th {...p} className={`${cell} bg-surface font-semibold text-ink`} />,
  td: ({ node: _, ...p }) => <td {...p} className={cell} />,
};

export default function DocumentText({ markdown }: { markdown: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]} components={components} skipHtml={false}>
      {markdown}
    </Markdown>
  );
}
