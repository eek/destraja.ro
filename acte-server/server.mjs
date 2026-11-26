#!/usr/bin/env node
// Punctul de intrare al serverului actelor. Pe VM (systemd):
//   node release/current/server.mjs --root /srv/acte --port 8090 --host 127.0.0.1
// Local, cu datele de test:
//   node acte-server/server.mjs --data acte-server/.fixture/data --release <dir cu template.html> --port 8090
// Imaginile de previzualizare, local: --resvg <binar> --og-assets <dir cu fonturile și logo.svg> [--og-cache <dir>]
// (în versiune sunt bin/resvg și og/, puse de tools/release.mjs).
// --root R înseamnă --data R/data, --release <directorul acestui fișier>, cu urmărirea lui R/release/current.
// Din mediu (pe VM, /etc/acte/origin.env prin systemd): ACTE_ORIGIN_KEY (una sau mai multe chei, cu virgulă: cererile
// venite prin Cloudflare au nevoie de una, în X-Acte-Key) și ACTE_OPEN_HOSTS (gazde care răspund și fără cheie).

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createActeServer } from './lib/server.mjs';

const args = process.argv.slice(2);
const opt = (k, d = null) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const here = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const root = opt('--root');
const dataDir = path.resolve(opt('--data', root ? path.join(root, 'data') : path.join(here, '.fixture', 'data')));
const releaseDir = path.resolve(opt('--release', here));
const port = Number(opt('--port', 8090));
const host = opt('--host', '127.0.0.1');

const s = createActeServer({
  dataDir,
  releaseDir,
  releasesRoot: root ? path.join(root, 'release') : null,
  watchRelease: !!root && !args.includes('--no-watch-release'),
  cacheBytes: Number(opt('--cache-mb', 128)) * 1024 * 1024,
  resvg: opt('--resvg') ? path.resolve(opt('--resvg')) : undefined,
  ogAssetsDir: opt('--og-assets') ? path.resolve(opt('--og-assets')) : undefined,
  ogCacheDir: opt('--og-cache') ? path.resolve(opt('--og-cache')) : undefined,
  originKeys: (process.env.ACTE_ORIGIN_KEY || '').split(',').map((k) => k.trim()).filter(Boolean),
  openHosts: (process.env.ACTE_OPEN_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean),
});
s.server.listen(port, host, () => console.error(`[acte] ascult pe http://${host}:${port} (versiunea ${s.release.id}, date: ${dataDir}, cheie de origine: ${process.env.ACTE_ORIGIN_KEY ? 'da' : 'nu'})`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => s.drain(sig));
