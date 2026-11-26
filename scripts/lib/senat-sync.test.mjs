import test from 'node:test';
import assert from 'node:assert/strict';
import { queueTexts, readQueuedTexts, rereadQueue, rereadKept, syncBills } from './senat-sync.mjs';
import { awakeClock } from './awake-clock.mjs';

// Ziua de 25 noiembrie 2026, în mic: lista în consultare are un proiect vechi și unul nou (B660), iar fișierul mai are
// două proiecte ieșite din consultare, de recitit azi.
const NOW = Date.parse('2026-11-25T08:00:00Z');
const quiet = { log: () => {}, write: () => {}, pause: 0 };
const item = (n) => ({ id: `B${n}/2026`, slug: `b${n}-2026`, sheetUrl: `https://www.senat.ro/Legis/Lista.aspx?cod=${n}` });
// Un proiect ieșit din consultare, cu mișcare recentă (de recitit zilnic) și citit ultima dată acum `days` zile.
const kept = (n, days) => ({
  ...item(n),
  consultationDeadline: '01-11-2026',
  leftListAt: '2026-11-01',
  stage: 'în lucru la comisii',
  timeline: [{ date: '20-11-2026', action: 'trimis la comisii' }],
  pdfs: [],
  syncedAt: new Date(NOW - days * 86_400_000).toISOString(),
});
const fetched = (it) => ({ ...it, initiators: [], pdfs: [], publicOpinions: [], consultationDeadline: '24-12-2026', syncedAt: new Date(NOW).toISOString() });

test('syncBills: lista în consultare (cu B660 nou) e salvată înainte de prima recitire', async () => {
  const saves = [];
  let listSavedAt = null;
  let firstReread = null;
  const previous = [{ ...fetched(item(589)), stage: 'ieri' }, kept(585, 1), kept(586, 2)];
  await syncBills({
    list: [item(589), item(660)],
    previous,
    fetchBill: async (it) => fetched(it),
    reread: async (b) => {
      firstReread ??= saves.length;
      return { next: { syncedAt: new Date(NOW).toISOString() }, news: [] };
    },
    save: (bills) => saves.push(bills.map((b) => b.id)),
    onListSaved: () => (listSavedAt = saves.length),
    today: '2026-11-25',
    now: () => NOW,
    ...quiet,
  });
  // Salvat după fiecare proiect din listă, apoi lista întreagă înainte de recitiri.
  assert.ok(listSavedAt >= 1 && listSavedAt <= firstReread, `lista salvată la ${listSavedAt}, prima recitire la ${firstReread}`);
  assert.ok(saves[listSavedAt - 1].includes('B660/2026'));
  // Imediat după primul proiect, fișierul are deja tot ce aveam (nimic nu se pierde la o oprire).
  assert.deepEqual(saves[0].toSorted(), ['B585/2026', 'B586/2026', 'B589/2026']);
  // La sfârșit, ordinea de până acum: lista Senatului, apoi proiectele păstrate.
  assert.deepEqual(saves.at(-1), ['B589/2026', 'B660/2026', 'B585/2026', 'B586/2026']);
});

test('syncBills: o oprire în timpul recitirilor (ca pe 25 noiembrie) lasă B660 în fișier', async () => {
  let file = null;
  let stuck = false;
  syncBills({
    list: [item(589), item(660)],
    previous: [fetched(item(589)), kept(585, 1), kept(586, 2)],
    fetchBill: async (it) => fetched(it),
    // Recitirea lui B586 (cea mai veche, deci prima) nu se mai termină, ca MinerU pe 25 noiembrie până la oprirea pasului.
    reread: (b) => {
      stuck = b.id === 'B586/2026';
      return new Promise(() => {});
    },
    save: (bills) => (file = structuredClone(bills)),
    today: '2026-11-25',
    now: () => NOW,
    ...quiet,
  });
  await new Promise((r) => setTimeout(r, 50));
  // Aici pasul e oprit: contează doar ce e deja pe disc.
  assert.ok(stuck);
  assert.deepEqual(
    file.map((b) => b.id),
    ['B589/2026', 'B660/2026', 'B585/2026', 'B586/2026'],
  );
});

test('syncBills: recitirea terminată e salvată pe loc, înainte de următoarea', async () => {
  const files = [];
  let calls = 0;
  await syncBills({
    list: [item(589)],
    previous: [fetched(item(589)), kept(585, 1), kept(586, 2)],
    fetchBill: async (it) => fetched(it),
    reread: async (b) => {
      calls++;
      if (calls === 2) assert.equal(files.at(-1).find((x) => x.id === 'B586/2026').stage, 'raport depus', 'prima recitire nu era salvată');
      return { next: { stage: 'raport depus', syncedAt: new Date(NOW).toISOString() }, news: ['stadiu: raport depus'] };
    },
    save: (bills) => files.push(structuredClone(bills)),
    today: '2026-11-25',
    now: () => NOW,
    ...quiet,
  });
  assert.equal(calls, 2);
});

test('rereadQueue: cele citite de cel mai mult timp întâi; cele nescadente rămân pe dinafară', () => {
  const fresh = { ...kept(590, 0), syncedAt: new Date(NOW - 3_600_000).toISOString() };
  const q = rereadQueue([kept(585, 1), kept(586, 3), fresh, kept(587, 2)], NOW);
  assert.deepEqual(
    q.map((b) => b.id),
    ['B586/2026', 'B587/2026', 'B585/2026'],
  );
});

test('rereadKept: după termen nu mai începe alta, iar mâine continuă cu cele rămase', async () => {
  let clock = NOW;
  const bills = [kept(581, 1), kept(582, 2), kept(583, 3), kept(584, 4), kept(585, 5)];
  const order = [];
  const reread = async (b) => {
    order.push(b.id);
    clock += 30 * 60_000; // fiecare recitire ține o jumătate de oră
    return { next: { syncedAt: new Date(clock).toISOString() }, news: [] };
  };
  const day1 = await rereadKept(bills, { reread, until: NOW + 60 * 60_000, now: () => clock, ...quiet });
  // Două recitiri încap în oră; a treia ar începe exact la termen, deci nu mai începe.
  assert.deepEqual(order, ['B585/2026', 'B584/2026']);
  assert.equal(day1.done, 2);
  assert.equal(day1.left, 3);

  // A doua zi: cele de ieri sunt scadente din nou, dar cele rămase la coadă (citite acum 4–6 zile) intră primele.
  clock = NOW + 86_400_000;
  order.length = 0;
  await rereadKept(bills, { reread, until: clock + 60 * 60_000, now: () => clock, ...quiet });
  assert.deepEqual(order, ['B583/2026', 'B582/2026']);
});

test('rereadKept: fără termen le recitește pe toate', async () => {
  const bills = [kept(581, 1), kept(582, 2)];
  const r = await rereadKept(bills, { reread: async () => ({ next: { syncedAt: new Date(NOW).toISOString() }, news: [] }), now: () => NOW, ...quiet });
  assert.deepEqual({ done: r.done, left: r.left }, { done: 2, left: 0 });
});

test('syncBills cu filtru: actualizează doar proiectul cerut, fără recitiri și fără ziua sincronizării', async () => {
  let saved = null;
  let listSaved = false;
  const { bills } = await syncBills({
    list: [item(589), item(660)],
    previous: [{ ...fetched(item(589)), stage: 'ieri' }, kept(585, 1)],
    targetFilter: 'b660',
    fetchBill: async (it) => ({ ...fetched(it), stage: 'azi' }),
    reread: async () => assert.fail('cu filtru nu se recitește'),
    save: (b) => (saved = b),
    onListSaved: () => (listSaved = true),
    today: '2026-11-25',
    now: () => NOW,
    ...quiet,
  });
  assert.equal(listSaved, false);
  assert.deepEqual(
    bills.map((b) => [b.id, b.stage]),
    [
      ['B589/2026', 'ieri'],
      ['B585/2026', 'în lucru la comisii'],
      ['B660/2026', 'azi'],
    ],
  );
  assert.equal(saved, bills);
});

test('syncBills: un proiect ieșit din listă înainte de termen e închis cu o zi înainte', async () => {
  const early = { ...kept(588, 1), leftListAt: undefined, consultationDeadline: '10-12-2026' };
  const { bills } = await syncBills({
    list: [item(589)],
    previous: [early],
    fetchBill: async (it) => fetched(it),
    reread: async () => ({ next: {}, news: [] }),
    save: () => {},
    today: '2026-11-25',
    now: () => NOW,
    ...quiet,
  });
  const b = bills.find((x) => x.id === 'B588/2026');
  assert.deepEqual([b.leftListAt, b.announcedDeadline, b.consultationDeadline], ['2026-11-25', '10-12-2026', '24-11-2026']);
});

test('rereadKept cu stop pe timpul treaz: trei ore de somn în timpul unei recitiri nu termină bugetul', async () => {
  // Ceasul fals al pasului: fiecare recitire lucrează 20 de minute (ceasul înaintează în pași de 5 s), iar în timpul celei
  // de-a doua Mac-ul doarme trei ore, ca pe 25 noiembrie. Bugetul: 90 de minute de lucru.
  let t = 0;
  const clock = awakeClock({ now: () => t });
  const work = (min) => {
    for (let i = 0; i < (min * 60) / 5; i++) {
      t += 5000;
      clock.sample();
    }
  };
  const bills = [kept(581, 1), kept(582, 2), kept(583, 3), kept(584, 4), kept(585, 5), kept(586, 6)];
  const order = [];
  const reread = async (b) => {
    order.push(b.id);
    work(10);
    if (order.length === 2) t += 3 * 3_600_000;
    work(10);
    return { next: { syncedAt: new Date(NOW).toISOString() }, news: [] };
  };
  const r = await rereadKept(bills, { reread, stop: () => clock.awakeMs() >= 90 * 60_000, now: () => NOW, ...quiet });
  // 0, 20, 40, 60, 80 de minute de lucru la pornirea fiecăreia: cinci încap, a șasea ar începe la 100.
  assert.equal(r.done, 5);
  assert.equal(r.left, 1);
});

test('queueTexts: un proiect pus din nou în coadă își păstrează locul și adună textele de recitit', () => {
  const q = {};
  queueTexts(q, 'b576-2026', [], '2026-11-25T08:00:00Z');
  queueTexts(q, 'b544-2026', ['aviz_LG'], '2026-11-25T08:01:00Z');
  queueTexts(q, 'b576-2026', ['aviz_ES'], '2026-11-26T08:00:00Z');
  queueTexts(q, 'b544-2026', ['aviz_LG', 'aviz_CL'], '2026-11-26T08:01:00Z');
  assert.deepEqual(q, {
    'b576-2026': { since: '2026-11-25T08:00:00Z', reread: ['aviz_ES'] },
    'b544-2026': { since: '2026-11-25T08:01:00Z', reread: ['aviz_LG', 'aviz_CL'] },
  });
});

test('readQueuedTexts: cele mai vechi întâi, coada salvată după fiecare, iar după buget restul rămâne pentru mâine', async () => {
  const q = {};
  queueTexts(q, 'b583-2026', [], '2026-11-26T08:03:00Z');
  queueTexts(q, 'b576-2026', ['aviz_ES'], '2026-11-25T08:00:00Z');
  queueTexts(q, 'b544-2026', [], '2026-11-26T08:01:00Z');
  const read = [];
  const saves = [];
  let minutes = 0;
  const r = await readQueuedTexts(q, {
    read: async (slug, reread) => {
      read.push([slug, reread]);
      minutes += slug === 'b576-2026' ? 40 : 10; // avizul de 39 de pagini al lui B576
    },
    save: (queue) => saves.push(Object.keys(queue)),
    stop: () => minutes >= 45,
    log: () => {},
  });
  assert.deepEqual(read, [
    ['b576-2026', ['aviz_ES']],
    ['b544-2026', []],
  ]);
  assert.deepEqual(saves, [['b583-2026', 'b544-2026'], ['b583-2026']]);
  assert.deepEqual(r, { due: 3, done: 2, failed: 0, left: 1 });
  assert.deepEqual(Object.keys(q), ['b583-2026']);
});

test('readQueuedTexts: un proiect cu eroare trece la coada cozii și nu le blochează pe celelalte', async () => {
  const q = {};
  queueTexts(q, 'b576-2026', [], '2026-11-25T08:00:00Z');
  queueTexts(q, 'b544-2026', [], '2026-11-26T08:01:00Z');
  const r = await readQueuedTexts(q, {
    read: async (slug) => {
      if (slug === 'b576-2026') throw new Error('MinerU a căzut');
    },
    log: () => {},
    at: () => '2026-11-26T09:00:00Z',
  });
  assert.deepEqual(r, { due: 2, done: 2, failed: 1, left: 0 });
  assert.deepEqual(q, { 'b576-2026': { since: '2026-11-26T09:00:00Z', reread: [] } });
});
