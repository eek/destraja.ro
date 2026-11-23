import { getManifest } from '@/lib/open-data';

// Ce date deschise publicăm, când au fost construite și sub ce licență (/date/manifest.json).
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(await getManifest());
}
