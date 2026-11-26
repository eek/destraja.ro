// Copiile documentelor: adresele (src/lib/documente-url.ts), manifestul și versiunile (scripts/lib/documente.mjs), ce se
// verifică azi și verdictul verificării, versiunea citită de analiză și amprentele publice (src/lib/documente.ts), plus
// răspunsurile Worker-ului din R2 (worker/documente.ts), cu un bucket de probă.
import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

register('./ts-resolve.mjs', import.meta.url);
const D = await import('./documente.mjs');
const { ourCopyUrl, keyFromPath, versionDay } = await import('../../src/lib/documente-url.ts');
const { analyzedVersion, fingerprints } = await import('../../src/lib/documente.ts');
const { handleDocumente, contentRange } = await import('../../worker/documente.ts');

test('ourCopyUrl: adresa relativă, absolută și cu pagină; @ rămâne în clar', () => {
  assert.equal(ourCopyUrl('b563-2026', 'forma_initiatorului_26b563FG.PDF'), '/documente/b563-2026/forma_initiatorului_26b563FG.PDF');
  assert.equal(ourCopyUrl('b563-2026', 'forma_initiatorului_26b563FG.PDF', { page: 4 }), '/documente/b563-2026/forma_initiatorului_26b563FG.PDF#page=4');
  assert.equal(
    ourCopyUrl('plx-1-2026', 'expunere_motive_em797@2026-12-03.pdf', { absolute: true }),
    'https://destraja.ro/documente/plx-1-2026/expunere_motive_em797@2026-12-03.pdf',
  );
  assert.equal(D.ourCopyPath('b1-2026/a.PDF', 2), '/documente/b1-2026/a.PDF#page=2');
});

test('keyFromPath: doar un slug și un PDF, fără urcări în dosar', () => {
  assert.equal(keyFromPath('/documente/b563-2026/forma_initiatorului_26b563FG.PDF'), 'b563-2026/forma_initiatorului_26b563FG.PDF');
  assert.equal(keyFromPath('/documente/plx-1-2026/em797%402026-12-03.pdf'), 'plx-1-2026/em797@2026-12-03.pdf');
  assert.equal(keyFromPath('/documente/plx-1-2026/em797@2026-12-03.pdf'), 'plx-1-2026/em797@2026-12-03.pdf');
  for (const bad of ['/documente/amprente.json', '/documente/b1/../x.pdf', '/documente/b1/%2e%2e%2fx.pdf', '/documente/a/b/c.pdf', '/documente/b1/x.txt', '/documente/%E0%A4%A.pdf', '/acte/b1/x.pdf']) {
    assert.equal(keyFromPath(bad), null, bad);
  }
});

test('versionName și versionDay: <nume>@<zi>.<ext>, cu sufix pentru a doua schimbare din aceeași zi', () => {
  assert.equal(D.versionName('forma_initiatorului_26b590FG.PDF', '2026-12-03'), 'forma_initiatorului_26b590FG@2026-12-03.PDF');
  assert.equal(D.versionName('a.pdf', '2026-12-03', 2), 'a@2026-12-03-2.pdf');
  assert.equal(versionDay('a@2026-12-03-2.pdf'), '2026-12-03');
  assert.equal(versionDay('forma_initiatorului_26b590FG.PDF'), null);
  assert.throws(() => D.versionName('a.pdf', '3 dec'));
});

test('sursele: Senatul după numele din adresă, Camera după cdep.ro (cu senat.ro ca alternativă) sau după fișierul de pe senat.ro', () => {
  const senate = D.senateSources({
    pdfs: [
      { type: 'forma_initiatorului', url: 'https://www.senat.ro/legis/PDF/2026/26b590FG.PDF' },
      { type: 'other', url: 'https://www.senat.ro/Legis/PDF/2026/26L622AV.pdf' },
    ],
  });
  assert.deepEqual(senate('forma_initiatorului_26b590FG.PDF'), { source_url: 'https://www.senat.ro/legis/PDF/2026/26b590FG.PDF', alt_url: null });
  // Fișa a schimbat tipul documentului („aviz” → „other”); fișierul vechi își găsește sursa după nume.
  assert.equal(senate('aviz_26L622AV.pdf').source_url, 'https://www.senat.ro/Legis/PDF/2026/26L622AV.pdf');
  // Scos din fișă: adresa de pe senat.ro din numele fișierului.
  assert.equal(senate('aviz_26b564AV.pdf').source_url, 'https://www.senat.ro/legis/PDF/2026/26b564AV.pdf');
  assert.equal(senate('other_scan.pdf'), null);

  const sheet = {
    fisa: {
      numarSenat: 'L129/2026',
      documente: [
        { url: 'https://www.cdep.ro/proiecte/2026/000/00/1/em797.pdf', eticheta: 'Expunerea de motive' },
        { url: 'https://www.cdep.ro/proiecte/2026/000/00/1/oug797.pdf', eticheta: 'Ordonanța de urgență a Guvernului' },
        { url: 'https://www.cdep.ro/ords/pls/proiecte/docs?2026/pl001_cd001_26.pdf', eticheta: 'Forma adoptată de Cameră' },
        { url: 'https://www.cdep.ro/proiecte/2026/000/00/1/cl797.pdf', eticheta: 'Avizul Consiliului Legislativ' },
      ],
    },
  };
  const of = D.chamberSources(sheet);
  assert.deepEqual(of('expunere_motive_em797.pdf'), { source_url: 'https://www.cdep.ro/proiecte/2026/000/00/1/em797.pdf', alt_url: 'https://www.senat.ro/legis/PDF/2026/26L129EM.PDF' });
  assert.deepEqual(of('forma_ordonanta_oug797.pdf'), { source_url: 'https://www.cdep.ro/proiecte/2026/000/00/1/oug797.pdf', alt_url: null });
  assert.equal(of('forma_camera_pl001cd00126.pdf').source_url, 'https://www.cdep.ro/ords/pls/proiecte/docs?2026/pl001_cd001_26.pdf');
  assert.deepEqual(of('forma_initiatorului_25L477FG.PDF'), { source_url: 'https://www.senat.ro/legis/PDF/2025/25L477FG.PDF', alt_url: null });
  assert.equal(of('aviz_cl797.pdf'), null);
});

test('în dezbatere: fără proiectele retrase, încheiate sau devenite lege', () => {
  assert.equal(D.senateInDebate('înregistrat la Senat pt. dezbatere'), true);
  assert.equal(D.senateInDebate('Trimis la Cameră pentru dezbatere'), true);
  assert.equal(D.senateInDebate('Retras de către iniţiator'), false);
  assert.equal(D.chamberInDebate('trimis pentru raport la comisiile permanente ale Camerei'), true);
  assert.equal(D.chamberInDebate('procedura legislativa încetata prin respingere definitiva'), false);
  assert.equal(D.chamberInDebate('lege trimisa la promulgare'), false);
  assert.equal(D.chamberInDebate('Lege 100/2026 LEGE pentru reglementarea'), false);
});

const row = (p, extra = {}) => ({ path: p, size: 10, sha256: 'a'.repeat(64), first_seen: '2026-11-01', source_url: `https://www.senat.ro/${p}`, last_checked: '2026-11-01', r2: '2026-11-26', ...extra });

test('mergeScan: rânduri noi cu ziua fișierului, sursa completată mai târziu, conținut schimbat pe disc', () => {
  const map = new Map([['b1-2026/x.PDF', row('b1-2026/x.PDF')], ['b2-2026/y.PDF', row('b2-2026/y.PDF', { source_url: null })]]);
  const scanned = [
    { path: 'b1-2026/x.PDF', size: 10, sha256: 'b'.repeat(64), day: '2026-11-01' },
    { path: 'b2-2026/y.PDF', size: 10, sha256: 'a'.repeat(64), day: '2026-11-01' },
    { path: 'b3-2026/z.PDF', size: 5, sha256: 'c'.repeat(64), day: '2026-10-30' },
    { path: 'b4-2026/w.PDF', size: 5, sha256: 'd'.repeat(64), day: '2027-01-01' },
  ];
  const sourceOf = (p) => (p.startsWith('b4') ? null : { source_url: `https://src/${p}`, alt_url: null });
  const { added, localChanges } = D.mergeScan(map, scanned, sourceOf, '2026-11-26');
  assert.deepEqual(added.map((r) => [r.path, r.first_seen, r.last_checked, r.source_url]), [
    ['b3-2026/z.PDF', '2026-10-30', '2026-10-30', 'https://src/b3-2026/z.PDF'],
    ['b4-2026/w.PDF', '2026-11-26', '2026-11-26', null],
  ]);
  assert.equal(map.get('b2-2026/y.PDF').source_url, 'https://src/b2-2026/y.PDF');
  assert.deepEqual(localChanges.map((c) => c.row.path), ['b1-2026/x.PDF']);
  // Același fișier, a doua oară: nimic nou.
  assert.equal(D.mergeScan(map, scanned.slice(2), sourceOf, '2026-11-26').added.length, 0);
});

test('mergeScan: un document schimbat (data/pdfs are versiunea nouă) nu e luat drept schimbare pe disc', () => {
  const map = new Map([['b1-2026/x.PDF', row('b1-2026/x.PDF')]]);
  D.recordVersion(map, map.get('b1-2026/x.PDF'), { size: 11, sha256: 'e'.repeat(64), day: '2026-12-03' });
  const { localChanges } = D.mergeScan(map, [{ path: 'b1-2026/x.PDF', size: 11, sha256: 'e'.repeat(64), day: '2026-12-03' }], () => null, '2026-12-04');
  assert.equal(localChanges.length, 0);
});

test('recordVersion: originalul rămâne, versiunea nouă primește @zi (și -2 în aceeași zi), schimbarea se notează', () => {
  const map = new Map([['b1-2026/x.PDF', row('b1-2026/x.PDF')]]);
  const doc = map.get('b1-2026/x.PDF');
  const one = D.recordVersion(map, doc, { size: 11, sha256: 'e'.repeat(64), day: '2026-12-03', via: 'https://www.senat.ro/x' });
  assert.equal(one.version.path, 'b1-2026/x@2026-12-03.PDF');
  assert.equal(one.version.version_of, 'b1-2026/x.PDF');
  assert.equal(doc.sha256, 'a'.repeat(64), 'amprenta originalului nu se schimbă');
  assert.equal(doc.current, 'b1-2026/x@2026-12-03.PDF');
  assert.deepEqual(one.change, { day: '2026-12-03', path: 'b1-2026/x.PDF', version: 'b1-2026/x@2026-12-03.PDF', source_url: 'https://www.senat.ro/x', before: 'a'.repeat(64), after: 'e'.repeat(64), text_changed: null });
  const two = D.recordVersion(map, doc, { size: 12, sha256: 'f'.repeat(64), day: '2026-12-03' });
  assert.equal(two.version.path, 'b1-2026/x@2026-12-03-2.PDF');
  assert.equal(two.change.before, 'e'.repeat(64), 'comparat cu versiunea de până atunci');
  assert.equal(D.latestPath(map, 'b1-2026/x.PDF'), 'b1-2026/x@2026-12-03-2.PDF');
});

test('manifestul: rânduri ordonate și câmpuri în aceeași ordine, citite înapoi la fel', () => {
  const map = new Map([['b2/y.pdf', { r2: '2026-11-26', path: 'b2/y.pdf', sha256: 's', size: 1, first_seen: 'd', source_url: null }], ['b1/x.pdf', row('b1/x.pdf')]]);
  const text = D.manifestText(map);
  assert.ok(text.indexOf('b1/x.pdf') < text.indexOf('b2/y.pdf'));
  assert.ok(text.split('\n')[1].startsWith('{"path":"b2/y.pdf","size":1,"sha256":"s"'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'documente-'));
  const file = path.join(dir, 'manifest.jsonl');
  fs.writeFileSync(file, text);
  assert.deepEqual([...D.readManifest(file).keys()], ['b1/x.pdf', 'b2/y.pdf']);
  assert.equal(D.manifestText(D.readManifest(file)), text);
  fs.rmSync(dir, { recursive: true });
});

test('dueRows: doar documente din R2, cu sursă, în dezbatere, neverificate de 6 zile; cele mai vechi și formele întâi', () => {
  const map = new Map(
    [
      row('b1/aviz_x.PDF', { last_checked: '2026-11-01' }),
      row('b1/forma_initiatorului_x.PDF', { last_checked: '2026-11-01' }),
      row('b1/expunere_motive_x.PDF', { last_checked: '2026-10-20' }),
      row('b1/recent.PDF', { last_checked: '2026-11-24' }),
      row('b1/fara-r2.PDF', { r2: undefined }),
      row('b1/fara-sursa.PDF', { source_url: null }),
      row('b2/inchis.PDF'),
      row('b1/x@2026-11-02.PDF', { version_of: 'b1/x.PDF' }),
    ].map((r) => [r.path, r]),
  );
  const due = D.dueRows(map, { inDebate: (slug) => slug === 'b1', today: '2026-11-26' });
  assert.deepEqual(due.map((r) => r.path), ['b1/expunere_motive_x.PDF', 'b1/forma_initiatorului_x.PDF', 'b1/aviz_x.PDF']);
  assert.equal(D.dueRows(map, { inDebate: () => true, today: '2026-11-26', minAgeDays: -1 }).length, 5);
  assert.equal(D.dailyQuota(783), 157);
});

test('urlsToTry: senat.ro întâi când nu știm, apoi adresa care a dat ultima oară același conținut', () => {
  const r = { source_url: 'https://www.cdep.ro/a.pdf', alt_url: 'https://www.senat.ro/A.PDF' };
  assert.deepEqual(D.urlsToTry(r).map((u) => u.which), ['alt', 'source']);
  assert.deepEqual(D.urlsToTry({ ...r, matched: 'source' }).map((u) => u.which), ['source', 'alt']);
  assert.deepEqual(D.urlsToTry({ source_url: 'https://www.senat.ro/A.PDF' }).map((u) => u.which), ['source']);
  assert.equal(D.isCdepUrl('https://www.cdep.ro/proiecte/x.pdf'), true);
  assert.equal(D.isCdepUrl('https://www.senat.ro/legis/PDF/2026/x.PDF'), false);
});

test('verdict: același conținut, schimbat (abia când am citit toate adresele) sau nedecis', () => {
  const S = 'a'.repeat(64);
  const N = 'n'.repeat(64);
  assert.deepEqual(D.verdict(S, [{ which: 'alt', url: 'u1', sha256: S }]), { state: 'same', matched: 'alt' });
  assert.deepEqual(D.verdict(S, [{ which: 'alt', url: 'u1', sha256: N }, { which: 'source', url: 'u2', sha256: S }]), { state: 'same', matched: 'source' });
  const changed = D.verdict(S, [{ which: 'alt', url: 'u1', sha256: N }, { which: 'source', url: 'u2', sha256: 'm'.repeat(64) }]);
  assert.equal(changed.state, 'changed');
  assert.equal(changed.from.which, 'source', 'documentul de pe cdep.ro e cel arătat pe pagină');
  // senat.ro diferă, iar cdep.ro a rămas pe altă zi (bugetul): nu decidem.
  assert.deepEqual(D.verdict(S, [{ which: 'alt', url: 'u1', sha256: N }], 1), { state: 'unknown' });
  // Sursa nu răspunde sau nu mai are documentul: nu e o schimbare.
  assert.deepEqual(D.verdict(S, [{ which: 'source', url: 'u2', sha256: null }]), { state: 'unknown' });
  assert.deepEqual(D.verdict(S, []), { state: 'unknown' });
});

test('analyzedVersion: versiunea găsită înaintea zilei analizei; cea găsită chiar în ziua ei nu', () => {
  const copy = {
    file: 'b1/x.PDF',
    sourceUrl: 's',
    url: '/documente/b1/x@2026-12-03.PDF',
    versions: [
      { day: '2026-10-20', url: '/documente/b1/x.PDF', sha256: 'a' },
      { day: '2026-12-03', url: '/documente/b1/x@2026-12-03.PDF', sha256: 'b' },
    ],
  };
  assert.equal(analyzedVersion(copy, '2026-11-02T10:00:00Z').sha256, 'a');
  assert.equal(analyzedVersion(copy, '2026-12-03T07:00:00Z').sha256, 'a');
  assert.equal(analyzedVersion(copy, '2026-12-04T07:00:00Z').sha256, 'b');
  assert.equal(analyzedVersion(copy, '2026-01-01').sha256, 'a', 'analiză dinaintea copiilor: originalul');
  assert.equal(analyzedVersion(copy, null).sha256, 'a');
});

test('fingerprints: doar ce e în R2, cu versiunile sub document', () => {
  const rows = [
    row('b1/x.PDF', { current: 'b1/x@2026-12-03.PDF' }),
    row('b1/x@2026-12-03.PDF', { version_of: 'b1/x.PDF', first_seen: '2026-12-03', sha256: 'e'.repeat(64) }),
    row('b1/neurcat.PDF', { r2: undefined }),
  ];
  const fp = fingerprints(rows, '2026-12-03T10:00:00Z');
  assert.equal(fp.count, 1);
  assert.deepEqual(fp.documents[0].versions, [
    { file: 'b1/x@2026-12-03.PDF', url: 'https://destraja.ro/documente/b1/x@2026-12-03.PDF', first_seen: '2026-12-03', sha256: 'e'.repeat(64), size: 10 },
  ]);
  assert.equal(fp.documents[0].url, 'https://destraja.ro/documente/b1/x.PDF');
  assert.equal(fp.documents[0].sha256, 'a'.repeat(64));
});

// ─── Worker-ul ──────────────────────────────────────────────────────────────────────────────────────────────────

const PDF = new TextEncoder().encode('%PDF-1.4 un document de probă');
function bucket() {
  const meta = (key) => ({ key, size: PDF.length, httpEtag: '"e1"', uploaded: new Date('2026-11-26T12:00:00Z') });
  return {
    async head(key) {
      return key === 'b1-2026/x.PDF' ? meta(key) : null;
    },
    async get(key, { onlyIf, range }) {
      if (key !== 'b1-2026/x.PDF') return null;
      if (onlyIf?.get?.('if-none-match') === '"e1"') return meta(key);
      const r = range?.get?.('range');
      if (r) {
        const [, a, b] = /bytes=(\d+)-(\d+)/.exec(r);
        const body = PDF.slice(Number(a), Number(b) + 1);
        return { ...meta(key), body: new Blob([body]).stream(), range: { offset: Number(a), length: body.length } };
      }
      return { ...meta(key), body: new Blob([PDF]).stream() };
    },
  };
}
const env = { DOCUMENTE: bucket(), ASSETS: { fetch: async () => new Response('{"static":true}', { headers: { 'content-type': 'application/json' } }) } };
const call = (p, init = {}) => handleDocumente(new Request(`https://destraja.ro${p}`, init), env, new URL(`https://destraja.ro${p}`));

test('Worker: PDF-ul din R2 cu antetele lui (inline, un an, immutable, ETag, noindex)', async () => {
  const res = await call('/documente/b1-2026/x.PDF');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('content-disposition'), 'inline; filename="x.PDF"');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(res.headers.get('etag'), '"e1"');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(await res.text(), '%PDF-1.4 un document de probă');
});

test('Worker: 304 la același ETag, 206 la Range, HEAD fără corp, 404 și 405', async () => {
  assert.equal((await call('/documente/b1-2026/x.PDF', { headers: { 'if-none-match': '"e1"' } })).status, 304);
  const part = await call('/documente/b1-2026/x.PDF', { headers: { range: 'bytes=0-4' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-4/${PDF.length}`);
  assert.equal(await part.text(), '%PDF-');
  const head = await call('/documente/b1-2026/x.PDF', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(PDF.length));
  assert.equal(await head.text(), '');
  assert.equal((await call('/documente/b1-2026/lipsa.PDF')).status, 404);
  assert.equal((await call('/documente/b1/../secret.pdf')).status, 404);
  assert.equal((await call('/documente/b1-2026/x.PDF', { method: 'POST' })).status, 405);
  assert.deepEqual(await (await call('/documente/amprente.json')).json(), { static: true });
});

test('contentRange: nimic pentru tot fișierul, interval pentru o bucată sau sfârșitul lui', () => {
  assert.equal(contentRange(undefined, 100), null);
  assert.equal(contentRange({ offset: 0, length: 100 }, 100), null);
  assert.equal(contentRange({ offset: 10, length: 5 }, 100), 'bytes 10-14/100');
  assert.equal(contentRange({ suffix: 20 }, 100), 'bytes 80-99/100');
});
