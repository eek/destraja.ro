// Hook de rezolvare pentru testele care importă cod TypeScript din worker/ și src/lib/ (Node 24 îl rulează direct,
// fără build): importurile fără extensie („./http”, „../src/lib/bill-ids”) și aliasul „@/” devin fișiere .ts.
// Folosit cu module.register din testele *.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

export async function resolve(specifier, context, next) {
  const fromParent = context.parentURL?.startsWith('file:') && /\.tsx?$/.test(context.parentURL);
  let base = null;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if (fromParent && (specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier).match(/^\.(m?js|json|tsx?)$/))
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  if (base) {
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}

// Fișierele .ts din repo sunt module ES (package.json n-are „type”): fără asta, Node le citește întâi ca CommonJS și scrie un avertisment.
export async function load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.ts') && !url.includes('/node_modules/')) return next(url, { ...context, format: 'module-typescript' });
  return next(url, context);
}
