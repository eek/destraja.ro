// MCP-ul public (worker/mcp.ts, worker/mcp-tools.ts) și datele lui (src/lib/bill-ids.ts, src/lib/open-data-stage.ts):
// mesajele JSON-RPC, versiunile, schemele, căutarea după număr în toate formele, stadiul de acum și erorile. Codul
// TypeScript rulează direct în Node 24; importurile fără extensie le rezolvă ts-resolve.mjs.
import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

register('./ts-resolve.mjs', import.meta.url);
const { normalizeId, parseBillRef, isoDate, bucharestToday } = await import('../../src/lib/bill-ids.ts');
const { senateStage, chamberStage, plausibleLink, senateReportCommittees } = await import('../../src/lib/open-data-stage.ts');
// Datele deschise din data/ (cum le scrie build-ul în /date): pentru cazurile reale de mai jos.
const { getBillDossier, getIdIndex, getOpenDataSlugs } = await import('../../src/lib/open-data.ts');
const { getBillBySlug } = await import('../../src/lib/bills.ts');
const { resolveStatus } = await import('../../src/lib/bill-status.ts');
const { handleMcp, rateKey, _resetCache, PROTOCOLS } = await import('../../worker/mcp.ts');

const TODAY = bucharestToday();
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// ─── Numere și date ──────────────────────────────────────────────────────────────────────────────────────────────

test('normalizeId: toate scrierile unui număr dau aceeași cheie', () => {
  for (const s of ['PL-x 110/2026', 'PL-x nr. 110/2026', 'Pl-x nr.110/2026', 'Pl‑x 110 / 2026', 'PLx 110/2026', 'plx-110-2026']) assert.equal(normalizeId(s), 'plx1102026', s);
  assert.equal(normalizeId('L630/22.12.2025'), 'l6302025');
  assert.equal(normalizeId('L630/2025'), 'l6302025');
  assert.equal(normalizeId('B563/2026'), 'b5632026');
  assert.equal(normalizeId('BP692/2026'), 'bp6922026');
});

test('parseBillRef: numere, slug-uri și adrese; textul obișnuit nu e referință', () => {
  const keys = (s) => parseBillRef(s)?.keys;
  assert.deepEqual(keys('PL-x 110/2026'), ['plx1102026']);
  assert.deepEqual(keys('PL-x nr. 110/2026'), ['plx1102026']);
  assert.deepEqual(keys('  B563/2026 '), ['b5632026']);
  assert.deepEqual(keys('L630/22.12.2025'), ['l6302025']);
  assert.deepEqual(keys('b563-2026'), ['b5632026']);
  assert.deepEqual(keys('BP 692/2026'), ['bp6922026']);
  assert.deepEqual(keys('110/2026'), ['b1102026', 'l1102026', 'plx1102026', 'bp1102026']);
  assert.equal(parseBillRef('110/2026').any, true);
  assert.deepEqual(keys('https://destraja.ro/legi/b563-2026'), ['b5632026']);
  assert.deepEqual(keys('https://www.destraja.ro/camera/plx-110-2026/'), ['plx1102026']);
  assert.deepEqual(keys('https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=23667'), ['idp:23667']);
  assert.deepEqual(keys('https://www.senat.ro/Legis/Lista.aspx?cod=28041&pos=0&NR=b604&AN=2026'), ['cod:28041', 'b6042026']);
  assert.deepEqual(keys('https://www.senat.ro/legis/lista.aspx?nr_cls=L630&an_cls=2025'), ['l6302025']);
  assert.deepEqual(keys('pl-x-110-2026'), ['plx1102026']);
  assert.equal(parseBillRef('https://fakecdep.ro/x?idp=1').kind, 'url-unknown', 'doar cdep.ro și subdomeniile lui');
  assert.equal(parseBillRef('https://exemplu.ro/x').kind, 'url-unknown');
  assert.equal(parseBillRef('chirii pentru tineri'), null);
  assert.equal(parseBillRef('Legea 227/2015'), null);
  assert.equal(parseBillRef('OUG-12-2026'), null, 'o ordonanță nu e slug de proiect');
  assert.equal(parseBillRef('constructor'), null);
});

test('isoDate: formatele Senatului și ale Camerei, fără date imposibile', () => {
  assert.equal(isoDate('20-11-2026'), '2026-11-20');
  assert.equal(isoDate('20.11.2026'), '2026-11-20');
  assert.equal(isoDate('5.3.2026'), '2026-03-05');
  assert.equal(isoDate('2026-11-25'), '2026-11-25', 'o dată deja ISO rămâne la fel');
  assert.equal(isoDate('31-02-2026'), null);
  assert.equal(isoDate('mâine'), null);
  assert.equal(isoDate(null), null);
});

test('bucharestToday: ora de vară (UTC+3) și de iarnă (UTC+2)', () => {
  assert.equal(bucharestToday(new Date('2026-07-01T21:30:00Z')), '2026-07-02');
  assert.equal(bucharestToday(new Date('2026-07-01T20:30:00Z')), '2026-07-01');
  assert.equal(bucharestToday(new Date('2026-01-01T22:30:00Z')), '2026-01-02');
  assert.equal(bucharestToday(new Date('2026-01-01T21:30:00Z')), '2026-01-01');
});

// ─── Stadiul de acum ─────────────────────────────────────────────────────────────────────────────────────────────

test('senateStage: consultarea deschisă e singura fereastră pentru cetățeni', () => {
  const s = senateStage({ stage: 'înregistrat la Senat pt. dezbatere', consultationDeadline: day(3) }, TODAY);
  assert.equal(s.in_debate, true);
  assert.equal(s.current_chamber, 'senat');
  assert.equal(s.window.status, 'open');
  assert.equal(s.window.closes_on, day(3));
  assert.deepEqual(s.deadlines.map((d) => [d.type, d.audience]), [['public_consultation', 'public']]);
  const last = senateStage({ stage: 'înregistrat la Senat pt. dezbatere', consultationDeadline: TODAY }, TODAY);
  assert.equal(last.window.status, 'open', 'ultima zi e inclusă');
});

test('senateStage: după consultare proiectul rămâne în dezbatere la Senat (nu dispare din in_debate)', () => {
  const s = senateStage(
    { stage: 'în lucru, la comisiile permanente ale Senatului', consultationDeadline: day(-10), reportCommittees: { names: ['Comisia pentru muncă'], deadline: day(5) } },
    TODAY,
  );
  assert.equal(s.in_debate, true);
  assert.equal(s.phase, 'committees');
  assert.equal(s.window.status, 'closed');
  assert.equal(s.window.closes_on, day(-10));
  assert.deepEqual(s.deadlines.map((d) => [d.type, d.audience, d.chamber]), [['committee_report', 'committee', 'senat']]);
  assert.match(s.guidance, /comisiei sesizate în fond \(Comisia pentru muncă\)/);
  assert.equal(senateStage({ stage: 'Comisia sesizatã în fond a depus raportul', consultationDeadline: day(-2) }, TODAY).phase, 'report');
});

test('senateStage: retras, trimis la Cameră, doar informare, termen necitibil', () => {
  for (const stage of ['Adoptat, trimis la promulgare', 'Respins definitiv']) assert.equal(senateStage({ stage, consultationDeadline: day(-30) }, TODAY).in_debate, false, stage);
  const gone = senateStage({ stage: 'Retras de către iniţiator', consultationDeadline: day(4) }, TODAY);
  assert.equal(gone.in_debate, false, 'un proiect retras nu e în consultare, chiar dacă termenul n-a trecut');
  assert.equal(gone.window.status, 'closed');
  const sent = senateStage({ stage: 'Trimis la Cameră pentru dezbatere', consultationDeadline: day(-20) }, TODAY);
  assert.equal(sent.in_debate, true);
  assert.equal(sent.current_chamber, 'camera');
  const info = senateStage({ stage: 'înregistrat la Senat pt. informare', consultationDeadline: day(-1) }, TODAY);
  assert.equal(info.current_chamber, 'camera');
  const unknown = senateStage({ stage: 'înregistrat la Senat pt. dezbatere', consultationDeadline: null }, TODAY);
  assert.equal(unknown.window.status, 'unknown', 'un termen lipsă e necunoscut, nu deschis');
});

const sheet = (over = {}) => ({
  stadiu: 'la comisii',
  titlu: 'Propunere legislativă pentru modificarea Legii nr. 1/2000',
  fisa: { bpi: null, numarCamera: null, numarSenat: null, cameraDecizionala: 'Camera Deputaților', caracter: null, urgenta: 'nu', stadiu: '', initiatori: [], obiect: null, timeline: [], comisii: null, ...over },
});

test('chamberStage: la comisiile Camerei, amendamentele sunt ale deputaților, nu termen pentru cetățeni', () => {
  const bill = sheet({
    stadiu: 'trimis pentru raport la comisiile permanente ale Camerei Deputatilor',
    timeline: [{ camera: 'Camera Deputaților', data: '18.11.2026', actiune: 'prezentare în Biroul Permanent al Camerei Deputatilor' }],
    comisii: { raport: [{ idc: 11, nume: 'Comisia juridică' }], aviz: [], termenAmendamente: day(2), termenRaport: day(6) },
  });
  const s = chamberStage({ status: resolveStatus(bill, TODAY), consultation: null }, TODAY);
  assert.equal(s.in_debate, true);
  assert.equal(s.current_chamber, 'camera');
  assert.equal(s.window.status, 'closed', 'fără consultare publică la Cameră');
  assert.deepEqual(s.deadlines.map((d) => [d.type, d.audience]), [['amendments', 'deputies'], ['committee_report', 'committee']]);
  assert.match(s.guidance, /deputații/);
});

test('chamberStage: adoptat de Cameră ca primă cameră → acum la Senat; legea → nu mai e în dezbatere', () => {
  const first = sheet({
    cameraDecizionala: 'Senatul',
    stadiu: 'adoptata de Camera Deputatilor',
    timeline: [{ camera: 'Camera Deputaților', data: '10.11.2026', actiune: 'adoptata de Camera Deputatilor' }],
  });
  const s = chamberStage({ status: resolveStatus(first, TODAY), consultation: null }, TODAY);
  assert.equal(s.in_debate, true);
  assert.equal(s.current_chamber, 'senat');
  assert.equal(s.phase, 'sent_to_other_chamber');
  const law = chamberStage({ status: resolveStatus(sheet({ stadiu: 'Lege 123/2026' }), TODAY), consultation: null }, TODAY);
  assert.equal(law.in_debate, false);
  assert.equal(law.current_chamber, null);
  assert.equal(law.phase, 'law');
});

test('chamberStage: consultarea Camerei nu mai e deschisă după ce proiectul a plecat la Senat', () => {
  const moved = sheet({ cameraDecizionala: 'Senatul', stadiu: 'adoptata de Camera Deputatilor', timeline: [{ camera: 'Camera Deputaților', data: '10.11.2026', actiune: 'adoptata de Camera Deputatilor' }] });
  const s = chamberStage({ status: resolveStatus(moved, TODAY), consultation: { deadline: day(3), form: null } }, TODAY);
  assert.equal(s.current_chamber, 'senat');
  assert.equal(s.window.status, 'closed');
  assert.ok(!s.deadlines.some((d) => d.audience === 'public'));
});

test('chamberStage: consultarea publică a Camerei deschide fereastra', () => {
  const bill = sheet({ stadiu: 'trimis pentru raport la comisiile permanente ale Camerei Deputatilor' });
  const s = chamberStage({ status: resolveStatus(bill, TODAY), consultation: { deadline: day(1), form: 'https://www.cdep.ro/formular' } }, TODAY);
  assert.equal(s.window.status, 'open');
  assert.equal(s.window.kind, 'chamber_public_consultation');
  assert.equal(s.deadlines[0].audience, 'public');
});

test('senateStage: raport comun, cu toate comisiile în îndrumare și în eticheta termenului', () => {
  const s = senateStage(
    { stage: 'în lucru, la comisiile permanente ale Senatului', consultationDeadline: day(-10), reportCommittees: { names: ['Comisia economică', 'Comisia juridică, de numiri'], deadline: day(5) } },
    TODAY,
  );
  assert.equal(s.deadlines.length, 1);
  assert.equal(s.deadlines[0].label, 'Termenul raportului comun (Comisia economică; Comisia juridică, de numiri)');
  assert.match(s.guidance, /comisiilor sesizate în fond, care fac raport comun \(Comisia economică; Comisia juridică, de numiri\)/);
});

test('plausibleLink și senateReportCommittees', () => {
  const link = (o) => plausibleLink({ senateRegistered: '2026-10-15', senateStage: 'Trimis la Cameră pentru dezbatere', chamberRegistered: '2026-11-18', chamberNumber: 'Pl-x 755/2026', chamberTimeline: [], ...o });
  assert.equal(link({}), true);
  assert.equal(link({ senateRegistered: '2026-10-07', chamberRegistered: '2026-03-11', senateStage: 'în lucru, la comisiile permanente ale Senatului' }), false, 'Camera înaintea Senatului: legătură greșită');
  assert.equal(link({ senateStage: 'în lucru, la comisiile permanente ale Senatului' }), false, 'fără dovada că a plecat de la Senat');
  assert.equal(link({ senateStage: 'în lucru', chamberTimeline: [{ camera: 'Senat', data: '16.11.2026', actiune: 'respinsa de catre Senat' }] }), true, 'votul Senatului pe fișa Camerei e dovadă');
  assert.equal(link({ chamberNumber: 'BP760/2026' }), false);
  assert.deepEqual(
    senateReportCommittees([{ action: 'trimis pentru aviz la Comisia economică (TERMEN: 01/12/2026)' }, { action: 'trimis pentru raport la Comisia pentru muncă, familie şi protecţie socială (TERMEN: 2/12/2026)' }]),
    { names: ['Comisia pentru muncă, familie și protecție socială'], deadline: '2026-12-02' },
  );
  // B553/2026: repartizarea refăcută repetă comisiile; fiecare apare o dată, cu cel mai târziu termen.
  assert.deepEqual(
    senateReportCommittees([
      { action: 'trimis pentru raport la Comisia juridică, de numiri, disciplină, imunităţi şi validări (TERMEN: 02/12/2026)' },
      { action: 'trimis pentru raport la Comisia pentru administraţie publică (TERMEN: 01/12/2026)' },
      { action: 'trimis pentru aviz la Comisia pentru drepturile omului, egalitate de şanse, culte şi minorităţi (TERMEN: 24/11/2026)' },
      { action: 'trimis pentru raport la Comisia pentru buget, finanţe, activitate bancară şi piaţă de capital (TERMEN: 03/12/2026)' },
      { action: 'trimis pentru raport la Comisia juridică, de numiri, disciplină, imunități și validări (TERMEN: 02/12/2026)' },
    ]),
    {
      names: ['Comisia juridică, de numiri, disciplină, imunități și validări', 'Comisia pentru administrație publică', 'Comisia pentru buget, finanțe, activitate bancară și piață de capital'],
      deadline: '2026-12-03',
    },
  );
  assert.deepEqual(
    senateReportCommittees([{ action: 'trimis pentru raport la Comisia pentru buget (TERMEN: 16/11/2026)' }, { action: 'trimis pentru raport suplimentar la Comisia pentru buget (TERMEN: 07/12/2026)' }]),
    { names: ['Comisia pentru buget'], deadline: '2026-12-07' },
    'raportul suplimentar aduce un termen nou aceleiași comisii',
  );
  assert.equal(senateReportCommittees([{ action: 'trimis pentru aviz la Comisia juridică (TERMEN: 01/12/2026)' }]), null, 'avizul nu e raport');
});

// ─── Cazuri reale din data/ (datele deschise de la build) ──────────────────────────────────────────────────────────

// Comisiile sesizate în fond pentru raport comun, cum le scrie fișa Senatului (adresele din data/senat/comisii.json).
const JOINT = {
  'b563-2026': ['comec@senat.ro', 'com.juridica@senat.ro'],
  'b565-2026': ['cmun@senat.ro', 'capot@senat.ro'],
  'b532-2026': ['com.juridica@senat.ro', 'comap@senat.ro'],
  'b557-2026': ['com.juridica@senat.ro', 'capot@senat.ro'],
  'b553-2026': ['com.juridica@senat.ro', 'capot@senat.ro', 'comisiabuget@senat.ro'],
  'b542-2026': ['comisiabuget@senat.ro', 'comec@senat.ro'],
  'b551-2026': ['comec@senat.ro', 'energie@senat.ro'],
  'b519-2026': ['comec@senat.ro', 'agri@senat.ro'],
};

test('date reale: la raport comun, get_submission_context are toate comisiile sesizate în fond, fără comisii puse din oficiu', async (t) => {
  for (const [slug, emails] of Object.entries(JOINT)) {
    const b = await getBillBySlug(slug);
    assert.equal(senateReportCommittees(b.timeline)?.names.length, emails.length, slug);
    const d = await getBillDossier(slug);
    if (!(d.in_debate && d.current_chamber === 'senat')) {
      t.diagnostic(`${slug} nu mai e la Senat (${d.status}); comisiile Senatului nu se mai verifică`);
      continue;
    }
    const fond = d.submission.recipients.filter((r) => /în fond/.test(r.role));
    assert.deepEqual(fond.map((r) => r.email), emails, slug);
    assert.ok(fond.every((r) => /raportul comun/.test(r.role)), slug);
    if (d.phase === 'committees') assert.match(d.submission.how, /raport comun/, slug);
    // Doar comisiile din fișă (sau propuse de analiză, cu adresa de pe senat.ro) și registratura: nimic adăugat din oficiu.
    const allowed = new Set([...emails, 'infopub@senat.ro', ...(b.analysis.consensus.institutionalEmails ?? []).flatMap((e) => e.to.map((x) => x.trim().toLowerCase()))]);
    for (const r of d.submission.recipients) assert.ok(allowed.has(r.email), `${slug}: ${r.email}`);
  }
});

test('date reale: fiecare proiect în dezbatere la Senat are toate comisiile din fișă, cu cel mai târziu termen', async () => {
  const fold = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Doar comisiile permanente au adresă în director (o comisie specială comună, ca la B522/2026, n-are).
  const dir = JSON.parse(await (await import('node:fs/promises')).readFile('data/senat/comisii.json', 'utf8')).comisii.filter((c) => c.email).map((c) => fold(c.nume));
  const listed = (n) => dir.some((c) => fold(n) === c || fold(n).startsWith(c));
  let joint = 0;
  for (const slug of await getOpenDataSlugs()) {
    const b = await getBillBySlug(slug);
    if (!b) continue;
    const d = await getBillDossier(slug);
    if (!d.in_debate || d.current_chamber !== 'senat') continue;
    const rc = senateReportCommittees(b.timeline);
    if (!rc) continue;
    if (rc.names.length > 1) joint++;
    const fond = d.submission.recipients.filter((r) => /în fond/.test(r.role));
    assert.equal(fond.length, rc.names.filter(listed).length, `${slug}: ${rc.names.join('; ')}`);
    for (const r of fond) assert.ok(rc.names.some((n) => fold(n) === fold(r.name)), `${slug}: ${r.name}`);
    const report = d.deadlines.find((x) => x.type === 'committee_report');
    if (rc.deadline && rc.deadline >= TODAY) assert.equal(report?.date, rc.deadline, slug);
  }
  assert.ok(joint > 0, 'măcar un raport comun în date');
});

test('date reale: idp-ul fișelor BP din data/camera duce la proiectul Senatului; idp-ul comun rămâne ambiguu', async () => {
  const index = await getIdIndex();
  assert.deepEqual(parseBillRef('https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=23630').keys, ['idp:23630']);
  assert.equal(index.ids['idp:23630'], 'b621-2026', 'BP821/2026 → B621/2026');
  assert.equal(index.ids['idp:23667'], 'b604-2026', 'Pl-x 755/2026 rămâne la B604/2026');
  // BP692/2026 (idp 23523) e legat și de B528/2026, și de B635/2026: nu alegem.
  assert.equal(index.ids['idp:23523'], undefined);
  assert.deepEqual(index.ambiguous['idp:23523'], ['b528-2026', 'b635-2026']);
  assert.deepEqual(index.ambiguous.bp6922026, ['b528-2026', 'b635-2026']);
});

test('date reale: câmpurile pregătite pe forma inițiatorului, pentru un proiect ajuns la Cameră, pot fi depășite', async (t) => {
  const d = await getBillDossier('b604-2026');
  const basis = d.submission.form_fields_basis;
  if (d.current_chamber !== 'camera' || !basis) return t.skip(`B604/2026: ${d.status}`);
  assert.ok(d.numbers.includes('Pl-x 755/2026'));
  assert.equal(basis.analysis_form, 'forma inițiatorului');
  assert.equal(basis.may_be_outdated, true);
  assert.match(basis.note, /înainte de votul Senatului.*Camera Deputaților/);
  // La Senat, aceeași formă e chiar cea dezbătută.
  const senate = await getBillDossier('b621-2026');
  if (senate.submission.form_fields_basis) assert.deepEqual([senate.submission.form_fields_basis.may_be_outdated, senate.submission.form_fields_basis.note], [false, null]);
});

test('date reale: forma actualizată a inițiatorului (coverage.form) are eticheta ei', async (t) => {
  const b = await getBillBySlug('b563-2026');
  if (b.analysis.coverage?.form !== 'actualizata') return t.skip(`B563/2026 e analizat acum pe forma ${b.analysis.coverage?.form}`);
  const d = await getBillDossier('b563-2026');
  assert.equal(d.analysis.analysis_form, 'forma actualizată a inițiatorului');
  if (d.submission.form_fields_basis) assert.equal(d.submission.form_fields_basis.analysis_form, 'forma actualizată a inițiatorului');
});

test('rateKey: IPv4 întreg, IPv6 pe prefixul /64', () => {
  assert.equal(rateKey('203.0.113.7'), '203.0.113.7');
  assert.equal(rateKey('2001:db8:abcd:12:1:2:3:4'), '2001:db8:abcd:12::/64');
  assert.equal(rateKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(rateKey(null), 'anon');
});

// ─── Date de probă pentru Worker ─────────────────────────────────────────────────────────────────────────────────

const window = (status, closes_on = null, kind = null) => ({ status, kind, closes_on });
const summary = (o) => ({
  numbers: [o.id],
  title: `Titlul oficial ${o.id}`,
  plain_title: null,
  risk: { score: 5, level: 'yellow' },
  status: 'La comisii',
  in_debate: true,
  current_chamber: 'camera',
  page_chamber: 'camera',
  phase: 'committees',
  deadlines: [],
  submission_window: window('closed'),
  url: `https://destraja.ro/legi/${o.slug}`,
  data_url: `https://destraja.ro/date/proiecte/${o.slug}.json`,
  ...o,
});
const BILLS = [
  summary({ id: 'B563/2026', slug: 'b563-2026', numbers: ['B563/2026', 'L630/2025'], plain_title: 'Divorțul la notar fără avocat', current_chamber: 'senat', page_chamber: 'senat', phase: 'public_consultation', risk: { score: 8, level: 'red' }, deadlines: [{ type: 'public_consultation', audience: 'public', chamber: 'senat', label: 'Consultare', date: day(2) }], submission_window: window('open', day(2), 'senate_public_consultation') }),
  summary({ id: 'B604/2026', slug: 'b604-2026', numbers: ['B604/2026', 'L639/2026', 'Pl-x 755/2026'], plain_title: 'Incompatibilitățile consilierilor locali', deadlines: [{ type: 'committee_report', audience: 'committee', chamber: 'camera', label: 'Raport', date: day(1) }] }),
  summary({ id: 'PL-x 110/2026', slug: 'plx-110-2026', plain_title: 'Chirii pentru tineri', risk: { score: 3, level: 'green' }, deadlines: [{ type: 'amendments', audience: 'deputies', chamber: 'camera', label: 'Amendamente', date: day(5) }, { type: 'plenary_scheduled', audience: 'plenary', chamber: 'camera', label: 'Plen', date: day(-1) }] }),
  summary({ id: 'B528/2026', slug: 'b528-2026', numbers: ['B528/2026', 'BP692/2026'], current_chamber: 'senat', page_chamber: 'senat' }),
  summary({ id: 'B635/2026', slug: 'b635-2026', numbers: ['B635/2026', 'BP692/2026'], current_chamber: 'senat', page_chamber: 'senat' }),
  summary({ id: 'B599/2026', slug: 'b599-2026', in_debate: false, current_chamber: null, phase: 'withdrawn', status: 'Retras', page_chamber: 'senat' }),
  // Consultarea s-a încheiat ieri, după build: la cerere apare închisă.
  summary({ id: 'B700/2026', slug: 'b700-2026', current_chamber: 'senat', page_chamber: 'senat', phase: 'public_consultation', deadlines: [{ type: 'public_consultation', audience: 'public', chamber: 'senat', label: 'Consultare', date: day(-1) }], submission_window: window('open', day(-1), 'senate_public_consultation') }),
];
const INDEX = { built_at: '2026-11-23T07:00:00.000Z', ids: {}, ambiguous: { bp6922026: ['b528-2026', 'b635-2026'] } };
for (const b of BILLS) for (const n of [b.slug, ...b.numbers]) if (!INDEX.ambiguous[normalizeId(n)]) INDEX.ids[normalizeId(n)] = b.slug;
INDEX.ids['idp:23667'] = 'b604-2026';
INDEX.ambiguous['idp:23523'] = ['b528-2026', 'b635-2026'];
INDEX.ids['cod:28041'] = 'b604-2026';
const dossierOf = (b) => ({
  ...b,
  schema_version: '2',
  title_official: b.title,
  official_url: 'https://www.senat.ro/x',
  status_detail: { title: b.status, detail: null, next: null, note: null, overdue: null, source: 'senat.ro' },
  analysis: { source_kind: 'ai_analysis', analyzed_at: '2026-10-20T10:00:00Z', analysis_form: 'forma inițiatorului', risk_score: 8, risk_level: 'red', summary: 'Rezumat', initiator_claim: 'x', reality_check: 'y', affected_groups: [], models_completed: 2, models: [{ model: 'Gemini', model_id: 'g', score: 8, level: 'red', verdict: 'v', key_findings: ['a', 'b'] }, { model: 'Claude', model_id: null, score: null, level: null, verdict: null, key_findings: [] }], corrections: 0 },
  submission: { window: { ...b.submission_window, channel: 'Formularul Senatului', channel_url: 'https://online.senat.ro' }, how: 'Cum', recipients: [{ name: 'Comisia juridică', email: 'com.juridica@senat.ro', role: 'r', kind: 'committee', source_url: 'https://www.senat.ro/c', checked_on: '2026-10-28' }], form_fields: null, form_fields_basis: null, memo_url: null },
  links: { page: b.url, official: 'https://www.senat.ro/x', senate: 'https://www.senat.ro/x', chamber: null },
  licence: 'CC BY 4.0',
  built_at: INDEX.built_at,
});
const FILES = new Map([
  ['/date/proiecte.json', { built_at: INDEX.built_at, bills: BILLS }],
  ['/date/index-id.json', INDEX],
  ...BILLS.map((b) => [`/date/proiecte/${b.slug}.json`, dossierOf(b)]),
]);

function makeEnv({ files = FILES, limit = true, searchLimit = true } = {}) {
  const calls = { assets: 0, limit: 0, search: 0 };
  return {
    calls,
    ASSETS: {
      async fetch(req) {
        calls.assets++;
        const body = files.get(new URL(req.url).pathname);
        return body ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) : new Response('nu', { status: 404 });
      },
    },
    MCP_LIMIT: { limit: async () => (calls.limit++, { success: limit }) },
    MCP_SEARCH_LIMIT: { limit: async () => (calls.search++, { success: searchLimit }) },
  };
}

const realFetch = globalThis.fetch;
function stubSearch(fn) {
  globalThis.fetch = async (url, init) => (String(url).startsWith('https://cauta.destraja.ro/') ? fn(String(url), init) : realFetch(url, init));
}
const restoreFetch = () => (globalThis.fetch = realFetch);

async function post(env, body, headers = {}) {
  const res = await handleMcp(
    new Request('https://destraja.ro/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'cf-connecting-ip': '203.0.113.7', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
  );
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}
const V = { 'mcp-protocol-version': '2025-06-18' };
const call = (env, name, args, id = 1) => post(env, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, V);
const data = (r) => {
  assert.equal(r.status, 200);
  assert.equal(r.body.result.isError, false, r.body.result.content?.[0]?.text);
  return r.body.result.structuredContent;
};
const toolError = (r) => {
  assert.equal(r.status, 200);
  assert.equal(r.body.result.isError, true);
  return r.body.result.content[0].text;
};

// ─── JSON-RPC și transport ───────────────────────────────────────────────────────────────────────────────────────

test('initialize: negociază versiunea; fără protocolVersion e -32602', async () => {
  const env = makeEnv();
  for (const [asked, got] of [['2025-06-18', '2025-06-18'], ['2025-03-26', '2025-03-26'], ['2024-11-05', '2025-06-18'], ['2025-11-25', '2025-06-18']]) {
    const r = await post(env, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: asked, capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.protocolVersion, got, asked);
    assert.deepEqual(r.body.result.capabilities, { tools: { listChanged: false } });
    assert.equal(r.body.result.serverInfo.name, 'destraja');
  }
  // Un client nou poate trimite antetul cu versiunea lui chiar la initialize: nu-l refuzăm.
  const init = { capabilities: {}, clientInfo: { name: 't', version: '1' } };
  const r = await post(env, { jsonrpc: '2.0', id: 'a', method: 'initialize', params: { protocolVersion: '2025-11-25', ...init } }, { 'mcp-protocol-version': '2025-11-25' });
  assert.equal(r.body.result.protocolVersion, '2025-06-18');
  for (const params of [{}, { protocolVersion: '2025-06-18' }, { protocolVersion: '2025-06-18', capabilities: {} }]) {
    const bad = await post(env, { jsonrpc: '2.0', id: 2, method: 'initialize', params });
    assert.equal(bad.body.error.code, -32602, JSON.stringify(params));
  }
  assert.deepEqual(PROTOCOLS, ['2025-06-18', '2025-03-26']);
});

test('notificările primesc 202 fără corp și nu pornesc nimic, nici tools/call fără id', async () => {
  const env = makeEnv();
  const a = await post(env, { jsonrpc: '2.0', method: 'notifications/initialized' }, V);
  assert.equal(a.status, 202);
  assert.equal(a.body, null);
  const b = await post(env, { jsonrpc: '2.0', method: 'tools/call', params: { name: 'list_bills', arguments: {} } }, V);
  assert.equal(b.status, 202);
  assert.equal(env.calls.assets, 0, 'o notificare tools/call nu citește date');
  const c = await post(env, { jsonrpc: '2.0', id: 9, result: {} }, V);
  assert.equal(c.status, 202, 'răspunsurile clientului sunt acceptate');
  for (const bad of [{ jsonrpc: '2.0', id: null, result: {} }, { jsonrpc: '2.0', id: 9, result: {}, error: { code: 1, message: 'x' } }, { jsonrpc: '2.0', id: 9, error: 'x' }])
    assert.equal((await post(env, bad, V)).status, 400, `răspuns stricat: ${JSON.stringify(bad)}`);
});

test('plicul JSON-RPC e verificat: jsonrpc, id, method, params, JSON stricat', async () => {
  const env = makeEnv();
  const cases = [
    [{ id: 1, method: 'ping' }, -32600],
    [{ jsonrpc: '1.0', id: 1, method: 'ping' }, -32600],
    [{ jsonrpc: '2.0', id: null, method: 'ping' }, -32600],
    [{ jsonrpc: '2.0', id: 1.5, method: 'ping' }, -32600],
    [{ jsonrpc: '2.0', id: 1, method: 7 }, -32600],
    [{ jsonrpc: '2.0', id: 1, method: 'ping', params: 'x' }, -32600],
    [{ jsonrpc: '2.0', id: 1 }, -32600],
    [null, -32600],
    [42, -32600],
    ['"hi"', -32600],
  ];
  for (const [body, code] of cases) {
    const r = await post(env, body, V);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.error.code, code, JSON.stringify(body));
  }
  const broken = await post(env, '{"jsonrpc": "2.0", "id": 1,', V);
  assert.equal(broken.status, 400);
  assert.equal(broken.body.error.code, -32700);
  const arr = await post(env, { jsonrpc: '2.0', id: 3, method: 'tools/list', params: [] }, V);
  assert.equal(arr.body.error.code, -32602);
});

test('metode necunoscute și cereri cu id pe notifications/*: -32601', async () => {
  const env = makeEnv();
  for (const method of ['resources/list', 'notifications/initialized', 'foo']) {
    const r = await post(env, { jsonrpc: '2.0', id: 5, method }, V);
    assert.equal(r.status, 200);
    assert.equal(r.body.id, 5);
    assert.equal(r.body.error.code, -32601, method);
  }
  const ping = await post(env, { jsonrpc: '2.0', id: 'p', method: 'ping' }, V);
  assert.deepEqual(ping.body, { jsonrpc: '2.0', id: 'p', result: {} });
});

test('loturi: refuzate în 2025-06-18, acceptate în 2025-03-26 (fără antet = 2025-03-26), cu limite', async () => {
  const env = makeEnv();
  const batch = [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }];
  const june = await post(env, batch, V);
  assert.equal(june.status, 400);
  assert.equal(june.body.error.code, -32600);
  const march = await post(env, batch, { 'mcp-protocol-version': '2025-03-26' });
  assert.equal(march.status, 200);
  assert.deepEqual(march.body.map((r) => r.id), [1, 2]);
  const none = await post(env, batch);
  assert.equal(none.status, 200);
  assert.equal((await post(env, [])).status, 400);
  assert.equal((await post(env, Array.from({ length: 11 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'ping' })))).status, 400);
  assert.equal((await post(env, [{ jsonrpc: '2.0', method: 'notifications/initialized' }])).status, 202);
  const init = await post(env, [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't' } } }]);
  assert.equal(init.body[0].error.code, -32600, 'initialize nu poate fi într-un lot');
});

test('antetul MCP-Protocol-Version nesuportat → 400; HTTP: GET 405, OPTIONS 204, Origin, Content-Type, mărime, limită', async () => {
  const env = makeEnv();
  const bad = await post(env, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'mcp-protocol-version': '2099-01-01' });
  assert.equal(bad.status, 400);
  const get = await handleMcp(new Request('https://destraja.ro/api/mcp'), env);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST, OPTIONS');
  const opt = await handleMcp(new Request('https://destraja.ro/api/mcp', { method: 'OPTIONS' }), env);
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get('access-control-allow-origin'), '*');
  assert.equal((await post(env, { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'null' })).status, 403);
  assert.equal((await post(env, { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://claude.ai' })).status, 200);
  assert.equal((await post(env, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post(env, { jsonrpc: '2.0', id: 1, method: 'ping' }, { accept: 'text/html' })).status, 406);
  assert.equal((await post(env, { jsonrpc: '2.0', id: 1, method: 'ping', params: { x: 'a'.repeat(40_000) } })).status, 413);
  const limited = await post(makeEnv({ limit: false }), { jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
});

test('tools/list: patru unelte, toate doar citire', async () => {
  const r = await post(makeEnv(), { jsonrpc: '2.0', id: 1, method: 'tools/list' }, V);
  assert.deepEqual(r.body.result.tools.map((t) => t.name), ['search_bills', 'list_bills', 'get_bill', 'get_submission_context']);
  for (const t of r.body.result.tools) {
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.annotations.destructiveHint, false);
    assert.equal(t.inputSchema.additionalProperties, false);
  }
});

test('argumentele sunt verificate după schema publicată: -32602 cu valorile permise', async () => {
  const env = makeEnv();
  const cases = [
    ['nu_exista', {}],
    ['list_bills', { chamber: 'cdep' }],
    ['list_bills', { deadline_within_days: 'soon' }],
    ['list_bills', { deadline_within_days: 1e15 }],
    ['list_bills', { limit: 0 }],
    ['list_bills', { cursor: 'x' }],
    ['list_bills', { extra: 1 }],
    ['get_bill', { id: 'B563/2026', section: 'full' }],
    ['get_bill', {}],
    ['get_bill', { id: 563 }],
    ['search_bills', { query: 'a'.repeat(201) }],
    ['search_bills', { query: '   ' }],
  ];
  for (const [name, args] of cases) {
    const r = await call(env, name, args);
    assert.equal(r.status, 200);
    assert.equal(r.body.error?.code, -32602, `${name} ${JSON.stringify(args)}`);
  }
  const r = await call(env, 'list_bills', { chamber: 'cdep' });
  assert.match(r.body.error.message, /senat, camera/);
  const args = await post(env, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_bills', arguments: [1] } }, V);
  assert.equal(args.body.error.code, -32602);
});

test('structuredContent doar pentru 2025-06-18; textul are mereu același JSON', async () => {
  const env = makeEnv();
  const june = await call(env, 'get_bill', { id: 'B563/2026' });
  assert.ok(june.body.result.structuredContent);
  assert.deepEqual(JSON.parse(june.body.result.content[0].text), june.body.result.structuredContent);
  const old = await post(env, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bill', arguments: { id: 'B563/2026' } } });
  assert.equal(old.body.result.structuredContent, undefined);
  assert.equal(JSON.parse(old.body.result.content[0].text).id, 'B563/2026');
});

// ─── Căutarea după număr ─────────────────────────────────────────────────────────────────────────────────────────

test('get_bill găsește proiectul după orice formă a numărului, slug sau adresă', async () => {
  const env = makeEnv();
  const forms = {
    'PL-x 110/2026': 'PL-x 110/2026',
    'PL-x nr. 110/2026': 'PL-x 110/2026',
    'Pl‑x 110 / 2026': 'PL-x 110/2026',
    'plx-110-2026': 'PL-x 110/2026',
    'B563/2026': 'B563/2026',
    'b563-2026': 'B563/2026',
    'L630/22.12.2025': 'B563/2026',
    'L630/2025': 'B563/2026',
    'Pl-x 755/2026': 'B604/2026',
    'https://destraja.ro/legi/b563-2026': 'B563/2026',
    'https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=23667': 'B604/2026',
    'https://www.senat.ro/Legis/Lista.aspx?cod=28041&pos=0&NR=b604&AN=2026': 'B604/2026',
    '563/2026': 'B563/2026',
  };
  for (const [id, want] of Object.entries(forms)) assert.equal(data(await call(env, 'get_bill', { id })).id, want, id);
});

test('get_bill: necunoscut, chei din prototip și numere ambigue dau erori de unealtă, nu crash', async () => {
  const env = makeEnv();
  for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'B9999/2026']) assert.match(toolError(await call(env, 'get_bill', { id })), /Nu găsesc/, id);
  assert.match(toolError(await call(env, 'get_bill', { id: 'BP692/2026' })), /B528\/2026.*B635\/2026/);
  assert.match(toolError(await call(env, 'get_bill', { id: 'https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=23523' })), /B528\/2026.*B635\/2026/, 'și după idp');
  assert.match(toolError(await call(env, 'get_bill', { id: 'https://exemplu.ro/x' })), /Adresa/);
});

test('get_bill: overview, analysis și submission; termenele trecute dispar la cerere', async () => {
  const env = makeEnv();
  const o = data(await call(env, 'get_bill', { id: 'PL-x 110/2026' }));
  assert.deepEqual(o.deadlines.map((d) => d.type), ['amendments'], 'ședința de ieri nu mai apare');
  assert.equal(o.analysis.models[0].key_findings_count, 2);
  assert.equal(o.analysis.models_completed, 2);
  assert.ok(o.built_at && o.licence && o.note);
  const a = data(await call(env, 'get_bill', { id: 'B563/2026', section: 'analysis' }));
  assert.deepEqual(a.analysis.models[0].key_findings, ['a', 'b']);
  const s = data(await call(env, 'get_bill', { id: 'B563/2026', section: 'submission' }));
  const g = data(await call(env, 'get_submission_context', { id: 'B563/2026' }));
  assert.deepEqual(s, g);
  assert.equal(g.submission_window.status, 'open');
  assert.equal(g.recipients[0].email, 'com.juridica@senat.ro');
  assert.match(g.safety, /nimic nu se trimite automat/);
  const late = data(await call(env, 'get_submission_context', { id: 'B700/2026' }));
  assert.equal(late.submission_window.status, 'closed', 'consultarea încheiată după build apare închisă');
  assert.equal(late.submission_window.channel_url, null);
  assert.equal(late.phase, 'committees');
  assert.match(late.status, /s-a încheiat/);
  assert.match(late.how, /s-a încheiat/);
  const lateBill = data(await call(env, 'get_bill', { id: 'B700/2026' }));
  assert.match(lateBill.status.title, /s-a încheiat/);
  const lateList = data(await call(env, 'list_bills', { chamber: 'senat' })).results.find((r) => r.id === 'B700/2026');
  assert.match(lateList.status, /s-a încheiat/, 'și în listă');
});

// ─── list_bills: în dezbatere, filtre, cursor ───────────────────────────────────────────────────────────────────

test('list_bills: implicit doar în dezbatere; filtre după camera de acum, consultare, felul termenului', async () => {
  const env = makeEnv();
  const all = data(await call(env, 'list_bills', {}));
  assert.ok(!all.results.some((r) => r.id === 'B599/2026'), 'retrasul nu e în dezbatere');
  assert.equal(all.total, BILLS.filter((b) => b.in_debate).length);
  assert.equal(all.results[0].id, 'B604/2026', 'termenul cel mai apropiat întâi');
  assert.equal(data(await call(env, 'list_bills', { in_debate: false })).total, BILLS.length);
  assert.deepEqual(data(await call(env, 'list_bills', { chamber: 'senat' })).results.map((r) => r.id).sort(), ['B528/2026', 'B563/2026', 'B635/2026', 'B700/2026']);
  assert.deepEqual(data(await call(env, 'list_bills', { open_consultation: true })).results.map((r) => r.id), ['B563/2026']);
  assert.deepEqual(data(await call(env, 'list_bills', { deadline_type: 'public_consultation', deadline_within_days: 7 })).results.map((r) => r.id), ['B563/2026']);
  assert.deepEqual(data(await call(env, 'list_bills', { deadline_within_days: 1 })).results.map((r) => r.id), ['B604/2026']);
  assert.equal(data(await call(env, 'list_bills', { risk: 'red' })).total, 1);
});

test('list_bills: cursorul e legat de filtre', async () => {
  const env = makeEnv();
  const p1 = data(await call(env, 'list_bills', { limit: 2 }));
  assert.equal(p1.results.length, 2);
  assert.ok(p1.next_cursor);
  const p2 = data(await call(env, 'list_bills', { limit: 2, cursor: p1.next_cursor }));
  assert.ok(!p2.results.some((r) => p1.results.some((x) => x.id === r.id)));
  assert.match(toolError(await call(env, 'list_bills', { limit: 2, cursor: p1.next_cursor, risk: 'red' })), /Cursorul nu mai e valabil/);
});

// ─── search_bills ────────────────────────────────────────────────────────────────────────────────────────────────

test('search_bills: numărul se rezolvă local, fără căutarea după sens', async () => {
  const env = makeEnv();
  stubSearch(() => assert.fail('nu trebuie chemată căutarea după sens'));
  try {
    const r = data(await call(env, 'search_bills', { query: 'PL-x nr. 110/2026' }));
    assert.equal(r.mode, 'number');
    assert.equal(r.results[0].id, 'PL-x 110/2026');
    const none = data(await call(env, 'search_bills', { query: 'B9999/2026' }));
    assert.equal(none.exact_not_found, true);
    assert.equal(none.results.length, 0);
    assert.equal(data(await call(env, 'search_bills', { query: 'BP692/2026' })).results.length, 2, 'un număr ambiguu dă toți candidații');
  } finally {
    restoreFetch();
  }
});

test('search_bills: după sens, cu dosarul comun pentru slug-ul Camerei și pasajul tăiat', async () => {
  const env = makeEnv();
  let asked;
  stubSearch((url) => {
    asked = new URL(url);
    return Response.json({
      results: [
        { slug: 'plx-755-2026', match: { text: 'Primul pasaj.', where: 'Forma inițiatorului · Art. I' } },
        { slug: 'b604-2026', match: null },
        { slug: 'plx-9999-2019', match: null },
        { slug: 'b563-2026', match: { text: `${'Cuvânt lung. '.repeat(60)}`, where: 'Expunerea de motive · partea 2' } },
      ],
    });
  });
  try {
    const r = data(await call(env, 'search_bills', { query: 'incompatibilități consilieri', limit: 5 }));
    assert.equal(asked.searchParams.get('q'), 'incompatibilități consilieri');
    assert.equal(r.mode, 'semantic');
    assert.equal(r.degraded, false);
    assert.deepEqual(r.results.map((x) => x.id), ['B604/2026', 'B563/2026']);
    assert.equal(r.results[0].passage_source, 'Forma inițiatorului · Art. I');
    assert.equal(r.results[1].passage_truncated, true);
    assert.ok(r.results[1].passage.length <= 402);
    assert.equal(r.unmatched_hits, 1);
  } finally {
    restoreFetch();
  }
});

test('search_bills: căutarea după sens căzută, lentă, limitată sau ciudată → titluri, cu degraded', async () => {
  const cases = [
    ['down', () => Promise.reject(new TypeError('fetch failed'))],
    ['timeout', () => Promise.reject(new DOMException('timeout', 'TimeoutError'))],
    ['limit', () => new Response('{}', { status: 429 })],
    ['bad', () => Response.json({ nimic: true })],
    ['null hit', () => Response.json({ results: [null] })],
    ['bad slug', () => Response.json({ results: [{ slug: '../../etc', match: null }] })],
    ['unmatched', () => Response.json({ results: [{ slug: 'plx-1-1999', match: null }] })],
    ['500', () => new Response('x', { status: 500 })],
  ];
  for (const [label, fn] of cases) {
    stubSearch(fn);
    try {
      const r = data(await call(makeEnv(), 'search_bills', { query: 'chirii pentru tineri' }));
      assert.equal(r.mode, 'titles', label);
      assert.equal(r.degraded, true, label);
      assert.ok(r.degraded_reason, label);
      assert.equal(r.results[0]?.id, 'PL-x 110/2026', label);
    } finally {
      restoreFetch();
    }
  }
  const env = makeEnv({ searchLimit: false });
  stubSearch(() => assert.fail('peste limită nu se cheamă căutarea'));
  try {
    const r = data(await call(env, 'search_bills', { query: 'chirii pentru tineri' }));
    assert.equal(r.mode, 'titles');
  } finally {
    restoreFetch();
  }
});

test('datele care nu se pot citi dau o eroare de unealtă, nu „niciun rezultat”', async () => {
  _resetCache();
  try {
    const env = makeEnv({ files: new Map() });
    assert.match(toolError(await call(env, 'list_bills', {})), /nu se pot citi/);
    assert.match(toolError(await call(env, 'get_bill', { id: 'B563/2026' })), /nu se pot citi/);
    _resetCache();
    const html = makeEnv();
    html.ASSETS.fetch = async () => new Response('<html>eroare</html>', { status: 200 });
    assert.match(toolError(await call(html, 'list_bills', {})), /nu se pot citi/, 'un JSON stricat e tot date indisponibile');
  } finally {
    _resetCache();
  }
});
