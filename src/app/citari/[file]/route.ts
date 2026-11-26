import { getCiteFile, getCiteSlugs } from '@/lib/citari-data';

// Textele trimiterilor de pe pagina unui proiect (data/citari/<slug>.json), pentru popover: /citari/<slug>.json.
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getCiteSlugs()).map((slug) => ({ file: `${slug}.json` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const data = await getCiteFile(file.replace(/\.json$/, ''));
  return data ? Response.json(data) : Response.json({ error: 'not_found' }, { status: 404 });
}
