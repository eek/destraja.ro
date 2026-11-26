import { fingerprints, readManifestRows } from '@/lib/documente';

// Amprentele copiilor noastre ale documentelor parlamentare (/documente/amprente.json), din data/documente/manifest.jsonl.
// Worker-ul trimite /documente/amprente.json la fișierul static (worker/documente.ts).
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(fingerprints(await readManifestRows(), new Date().toISOString()));
}
