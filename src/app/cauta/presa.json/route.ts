import fs from 'node:fs/promises';
import path from 'node:path';
import type { PressIndex } from '@/lib/search';

// Pentru grupul „Presă” de pe /cauta (src/lib/search.ts): numele publicațiilor și articolele pe care le-am verificat la
// fiecare proiect (data/news). La un articol găsit de căutare arătăm proiectul despre care e; la o căutare după numărul
// proiectului, articolele lui vin primele (presa rar scrie „B598/2026”). Fișier static, făcut la build.
export const dynamic = 'force-static';

export async function GET() {
  const data = path.join(process.cwd(), 'data');
  const outlets = JSON.parse(await fs.readFile(path.join(data, 'news-outlets.json'), 'utf8')) as Record<string, string>;
  const bills: PressIndex['bills'] = {};
  for (const file of (await fs.readdir(path.join(data, 'news'))).filter((f) => f.endsWith('.json'))) {
    const news = JSON.parse(await fs.readFile(path.join(data, 'news', file), 'utf8')) as {
      slug: string;
      billId: string;
      articles?: { url: string; title: string; domain: string; publishedAt?: string | null }[];
    };
    if (!news.articles?.length) continue;
    // Presa se caută doar la proiectele în consultare la Senat.
    bills[news.slug] = { id: news.billId, href: `/legi/${news.slug}`, articles: news.articles.map((a) => [a.url, a.title, a.domain, a.publishedAt ?? null]) };
  }
  return Response.json({ outlets, bills } satisfies PressIndex);
}
