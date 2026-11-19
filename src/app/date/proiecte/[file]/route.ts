import { getBillDossier, getOpenDataSlugs } from '@/lib/open-data';

// Dosarul unui proiect, date deschise: /date/proiecte/<slug>.json (src/lib/open-data.ts).
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getOpenDataSlugs()).map((slug) => ({ file: `${slug}.json` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const dossier = await getBillDossier(file.replace(/\.json$/, ''));
  return dossier ? Response.json(dossier) : Response.json({ error: 'not_found' }, { status: 404 });
}
