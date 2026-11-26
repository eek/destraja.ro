import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNC_FIELDS, mergeBills, neededPdfs, senatStep, shortError, sourceLine, vmFreshness } from './senat-vm.mjs';

// Dimineața de 27 noiembrie 2026: VM-ul a citit lista la 07:31, cu B670 nou și B589 recitit; Mac-ul are B589 de ieri
// (cu un câmp al lui), B585 ieșit din consultare (recitit de Mac mai recent decât de VM) și B517, recuperat doar pe Mac.
const T = (h) => `2026-11-${h}`;
const bill = (n, syncedAt, extra = {}) => ({
  id: `B${n}/2026`,
  slug: `b${n}-2026`,
  consultationDeadline: '24-12-2026',
  stage: 'în consultare',
  pdfs: [],
  timeline: [],
  syncedAt,
  ...extra,
});

test('mergeBills: câmpurile citirii vin de la VM când e mai nou, câmpurile Mac-ului rămân', () => {
  const vm = [bill(589, T('27T05:31:00Z'), { stage: 'azi', opinionsCount: 4 }), bill(670, T('27T05:32:00Z'))];
  const mac = [bill(589, T('26T07:40:00Z'), { stage: 'ieri', opinionsCount: 2, macNote: 'al Mac-ului' })];
  const { bills, fromVm, macOnly } = mergeBills(vm, mac);
  assert.deepEqual(
    bills.map((b) => b.id),
    ['B589/2026', 'B670/2026'],
  );
  assert.equal(bills[0].stage, 'azi');
  assert.equal(bills[0].opinionsCount, 4);
  assert.equal(bills[0].syncedAt, T('27T05:31:00Z'));
  assert.equal(bills[0].macNote, 'al Mac-ului', 'un câmp care nu e al citirii rămâne de pe Mac');
  assert.deepEqual(fromVm, ['B589/2026', 'B670/2026']);
  assert.deepEqual(macOnly, []);
});

test('mergeBills: proiectul citit mai recent de Mac rămâne neatins; la egalitate tot al Mac-ului', () => {
  const macKept = bill(585, T('27T06:00:00Z'), { stage: 'raport comisie', leftListAt: '2026-11-02', macNote: 'x' });
  const same = bill(586, T('26T10:00:00Z'), { stage: 'Mac' });
  const { bills, fromVm } = mergeBills([bill(585, T('26T05:30:00Z'), { stage: 'comisii' }), { ...same, stage: 'VM' }], [macKept, same]);
  assert.equal(bills[0], macKept);
  assert.equal(bills[1].stage, 'Mac');
  assert.deepEqual(fromVm, []);
});

test('mergeBills: un câmp al citirii lipsă la VM (proiect revenit în listă) dispare, proiectele doar de pe Mac rămân la coadă', () => {
  const mac = [
    bill(600, T('25T07:00:00Z'), { leftListAt: '2026-11-25', announcedDeadline: '30-12-2026', consultationDeadline: '24-11-2026' }),
    bill(517, T('26T08:00:00Z'), { restoredOnMac: true }),
  ];
  const vm = [bill(600, T('27T05:31:00Z'))];
  const { bills, macOnly } = mergeBills(vm, mac);
  assert.equal(bills[0].leftListAt, undefined);
  assert.equal(bills[0].announcedDeadline, undefined);
  assert.equal(bills[0].consultationDeadline, '24-12-2026');
  assert.deepEqual(macOnly, ['B517/2026']);
  assert.equal(bills[1].restoredOnMac, true);
});

test('mergeBills: același apel pe VM unește fișierul trimis de Mac (put-bills), fără dubluri', () => {
  const vm = [bill(589, T('27T05:31:00Z')), bill(589, T('20T05:31:00Z'))];
  const mac = [bill(589, T('26T07:00:00Z')), bill(517, T('26T08:00:00Z'))];
  const { bills } = mergeBills(vm, mac);
  assert.deepEqual(
    bills.map((b) => [b.id, b.syncedAt]),
    [
      ['B589/2026', T('27T05:31:00Z')],
      ['B517/2026', T('26T08:00:00Z')],
    ],
  );
});

test('SYNC_FIELDS: acoperă tot ce scrie citirea în data/senat-bills.json', () => {
  for (const k of ['id', 'pdfs', 'timeline', 'publicOpinions', 'syncedAt', 'leftListAt', 'announcedDeadline', 'initiators']) {
    assert.ok(SYNC_FIELDS.includes(k), k);
  }
});

test('vmFreshness: de azi e bună; de ieri, fără răspuns, fără listă sau cu o listă mică, nu', () => {
  const ok = { listDay: '2026-11-27', listAt: '2026-11-27T05:31:00Z', listCount: 28 };
  assert.deepEqual(vmFreshness(ok, '2026-11-27'), { fresh: true, why: null });
  assert.match(vmFreshness(null, '2026-11-27').why, /n-a răspuns/);
  assert.match(vmFreshness({ ...ok, listDay: '2026-11-26', error: 'HTTP 503' }, '2026-11-27').why, /din 2026-11-26 \(azi: HTTP 503\)/);
  assert.match(vmFreshness({ startedAt: 'x', error: 'ENOTFOUND www.senat.ro' }, '2026-11-27').why, /n-a citit lista: ENOTFOUND/);
  assert.match(vmFreshness({ ...ok, listCount: 2 }, '2026-11-27').why, /doar 2 proiecte/);
});

test('neededPdfs: doar PDF-urile proiectelor cerute care lipsesc pe Mac, cu nume sigure', () => {
  const b = bill(670, 'x', {
    pdfs: [
      { type: 'forma_initiatorului', url: 'https://www.senat.ro/legis/PDF/2026/26b670FG.pdf' },
      { type: 'expunere_motive', url: 'https://www.senat.ro/legis/PDF/2026/26b670EM.pdf' },
      { type: 'aviz', url: 'https://www.senat.ro/legis/PDF/2026/rău nume.pdf' },
    ],
  });
  const evil = { ...bill(1, 'x'), slug: '../etc', pdfs: [{ type: 'aviz', url: 'https://x/a.pdf' }] };
  const other = bill(589, 'x', { pdfs: [{ type: 'aviz', url: 'https://www.senat.ro/legis/PDF/2026/26b589CL.pdf' }] });
  const have = new Set(['b670-2026/expunere_motive_26b670EM.pdf']);
  const out = neededPdfs([b, evil, other], ['B670/2026', 'B1/2026'], (slug, name) => have.has(`${slug}/${name}`));
  assert.deepEqual(out, ['pdfs/b670-2026/forma_initiatorului_26b670FG.pdf']);
});

// Pasul de pe Mac: când ia de pe VM și când citește singur.
function stepWith({ status, pullError, vmResult = { used: true, fromVm: 2, pdfs: 5 }, configured = true }) {
  const calls = [];
  return {
    calls,
    run: () =>
      senatStep({
        vmConfigured: configured,
        today: '2026-11-27',
        pullStatus: async () => {
          calls.push('pull');
          if (pullError) throw new Error(pullError);
          return status;
        },
        fromVm: async () => {
          calls.push('vm');
          return vmResult;
        },
        fromMac: async (why) => calls.push(`mac:${why}`),
      }),
  };
}
const fresh = { listDay: '2026-11-27', listAt: '2026-11-27T05:31:00Z', listCount: 28 };

test('senatStep: lista VM-ului de azi → datele de pe VM, Mac-ul nu citește Senatul', async () => {
  const s = stepWith({ status: fresh });
  const source = await s.run();
  assert.deepEqual(s.calls, ['pull', 'vm']);
  assert.equal(source.from, 'vm');
  assert.equal(source.listTime, '07:31');
  assert.equal(source.fromVm, 2);
  assert.equal(sourceLine(source), 'Senat: de pe VM, lista din 07:31');
});

test('senatStep: VM-ul nu răspunde → citește Mac-ul, cu motivul', async () => {
  const s = stepWith({ pullError: 'ssh: connect to host eek-nas.eek.ro: Operation timed out' });
  const source = await s.run();
  assert.deepEqual(s.calls, ['pull', 'mac:VM-ul n-a răspuns: ssh: connect to host eek-nas.eek.ro: Operation timed out']);
  assert.equal(source.from, 'mac');
  assert.equal(source.vmConfigured, true);
  assert.match(sourceLine(source), /^Senat: citit de Mac \(VM-ul n-a răspuns/);
});

test('senatStep: lista VM-ului de ieri → citește Mac-ul, fără să atingă datele VM-ului', async () => {
  const s = stepWith({ status: { ...fresh, listDay: '2026-11-26' } });
  const source = await s.run();
  assert.deepEqual(s.calls, ['pull', 'mac:lista VM-ului e din 2026-11-26']);
  assert.equal(source.vm.listDay, '2026-11-26');
});

test('senatStep: fișierul VM-ului stricat după o stare bună → citește Mac-ul', async () => {
  const s = stepWith({ status: fresh, vmResult: { used: false, why: 'fișierul VM-ului e gol sau stricat' } });
  const source = await s.run();
  assert.deepEqual(s.calls, ['pull', 'vm', 'mac:fișierul VM-ului e gol sau stricat']);
  assert.equal(source.from, 'mac');
});

test('senatStep: fără VM configurat → Mac-ul, fără să întrebe VM-ul', async () => {
  const s = stepWith({ status: fresh, configured: false });
  const source = await s.run();
  assert.deepEqual(s.calls, ['mac:undefined']);
  assert.deepEqual(source, { from: 'mac', why: null, vmConfigured: false });
  assert.equal(sourceLine(source), 'Senat: citit de Mac');
});

test('shortError: motivul lui ssh, nu ecoul lui rsync', () => {
  const stderr = [
    'ssh: Could not resolve hostname nonexistent-jump-host: nodename nor servname provided, or not known',
    'rsync: connection unexpectedly closed (0 bytes received so far) [Receiver]',
    'rsync error: unexplained error (code 255) at io.c(232) [Receiver=3.4.1]',
  ].join('\n');
  assert.equal(shortError(stderr, 'x'), 'ssh: Could not resolve hostname nonexistent-jump-host: nodename nor servname provided, or not known');
  assert.equal(shortError('rsync error: some error\n', 'x'), 'rsync error: some error');
  assert.equal(shortError('', 'Command failed'), 'Command failed');
});
