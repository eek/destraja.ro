import fs from 'node:fs/promises';
import path from 'node:path';
import { pressKey, type PressIndex } from '@/lib/search';

// Pentru grupul „Presă” de pe /cauta (src/lib/search.ts): numele publicațiilor și, la articolele pe care le-am verificat
// la un proiect (data/news), proiectul despre care e articolul. Fișier static, făcut la build.
export const dynamic = 'force-static';

export async function GET() {
  const data = path.join(process.cwd(), 'data');
  const outlets = JSON.parse(await fs.readFile(path.join(data, 'news-outlets.json'), 'utf8')) as Record<string, string>;
  const about: PressIndex['about'] = {};
  for (const file of (await fs.readdir(path.join(data, 'news'))).filter((f) => f.endsWith('.json'))) {
    const news = JSON.parse(await fs.readFile(path.join(data, 'news', file), 'utf8')) as { slug: string; billId: string; articles?: { url: string }[] };
    // Presa se caută doar la proiectele în consultare la Senat.
    for (const a of news.articles ?? []) (about[pressKey(a.url)] ??= []).push([news.billId, `/legi/${news.slug}`]);
  }
  return Response.json({ outlets, about } satisfies PressIndex);
}
