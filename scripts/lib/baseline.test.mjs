// Cazurile din textele reale pe care citirea actelor modificate le rata sau le citea greșit (scripts/lib/baseline.mjs).
// Fără rețea: node --test scripts/lib/
import test from 'node:test';
import assert from 'node:assert/strict';
import { amendedArticles, baselinePrompt, BASELINE_METHOD, cutArticle, shortTitle, touchedParagraphs } from './baseline.mjs';
import { parseConsolidatedArticles } from './legislatie.mjs';

// Actul, articolele modificate, cele noi și motivele instrucțiunilor fără articol, pe scurt.
const read = (text) =>
  amendedArticles(text).map((a) => ({
    act: `${a.tipAct} ${a.numar}/${a.an}`,
    ...(a.repealed && { repealed: true }),
    amended: a.articles.filter((x) => x.status === 'amended').map((x) => x.num),
    new: a.articles.filter((x) => x.status === 'new').map((x) => x.num),
    unresolved: a.unresolved.map((u) => u.reason),
  }));

test('textul nou citat pe rândul instrucțiunii nu dă articole modificate (B629/2026)', () => {
  const text = `Art. I. – Ordonanța de urgență a Guvernului nr. 80/2013 privind taxele judiciare de timbru, cu modificările ulterioare, se modifică după cum urmează:
3. După articolul 40 se introduce un nou articol, articolul 40¹, cu următorul cuprins: „Art. 40¹. – (1) Prin derogare de la prevederile art. 8 alin. (2) din Legea nr. 500/2002 și de la prevederile art. 30 alin. (2)
(2) Prevederile art. 45 se aplică în mod corespunzător.”
4. La articolul 41, alineatul (1) se modifică și va avea următorul cuprins:`;
  assert.deepEqual(read(text), [{ act: 'ORDONANȚĂ DE URGENȚĂ 80/2013', amended: ['41'], new: ['40^1'], unresolved: [] }]);
});

test('punctele și „se modifică” din textul nou citat nu sunt instrucțiuni (PL-x 530/2026)', () => {
  const text = `Art. I. - Legea nr. 144/2007 privind Agenția Națională de Integritate, cu modificările ulterioare, se modifică după cum urmează:
1. Articolul 13 se modifică și va avea următorul cuprins:
„Art. 13. - (1) Agenția Națională de Integritate este autoritate administrativă autonomă.
b) exercită, pentru cel mult 60 de zile, calitatea de ordonator; în această perioadă nu poate:
1. modifica structura organizatorică a Agenției;
2. Contractul de management se modifică prin act adițional, potrivit art. 7;
e) îndeplinește alte atribuții."
2. La articolul 18, după alineatul (3) se introduce un nou alineat, alin. (3¹), cu următorul cuprins:`;
  assert.deepEqual(read(text), [{ act: 'LEGE 144/2007', amended: ['13', '18'], new: [], unresolved: [] }]);
  // Ghilimelele de închidere pierdute la scanare: următoarea instrucțiune („3. La articolul 20…”) tot se citește.
  const lost = `${text}
„(3¹) Activitatea inspectorilor constituie vechime în specialitate juridică.
3. La articolul 20, alineatul (2) se modifică și va avea următorul cuprins:`;
  assert.deepEqual(read(lost)[0].amended, ['13', '18', '20']);
});

test('ghilimelele din preambul nu ascund rândul de început (PL-x 367/2026)', () => {
  const text = `Luând în considerare faptul că indicatorul acestui jalon îl reprezintă: „Dispoziție legală care indică intrarea în vigoare
Guvernul României adoptă prezenta ordonanță de urgență:
Art. I. - Ordonanța de urgență a Guvernului nr. 57/2007 privind regimul ariilor naturale protejate, aprobată cu modificări și completări prin Legea nr. 49/2011, se modifică și se completează după cum urmează:
1. La articolul 4, după punctul 40 se introduc două puncte noi, pct. 41 și 42, cu următorul cuprins:`;
  assert.deepEqual(read(text), [{ act: 'ORDONANȚĂ DE URGENȚĂ 57/2007', amended: ['4'], new: [], unresolved: [] }]);
});

test('actul scris fără „nr.”, cu „nr. nr.”, fără „a Guvernului” sau cu greșeli de scanare', () => {
  const header = (act) => `Art. I – ${act} privind ceva, publicată în Monitorul Oficial, se modifică după cum urmează:\n1. La articolul 2, litera c) se modifică și va avea următorul cuprins:`;
  const act = (s) => read(header(s))[0]?.act;
  assert.equal(act('Legea 200/2006'), 'LEGE 200/2006');
  assert.equal(act('Legea nr. nr. 227/2015'), 'LEGE 227/2015');
  assert.equal(act('Legea nr 51/1995'), 'LEGE 51/1995');
  assert.equal(act('Ordonanța de urgență nr. 57/2019'), 'ORDONANȚĂ DE URGENȚĂ 57/2019');
  assert.equal(act('Ordonanța nr. 2/2001'), 'ORDONANȚĂ 2/2001');
  assert.equal(act('Ordonanță de urgență nr. 195/2002'), 'ORDONANȚĂ DE URGENȚĂ 195/2002');
  assert.equal(act('Ordonanța de urgență a Guvermului nr. 28/1999'), 'ORDONANȚĂ DE URGENȚĂ 28/1999');
  assert.equal(act('ORDONANȚA DE URGENȚĂ nr. 13 din 6 martie 2013'), 'ORDONANȚĂ DE URGENȚĂ 13/2013');
  // Fără „nr.”, doar cu bară: un număr fără an nu e un act.
  assert.equal(act('Legea educației 2011'), undefined);
});

test('„cum urmează” fără „după” și „ćum” deschid modificările (PL-x 104/2026, Pl-x 96/2026)', () => {
  const t1 = `Art.I.- Ordonanța de urgență a Guvernului nr.155/2001 privind câinii fără stăpân, se completează cum urmează:\n1. La articolul 7, după alineatul (2) se introduce un nou alineat:`;
  const t2 = `Articol unic. - Ordonanța de urgență a Guvernului nr. 57/2019 privind Codul administrativ, se completează după ćum urmează:\n1. La articolul 240, după alineatul (2) se introduce un nou alineat:`;
  assert.deepEqual(read(t1)[0].amended, ['7']);
  assert.deepEqual(read(t2)[0].amended, ['240']);
});

test('rândul de început rupt în două la scanare (PL-x 504/2025)', () => {
  const text = `Art. I. – Articolul 1 din Ordonanța de urgență a Guvernului nr. 25/2025 pentru împrumuturi din Trezorerie, publicată în Monitorul
Oficial al României, Partea I, nr.343 din 16 aprilie 2025, se modifică și se completează după cum urmează:
1. La alineatul (1), partea introductivă se modifică și va avea următorul cuprins:`;
  assert.deepEqual(read(text), [{ act: 'ORDONANȚĂ DE URGENȚĂ 25/2025', amended: ['1'], new: [], unresolved: [] }]);
});

test('rândul rupt chiar după „nr.”: actul e cel de pe primul rând, nu legea de aprobare (PL-x 171/2026)', () => {
  const text = `Art. I - Ordonanța de urgență a Guvernului nr. 85/2024 privind reorganizarea Ministerului Agriculturii, precum și pentru modificarea Ordonanței Guvernului nr.
12/2024 privind o schemă de ajutor de stat, publicată în Monitorul Oficial, aprobată cu modificări prin Legea nr. 314/2024, se modifică și se completează după cum urmează:
1. Articolul 4 se modifică și va avea următorul cuprins:`;
  assert.deepEqual(read(text), [{ act: 'ORDONANȚĂ DE URGENȚĂ 85/2024', amended: ['4'], new: [], unresolved: [] }]);
  // Rupt după „publicată în Mo”, cu legea de aprobare pe rândul al doilea (PL-x 78/2026).
  const t2 = `Art. III. – Ordonanța de urgență a Guvernului nr. 49/2023 privind consolidarea spitalelor, publicată în Mo
României, Partea I, nr. 468 din 26 mai 2023, aprobată prin Legea nr. 55/2024, cu modificările ulterioare, se modifică și se completează după cum urmează:
2. La articolul 11, după alineatul (2) se introduce un nou alineat, alin. (2^1), cu următorul cuprins:`;
  assert.deepEqual(read(t2), [{ act: 'ORDONANȚĂ DE URGENȚĂ 49/2023', amended: ['11'], new: [], unresolved: [] }]);
});

test('un titlu deasupra rândului de început nu se lipește de el (Pl-x 481/2026)', () => {
  const text = `Art. 25 - Modificarea Ordonanței Guvernului nr.2/2001
La data desființării, articolul 18 din Ordonanța Guvernului nr.2/2001 privind regimul juridic al contravențiilor se modifică și va avea următorul cuprins:
„Art.18 – Contravenientul este obligat să prezinte actul de identitate.”`;
  assert.deepEqual(read(text), [{ act: 'ORDONANȚĂ 2/2001', amended: ['18'], new: [], unresolved: [] }]);
});

test('puncte fără spațiu, nenumerotate sau începute cu „La Titlul…” (Pl-x 701, PL-x 317, PL-x 117/2026)', () => {
  const text = `Art. I – Legea nr. 227/2015 privind Codul fiscal se modifică și se completează după cum urmează:
1.După articolul 399 se introduce articolul 399¹:
„Art. 399¹ (1) Motorina agricolă beneficiază de scutire.”
Articolul 401 se modifică și va avea următorul cuprins:
„Art. 401. – Text nou.”
La Titlul IV – Impozitul pe venit, după articolul 60 se introduce un nou articol, articolul 60¹, cu următorul cuprins:`;
  assert.deepEqual(read(text), [{ act: 'LEGE 227/2015', amended: ['401'], new: ['399^1', '60^1'], unresolved: [] }]);
});

test('„se completează după articolul 47, cu un nou articol” și „art 183” fără punct', () => {
  const text = `Articol unic - Ordonanța Guvernului nr. 26/2000 privind asociațiile și fundațiile, se modifică și se completează după cum urmează:
1. La Capitolul VII – Veniturile, se completează după articolul 47, cu un nou articol, articolul 47¹, cu următorul cuprins:
2. Alin (5) al art 183 se modifică și va avea următorul cuprins:`;
  assert.deepEqual(read(text), [{ act: 'ORDONANȚĂ 26/2000', amended: ['183'], new: ['47^1'], unresolved: [] }]);
});

test('articolele cu cifre romane ale actelor de modificare (Pl-x 549/2026, PL-x 41/2026)', () => {
  const t1 = `Art. I – Articolul III din Legea nr. 141/2025 privind unele măsuri fiscal-bugetare, cu modificările ulterioare, se modifică și se completează după cum urmează:
1. La alineatul (1), partea introductivă și litera b) se modifică și vor avea următorul cuprins:`;
  assert.deepEqual(read(t1), [{ act: 'LEGE 141/2025', amended: ['iii'], new: [], unresolved: [] }]);
  // Articolul 456 e al Codului fiscal, modificat de art. XII; actul modificat aici e Legea nr. 239/2025, deci art. XII.
  const t2 = `Art. V – Legea nr. 239/2025 privind unele măsuri, se modifică după cum urmează:
2. La articolul XII punctul 24, la articolul 456 alineatul (2), după litera s) se introduce o nouă literă, lit. ș), cu următorul cuprins:`;
  assert.deepEqual(read(t2), [{ act: 'LEGE 239/2025', amended: ['xii'], new: [], unresolved: [] }]);
});

test('legea de aprobare: „Se aprobă Ordonanța … cu următoarea modificare” (PL-x 114/2026)', () => {
  const text = `Articol unic.- Se aprobă Ordonanța Guvernului nr.4 din 30 ianuarie 2026 pentru modificarea Legii nr. 182/2000, publicată în Monitorul Oficial, cu următoarea modificare:
- La articolul I punctul 1, alineatul (4) al articolului 23 va avea următorul cuprins:`;
  assert.deepEqual(read(text), [{ act: 'ORDONANȚĂ 4/2026', amended: ['i'], new: [], unresolved: [] }]);
  const unic = `Articol unic. – Se aprobă Ordonanța de urgență a Guvernului nr. 22 din 31 martie 2026 privind unele măsuri, cu următoarele modificări:
2. La articolul unic punctul 2, articolul 8 va avea următorul cuprins:`;
  assert.deepEqual(read(unic), [{ act: 'ORDONANȚĂ DE URGENȚĂ 22/2026', amended: ['unic'], new: [], unresolved: [] }]);
});

test('anexele și capitolele rămân explicit fără articol; „Articol unic” între rânduri nu lasă o instrucțiune pierdută', () => {
  const t1 = `Art. I – Legea-cadru nr. 153/2017 privind salarizarea, se modifică după cum urmează:
1. La anexa nr. I, capitolul I, articolul 5 se modifică și va avea următorul cuprins:
2. Titlul capitolului II se modifică și va avea următorul cuprins:`;
  assert.deepEqual(read(t1), [{ act: 'LEGE 153/2017', amended: [], new: [], unresolved: ['anexă', 'nu e un articol (titlu, capitol, secțiune, mențiunea de transpunere)'] }]);
  const t2 = `Legea învățământului preuniversitar nr. 198/2023, publicată în Monitorul Oficial, se modifică și se completează după cum urmează:
Articol unic
La articolul 24 din Legea învățământului preuniversitar nr. 198/2023, alineatul (3) se modifică și va avea următorul cuprins:
„(3) Învățământul gimnazial se organizează cu program de dimineață.”`;
  assert.deepEqual(read(t2), [{ act: 'LEGE 198/2023', amended: ['24'], new: [], unresolved: [] }]);
});

test('o lege nouă, fără modificări ale altor acte, nu are acte (B523/2026)', () => {
  const text = `PROIECT DE LEGE pentru declararea anului 2027 drept „Anul cultural Ion Voicu”
Art. 1 Se declară anul 2027 drept „Anul cultural Ion Voicu”.
Art. 2 (1) Măsurile se realizează cu respectarea Legii nr. 422/2001 privind protejarea monumentelor istorice, cu modificările și completările ulterioare.`;
  assert.deepEqual(read(text), []);
});

test('portalul: „Articolul III” al unei legi de modificare are numărul „iii”', () => {
  const html = `<span class="S_ART"><span class="S_ART_TTL">Articolul III</span><span class="S_ART_BDY" style="display:block">Textul.</span></span>`;
  assert.deepEqual(parseConsolidatedArticles(html).map((a) => a.num), ['iii']);
  // Articolul roman care introduce alte articole: eticheta e doar primul titlu (OUG nr. 89/2025).
  const nested = `<span class="S_ART"><span class="S_ART_TTL">Articolul I</span><span class="S_ART_BDY" style="display:block">Codul se modifică:<span class="S_ART"><span class="S_ART_TTL">Articolul 359</span>Text.</span></span></span>` +
    `<span class="S_ART"><span class="S_ART_TTL">Articolul V^1</span><span class="S_ART_BDY">Altul.</span></span>`;
  assert.deepEqual(parseConsolidatedArticles(nested).map((a) => [a.num, a.label]), [['i', 'Articolul I'], ['v^1', 'Articolul V^1']]);
  const unic = `<span class="S_ART"><span class="S_ART_TTL">ARTICOL UNIC</span><span class="S_ART_BDY">Se aprobă.</span></span>`;
  assert.deepEqual(parseConsolidatedArticles(unic).map((a) => a.num), ['unic']);
});

test('secțiunea din prompt: articolele găsite, cele noi, limita și nicio secțiune fără acte', () => {
  const baseline = {
    method: BASELINE_METHOD,
    form: 'initiator',
    textHash: 'x',
    fetchedAt: '2026-11-19T08:00:00Z',
    acts: [
      {
        reference: 'Legea nr. 51/1995',
        status: 'found',
        title: 'LEGE nr. 51 din 7 iunie 1995 pentru organizarea profesiei de avocat EMITENT: PARLAMENTUL',
        url: 'https://legislatie.just.ro/Public/DetaliiDocument/6036',
        fetchedAt: '2026-11-19T08:00:00Z',
        articles: [
          { num: '3', status: 'found', label: 'Articolul 3', text: 'Articolul 3\n(1) Activitatea avocatului.', notes: [] },
          { num: '3^1', status: 'new' },
          { num: '28', status: 'found', label: 'Articolul 28', text: `Articolul 28\n${'x'.repeat(5000)}`, notes: [] },
        ],
      },
      { reference: 'Legea nr. 9/1991', status: 'not-found', reason: 'actul nu apare în căutarea portalului', articles: [] },
    ],
  };
  const { text, meta } = baselinePrompt(baseline, '/tmp/b.json');
  assert.match(text, /^TEXTUL ÎN VIGOARE AL ARTICOLELOR MODIFICATE, de pe legislatie\.just\.ro, cu caracter informativ:/);
  assert.match(text, /=== Legea nr\. 51\/1995 \(LEGE nr\. 51 din 7 iunie 1995 pentru organizarea profesiei de avocat\), forma consolidată/);
  assert.match(text, /--- Articolul 3, în vigoare:\n\(1\) Activitatea avocatului\./);
  assert.match(text, /--- Art\. 3\^1: articol nou/);
  assert.match(text, /Legea nr\. 9\/1991: actul nu a fost găsit/);
  assert.equal(meta.articlesShown, 2);
  assert.equal(meta.truncated, false);
  const small = baselinePrompt(baseline, '/tmp/b.json', { max: 2000 });
  assert.equal(small.meta.truncated, true);
  assert.equal(small.meta.articlesShown, 1);
  assert.match(small.text, /NU AU ÎNCĂPUT: încă 1 articole/);
  assert.equal(baselinePrompt({ ...baseline, acts: [] }, '/tmp/b.json').text, null);
});

test('lista de articole după „și” și abrogarea unui act întreg pe același rând (PL-x 485/2025)', () => {
  const text = `Art.30.

La data intrării în vigoare a prezentei legi, art.10 alin.(4) și 17¹ din Ordonanța de urgență a Guvernului nr.30/2007 privind organizarea și funcționarea Ministerului Afacerilor Interne, publicată în Monitorul Oficial al României, Partea I, nr.309 din 9 mai 2007, aprobată cu modificări prin Legea nr.15/2008 și Ordonanța de urgență a Guvernului nr.120/2005 privind operaționalizarea Direcției generale anticorupție din cadrul Ministerului Afacerilor Interne, publicată în Monitorul Oficial al României, Partea I, nr.809 din 6 septembrie 2005, aprobată cu modificări prin Legea nr.383/2005, se abrogă.`;
  assert.deepEqual(read(text), [
    { act: 'ORDONANȚĂ DE URGENȚĂ 30/2007', amended: ['10', '17^1'], new: [], unresolved: [] },
    { act: 'ORDONANȚĂ DE URGENȚĂ 120/2005', repealed: true, amended: [], new: [], unresolved: [] },
  ]);
  // Alineatul (4) e ținut minte lângă art. 10; 17^1 se abrogă întreg.
  const [oug] = amendedArticles(text);
  assert.deepEqual(touchedParagraphs(oug.articles[0].instructions, '10'), ['4']);
  assert.equal(touchedParagraphs(oug.articles[1].instructions, '17^1'), null);
});

test('enumerări: „art. 5, 7 și 9¹”, „art. 3 alin. (2) și art. 4”, punctele nu sunt articole (Pl-x 187, Pl-x 218, Pl-x 594/2026)', () => {
  const text = `Art. I. – Legea nr. 303/2022 privind statutul judecătorilor și procurorilor se modifică după cum urmează:
1. Articolele 5, 7 și 9¹ se abrogă.
2. La articolul 3 alineatul (2) și articolul 4 se abrogă.
3. La articolul 12, punctele 3 și 4 se abrogă.
4. Art. 22^1 și 22^2, se modifică și vor avea următorul cuprins:
Art. II. – Ordonanța Guvernului nr. 8/2011 se modifică după cum urmează:
1. Articolele VII și VIII se abrogă.`;
  assert.deepEqual(read(text), [
    { act: 'LEGE 303/2022', amended: ['5', '7', '9^1', '3', '4', '12', '22^1', '22^2'], new: [], unresolved: [] },
    { act: 'ORDONANȚĂ 8/2011', amended: ['vii', 'viii'], new: [], unresolved: [] },
  ]);
});

test('abrogarea unui act întreg și ce nu e una (PL-x 461, PL-x 286, PL-x 523, PL-x 487/2026)', () => {
  // Abrogat în întregime: niciun articol numit, doar descrierea actului până la „se abrogă”.
  const whole = `Art. 7. – La data intrării în vigoare a prezentei legi, Legea nr. 9/1991 privind înființarea Institutului Român pentru Drepturile Omului, publicată în Monitorul Oficial al României, Partea I, nr. 24 din 30 ianuarie 1991, cu modificările și completările ulterioare, se abrogă.`;
  assert.deepEqual(read(whole), [{ act: 'LEGE 9/1991', repealed: true, amended: [], new: [], unresolved: [] }]);
  // Două acte legate prin „și”, după „cu modificările și completările ulterioare” (PL-x 487/2026).
  const two = `(2) La data intrării în vigoare a prezentei legi, Ordonanța de Urgență a Guvernului nr. 147/2022 privind înființarea Agenției Române pentru Investiții și Comerț Exterior, publicată în Monitorul Oficial al României, nr. 1048 din 28 octombrie 2022, cu modificările și completările ulterioare și Hotararea Guvernului nr. 153/2023 privind organizarea și funcționarea Agenției, publicată în Monitorul Oficial, se abrogă.`;
  assert.deepEqual(read(two).map((a) => [a.act, a.repealed]), [['ORDONANȚĂ DE URGENȚĂ 147/2022', true], ['HOTĂRÂRE 153/2023', true]]);
  // Legile de aprobare legate între ele nu sunt abrogate.
  const approvals = `Art. 5. – Ordonanța Guvernului nr. 2/2001 privind regimul juridic al contravențiilor, aprobată prin Legea nr. 180/2002 și Legea nr. 20/2009, se abrogă.`;
  assert.deepEqual(read(approvals).map((a) => [a.act, a.repealed]), [['ORDONANȚĂ 2/2001', true]]);
  // Un alt alineat între act și „se abrogă” (rânduri lipite, PL-x 286/2026): se abrogă altceva, nu Legea nr. 98/2016.
  const other = `Art. XXVII. - (1) În organizarea activității achizițiilor publice, potrivit Legii nr. 98/2016 privind achizițiile publice, instituțiile publice înființează un compartiment intern specializat. (2) La data intrării în vigoare a prezentei ordonanțe de urgență, se abrogă art. 2 alin. (1) din Normele metodologice.`;
  assert.deepEqual(read(other), [{ act: 'LEGE 98/2016', amended: [], new: [], unresolved: ['instrucțiunea nu numește un articol'] }]);
  // „Articolul VIII din Ordonanța…” e articolul ordonanței, nu al proiectului (PL-x 523/2026).
  const roman = `Articolul VIII din Ordonanța de urgență a Guvernului nr. 132/2024 pentru modificarea și completarea Legii nr. 227/2015 privind Codul fiscal, cu modificările și completările ulterioare, se abrogă.`;
  assert.deepEqual(read(roman), [{ act: 'ORDONANȚĂ DE URGENȚĂ 132/2024', amended: ['viii'], new: [], unresolved: [] }]);
  // O parte a actului nu e actul întreg.
  const chapter = `Art. 3. – Capitolul II din Legea nr. 51/1995 privind profesia de avocat se abrogă.`;
  assert.equal(read(chapter)[0].repealed, undefined);
});

test('alineatele atinse, din instrucțiuni', () => {
  assert.deepEqual(touchedParagraphs(['3. La articolul 8, alineatul (2) se modifică și va avea următorul cuprins:'], '8'), ['2']);
  assert.deepEqual(touchedParagraphs(['1. Alineatul (2) se modifică:', '2. După alineatul (3) se introduce un nou alineat, alin. (3^1), cu următorul cuprins:'], '183'), ['2', '3', '3^1']);
  assert.deepEqual(touchedParagraphs(['5. La articolul 4, alineatele (1) și (3) se abrogă.'], '4'), ['1', '3']);
  assert.equal(touchedParagraphs(['1. Articolul 13 se modifică și va avea următorul cuprins:'], '13'), null);
  assert.equal(touchedParagraphs(['2. La articolul 14, litera h) se abrogă.'], '14'), null);
});

test('articolul tăiat la margine de alineat, cu alineatele atinse întâi', () => {
  const art = ['(1) Primul alineat.', `(2) ${'a'.repeat(900)}`, `(3) ${'b'.repeat(900)}`, '(4) Alineatul modificat de proiect.', `(5) ${'c'.repeat(900)}`].join('\n');
  const plain = cutArticle(art, 1500);
  assert.match(plain, /^\(1\) Primul alineat\.\n\(2\) a+\n\[…\]\n\[ARTICOL PRESCURTAT: lipsesc \d+ de caractere/);
  assert.doesNotMatch(plain, /\(4\)/);
  const touched = cutArticle(art, 1500, ['4']);
  assert.match(touched, /\(4\) Alineatul modificat de proiect\./);
  assert.match(touched, /s-au păstrat întâi alineatele atinse de proiect: \(4\)/);
  // Ordinea din lege rămâne; ce lipsește e marcat.
  assert.ok(touched.indexOf('(1) Primul') < touched.indexOf('(4) Alineatul'));
  assert.match(touched, /\[…\]\n\(4\)/);
  assert.equal(cutArticle(art, 10_000), art);
});

test('omnibus: capul pe articol scade cu numărul articolelor, iar secțiunea rămâne sub 40.000 (Pl-x 530/2026)', () => {
  const paras = (n) => Array.from({ length: 8 }, (_, i) => `(${i + 1}) ${`Alineatul ${i + 1} al articolului ${n}. `.repeat(12)}`).join('\n');
  const articles = Array.from({ length: 20 }, (_, i) => ({
    num: String(i + 1),
    status: 'found',
    label: `Articolul ${i + 1}`,
    text: `Articolul ${i + 1}\n${paras(i + 1)}`,
    notes: [],
    instructions: [`${i + 1}. La articolul ${i + 1}, alineatul (7) se modifică și va avea următorul cuprins:`],
  }));
  const baseline = {
    method: BASELINE_METHOD,
    form: 'camera',
    textHash: 'x',
    acts: [{ reference: 'Legea nr. 176/2010', status: 'found', url: 'https://legislatie.just.ro/Public/DetaliiDocument/122147', articles }],
  };
  const { text, meta } = baselinePrompt(baseline, '/tmp/b.json');
  assert.ok(text.length <= 40_000, `${text.length}`);
  assert.equal(meta.articlesShown, 20);
  assert.ok(meta.articleCap >= 1500 && meta.articleCap < 8000, `${meta.articleCap}`);
  assert.equal(meta.articlesCut, 20);
  // Alineatul pe care îl modifică proiectul e păstrat la fiecare articol.
  for (let i = 1; i <= 20; i++) assert.ok(text.includes(`(7) Alineatul 7 al articolului ${i}.`), `art. ${i}`);
  // Cu 60 de articole nici 1.500 pe articol nu ajung: capul rămâne 1.500 și restul e numărat.
  const many = { ...baseline, acts: [{ ...baseline.acts[0], articles: [...articles, ...articles, ...articles].map((a, i) => ({ ...a, num: String(i + 1) })) }] };
  const big = baselinePrompt(many, '/tmp/b.json');
  assert.ok(big.text.length <= 40_000);
  assert.equal(big.meta.articleCap, 1500);
  assert.ok(big.meta.articlesShown > 13 && big.meta.articlesShown < 60);
  assert.match(big.text, /NU AU ÎNCĂPUT: încă \d+ articole/);
});

test('actul abrogat în întregime, în prompt: spus pe nume, cu textul doar dacă încape', () => {
  const baseline = {
    method: BASELINE_METHOD,
    form: 'senat',
    textHash: 'x',
    acts: [
      {
        reference: 'Ordonanța de urgență a Guvernului nr.120/2005',
        status: 'found',
        repealed: true,
        url: 'https://legislatie.just.ro/Public/DetaliiDocument/64869',
        actArticles: 2,
        actChars: 60,
        actText: [
          { num: '1', label: 'Articolul 1', text: 'Articolul 1\nSe operaționalizează Direcția.' },
          { num: '2', label: 'Articolul 2', text: 'Articolul 2\nDispoziții finale.' },
        ],
        articles: [],
      },
    ],
  };
  const { text, meta } = baselinePrompt(baseline, '/tmp/b.json');
  assert.match(text, /--- Proiectul abrogă actul în întregime \(2 articole\)\. Textul lui în vigoare:\nArticolul 1\nSe operaționalizează Direcția\.\nArticolul 2/);
  assert.equal(meta.actsRepealed, 1);
  const big = { ...baseline, acts: [{ ...baseline.acts[0], actChars: 90_000, actText: undefined }] };
  assert.match(baselinePrompt(big, '/tmp/b.json').text, /abrogă actul în întregime \(2 articole\)\. Textul lui \(90000 de caractere\) nu a încăput aici\./);
});

test('titlul de pe portal fără emitent, cu sau fără două puncte (B596/2026)', () => {
  assert.equal(
    shortTitle('LEGE nr. 165 din 10 iulie 2018 privind acordarea biletelor de valoare EMITENT Parlamentul PUBLICAT ÎN \n Monitorul Oficial nr. 599 din 13 iulie 2018'),
    'LEGE nr. 165 din 10 iulie 2018 privind acordarea biletelor de valoare',
  );
  assert.equal(shortTitle('LEGE nr. 51 din 7 iunie 1995 pentru organizarea profesiei de avocat EMITENT: PARLAMENTUL PUBLICAT ÎN: MONITORUL OFICIAL'), 'LEGE nr. 51 din 7 iunie 1995 pentru organizarea profesiei de avocat');
});
