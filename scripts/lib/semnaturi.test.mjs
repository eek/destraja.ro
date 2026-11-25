import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { linkSigners, partyKey, profileMandates, sheetSigners } from './semnaturi.mjs';
import { parseSheet } from './cdep.mjs';

const fixture = (p) => fs.readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8');

test('fișa Camerei: fiecare inițiator cu camera și legislatura din link (PL-x 10/2023, semnat în legislatura 2020)', () => {
  const html = fixture('cdep/plx-10-2023.html');
  const signers = sheetSigners(html);
  assert.ok(signers.length > 5);
  assert.ok(signers.every((s) => s.leg === 2020 && (s.cam === 1 || s.cam === 2)));
  assert.deepEqual(signers.find((s) => s.idm === 58 && s.cam === 2), { cam: 2, leg: 2020, idm: 58, nume: 'Calotă Florică Ică' });
  // parseSheet păstrează aceeași legislatură pe inițiatorii din data/cdep/proiecte.
  const { initiatori } = parseSheet(html);
  assert.equal(initiatori.length, signers.length);
  assert.ok(initiatori.every((i) => i.leg === 2020));
  assert.ok(parseSheet(fixture('cdep/plx-184-2026.html')).initiatori.every((i) => i.leg === 2024));
});

test('fișa deputatului: mandatele trecute, cu idm-ul fiecărei legislaturi; mandatul de acum n-are link', () => {
  assert.deepEqual(profileMandates(fixture('mps/cdep-idm-131-leg-2024.html')), ['2:2020:132', '2:2012:155']);
  assert.equal(profileMandates('<html>fără secțiune</html>'), null);
});

test('partidul, comparabil între fișe', () => {
  assert.equal(partyKey('neafiliati'), partyKey('Neafiliați'));
  assert.equal(partyKey('SOS RO'), 'sos');
  assert.equal(partyKey('Minoritati'), partyKey('Minorități'));
  assert.equal(partyKey(null), '');
});

const e = (name, cam, leg, idm, party = 'PSD') => ({ name, cam, leg, idm, party });

test('legislatura de acum: după nume, ca statisticile; aceeași persoană cu sau fără diacritice și cratime', () => {
  const [a, b, c] = linkSigners([e('Federovici Doina-Elena', 1, 2024, 39), e('Federovici Doina Elena', null, 2024, null), e('Pop Ana', 2, null, 7)]);
  assert.deepEqual(a, { person: 'federovici-doina-elena', why: 'curent' });
  assert.deepEqual(b, { person: 'federovici-doina-elena', why: 'curent' });
  assert.deepEqual(c, { person: 'pop-ana', why: 'curent' });
});

test('mandat trecut listat pe fișa deputatului: legat chiar dacă numele de atunci era altul', () => {
  const links = linkSigners([e('Ionescu Maria', 2, 2024, 131), e('Popescu Maria', 2, 2020, 132), e('Grindeanu Sorin-Mihai', 2, 2020, 999)], {
    '2:2024:131': ['2:2020:132'],
  });
  assert.deepEqual(links[1], { person: 'ionescu-maria', why: 'profil' });
  assert.deepEqual(links[2], { person: null, why: 'fost' });
});

test('omul are fișă cu mandatele, iar mandatul vechi cu același nume nu e pe ea: rămâne nelegat', () => {
  const links = linkSigners([e('Fifor Mihai-Viorel', 2, 2024, 106), e('Fifor Mihai-Viorel', 1, 2016, 54)], { '2:2024:106': ['2:2020:107'] });
  assert.deepEqual(links[1], { person: null, why: 'neconfirmat' });
});

test('fără fișă: numele identic leagă doar cu trei părți sau cu același partid', () => {
  const links = linkSigners([
    e('Stoica Ciprian-Titi', 1, 2024, 100, 'AUR'),
    e('Stoica Ciprian-Titi', 2, 2020, 275, 'AUR'),
    e('Lavric Sorin', 1, 2024, 60, 'AUR'),
    e('Lavric Sorin', 1, 2020, 68, 'AUR'),
    e('Gavrilă Anamaria', 2, 2024, 113, 'neafiliati'),
    e('Gavrilă Anamaria', 2, 2020, 112, 'AUR'),
  ]);
  assert.deepEqual(links[1], { person: 'stoica-ciprian-titi', why: 'nume' });
  assert.deepEqual(links[3], { person: 'lavric-sorin', why: 'nume' });
  assert.deepEqual(links[5], { person: null, why: 'incert' });
});

test('doi parlamentari cu același nume în aceeași legislatură trecută: niciunul nu e legat', () => {
  const links = linkSigners([e('Popa Ion', 2, 2024, 1), e('Popa Ion', 2, 2020, 10), e('Popa Ion', 2, 2020, 11)]);
  assert.deepEqual(links.slice(1), [
    { person: null, why: 'omonim' },
    { person: null, why: 'omonim' },
  ]);
});

test('legislatura lipsă se ia din aceeași cameră, același idm și același nume văzute pe altă fișă', () => {
  const links = linkSigners([e('Ionescu Dan', 2, 2024, 5), e('Vasile Ana Maria', 2, 2020, 33), e('Vasile Ana Maria', 2, null, 33)]);
  assert.deepEqual(links[2], { person: null, why: 'fost' });
  // Fără nicio altă fișă cu cheia ei, semnătura fără legislatură rămâne a legislaturii de acum, după nume.
  assert.deepEqual(linkSigners([e('Vasile Ana Maria', 2, null, 33)])[0], { person: 'vasile-ana-maria', why: 'curent' });
});

test('o cheie revendicată de fișele a doi oameni nu se leagă de niciunul', () => {
  const links = linkSigners([e('A B C', 2, 2024, 1), e('D E F', 2, 2024, 2), e('X Y Z', 2, 2020, 9)], {
    '2:2024:1': ['2:2020:9'],
    '2:2024:2': ['2:2020:9'],
  });
  assert.deepEqual(links[2], { person: null, why: 'ambiguu' });
});
