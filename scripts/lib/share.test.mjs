import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARE_TEXT_MAX, shareMessage, shareUrl, whatsappHref } from '../../src/lib/share.ts';

const TODAY = '2026-11-26';
const full = {
  title: 'Vânătoare tot anul la ciori și grauri',
  number: 'PL-x 17/2026',
  url: 'https://destraja.ro/camera/plx-17-2026',
  risk: { level: 'red', score: 7 },
  canAct: true,
};

test('analiză completă: titlul, numărul, nivelul și scorul, după trei modele, apoi linkul', () => {
  const m = shareMessage(full, TODAY);
  assert.equal(
    m.text,
    'Vânătoare tot anul la ciori și grauri (PL-x 17/2026): risc ridicat, 7/10, după analiza a trei modele AI. Vezi ce schimbă și cum trimiți o opinie:',
  );
  assert.equal(m.url, 'https://destraja.ro/camera/plx-17-2026?utm_source=share');
  assert.equal(m.full, `${m.text} ${m.url}`);
  // Scorul cu virgulă, ca pe pagină; nivelul moderat; fără „cum trimiți” când pagina n-are unde.
  const y = shareMessage({ ...full, risk: { level: 'yellow', score: 5.25 }, canAct: false }, TODAY);
  assert.match(y.text, /: risc moderat, 5,3\/10, după analiza a trei modele AI\. Vezi ce schimbă:$/);
});

test('fără analiză: titlul, numărul și stadiul, fără niciun scor', () => {
  const m = shareMessage(
    {
      title: 'Proiect de Lege privind aprobarea Ordonanței de urgență a Guvernului nr.133/2024 pentru asigurarea unor împrumuturi din Trezoreria Statului',
      number: 'PL-x 10/2025',
      url: 'https://destraja.ro/camera/plx-10-2025',
      risk: null,
      stage: 'Raportul comisiei e gata',
    },
    TODAY,
  );
  assert.equal(
    m.text,
    'Proiect de Lege privind aprobarea Ordonanței de urgență a Guvernului nr.133/2024 pentru asigurarea unor împrumuturi din Trezoreria Statului (PL-x 10/2025). Stadiul: raportul comisiei e gata. Vezi unde a ajuns:',
  );
  assert.doesNotMatch(m.text, /risc|\/10|modele/);
});

test('consultare deschisă: data de final, socotită în ziua trimiterii', () => {
  const input = { ...full, title: 'Primăriile vor putea refuza mai ușor cererile de informații publice', number: 'B660/2026', consultationEnd: '2026-12-24', canAct: true };
  const m = shareMessage(input, TODAY);
  assert.match(m.text, /după analiza a trei modele AI\. Consultarea publică e deschisă până pe 24 decembrie\. Vezi ce schimbă și cum trimiți o opinie:$/);
  // Ultima zi încă e deschisă; a doua zi, propoziția dispare.
  assert.match(shareMessage(input, '2026-12-24').text, /deschisă până pe 24 decembrie/);
  assert.doesNotMatch(shareMessage(input, '2026-12-25').text, /Consultarea/);
  // Peste an, cu anul.
  assert.match(shareMessage({ ...input, consultationEnd: '2027-01-08' }, TODAY).text, /până pe 8 ianuarie 2027\./);
});

test('analiză de refăcut: fără nivel și fără scor, cu nota că se reface', () => {
  const m = shareMessage({ ...full, stale: true }, TODAY);
  assert.equal(
    m.text,
    'Vânătoare tot anul la ciori și grauri (PL-x 17/2026). Analiza celor trei modele AI se reface după schimbări recente. Vezi ce schimbă și cum trimiți o opinie:',
  );
  assert.doesNotMatch(m.text, /risc|7\/10/);
});

test('un titlu lung e scurtat la cuvânt, ca mesajul să rămână sub 280 de caractere înainte de link', () => {
  const title = Array.from({ length: 60 }, (_, i) => `cuvânt${i}`).join(' ');
  const m = shareMessage({ ...full, title, consultationEnd: '2026-12-24' }, TODAY);
  assert.ok(m.text.length <= SHARE_TEXT_MAX, `${m.text.length}`);
  assert.match(m.text, /^cuvânt0 .*cuvânt\d+… \(PL-x 17\/2026\): risc ridicat/);
});

test('linkurile: eticheta share și textul WhatsApp codat', () => {
  assert.equal(shareUrl('https://destraja.ro/legi/b660-2026'), 'https://destraja.ro/legi/b660-2026?utm_source=share');
  assert.equal(whatsappHref('a b: ș https://x.ro/?utm_source=share'), 'https://wa.me/?text=a%20b%3A%20%C8%99%20https%3A%2F%2Fx.ro%2F%3Futm_source%3Dshare');
});
