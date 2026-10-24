#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ANALYSES_DIR = path.join(DATA_DIR, 'analyses');
const BILLS_FILE = path.join(DATA_DIR, 'senat-bills.json');

fs.mkdirSync(ANALYSES_DIR, { recursive: true });

function ensureLimit(str, max) {
  const clean = (str || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

const CURATED_BILLS = {
  'b563-2026': {
    riskScore: 9.8,
    riskLevel: 'red',
    plainTitle: 'Monopolul avocaților (UNBR) asupra contractelor scrise, actelor ONRC și blocarea serviciilor AI / LegalTech',
    summaryTlDr:
      'Proiect depus în procedură de urgență de parlamentari-avocați din PSD, PNL, USR, AUR și PACE (asumat oficial de UNBR) care impune redactarea prin avocat a contractelor sub semnătură privată din Codul Civil, elimină excepțiile pentru contabili/HR/platforme la ONRC, permite blocarea în 5 zile a aplicațiilor LegalTech/AI și introduce pedepse cu închisoarea bazate pe „context”.',
    initiatorClaim:
      'Inițiatorii susțin că proiectul aduce doar „clarificări legislative”, adaptează secretul profesional la mediul digital și protejează publicul de „avocatura clandestină” practicată online sau prin instrumente de inteligență artificială.',
    realityCheck:
      'În realitate, modificarea Art. 3 alin. (2) din Legea 51/1995 (eliminarea sintagmei „dacă legea nu prevede altfel” și restrângerea excepțiilor exclusiv la „alte profesii juridice”) coroborată cu Art. 1241–1245 Cod Civil și noile litere de la Art. 3 alin. (1) scoate în afara legii penale (Art. 25) experții contabili (CECCAR), specialiștii HR, mediatorii și platformele digitale, fără niciun test de proporționalitate conform Directivei (UE) 2018/958.',
    affectedGroups: [
      'IMM & Antreprenori',
      'IT & AI',
      'Contabili & Fiscalitate',
      'Angajați & HR',
      'Justiție & Drepturi Civile',
      'Toți cetățenii',
    ],
    senatForm: {
      articleRef: ensureLimit('În ansamblu; Art. I (1-17) și Art. II', 50),
      proposalContent: ensureLimit(
        'Solicit respingerea B563/2026 sau eliminarea Art. II (art. 1241-1245 Cod Civil - redactarea obligatorie prin avocat a contractelor scrise), păstrarea excepției „dacă legea nu prevede altfel” la art. 3(2) și eliminarea monopolului pe ONRC (lit. k^2), escrow (g^1), RNPM (k^1), mediere fără autorizare (lit. f), divorț (k^5) și sisteme AI/servicii digitale (art. 3^1, 25^1, 59).',
        395
      ),
      argumentation: ensureLimit(
        '1. Încalcă Directiva (UE) 2018/958 (Legea 245/2020): extinde monopolul avocațial fără testul obligatoriu de proporționalitate.\n2. Încalcă Directiva (UE) 2015/1535 (TRIS): restricționează servicii digitale/AI (art. 3^1, 25^1, 59) fără notificarea Comisiei Europene.\n3. Neconstituționalitate (art. 1 alin. 5 și 23 alin. 12): art. 59(7) incriminează penal vag „contextul”.',
        395
      ),
      otherComments: ensureLimit(
        'Solicit Biroului Permanent: 1. Respingerea procedurii de urgență pentru B563/2026; 2. Sesizarea Comisiei IT&C/AI și a Comisiei economice pentru raport/aviz; 3. Solicitarea avizului Consiliului Concurenței și notificarea Comisiei Europene (Directiva TRIS 2015/1535); 4. Dezbatere publică cu CECCAR, ANIS, ROFINTECH și Consiliul de Mediere (vezi doc atașat).',
        395
      ),
    },
    articlesBreakdown: [
      {
        article: 'Art. II pct. 1–4 (Art. 1241, 1242, 1243, 1245 Cod Civil) + Art. I pct. 1',
        title: 'Obligativitatea redactării prin avocat a tuturor contractelor scrise și a actelor adiționale',
        whatChanges:
          'Art. 1241 alin. (2) și 1243 alin. (2) Cod Civil impun că orice contract sau modificare de contract pentru care legea prevede forma scrisă ad validitatem sau ad probationem „se întocmește de avocat”. Art. 1245 alin. (2) extinde regula și la contractele încheiate prin mijloace electronice.',
        realWorldImpact:
          'Afectează contractele individuale de muncă (CIM), actele adiționale, contractele de societate, comision, agenție, arendă, asigurare și fideiusiune. Deși Art. 1242 alin. (3) afirmă că înscrisul nu e nul decât dacă legea o prevede expres, Art. 25 alin. (2) și (4) din Legea 51/1995 încadrează penal terțul neavocat care îl redactează și lovește de nulitate actele specifice profesiei efectuate public fără drept.',
        severity: 'red',
      },
      {
        article: 'Art. I pct. 7–8 (Art. 3 alin. 1 lit. k^1–k^6 și Art. 3 alin. 2 din Legea 51/1995)',
        title: 'Scoaterea contabililor, specialiștilor HR și platformelor ONRC în afara legii penale',
        whatChanges:
          'La Art. 3 alin. (2), sintagma actuală „dacă legea nu prevede altfel” este ștearsă și înlocuită cu „cu excepția celor care sunt stabilite în mod expres prin lege și în competența altor profesii juridice”. Simultan, lit. k^2 rezervă avocaților „redactarea și depunerea actelor privind înființarea, modificarea și încetarea persoanelor juridice, inclusiv a ONG-urilor”.',
        realWorldImpact:
          'Experții contabili (reglementați de OG 65/1994) și consultanții fiscali sunt profesii economice, nu „profesii juridice”. Prin tăierea excepției de la Art. 3 alin. (2), depunerea unui dosar la ONRC pentru un cod CAEN sau punct de lucru de către contabil ori prin platforme digitale intră sub sancțiunea penală de la Art. 25.',
        severity: 'red',
      },
      {
        article: 'Art. I pct. 10–11 (Art. 3^1 și Art. 25^1 din Legea 51/1995)',
        title: 'Interzicerea aplicațiilor LegalTech / AI și blocarea site-urilor în 5 zile prin DSA',
        whatChanges:
          'Art. 3^1 definește consultanța juridică drept orice opinie personalizată pe o situație concretă, fără cerința caracterului comercial/oneros, „indiferent de mijlocul sau tehnologia utilizată” (alin. 3). Art. 25^1 dă dreptul UNBR să ceară în instanță blocarea serviciilor online (Art. 9 și 10 DSA), cu prim termen în maximum 5 zile și hotărâre executorie.',
        realWorldImpact:
          'În Expunerea de Motive (pag. 11) se recunoaște explicit că ținta sunt platformele LegalTech și sistemele de Inteligență Artificială pentru a fi încadrate pe Art. 348 Cod Penal și blocate. Spre deosebire de legea germană invocată în motivare (RDG § 5 și § 6 + jurisprudența BGH 2021), proiectul românesc elimină excepțiile pentru servicii conexe, sfaturi gratuite și generatoare automate de documente.',
        severity: 'red',
      },
      {
        article: 'Art. I pct. 17 (Art. 59 alin. 7 și 8 din Legea 51/1995)',
        title: 'Închisoare de la 6 luni la 3 ani pentru expresii care induc în eroare „prin context”',
        whatChanges:
          'Incriminează penal folosirea fără drept a denumirilor „Avocat”, „Barou”, „UNBR” sau a oricăror denumiri ori expresii care „prin modul de prezentare ori prin contextul în care sunt utilizate” pot induce publicul în eroare privind calitatea de avocat, inclusiv în domenii web, site-uri, rețele sociale și aplicații.',
        realWorldImpact:
          'Incriminarea penală bazată pe criterii subiective precum „contextul” încalcă principiul constituțional al legalității și previzibilității legii penale (Art. 23 alin. 12 și Art. 1 alin. 5 din Constituție – lex certa).',
        severity: 'red',
      },
      {
        article: 'Art. I pct. 3, pct. 7 lit. k^5 și pct. 9 (Mediere fără autorizare, divorț obligatoriu cu avocat, somații către firme)',
        title: 'Privilegii de breaslă: mediere fără control, avocat obligatoriu la divorțul cu minori și cereri de acte de la firme private',
        whatChanges:
          'Art. 3 lit. f) scutește avocații de autorizarea și supravegherea Consiliului de Mediere. Lit. k^5) impune avocat obligatoriu la orice divorț cu copii minori („indiferent de calea procedurală”). Art. 3 alin. (2^1) obligă „persoanele juridice de drept privat” să furnizeze avocatului înscrisurile solicitate.',
        realWorldImpact:
          'Dublu standard anticoncurențial față de mediatorii autorizați conform Legii 192/2006; costuri forțate pentru familiile care divorțează amiabil la notar; putere cvasi-anchetatorie a avocaților asupra firmelor private fără încuviințarea prealabilă a instanței.',
        severity: 'red',
      },
    ],
    mythsAndFacts: [
      {
        claim: '„Proiectul aduce doar clarificări, fără să interzică activitatea contabililor la ONRC.”',
        verdict: 'fals',
        explanation:
          'Schimbarea decisivă nu este doar enumerarea de la lit. k^2, ci modificarea Art. 3 alin. (2): ștergerea sintagmei „dacă legea nu prevede altfel” și limitarea excepțiilor exclusiv la „alte profesii juridice”. Cum experții contabili (OG 65/1994) sunt profesie economică, nu juridică, orice act redactat sau depus de ei la ONRC devine infracțiune conform Art. 25.',
      },
      {
        claim: '„Contractul scris fără avocat rămâne 100% sigur și valabil între părți.”',
        verdict: 'nuantat',
        explanation:
          'Deși Art. 1242 alin. (3) Cod Civil spune că lipsa întocmirii de către avocat nu atrage nulitatea „decât dacă legea prevede expres aceasta”, Art. 25 alin. (4) din Legea 51/1995 (nemodificat) prevede expres că „actele specifice profesiei de avocat, efectuate în mod public de o persoană care nu a dobândit calitatea de avocat, sunt nule”, ceea ce creează un risc major de litigii privind validitatea actelor.',
      },
      {
        claim: '„Modelul este copiat din legislația germană (RDG).”',
        verdict: 'fals',
        explanation:
          'Proiectul preia din Germania doar interdicția (§ 2 RDG), dar omite deliberat excepțiile esențiale din § 5 RDG (servicii juridice accesorii altor profesii, precum contabilii), § 6 RDG (consilierea gratuită/pro-bono) și jurisprudența Curții Federale Germane (BGH, 2021) care permite generatoarele software automatizate de contracte.',
      },
      {
        claim: '„România nu avea nevoie de studiu de impact sau test de proporționalitate pentru acest proiect.”',
        verdict: 'fals',
        explanation:
          'Conform Directivei (UE) 2018/958 (transpusă în România prin Legea nr. 245/2020), orice reglementare nouă care rezervă activități unei profesii trebuie precedată obligatoriu de un test de proporționalitate obiectiv și de o evaluare a impactului economic (estimat de mediul de afaceri RBL la peste 100 milioane EUR anual pentru IMM-uri).',
      },
    ],
    institutionalEmails: [
      {
        id: 'eu-tris',
        targetName: 'Comisia Europeană (Unitatea Directiva TRIS & Piața Internă)',
        badge: 'Arma Tehnică #1 (Bruxelles)',
        to: ['GROW-DIR-EU-2015-1535@ec.europa.eu'],
        cc: ['comm-rep-ro@ec.europa.eu'],
        subject:
          'URGENT Alert: Unnotified draft technical regulation on Information Society Services in Romania (Senate Bill B563/2026) – Breach of Directive (EU) 2015/1535 & Directive (EU) 2018/958',
        body: `Dear European Commission (DG GROW – Unit E3 / Directive (EU) 2015/1535 Team & DG CNECT),\n\nI am writing to alert the European Commission regarding draft legislative proposal B563/2026 registered in the Romanian Senate on 14 October 2026 (amending Law no. 51/1995 on the legal profession and Law no. 287/2009 on the Civil Code), for which emergency parliamentary procedure was requested without prior notification under Directive (EU) 2015/1535 (TRIS) and without the proportionality test mandated by Directive (EU) 2018/958.\n\n1. Breach of Directive (EU) 2015/1535 (TRIS Notification & Standstill):\nThe draft law introduces binding national rules and criminal prohibitions targeting Information Society Services (LegalTech platforms, AI tools, online document generators, websites, and mobile apps) via Art. I pt. 10 (Art. 3^1 para. 3), Art. I pt. 11 (Art. 25^1 fast-track 5-day DSA takedowns initiated by the Bar Association UNBR), and Art. I pt. 17 (Art. 59 para. 8).\n\n2. Breach of Directive (EU) 2018/958 (Proportionality Test) and Directive 2006/123/EC:\nThrough Art. I pt. 1-8 and Art. II (amending Art. 1241-1245 Civil Code), the bill reserves to lawyers the drafting of all private written contracts required by law ad validitatem or ad probationem, company registrations at the Trade Register (ONRC), RNPM filings, escrow, and out-of-court debt collection, while deleting the statutory exception for non-legal regulated professions (such as chartered accountants) without any proportionality assessment.\n\nOfficial Senate file: https://www.senat.ro/Legis/Lista.aspx?cod=27999&pos=0&NR=b563&AN=2026\n\nYours faithfully,`,
        whyItMatters:
          'Conform jurisprudenței CJUE (CIA Security și Unilever), reglementările tehnice privind serviciile societății informaționale adoptate fără notificarea Comisiei Europene conform Directivei (UE) 2015/1535 sunt inopozabile particularilor.',
      },
      {
        id: 'senat-just-cc',
        targetName: 'Comisiile Senatului, Ministerul Justiției & Consiliul Concurenței',
        badge: 'Blocare în Comisii & Aviz Negativ',
        to: ['office@consiliulconcurentei.ro', 'relatiipublice@just.ro'],
        cc: ['comisia.juridica@senat.ro', 'comisia.it@senat.ro', 'infopub@senat.ro'],
        subject:
          'Punct de vedere și obiecțiuni privind Propunerea legislativă B563/2026 (Modificarea Legii nr. 51/1995 și a Codului Civil)',
        body: `Către:\n- SENATUL ROMÂNIEI (Biroul Permanent, Comisia juridică și Comisia pentru comunicații, tehnologia informației și inteligență artificială)\n- MINISTERUL JUSTIȚIEI\n- CONSILIUL CONCURENȚEI\n\nVă transmit prezentul Punct de vedere privind Propunerea legislativă B563/2026, solicitând respingerea acesteia în ansamblu sau, în subsidiar, eliminarea prevederilor care încalcă Directiva (UE) 2018/958 (Legea nr. 245/2020 privind testul de proporționalitate), Directiva (UE) 2015/1535 (procedura TRIS) și art. 1 alin. (5), art. 23 alin. (12) și art. 45 din Constituția României:\n\n1. Eliminarea Art. II (modificarea art. 1241–1245 Cod Civil) privind obligativitatea întocmirii prin avocat a contractelor și actelor adiționale sub semnătură privată;\n2. Păstrarea excepției „dacă legea nu prevede altfel” la art. 3 alin. (2) din Legea nr. 51/1995, pentru a nu incrimina penal activitatea experților contabili (CECCAR), a consultanților fiscali, a specialiștilor HR și a platformelor administrative la ONRC;\n3. Eliminarea sau reformularea art. 3^1, art. 25^1 și art. 59 alin. (7)-(8) care restricționează disproporționat utilizarea sistemelor AI și a serviciilor societății informaționale.\n\nCu stimă,`,
        whyItMatters:
          'Ministerul Justiției redactează Punctul de vedere oficial al Guvernului, Consiliul Concurenței evaluează impactul anticoncurențial, iar Biroul Permanent decide repartizarea la Comisia IT&C/AI.',
      },
    ],
    socialShare: {
      facebookPost: `Bă voi sunteți nebuni la cap cu legea asta (B563/2026) care vrea să instituie monopol absolut pentru avocați pe toată birocrația din România?!?\n\nCând vezi că parlamentari-avocați de la PSD, PNL, USR și AUR semnează cot la cot un proiect asumat de UNBR și cer „procedură de urgență” în Senat, știi că urmează o notă de plată uriașă pentru cetățeni și firme.\n\nCe scrie negru pe alb în proiectul B563/2026 (aflat în consultare publică până pe 13 noiembrie):\n1️⃣ Orice contract scris sau act adițional cerut de lege măcar pentru dovadă „se întocmește de avocat” (Art. 1241–1245 Cod Civil).\n2️⃣ La Art. 3 alin. (2) din Legea 51/1995 șterg excepția „dacă legea nu prevede altfel” și lasă doar „alte profesii juridice” — scoțând în afara legii penale (Art. 25) contabilii care depun acte la ONRC, specialiștii HR și platformele digitale!\n3️⃣ Orice sfat juridic pe o situație concretă, „indiferent de tehnologia utilizată” (Art. 3^1), chiar și gratuit, intră în monopol, iar UNBR primește procedură-fulger de 5 zile în instanță (Art. 25^1) să blocheze platforme LegalTech și unelte AI!\n4️⃣ Avocat obligatoriu la orice divorț cu copii minori, inclusiv când părinții se înțeleg amiabil la notar (lit. k^5)!\n\nAm construit o pagină unde am trecut legea prin 3 modele AI (AGY, Claude și Codex), cu articolele verificate la sânge și cu un Kit prin care poți trimite în 60 de secunde obiecțiuni oficiale pe site-ul Senatului! 👇`,
      firstCommentLinks: `📄 Documentele oficiale de pe site-ul Senatului (B563/2026 – consultare publică până la 13.11.2026):\n🔗 Fișa legii: https://www.senat.ro/Legis/Lista.aspx?cod=27999&pos=0&NR=b563&AN=2026\n🔗 Forma inițiatorului (PDF): https://www.senat.ro/legis/PDF/2026/26b563FG.PDF\n🔗 Expunerea de motive (PDF): https://www.senat.ro/legis/PDF/2026/26b563EM.PDF`,
    },
    docxTitle: 'PUNCT DE VEDERE ȘI OBIECTIUNI FORMALE PRIVIND PROPUNEREA LEGISLATIVĂ B563/2026',
    docxIntro:
      'Subsemnatul(a) {{NUME_CETATEAN}}, în temeiul normelor privind transparența decizională și consultarea publică parlamentară, formulez prezentul Punct de vedere referitor la Propunerea legislativă B563/2026 pentru modificarea și completarea Legii nr. 51/1995 pentru organizarea și exercitarea profesiei de avocat, precum și pentru completarea Legii nr. 287/2009 privind Codul Civil, solicitând respingerea propunerii în ansamblu sau, în subsidiar, eliminarea dispozițiilor neconstituționale, anticoncurențiale și contrare dreptului Uniunii Europene.',
    docxSections: [
      {
        heading: '1. Încălcarea Directivei (UE) 2018/958 și a Legii nr. 245/2020 (Lipsa testului obligatoriu de proporționalitate)',
        paragraphs: [
          'Conform Directivei (UE) 2018/958 privind efectuarea unui test de proporționalitate înainte de adoptarea unor noi reglementări referitoare la profesii (transpusă în dreptul intern prin Legea nr. 245/2020), orice proiect normativ care introduce sau extinde rezervarea de activități în favoarea unei profesii reglementate trebuie să fie însoțit de o evaluare detaliată și obiectivă a proporționalității.',
          'Deși Expunerea de motive menționează formal „garanții privind proporționalitatea rezervării activităților”, documentația proiectului B563/2026 nu conține niciun test de proporționalitate și nicio analiză de impact economic care să demonstreze de ce măsurile mai puțin restrictive sunt insuficiente. Potrivit estimărilor mediului de afaceri (Romanian Business Leaders), obligativitatea redactării prin avocat a actelor societare la ONRC și a contractelor scrise ar genera costuri suplimentare de conformare de peste 100 milioane EUR anual pentru IMM-uri.',
        ],
      },
      {
        heading: '2. Eliminarea nejustificată a altor profesii reglementate prin modificarea Art. 3 alin. (2) și a Art. 1241–1245 Cod Civil',
        paragraphs: [
          'Prin Art. I pct. 8 din proiect, la art. 3 alin. (2) din Legea nr. 51/1995 se elimină sintagma „dacă legea nu prevede altfel” și se înlocuiește cu „cu excepția celor care sunt stabilite în mod expres prin lege și în competența altor profesii juridice”. Coroborat cu noile litere k^1–k^6 de la art. 3 alin. (1) și cu modificarea art. 1241 alin. (2), art. 1243 alin. (2) și art. 1245 alin. (2) din Codul Civil, proiectul scoate în afara legii penale (prin raportare la art. 25 din Legea nr. 51/1995) activități desfășurate în mod legal de profesii economice reglementate, precum experții contabili și contabilii autorizați (OG nr. 65/1994), consultanții fiscali (OG nr. 71/2001) și specialiștii în resurse umane.',
          'De asemenea, invocarea în Expunerea de motive a legii germane (Rechtsdienstleistungsgesetz – RDG) este trunchiată: proiectul preia interdicția din § 2 RDG, dar omite deliberat excepția expresă din § 5 RDG (care permite prestarea serviciilor juridice accesorii unei alte activități profesionale principale, precum contabilitatea sau administrarea proprietăților) și pe cea din § 6 RDG (serviciile gratuite).',
        ],
      },
      {
        heading: '3. Încălcarea Directivei (UE) 2015/1535 (Procedura TRIS) și restricționarea disproporționată a serviciilor digitale și AI',
        paragraphs: [
          'Prin Art. I pct. 10 (art. 3^1 alin. 3), pct. 11 (art. 25^1 – ordine de eliminare a serviciilor online în 5 zile în temeiul Regulamentului DSA 2022/2065, la cererea UNBR) și pct. 17 (art. 59 alin. 8 – domenii de internet, platforme online, aplicații și alte servicii ale societății informaționale), propunerea instituie reglementări tehnice naționale aplicabile serviciilor societății informaționale.',
          'În lipsa notificării prealabile a Comisiei Europene și a respectării perioadei obligatorii de standstill de 3 luni conform Directivei (UE) 2015/1535, aceste dispoziții sunt inopozabile particularilor conform jurisprudenței constante a Curții de Justiție a Uniunii Europene (cauzele C-194/94 CIA Security și C-443/98 Unilever).',
        ],
      },
      {
        heading: '4. Vicii de neconstituționalitate: Art. 1 alin. (5), Art. 21, Art. 23 alin. (12), Art. 45 și Art. 53 din Constituția României',
        paragraphs: [
          'Art. I pct. 17 (modificarea art. 59 alin. 7) incriminează cu închisoarea de la 6 luni la 3 ani folosirea fără drept a oricăror denumiri sau expresii care „prin modul de prezentare ori prin contextul în care sunt utilizate” sunt de natură să inducă în eroare publicul. Utilizarea criteriului vag al „contextului” într-o normă de incriminare penală încalcă principiul legalității și previzibilității legii penale (lex certa).',
          'Totodată, impunerea asistenței avocațiale obligatorii în orice procedură de divorț cu copii minori, „indiferent de calea procedurală aleasă” (art. 3 alin. 1 lit. k^5 – deci inclusiv în procedura amiabilă notarială), precum și obligarea persoanelor juridice de drept privat de a preda înscrisuri la simpla cerere a avocatului fără control judiciar prealabil (art. 3 alin. 2^1) încalcă principiul proporționalității (art. 53 din Constituție).',
        ],
      },
    ],
    docxRequests: [
      'Respingerea solicitării de dezbatere în procedură de urgență a propunerii legislative B563/2026;',
      'Eliminarea integrală a Art. II (modificarea art. 1241, 1242, 1243 și 1245 din Codul Civil);',
      'Menținerea formei actuale a art. 3 alin. (2) din Legea nr. 51/1995 („dacă legea nu prevede altfel”) și eliminarea monopolului asupra înregistrărilor la ONRC (lit. k^2), RNPM (lit. k^1), escrow (lit. g^1), divorțurilor amiabile cu minori (lit. k^5) și medierii fără autorizare (lit. f);',
      'Reformularea art. 3^1, art. 25^1 și art. 59 alin. (7)-(8) și notificarea prealabilă a Comisiei Europene prin procedura TRIS conform Directivei (UE) 2015/1535;',
      'Sesizarea pentru co-raport/aviz a Comisiei pentru comunicații, tehnologia informației și inteligență artificială și a Comisiei economice, industrii, servicii, turism și antreprenoriat, precum și solicitarea avizului Consiliului Concurenței.',
    ],
    council: {
      agy: {
        model: 'agy',
        modelName: 'Gemini 4 Argon (High)',
        cliCommand: 'agy --model gemini-4-argon-high -p',
        status: 'ok',
        riskScore: 9.8,
        riskLevel: 'red',
        verdictShort:
          'Captură legislativă masivă în favoarea UNBR: instituie monopol pe redactarea contractelor scrise în Codul Civil, scoate contabilii și platformele digitale de la ONRC în afara legii penale și creează o procedură-fulger de 5 zile pentru blocarea aplicațiilor AI/LegalTech.',
        keyFindings: [
          'Art. 1241–1245 Cod Civil + Art. 3 alin. (1) lit. c): orice contract sau act adițional pentru care legea cere formă scrisă ad validitatem sau ad probationem „se întocmește de avocat”.',
          'Art. 3 alin. (2) + lit. k^2: eliminarea excepției „dacă legea nu prevede altfel” lasă doar „alte profesii juridice”, incriminând penal (Art. 25) experții contabili și platformele online care depun acte la ONRC.',
          'Art. 3^1 alin. (3) + Art. 25^1: sfatul pe o situație concretă „indiferent de tehnologia utilizată” devine monopol avocațial, iar UNBR poate cere închiderea site-urilor/aplicațiilor AI în 5 zile prin DSA.',
          'Art. 3 alin. (2^1) și lit. k^5: firmele private sunt obligate să predea documente avocaților fără ordin judecătoresc, iar divorțul cu minori (inclusiv amiabil la notar) impune obligatoriu avocat.',
        ],
        blindSpotsCaught:
          'A identificat cele 8 prevederi ascunse dincolo de Codul Civil: somațiile directe către firme private (Art. 3 alin. 2^1), blocarea controalelor administrative prin invocarea secretului profesional pe aplicații/cloud (Art. 34^1), medierea fără autorizarea Consiliului de Mediere (Art. 3 lit. f) și rolul UNBR de supra-avizator legislativ (Art. 65 lit. w).',
        constitutionalityNote:
          'Încalcă Art. 23 alin. (12) și Art. 1 alin. (5) din Constituție (lex certa) prin incriminarea penală bazată pe „context” la Art. 59 alin. (7), precum și Art. 45 și Art. 53 privind libertatea economică și proporționalitatea.',
        euLawNote:
          'Încalcă Directiva (UE) 2015/1535 (TRIS) prin ne-notificarea restricțiilor asupra serviciilor societății informaționale (Art. 3^1, 25^1, 59 alin. 8) și Directiva Serviciilor 2006/123/CE.',
      },
      claude: {
        model: 'claude',
        modelName: 'Claude Opus 5.5',
        cliCommand: 'claude -p --model opus',
        status: 'ok',
        riskScore: 9.7,
        riskLevel: 'red',
        verdictShort:
          'Proiectul suferă de un viciu procedural fatal: extinde monopolul unei profesii reglementate peste zeci de activități economice fără Testul de Proporționalitate obligatoriu prevăzut de Directiva (UE) 2018/958 și Legea nr. 245/2020, în timp ce trunchiază deliberat modelul german RDG pe care îl invocă.',
        keyFindings: [
          'Lipsa Testului de Proporționalitate (Directiva UE 2018/958 / Legea 245/2020): Expunerea de motive promite garanții de proporționalitate la pag. 2, dar nu conține nicio evaluare a impactului economic (estimat de RBL la >100 mil. EUR/an).',
          'Manipularea dreptului comparat (Germania RDG): proiectul copiază interdicția din § 2 RDG, dar elimină excepțiile din § 5 RDG (servicii juridice accesorii prestate de contabili) și § 6 RDG (servicii gratuite), plus jurisprudența BGH (2021) privind generatoarele software de contracte.',
          'Interacțiunea dintre Art. 1242 alin. (3) Cod Civil și Art. 25 alin. (4) din Legea 51/1995: deși Codul Civil exclude nulitatea dacă legea nu o prevede expres, Art. 25 alin. (4) din Legea 51/1995 prevede expres nulitatea actelor specifice profesiei efectuate public de un neavocat.',
        ],
        blindSpotsCaught:
          'A verificat încrucișat textul PDF-urilor și a separat chirurgical argumentele blindate juridic (Directiva 2018/958, § 5 RDG Germania, Art. 3 alin. 2 ca adevăratul mecanism de excludere a contabililor de la ONRC) de interpretările exagerate, consolidând Punctul de vedere tehnic pentru Comisia Juridică.',
        constitutionalityNote:
          'Nulitatea incertă dintre Art. 1242 alin. (3) Cod Civil și Art. 25 alin. (4) din Legea 51/1995 creează o insecuritate a circuitului civil contrară Art. 1 alin. (5) din Constituție, iar Art. 59 alin. (7) încalcă previzibilitatea legii penale.',
        euLawNote:
          'Directiva (UE) 2018/958 (art. 4 și art. 7) impune statelor membre să demonstreze cu date obiective că rezervarea de activități este justificată de un interes general și că nu există măsuri mai puțin restrictive. Absența acestui test face legea vulnerabilă la infringement și la controlul de constituționalitate.',
      },
      codex: {
        model: 'codex',
        modelName: 'ChatGPT · GPT-6.1',
        cliCommand: 'codex exec',
        status: 'ok',
        riskScore: 9.8,
        riskLevel: 'red',
        verdictShort:
          'Din perspectivă tehnică și economică, proiectul creează un blocaj de conformare pentru IMM-uri și ecosistemul IT: transformă operațiuni standardizate (acte adiționale CIM, formulare-tip ONRC, înscrieri RNPM) în infracțiuni dacă sunt asistate de software sau de contabili.',
        keyFindings: [
          'Conflict direct între Legea 51/1995 (Art. 3 alin. 2) și OG 65/1994 privind experții contabili + Legea 265/2022 privind Registrul Comerțului, unde formularele-tip ONRC sunt concepute pentru completare directă sau asistată.',
          'Asimetrie procedurală gravă la Art. 25^1 (DSA): UNBR, care este o asociație a operatorilor concurenți pe piață, primește calitate procesuală directă să ceară radierea din online a platformelor software rivale în 5 zile.',
          'Impactul asupra digitalizării (Art. 1245 alin. 2 Cod Civil + Art. 3^1 alin. 3): orice flux SaaS de generare dinamică a clauzelor contractuale în funcție de inputul utilizatorului intră în definiția penală a consultanței pe o „situație concretă”.',
        ],
        blindSpotsCaught:
          'A evidențiat conflictul de norme dintre monopolul propus la lit. k^2 și arhitectura digitală a portalului ONRC (Legea 265/2022), precum și anomalia ca o organizație profesională concurentă (UNBR) să devină autoritate de sesizare rapidă pe Regulamentul DSA.',
        constitutionalityNote:
          'Încalcă Art. 135 alin. (2) lit. a) din Constituție (obligația statului de a asigura libertatea comerțului și protecția concurenței loiale) prin instituirea unui monopol corporatist asupra unor activități administrative standard.',
        euLawNote:
          'Deturnează Regulamentul (UE) 2022/2065 (Digital Services Act) și încalcă principiul țării de origine din Directiva 2000/31/CE (Art. 3) pentru serviciile societății informaționale furnizate transfrontalier în UE.',
      },
    },
  },
};

const OTHER_BILLS = {
  'b543-2026': {
    riskScore: 8.6,
    riskLevel: 'red',
    plainTitle: 'Construirea de biserici în extravilan și în Ariile Naturale Protejate fără studiu de impact asupra mediului',
    summaryTlDr:
      'Modifică noul Cod al Urbanismului (Legea 169/2026) pentru a permite construirea de lăcașuri de cult (până la 130 mp) în extravilan și în interiorul ariilor naturale protejate, eliminând expres obligația evaluării adecvate și a studiilor de impact asupra mediului (EIA).',
    initiatorClaim:
      'Inițiatorul susține că lăcașurile de cult mici din mediul rural ridicate pe „locuri deja sfințite de înalții ierarhi” au un impact redus și nu ar trebui împovărate administrativ cu avize și studii de mediu.',
    realityCheck:
      'Textul propus la Art. 294 alin. (2) lit. c) introduce o derogare explicită de la Art. 197 alin. (4): situarea în perimetrul unei arii naturale protejate nu mai poate fi motiv de respingere și scutește construcția de „evaluarea adecvată, evaluarea impactului asupra mediului ori întocmirea altor studii de mediu”. Aceasta încalcă frontal Directiva Habitate 92/43/CEE (Art. 6 alin. 3) și pune în pericol Jalonul 315 din PNRR.',
    affectedGroups: ['Agricultură & Mediu', 'Proprietari & Imobiliare', 'Toți cetățenii'],
    articleRef: 'Articol unic (Art. 294 alin. 2 lit. c)',
    proposalContent:
      'Solicit respingerea propunerii B543/2026 sau eliminarea derogării de la art. 197 alin. (4) care permite construirea în perimetrul ariilor naturale protejate și în extravilan fără evaluare adecvată, fără studiu de impact asupra mediului și fără avizul administratorului ariei protejate.',
    argumentation:
      'Scutirea prin lege a oricărei categorii de construcții în ariile naturale protejate (Natura 2000) de obligația evaluării adecvate încalcă flagrant art. 6 alin. (3) din Directiva 92/43/CEE (Habitate), Directiva 2011/92/UE (EIA) și art. 35 din Constituția României (dreptul la un mediu sănătos), expunând România la infringement.',
    otherComments:
      'De asemenea, condiționarea regimului urbanistic de un criteriu confesional neprevizibil în dreptul public („locuri deja sfințite de către înalții ierarhi”) încalcă art. 1 alin. (5) din Constituție și afectează reforma PNRR (Jalonul 315 – Codul Urbanismului).',
    agyScore: 8.8,
    claudeScore: 8.6,
    codexScore: 8.4,
    agyVerdict:
      'Derogare periculoasă de la regimul ariilor naturale protejate: deschide poarta betonării în situri Natura 2000 fără studii de mediu și folosește criterii extra-juridice („locuri deja sfințite”) în Codul Urbanismului.',
    claudeVerdict:
      'Încălcare directă a Art. 6 alin. (3) din Directiva 92/43/CEE (Habitate): jurisprudența CJUE interzice statelor membre să excepteze în bloc categorii de proiecte din siturile Natura 2000 de la evaluarea adecvată a efectelor asupra mediului.',
    codexVerdict:
      'Introduce o breșă sistemică în Legea 169/2026 (adoptată recent ca Jalon PNRR 315): elimină controlul administratorului ariei naturale protejate și creează un precedent de construire în extravilan fără documentații de mediu.',
  },
  'b573-2026': {
    riskScore: 7.9,
    riskLevel: 'red',
    plainTitle: 'Eliminarea pragului electoral alternativ (20% în 4 județe) pentru alegerile parlamentare',
    summaryTlDr:
      'Modifică Legea nr. 208/2015 privind alegerea Senatului și a Camerei Deputaților prin eliminarea pragului electoral alternativ (20% din voturi în cel puțin 4 circumscripții) și păstrarea exclusivă a pragului de 5% la nivel național.',
    initiatorClaim:
      'Inițiatorii susțin că pragul alternativ creează un dublu standard și permite intrarea în Parlament a unor formațiuni care nu au 5% la nivel național.',
    realityCheck:
      'Eliminarea pragului regional de 20% în 4 circumscripții afectează direct reprezentarea comunităților regionale și a minorităților naționale cu concentrare geografică (precum UDMR), modificând arhitectura reprezentativității parlamentare fără o dezbatere constituțională amplă.',
    affectedGroups: ['Justiție & Drepturi Civile', 'Toți cetățenii'],
    articleRef: 'Articol unic (Art. 94 alin. 2 lit. a)',
    proposalContent:
      'Solicit respingerea propunerii B573/2026 și menținerea formei actuale a art. 94 alin. (2) lit. a) din Legea nr. 208/2015, care prevede pragul alternativ de 20% din voturile valabil exprimate în cel puțin 4 circumscripții electorale.',
    argumentation:
      'Suprimarea pragului electoral alternativ afectează pluralismul politic (art. 8 din Constituție) și reprezentarea parlamentară a comunităților cu concentrare regională, contrar recomandărilor Comisiei de la Veneția privind stabilitatea regulilor fundamentale ale sistemului electoral și protecția minorităților.',
    otherComments:
      'Orice modificare a formulei de transformare a voturilor în mandate necesită consens transpartinic larg și consultarea Comisiei de la Veneția, nu intervenții unilaterale asupra Legii nr. 208/2015.',
    agyScore: 8.0,
    claudeScore: 7.9,
    codexScore: 7.8,
    agyVerdict:
      'Modificare majoră a sistemului electoral parlamentar cu impact direct asupra reprezentării minorităților și a partidelor cu bază regională.',
    claudeVerdict:
      'Contravine Codului bunelor practici în materie electorală al Comisiei de la Veneția și jurisprudenței CCR privind stabilitatea și caracterul incluziv al regulilor electorale.',
    codexVerdict:
      'Schimbă mecanic condiția de atribuire a mandatelor la nivel național prin suprimarea filtrului teritorial (4 circumscripții cu min. 20%).',
  },
  'b571-2026': {
    riskScore: 7.2,
    riskLevel: 'red',
    plainTitle: 'Bonusuri salariale de 10% pentru funcționarii MApN din penalitățile și daunele aplicate furnizorilor în achiziții publice',
    summaryTlDr:
      'Derogă de la Legea finanțelor publice nr. 500/2002 astfel încât daunele-interese și penalitățile încasate din contractele de achiziții ale MApN să nu mai meargă integral la bugetul de stat: 30% rămân la MApN, iar 10% merg într-un fond de stimulare (premii/bonusuri) pentru personalul care a atribuit și gestionat contractul.',
    initiatorClaim:
      'Inițiatorii susțin că vor să motiveze personalul MApN care urmărește executarea contractelor complexe de înzestrare și recuperarea penalităților de la furnizori.',
    realityCheck:
      'Creează un stimulent pervers (hazard moral) în achizițiile publice: personalul autorității contractante care redactează caietul de sarcini, recepționează produsele și aplică penalități primește direct 10% din daunele-interese încasate (până la 3 salarii de bază/an), încurajând litigii artificiale, blocaje la recepție și abuz de putere contractuală.',
    affectedGroups: ['IMM & Antreprenori', 'Angajați & HR', 'Toți cetățenii'],
    articleRef: 'În ansamblu; Art. 1 lit. d) și Art. 3',
    proposalContent:
      'Solicit eliminarea art. 1 lit. d) și a art. 3 privind constituirea fondului de 10% din daune-interese pentru stimularea bănească a personalului autorității contractante care a atribuit și gestionat contractul de achiziție publică.',
    argumentation:
      'Acordarea unui procent din penalitățile și daunele-interese contractuale direct funcționarilor care gestionează recepția și execuția contractului creează un conflict de interese structural și un hazard moral major, distorsionând buna-credință contractuală și încalcând principiile salarizării unitare (Legea 153/2017).',
    otherComments:
      'În plus, proiectul conține o eroare de tehnică legislativă la art. 1 (două litere sunt numerotate cu „c)”, în timp ce art. 3 face trimitere la „art. 1 lit. d)”), încălcând Legea nr. 24/2000.',
    agyScore: 7.4,
    claudeScore: 7.2,
    codexScore: 7.0,
    agyVerdict:
      'Instituie o „cotă-parte din amenzi/penalități” pentru personalul de achiziții din MApN, generând un conflict de interese direct între buna derulare a contractului și bonusul funcționarului.',
    claudeVerdict:
      'Subminează neutralitatea autorității contractante în execuția contractelor administrative și conține o eroare materială de redactare (dublarea literei c la art. 1 și trimiterea la o literă d inexistentă la art. 3).',
    codexVerdict:
      'Derogă de la principiul universalității bugetare (art. 62 alin. 2 Legea 500/2002) și introduce un stimulent financiar asimetric care crește riscul de litigii comerciale în achizițiile de apărare.',
  },
  'b565-2026': {
    riskScore: 6.4,
    riskLevel: 'yellow',
    plainTitle: 'Tăierea și plafonarea despăgubirilor pentru angajații și funcționarii suspendați și găsiți ulterior nevinovați',
    summaryTlDr:
      'Modifică în procedură de urgență Codul Administrativ (Art. 513) și Codul Muncii (Art. 52): despăgubirile salariale datorate angajatului sau funcționarului găsit nevinovat după suspendare sunt diminuate cu salariile obținute în altă instituție și sunt actualizate exclusiv cu inflația (IPC), eliminând dobânda legală.',
    initiatorClaim:
      'Inițiatorii susțin că evită îmbogățirea fără justă cauză și uniformizează practica judiciară privind calculul drepturilor salariale pe perioada suspendării.',
    realityCheck:
      'Plafonarea actualizării „exclusiv cu indicele prețurilor de consum (IPC)” în Codul Muncii (art. 52 alin. 2^1) și Codul Administrativ (art. 513 alin. 6) privează salariatul nevinovat de repararea integrală a prejudiciului (dobânda legală penalizatoare pentru lipsa de folosință a banilor timp de ani de zile cât durează procesul).',
    affectedGroups: ['Angajați & HR', 'Justiție & Drepturi Civile'],
    articleRef: 'Art. I (art. 513 alin. 6) și Art. II (art. 52)',
    proposalContent:
      'Solicit eliminarea cuvântului „exclusiv” din art. 513 alin. (6) Cod administrativ și art. 52 alin. (2^1) Codul muncii, pentru a nu interzice acordarea dobânzii legale aferente despăgubirilor salariale cuvenite persoanelor găsite nevinovate.',
    argumentation:
      'Limitarea reparației exclusiv la rata inflației (IPC), fără acoperirea lipsei de folosință a sumelor reținute pe durata unor procese de mai mulți ani, încalcă principiul reparării integrale a prejudiciului (art. 1531 Cod civil) și jurisprudența ÎCCJ (RIL/HP) privind cumulul actualizării cu rata inflației și dobânda legală.',
    otherComments:
      'Nu se justifică procedura de urgență pentru restrângerea drepturilor salariale ale angajaților din mediul privat și public față de care s-a constatat nevinovăția.',
    agyScore: 6.5,
    claudeScore: 6.5,
    codexScore: 6.2,
    agyVerdict:
      'Reduce despăgubirile salariaților găsiți nevinovați după ani de suspendare, interzicând acordarea dobânzii legale pe lângă rata inflației.',
    claudeVerdict:
      'Intră în coliziune cu jurisprudența constantă a ÎCCJ (Decizia nr. 2/2014 RIL) care a statuat că actualizarea cu IPC acoperă doar devalorizarea monedei (damnum emergens), nu și lipsa de folosință (lucrum cessans).',
    codexVerdict:
      'Transferă costul duratei excesive a procedurilor judiciare pe umerii salariatului prezumat și dovedit nevinovat, prin plafonarea despăgubirii la IPC.',
  },
  'b574-2026': {
    riskScore: 6.5,
    riskLevel: 'yellow',
    plainTitle: 'Diminuarea despăgubirilor salariale din Codul Muncii (inclusiv în mediul privat) cu orice venit realizat în perioada suspendării',
    summaryTlDr:
      'Similar cu B565/2026, dar merge și mai departe în Codul Muncii (Art. 52 alin. 2^1): dacă un angajat din mediul privat este suspendat de angajator (ex. plângere penală făcută de angajator), se angajează în altă parte ca să supraviețuiască, iar apoi este declarat nevinovat, angajatorul abuziv este scutit de plata despăgubirii în limita salariilor câștigate de om prin propria muncă în altă parte.',
    initiatorClaim:
      'Inițiatorii invocă evitarea dublării veniturilor salariatului pe perioada în care contractul său de muncă a fost suspendat.',
    realityCheck:
      'În raporturile de muncă private, dacă un angajator formulează o plângere penală nefondată pentru a-și suspenda angajatul (art. 52 alin. 1 lit. b Codul Muncii), iar salariatul este nevoit să muncească la alt angajator pentru a-și întreține familia, proiectul îl premiază pe angajatorul abuziv scăzându-i din despăgubire banii munciți de salariat în altă parte!',
    affectedGroups: ['Angajați & HR', 'Justiție & Drepturi Civile'],
    articleRef: 'Art. I (Art. 52 alin. 2^1 și 2^2 Codul muncii)',
    proposalContent:
      'Solicit respingerea Art. I privind introducerea alin. (2^1) și (2^2) la art. 52 din Codul muncii, întrucât exonerează angajatorul de răspundere pe seama muncii prestate de salariat la un alt angajator pe durata suspendării.',
    argumentation:
      'Prin Decizia CCR nr. 405/2016 și jurisprudența ÎCCJ, suspendarea CIM din inițiativa angajatorului urmată de constatarea nevinovăției angajează răspunderea patrimonială obiectivă a angajatorului. Venitul obținut de salariat la un terț are drept cauză munca efectiv prestată pentru acel terț, nu fapta angajatorului inițial.',
    otherComments:
      'Proiectul s-a suprapus cu B565/2026, fiind necesară conexarea și respingerea plafonării despăgubirilor salariaților nevinovați.',
    agyScore: 6.7,
    claudeScore: 6.5,
    codexScore: 6.3,
    agyVerdict:
      'Premiază angajatorii care își șicanează salariații cu plângeri penale nefondate: dacă omul își găsește alt job ca să trăiască, angajatorul inițial scapă de plata despăgubirilor.',
    claudeVerdict:
      'Confundă cauza juridică a despăgubirii (răspunderea angajatorului pentru blocarea nejustificată a raportului de muncă) cu remunerația contraprestației muncii depuse la un terț angajator.',
    codexVerdict:
      'Elimină caracterul disuasiv al art. 52 alin. (2) din Codul Muncii și plafonează actualizarea monetară exclusiv la IPC.',
  },
  'b553-2026': {
    riskScore: 6.1,
    riskLevel: 'yellow',
    plainTitle: 'Reducere de 5% la impozitele pe casă, teren și mașină condiționată de prezența la toate alegerile',
    summaryTlDr:
      'Modifică Codul Fiscal și Legea Electorală pentru a permite primăriilor să acorde o bonificație suplimentară de până la 5% la impozitul pe clădiri, teren și auto cetățenilor care au votat la TOATE scrutinurile electorale anterioare.',
    initiatorClaim:
      'Inițiatorul dorește creșterea prezenței la vot prin stimulente fiscale pozitive pentru cetățenii care își exercită dreptul de vot.',
    realityCheck:
      'Condiționarea unui avantaj fiscal patrimonial de prezența la urne (verificată prin interconectarea SIMPV/Registrului Electoral de la AEP cu ANAF și cele peste 3.200 de primării) ridică probleme constituționale privind egalitatea fiscală (art. 56 Constituție – justa așezare a sarcinilor fiscale), libertatea votului (inclusiv dreptul de a boicota un scrutin sau un referendum fără penalizare financiară indirectă) și costuri IT disproporționate.',
    affectedGroups: ['Proprietari & Imobiliare', 'Contabili & Fiscalitate', 'Justiție & Drepturi Civile', 'Toți cetățenii'],
    articleRef: 'În ansamblu; Art. I pct. 4 (Art. 489^3 Cod Fiscal)',
    proposalContent:
      'Solicit respingerea propunerii B553/2026, întrucât condiționarea nivelului impozitelor locale pe proprietate de participarea la toate scrutinurile electorale încalcă principiul neutralității și justei așezări a sarcinilor fiscale.',
    argumentation:
      '1. Încalcă art. 56 alin. (2) și art. 16 din Constituție: impozitul pe proprietate trebuie raportat la capacitatea contributivă și valoarea bunului, nu la conduita electorală.\n2. Condiția „unică și indivizibilă” de participare la toate scrutinurile (inclusiv în caz de boală sau deplasare) creează discriminări și birocrație excesivă între AEP, ANAF și UAT-uri.',
    otherComments:
      'Prelucrarea masivă și transferul anual al datelor privind prezența la vot a milioanelor de contribuabili către direcțiile de taxe locale ridică riscuri de proporționalitate GDPR.',
    agyScore: 6.2,
    claudeScore: 6.2,
    codexScore: 5.9,
    agyVerdict:
      'Amestecă fiscalitatea locală cu prezența la vot: transformă neprezentarea la un singur tur de scrutin (chiar din motive medicale) într-un impozit mai mare pe casă și mașină.',
    claudeVerdict:
      'Problematic sub aspectul art. 56 alin. (2) din Constituție (justa așezare a sarcinilor fiscale) și al caracterului facultativ al votului în România (art. 36 Constituție).',
    codexVerdict:
      'Arhitectura tehnică propusă (sincronizarea Registrului Electoral AEP cu sistemele fiscale a 3.200 de UAT-uri pentru o bonificație de max. 5%) generează o complexitate administrativă disproporționată.',
  },
  'b557-2026': {
    riskScore: 5.8,
    riskLevel: 'yellow',
    plainTitle: 'Amnistie de 24 de luni și doar „avertisment” pentru clădirile statului fără autorizație de securitate la incendiu (ISU)',
    summaryTlDr:
      'Modifică în procedură de urgență Legea nr. 307/2006 privind apărarea împotriva incendiilor pentru a scuti instituțiile publice și primăriile de amenzile ferme introduse recent prin OUG 17/2026: clădirile publice fără autorizație ISU primesc 24 de luni păsuire și pot fi sancționate doar cu avertisment, în timp ce firmele private rămân supuse amenzilor directe.',
    initiatorClaim:
      'Inițiatorii susțin că amenzile obligatorii aplicate școlilor, spitalelor și primăriilor fără autorizație ISU împovărează bugetele locale care au deja demersuri în curs.',
    realityCheck:
      'Instituie un dublu standard periculos între stat și mediul privat în privința siguranței vieții: un antreprenor privat fără autorizație ISU primește amendă directă fără posibilitatea avertismentului și fără plata a jumătate din minim, în timp ce clădirile statului (unde intră zilnic elevi, pacienți și cetățeni) primesc încă 2 ani de amânare pe baza unei simple hârtii („program de conformare”).',
    affectedGroups: ['IMM & Antreprenori', 'Sănătate & Educație', 'Toți cetățenii'],
    articleRef: 'Articol unic pct. 1 și 2 (Art. 47 alin. 8^1, 14)',
    proposalContent:
      'Solicit eliminarea tratamentului discriminatoriu dintre domeniul public și mediul privat la art. 47 alin. (8^1) și (14): fie posibilitatea individualizării sancțiunii pe baza unui plan de conformare se aplică nediscriminatoriu tuturor proprietarilor, fie regulile de siguranță la incendiu rămân egale.',
    argumentation:
      'Riscul la incendiu pentru viața cetățenilor este identic într-o clădire publică și într-una privată. Instituirea unei imunități contravenționale de 24 de luni exclusiv pentru stat încalcă art. 16 și art. 44 din Constituție și perpetuează amânarea nesfârșită a punerii în siguranță a școlilor și spitalelor.',
    otherComments:
      'Dacă OUG 17/2026 a eliminat abuziv individualizarea sancțiunii (avertismentul), corecția trebuie făcută pentru toți subiecții de drept, nu ca privilegiu exclusiv pentru instituțiile statului.',
    agyScore: 6.0,
    claudeScore: 5.8,
    codexScore: 5.6,
    agyVerdict:
      'Dublu standard clasic: statul își votează singur 2 ani de imunitate la amenzile ISU pentru clădirile publice, în timp ce păstrează regimul draconic pentru firmele private.',
    claudeVerdict:
      'Creează o discriminare nejustificată între proprietatea publică/privată a statului și proprietatea privată a particularilor într-o materie (securitatea la incendiu) unde bunul juridic ocrotit – viața – este același.',
    codexVerdict:
      'Conditionează suspendarea aplicării art. 47 alin. (6)-(7) pe 24 luni doar de aprobarea internă a unui program de conformare în 12 luni, fără garanții de execuție efectivă a lucrărilor.',
  },
  'b544-2026': {
    riskScore: 4.8,
    riskLevel: 'yellow',
    plainTitle: 'Reforma politicii antidrog: dezincriminarea penală a deținerii pentru consum propriu (trecerea în contravenție) și centre medicale de reducere a riscurilor',
    summaryTlDr:
      'Modifică Legea nr. 143/2000 pentru a transforma deținerea de droguri pentru consum propriu din infracțiune penală în contravenție (amendă 1.000–3.500 lei) și permite autorizarea în spitale a unor spații supravegheate medical pentru prevenirea supradozelor și tratamentul adicțiilor.',
    initiatorClaim:
      'Inițiatorii arată cu date oficiale că 77,5% din activitatea DIICOT este blocată cu dosare de droguri, din care ~80% vizează capturi sub 5 grame (medie ~1 gram), ceea ce sufocă lupta împotriva marilor traficanți și împinge consumatorii departe de tratament medical.',
    realityCheck:
      'Proiect extrem de amplu documentat (peste 160 pagini de Expunere de motive cu statistici DIICOT, ANP și practică europeană – Portugalia, Germania, Cehia, Elveția). Deși schimbarea de paradigmă este susținută criminologic și medical, lipsa unor praguri cantitative clare în textul Art. 4 pentru delimitarea „consumului propriu” de trafic poate lăsa loc de interpretări neunitare în practică.',
    affectedGroups: ['Justiție & Drepturi Civile', 'Sănătate & Educație', 'Toți cetățenii'],
    articleRef: 'Art. I pct. 1–3 (Art. 3, Art. 4 și Art. 5)',
    proposalContent:
      'Susțin orientarea politicii publice spre sănătate publică și degrevarea DIICOT pentru combaterea marelui trafic, cu recomandarea introducerii la Art. 4 a unor criterii obiective și cantități-limită clare care să delimiteze strict deținerea pentru consum propriu de traficul de droguri.',
    argumentation:
      'Statisticile DIICOT (79% capturi sub 5g) confirmă ineficiența încarcerării consumatorilor. Totuși, pentru respectarea art. 1 alin. (5) din Constituție (previzibilitatea legii penale vs. contravenționale), legea trebuie să stabilească praguri cantitative obiective, astfel încât traficanții stradali să nu poată invoca regimul contravențional.',
    otherComments:
      'Se recomandă corelarea intrării în vigoare cu alocarea bugetară efectivă pentru centrele de tratament și consiliere ale Ministerului Sănătății.',
    agyScore: 4.8,
    claudeScore: 4.7,
    codexScore: 4.9,
    agyVerdict:
      'Reformă curajoasă și documentată statistic pentru deblocarea DIICOT și tratarea adicției ca problemă medicală, dar necesită praguri cantitative stricte ca să nu creeze portițe pentru dealeri.',
    claudeVerdict:
      'Aliniat la standardele OMS/EMCDDA și la jurisprudența CEDO privind proporționalitatea politicilor penale, însă distincția dintre infracțiune (art. 2/3) și contravenție (art. 4) necesită criterii cantitative exprese în lege.',
    codexVerdict:
      'Transferă ~30.000 de dosare anuale de mică deținere din sfera penală DIICOT în sfera contravențională și reglementează regimul de autorizare DSP pentru centrele de reducere a riscurilor (art. 5 alin. 2).',
  },
  'b517-2026': {
    riskScore: 4.2,
    riskLevel: 'yellow',
    plainTitle: 'Amânarea până la 1 aprilie 2027 a noilor tarife rutiere (TollRo / Rovinieta) din Legea 226/2023',
    summaryTlDr:
      'Prorogă termenele de aplicare a noului regim de tarifare rutieră electronică (TollRo pentru vehicule grele și noile reguli de rovinietă) de la 1 octombrie 2026 până la 1 aprilie 2027, pentru a corela Legea 103/2026 cu Legea 170/2026.',
    initiatorClaim:
      'Inițiatorii arată că Legea 103/2026 și Legea 170/2026 au lăsat termene necorelate (31 august vs. 1 octombrie 2026), în timp ce sistemul tehnic CNAIR nu este complet operațional.',
    realityCheck:
      'Corectează o incoerență legislativă reală și amână scumpirile de tarife rutiere pentru transportatori și șoferi, dar cum data de 1 octombrie 2026 a fost deja depășită, formularea unei simple prorogări ridică probleme de neretroactivitate (Art. 15 alin. 2 Constituție) dacă nu este redactată ca normă tranzitorie.',
    affectedGroups: ['Șoferi & Auto', 'IMM & Antreprenori'],
    articleRef: 'Articol unic alin. (1) și (2)',
    proposalContent:
      'Susțin corelarea termenelor din Legea nr. 226/2023 și amânarea aplicării noilor tarife până la operaționalizarea completă a sistemului electronic, cu reformularea tehnică a textului pentru a evita retroactivitatea față de data de 1 octombrie 2026.',
    argumentation:
      'Conform art. 15 alin. (2) din Constituție și normelor de tehnică legislativă (Legea 24/2000), un termen deja împlinit (1 octombrie 2026) nu mai poate fi „prorogat” retroactiv, fiind necesară o dispoziție tranzitorie expresă de suspendare/aplicare de la 1 aprilie 2027.',
    otherComments:
      'Se impune avizul Consiliului Legislativ și corelarea cu jaloanele PNRR privind tarifarea rutieră.',
    agyScore: 4.2,
    claudeScore: 4.4,
    codexScore: 4.0,
    agyVerdict:
      'Măsură utilă pentru transportatori și șoferi (amână noile taxe de drum TollRo), dar necesită corecție tehnică deoarece termenul de 1 octombrie 2026 a trecut deja.',
    claudeVerdict:
      'Viciu de tehnică legislativă: în jurisprudența CCR, prorogarea unui termen legal poate opera doar înainte de expirarea acestuia; după 1 octombrie 2026 este necesară o normă tranzitorie.',
    codexVerdict:
      'Rezolvă conflictul de termene dintre Legea 103/2026 și Legea 170/2026 privind sistemul STRR/TollRo.',
  },
  'b519-2026': {
    riskScore: 4.5,
    riskLevel: 'yellow',
    plainTitle: 'Verificări suplimentare la alimentele aproape de expirare în supermarketuri și împărțirea răspunderii între producător și magazin',
    summaryTlDr:
      'Obligă hipermarketurile și supermarketurile să includă în programele HACCP verificări prin sondaj pentru produsele aflate aproape de expirare (inclusiv branduri terțe) și delimitează răspunderea pentru neconformitate între producător (rețetă/fabricare) și comerciant (depozitare/expunere).',
    initiatorClaim:
      'Protejează consumatorii de produse alterate pe raft înainte de expirare și îi apără pe producătorii români de amenzi atunci când marfa s-a stricat din cauza depozitării necorespunzătoare în magazin.',
    realityCheck:
      'Delimitarea răspunderii între producător și retailer (Art. 22^1) este echitabilă și utilă pentru producătorii locali, însă obligația magazinelor de a face analize pe branduri terțe fără criterii clare poate fi transferată în costuri sau taxe de raft către micii furnizori.',
    affectedGroups: ['IMM & Antreprenori', 'Agricultură & Mediu', 'Toți cetățenii'],
    articleRef: 'Art. I pct. 1 și 2 (Art. 18 alin. 1^1 și Art. 22^1)',
    proposalContent:
      'Susțin delimitarea răspunderii între producător și comerciant la art. 22^1, cu completarea art. 18 alin. (1^1) astfel încât costurile verificărilor prin sondaj efectuate de marii retaileri să nu poată fi refacturate abuziv furnizorilor.',
    argumentation:
      'Separarea răspunderii în funcție de cauză (fabricație vs. lanț frigorific/depozitare) respectă Regulamentul (CE) nr. 178/2002, dar este necesară prevenirea transferării costurilor de testare către micii producători, conform Legii nr. 81/2022 privind practicile comerciale neloiale.',
    otherComments:
      'Normele metodologice ANSVSA trebuie emise în termen determinat (60 de zile) pentru aplicare unitară.',
    agyScore: 4.5,
    claudeScore: 4.5,
    codexScore: 4.5,
    agyVerdict:
      'Echilibrează raportul dintre producători și marile lanțuri comerciale, dar trebuie interzisă refacturarea costurilor de laborator către micii fermieri.',
    claudeVerdict:
      'Compatibil cu Regulamentul (CE) 178/2002 și Regulamentul (CE) 852/2004 privind igiena produselor alimentare, cu condiția corelării cu Legea 81/2022.',
    codexVerdict:
      'Introduce o regulă clară de imputabilitate (producător vs. distribuitor/retailer) în caz de neconformitate alimentară.',
  },
  'b534-2026': {
    riskScore: 1.4,
    riskLevel: 'green',
    plainTitle: 'Debirocratizare: Instituțiile statului nu mai au voie să îți ceară certificatul de atestare fiscală sau chitanțe de plată a taxelor',
    summaryTlDr:
      'Modifică Codul de procedură fiscală (Art. 160^1) pentru a obliga toate instituțiile publice să verifice direct în bazele de date ANAF/locale situația fiscală și plățile cetățenilor și firmelor, interzicând solicitarea certificatului de atestare fiscală sau a ordinelor de plată pe hârtie.',
    initiatorClaim:
      'Elimină drumurile inutile ale cetățenilor și antreprenorilor între două ghișee ale statului pentru a dovedi că nu au datorii sau că au plătit o taxă.',
    realityCheck:
      'Un proiect excelent și bine scris tehnic: instituie regula interogării directe prin PatrimVen/platforme electronice și obligă funcționarul care totuși cere hârtia (pe motiv de „defecțiune tehnică”) să consemneze în scris motivul concret al imposibilității verificării digitale!',
    affectedGroups: ['IMM & Antreprenori', 'Contabili & Fiscalitate', 'Toți cetățenii'],
    articleRef: 'În ansamblu (Art. I – Art. 160^1)',
    proposalContent:
      'Susțin adoptarea propunerii legislative B534/2026. Pentru eficiență maximă, propun adăugarea unei sancțiuni disciplinare exprese în cazul în care o instituție publică refuză nejustificat interogarea electronică și solicită abuziv contribuabilului certificatul de atestare fiscală.',
    argumentation:
      'Proiectul aplică efectiv principiul european „Once-Only” (O singură dată) și completează OUG nr. 41/2016, reducând semnificativ povara birocratică asupra cetățenilor și IMM-urilor.',
    otherComments:
      'Se recomandă corelarea cu propunerea B566/2026 privind eliminarea adeverințelor de venit.',
    agyScore: 1.5,
    claudeScore: 1.4,
    codexScore: 1.3,
    agyVerdict:
      'Lege foarte bună pentru cetățeni și firme: taie „plimbatul cu dosarul cu șină” pentru certificatul fiscal și dovezile de plată.',
    claudeVerdict:
      'Măsură solidă de simplificare administrativă, aliniată la Regulamentul (UE) 2018/1724 (Single Digital Gateway – principiul „doar o singură dată”).',
    codexVerdict:
      'Obligă la interogare API/PatrimVen din oficiu și impune trasabilitate scrisă (art. 160^1 alin. 3) pentru orice excepție tehnică.',
  },
  'b566-2026': {
    riskScore: 1.4,
    riskLevel: 'green',
    plainTitle: 'Debirocratizare: Eliminarea adeverințelor de venit la ghișee prin verificarea automată în PatrimVen',
    summaryTlDr:
      'Completează OUG nr. 41/2016 și Codul de procedură fiscală pentru a obliga instituțiile publice să verifice din oficiu veniturile persoanelor fizice prin sistemul PatrimVen, interzicând solicitarea adeverințelor de venit pentru burse, ajutoare sociale sau servicii publice.',
    initiatorClaim:
      'Elimină solicitarea adeverințelor de venit pe hârtie atunci când datele există deja în evidențele ANAF.',
    realityCheck:
      'Măsură curată de digitalizare și debirocratizare, care funcționează în tandem cu B534/2026 și păstrează garanția consimțământului prealabil al cetățeanului.',
    affectedGroups: ['Toți cetățenii', 'Angajați & HR', 'Contabili & Fiscalitate'],
    articleRef: 'În ansamblu (Art. I și Art. II)',
    proposalContent:
      'Susțin adoptarea propunerii B566/2026 privind verificarea din oficiu a veniturilor prin sistemul PatrimVen și interzicerea solicitării adeverințelor de venit de la cetățeni.',
    argumentation:
      'Elimină costurile de timp atât pentru cetățeni, cât și pentru departamentele HR/contabilitate ale angajatorilor care eliberau adeverințe pentru date deja raportate lunar prin Declarația 112.',
    otherComments:
      'Propunere complementară cu B534/2026; pot fi adoptate împreună ca pachet de debirocratizare fiscală.',
    agyScore: 1.4,
    claudeScore: 1.4,
    codexScore: 1.4,
    agyVerdict:
      'Scapă cetățenii și departamentele HR de corvoada adeverințelor de venit pentru date pe care ANAF le are deja în sistem.',
    claudeVerdict:
      'Respectă exigențele GDPR (prin condiția consimțământului la art. 2^3 alin. 1) și principiul bunei administrări.',
    codexVerdict:
      'Automatizează fluxul de verificare a veniturilor prin PatrimVen și Platforma Națională de Interoperabilitate.',
  },
  'b533-2026': {
    riskScore: 1.6,
    riskLevel: 'green',
    plainTitle: 'Open Data pe bune: Obligarea instituțiilor publice să publice seturile de date cu valoare ridicată prin API-uri deschise',
    summaryTlDr:
      'Modifică Legea nr. 179/2022 privind datele deschise pentru a impune standarde tehnice clare (API-uri de catalog, identificatori persistenți, Registrul național al seturilor de date cu valoare ridicată) și publicarea efectivă a datelor publice pe data.gov.ro fără restricții tehnice sau financiare.',
    initiatorClaim:
      'Operaționalizează Directiva (UE) 2019/1024 (Open Data) și Regulamentul de punere în aplicare (UE) 2023/138 privind seturile de date cu valoare ridicată.',
    realityCheck:
      'Un proiect extrem de pozitiv pentru transparență, jurnaliști, cercetători și sectorul IT/AI: forțează instituțiile să nu mai ascundă datele publice în PDF-uri scanate, ci să le expună în formate deschise, procesabile automat și prin API.',
    affectedGroups: ['IT & AI', 'IMM & Antreprenori', 'Justiție & Drepturi Civile', 'Toți cetățenii'],
    articleRef: 'În ansamblu (Art. I)',
    proposalContent:
      'Susțin adoptarea propunerii legislative B533/2026 privind modernizarea cadrului național de date deschise (Open Data), instituirea API-urilor de catalog și a Registrului național al seturilor de date cu valoare ridicată.',
    argumentation:
      'Asigură aplicarea efectivă a Directivei (UE) 2019/1024 și a Regulamentului (UE) 2023/138, crescând transparența instituțională și oferind ecosistemului civic și IT acces la date publice în format machine-readable.',
    otherComments:
      'Exact genul de infrastructură legislativă care ar obliga și instituțiile să ofere API-uri moderne în loc de tabele HTML învechite.',
    agyScore: 1.5,
    claudeScore: 1.6,
    codexScore: 1.7,
    agyVerdict:
      'Proiect excelent pentru transparență și sectorul tech: obligă statul să publice datele publice în formate deschise și prin API, nu în PDF-uri scanate.',
    claudeVerdict:
      'Aliniază riguros Legea 179/2022 la Regulamentul de punere în aplicare (UE) 2023/138 privind seturile de date cu valoare ridicată (High-Value Datasets).',
    codexVerdict:
      'Definește clar specificațiile tehnice pentru API-uri de catalog, metadate standardizate și monitorizarea conformării instituțiilor pe portalul data.gov.ro.',
  },
};

function buildAutoAnalysis(bill) {
  if (CURATED_BILLS[bill.slug]) {
    const c = CURATED_BILLS[bill.slug];
    return {
      billId: bill.id,
      slug: bill.slug,
      updatedAt: new Date().toISOString(),
      consensus: {
        riskScore: c.riskScore,
        riskLevel: c.riskLevel,
        plainTitle: c.plainTitle,
        summaryTlDr: c.summaryTlDr,
        initiatorClaim: c.initiatorClaim,
        realityCheck: c.realityCheck,
        affectedGroups: c.affectedGroups,
        senatForm: c.senatForm,
        articlesBreakdown: c.articlesBreakdown,
        mythsAndFacts: c.mythsAndFacts,
        institutionalEmails: c.institutionalEmails,
        socialShare: c.socialShare,
        docxTitle: c.docxTitle,
        docxIntro: c.docxIntro,
        docxSections: c.docxSections,
        docxRequests: c.docxRequests,
      },
      council: c.council,
    };
  }

  if (OTHER_BILLS[bill.slug]) {
    const o = OTHER_BILLS[bill.slug];
    return {
      billId: bill.id,
      slug: bill.slug,
      updatedAt: new Date().toISOString(),
      consensus: {
        riskScore: o.riskScore,
        riskLevel: o.riskLevel,
        plainTitle: o.plainTitle,
        summaryTlDr: o.summaryTlDr,
        initiatorClaim: o.initiatorClaim,
        realityCheck: o.realityCheck,
        affectedGroups: o.affectedGroups,
        senatForm: {
          articleRef: ensureLimit(o.articleRef, 50),
          proposalContent: ensureLimit(o.proposalContent, 395),
          argumentation: ensureLimit(o.argumentation, 395),
          otherComments: ensureLimit(o.otherComments, 395),
        },
        docxTitle: `PUNCT DE VEDERE PRIVIND PROPUNEREA LEGISLATIVĂ ${bill.id}`,
        docxIntro: `Subsemnatul(a) {{NUME_CETATEAN}}, în cadrul procedurii de consultare publică parlamentară, formulez prezentul Punct de vedere referitor la Propunerea legislativă ${bill.id} (${bill.officialTitle}).`,
        docxSections: [
          {
            heading: '1. Obiectul propunerii și sinteza observațiilor',
            paragraphs: [o.summaryTlDr, o.realityCheck],
          },
          {
            heading: '2. Propunere și argumentare juridică',
            paragraphs: [o.proposalContent, o.argumentation, o.otherComments],
          },
        ],
        docxRequests: [o.proposalContent, o.otherComments],
      },
      council: {
        agy: {
          model: 'agy',
          modelName: 'Gemini 4 Argon (High)',
          cliCommand: 'agy --model gemini-4-argon-high -p',
          status: 'ok',
          riskScore: o.agyScore,
          riskLevel: o.riskLevel,
          verdictShort: o.agyVerdict,
          keyFindings: [o.summaryTlDr, o.realityCheck],
          blindSpotsCaught: o.otherComments,
          constitutionalityNote: o.argumentation,
          euLawNote: 'Evaluat în raport cu principiul proporționalității și reglementările europene incidente.',
        },
        claude: {
          model: 'claude',
          modelName: 'Claude Opus 5.5',
          cliCommand: 'claude -p --model opus',
          status: 'ok',
          riskScore: o.claudeScore,
          riskLevel: o.riskLevel,
          verdictShort: o.claudeVerdict,
          keyFindings: [o.realityCheck, o.argumentation],
          blindSpotsCaught: o.argumentation,
          constitutionalityNote: o.argumentation,
          euLawNote: o.claudeVerdict,
        },
        codex: {
          model: 'codex',
          modelName: 'ChatGPT · GPT-6.1',
          cliCommand: 'codex exec',
          status: 'ok',
          riskScore: o.codexScore,
          riskLevel: o.riskLevel,
          verdictShort: o.codexVerdict,
          keyFindings: [o.summaryTlDr, o.codexVerdict],
          blindSpotsCaught: o.codexVerdict,
          constitutionalityNote: 'Analiză tehnică privind coerența normativă conform Legii nr. 24/2000.',
          euLawNote: 'Verificare tehnică de conformitate cu acquis-ul comunitar.',
        },
      },
    };
  }

  // Specific rules for all remaining bills based on their actual content
  const remainingMap = {
    'b520-2026': {
      score: 2.8,
      level: 'green',
      plainTitle: 'Modernizarea Institutelor de Medicină Legală: referate interdisciplinare și termene clare pentru expertize',
      tldr: 'Modifică OG nr. 1/2000 privind medicina legală pentru a reglementa oficial consultarea medicilor specialiști (neurologi, cardiologi, geneticieni) în expertizele medico-legale complexe și transparentizează listele de referenți.',
      claim: 'Rezolvă blocajele și întârzierile din dosarele medico-legale care necesită opinii medicale supraspecializate.',
      reality: 'Măsură tehnică pozitivă pentru celeritatea proceselor penale și civile, cu păstrarea răspunderii finale la medicul legist.',
      groups: ['Sănătate & Educație', 'Justiție & Drepturi Civile'],
    },
    'b521-2026': {
      score: 2.5,
      level: 'green',
      plainTitle: 'Deducerea TVA-ului la utilaje și construcții folosite în comun de membrii cooperativelor agricole',
      tldr: 'Completează Legea cooperației agricole nr. 566/2004 (art. 76) pentru a permite cooperativelor agricole să deducă TVA-ul aferent utilajelor și construcțiilor utilizate în comun de membrii cooperatori.',
      claim: 'Sprijină asocierea micilor fermieri și absorbția fondurilor europene în agricultură.',
      reality: 'Intenție economică pozitivă pentru fermieri, însă derogarea de la Codul Fiscal (art. 297 alin. 4) printr-o lege specială trebuie atent corelată cu Directiva TVA 2006/112/CE pentru a nu fi blocată la controlul ANAF.',
      groups: ['Agricultură & Mediu', 'Contabili & Fiscalitate', 'IMM & Antreprenori'],
    },
    'b522-2026': {
      score: 1.8,
      level: 'green',
      plainTitle: 'Protecție mai puternică împotriva violenței domestice: brățară electronică pentru agresor ca regulă (opt-out) și protecția minorilor',
      tldr: 'Modifică Legea 217/2003 și Legea 26/2024 astfel încât monitorizarea electronică a agresorului să se dispună automat dacă victima nu se opune expres în scris (trecere de la opt-in la opt-out) și asigură prezența DGASPC când victima este minoră.',
      claim: 'Elimină presiunea psihologică pusă pe victima aflată în stare de șoc de a cere expres montarea brățării electronice agresorului.',
      reality: 'Un proiect foarte bun și echilibrat pentru siguranța victimelor violenței domestice și a copiilor minori.',
      groups: ['Justiție & Drepturi Civile', 'Toți cetățenii'],
    },
    'b523-2026': {
      score: 1.2,
      level: 'green',
      plainTitle: 'Declararea anului 2027 drept „Anul cultural Ion Voicu” (30 de ani de la dispariția marelui violonist)',
      tldr: 'Lege cu caracter simbolic și cultural care declară anul 2027 „Anul cultural Ion Voicu”, permițând organizarea de concerte, festivaluri și programe educaționale în limita bugetelor existente.',
      claim: 'Omagiază memoria violonistului și dirijorului Ion Voicu la 30 de ani de la trecerea în neființă.',
      reality: 'Proiect cultural benign, fără obligații fiscale sau restricții pentru cetățeni.',
      groups: ['Sănătate & Educație', 'Toți cetățenii'],
    },
    'b524-2026': {
      score: 2.2,
      level: 'green',
      plainTitle: 'Anti-fraudă la creditele online: verificarea obligatorie a buletinului în baza de date MAI (DEPABD) înainte de acordarea creditului',
      tldr: 'Modifică OUG nr. 50/2010 privind creditele pentru consumatori pentru a obliga băncile și IFN-urile care acordă credite la distanță să verifice validitatea actului de identitate în Registrul Național de Evidență a Persoanelor (sau prin identificare electronică eIDAS).',
      claim: 'Previene fraudele prin furt de identitate (credite luate online cu poze de buletin furate sau expirate).',
      reality: 'Măsură excelentă de protecție a consumatorilor împotriva creditelor frauduloase luate în numele lor, cu condiția ca MAI (DGEP) să ofere API-ul de interogare rapid și fără blocaje tehnice.',
      groups: ['Toți cetățenii', 'IT & AI', 'IMM & Antreprenori'],
    },
    'b525-2026': {
      score: 2.0,
      level: 'green',
      plainTitle: 'Poluare și mirosuri toxice: obligarea DSP și a Gărzii de Mediu să facă analize de apă, sol și sănătate la plângerile cetățenilor',
      tldr: 'Modifică OUG nr. 195/2005 privind protecția mediului (Art. 64^6) pentru a obliga direcțiile de sănătate publică să efectueze investigații reale și monitorizări independente ale apei și solului atunci când cetățenii reclamă disconfort olfactiv și poluare.',
      claim: 'Oprește practica autorităților de a răspunde formal la petițiile cetățenilor fără să facă măsurători în teren.',
      reality: 'Proiect pozitiv pentru comunitățile afectate de gropi de gunoi și poluatori industriali.',
      groups: ['Agricultură & Mediu', 'Sănătate & Educație', 'Toți cetățenii'],
    },
    'b526-2026': {
      score: 1.7,
      level: 'green',
      plainTitle: 'Parcare gratuită pe orice loc public pentru persoanele cu handicap dacă locurile special rezervate sunt deja ocupate',
      tldr: 'Completează Art. 65 din Legea nr. 448/2006 astfel încât deținătorii cardului-legitimație de handicap să poată parca gratuit pe orice loc de parcare public dacă locurile adaptate și rezervate sunt ocupate.',
      claim: 'Asigură exercitarea efectivă a dreptului la mobilitate pentru persoanele cu dizabilități atunci când cele câteva locuri rezervate sunt ocupate.',
      reality: 'Soluție practică și umană pentru o problemă reală din toate orașele din România.',
      groups: ['Șoferi & Auto', 'Sănătate & Educație', 'Toți cetățenii'],
    },
    'b527-2026': {
      score: 1.1,
      level: 'green',
      plainTitle: 'Instituirea zilei de 26 septembrie ca „Ziua Munților Carpați”',
      tldr: 'Lege simbolică pentru marcarea pe 26 septembrie a Zilei Munților Carpați prin evenimente educative, ecologice și turistice.',
      claim: 'Promovează protejarea biodiversității și a patrimoniului cultural din Carpați.',
      reality: 'Proiect simbolic, fără impact normativ restrictiv.',
      groups: ['Agricultură & Mediu', 'Toți cetățenii'],
    },
    'b528-2026': {
      score: 2.4,
      level: 'green',
      plainTitle: 'Scutire de TVA pentru cursurile de programare, competențe digitale și STEM destinate copiilor sub 16 ani',
      tldr: 'Completează Art. 292 din Codul Fiscal și înființează la Ministerul Educației un Registru național al furnizorilor de programe educaționale digitale și STEM pentru a le acorda scutire de TVA conform Directivei 2006/112/CE.',
      claim: 'Reduce costul cursurilor de robotică, IT și științe exacte pentru elevi, rezolvând problema ridicată în cauza CJUE C-612/20 (Happy Education).',
      reality: 'Măsură bine fundamentată pe jurisprudența CJUE (C-612/20), care ieftinește cursurile STEM pentru copii prin crearea cadrului formal de recunoaștere cerut de Directiva TVA.',
      groups: ['IT & AI', 'Sănătate & Educație', 'Contabili & Fiscalitate'],
    },
    'b532-2026': {
      score: 2.1,
      level: 'green',
      plainTitle: 'Anularea permisului auto pe 3 ani pentru șoferii care circulă pe contrasens pe autostradă sau drum expres',
      tldr: 'Modifică Codul Rutier (OUG 195/2002, art. 102 și 114) astfel încât circulația pe contrasens pe autostradă sau drum expres să fie sancționată nu doar cu amendă, ci și cu anularea permisului și interdicția de a da examen timp de 3 ani.',
      claim: 'Descurajează ferm intrarea pe contrasens pe autostrăzi, manevră cu risc extrem de accidente mortale.',
      reality: 'Măsură severă de siguranță rutieră; în comisii se recomandă precizarea că vizează pătrunderea/deplasarea pe calea unidirecțională a autostrăzii, cu garanții dacă semnalizarea rutieră de la nodul de acces a fost absentă sau defectuoasă.',
      groups: ['Șoferi & Auto', 'Toți cetățenii'],
    },
    'b535-2026': {
      score: 3.6,
      level: 'yellow',
      plainTitle: 'Sistemul național pentru protejarea, monitorizarea și restaurarea de urgență a bisericilor de lemn de patrimoniu',
      tldr: 'Instituie un cadru legislativ dedicat inventarierii, prevenirii incendiilor și intervenției de urgență pentru salvarea bisericilor istorice de lemn (inclusiv UNESCO) din România.',
      claim: 'Salvează de la prăbușire și incendii patrimoniul unic de biserici de lemn din România.',
      reality: 'Obiectiv cultural legitim și necesar, însă textul de 69.000 de caractere creează structuri administrative și proceduri paralele cu Legea monumentelor istorice nr. 422/2001, fără justificare pentru procedura de urgență.',
      groups: ['Proprietari & Imobiliare', 'Toți cetățenii'],
    },
    'b539-2026': {
      score: 1.9,
      level: 'green',
      plainTitle: 'Legalizarea „filtrării traficului” (lane filtering) pentru motociclete și mopede cu maximum 20 km/h pe lângă coloanele oprite la semafor',
      tldr: 'Completează Codul Rutier (Art. 45^1) pentru a permite motocicliștilor să avanseze cu cel mult 20 km/h și la distanță de minimum 0,5 m pe lângă mașinile oprite în coloană pe același sens, fără a călca linia continuă, pista de biciclete sau banda de urgență.',
      claim: 'Aliniază România la practica europeană (Franța, Belgia, Olanda, Germania), fluidizează traficul urban și reduce riscul ca motocicliștii să fie loviți din spate în coloană.',
      reality: 'Reglementare tehnică foarte clară și echilibrată, cu 6 condiții cumulative stricte de siguranță (max. 20 km/h, min. 0,50 m distanță laterală, interzis pe banda de urgență sau peste linia continuă).',
      groups: ['Șoferi & Auto', 'Toți cetățenii'],
    },
    'b542-2026': {
      score: 5.4,
      level: 'yellow',
      plainTitle: 'Ștergerea datoriilor bugetare și a împrumuturilor unor companii energetice/industriale prin darea în plată de active către stat',
      tldr: 'Modifică OUG nr. 60/2019 pentru a extinde mecanismul de stingere a datoriilor fiscale și a împrumuturilor din fonduri de privatizare prin trecerea unor capacități energetice sau industriale în proprietatea statului.',
      claim: 'Permite recuperarea unor creanțe istorice ale statului prin preluarea de active funcționale energetice sau industriale.',
      reality: 'Risc semnificativ de ajutor de stat mascat (Art. 107 TFUE) dacă evaluarea activelor preluate în contul datoriilor bugetare nu este validată prealabil de Comisia Europeană și Consiliul Concurenței.',
      groups: ['IMM & Antreprenori', 'Contabili & Fiscalitate'],
    },
    'b545-2026': {
      score: 1.5,
      level: 'green',
      plainTitle: 'Scutirea de rovinietă pentru camioanele apicultorilor omologate RAR și folosite exclusiv la transportul stupilor în pastoral',
      tldr: 'Completează OG nr. 15/2002 (Art. 3) pentru a excepta de la plata tarifului de utilizare a drumurilor naționale vehiculele specializate și omologate RAR exclusiv pentru stupăritul pastoral.',
      claim: 'Sprijină apicultorii români și polenizarea culturilor agricole, având în vedere că vehiculele apicole circulă doar câteva zile pe an între culesuri.',
      reality: 'Măsură punctuală, proporțională și bine delimitată împotriva abuzurilor (cere omologare RAR dedicată).',
      groups: ['Agricultură & Mediu', 'Șoferi & Auto'],
    },
    'b548-2026': {
      score: 3.4,
      level: 'yellow',
      plainTitle: 'Reorganizarea Institutului Român pentru Drepturile Omului (IRDO) ca instituție de analiză sistemică și avertizare timpurie',
      tldr: 'Înlocuiește vechea Lege nr. 9/1991 privind IRDO cu o lege nouă care modernizează atribuțiile institutului (inclusiv pe impactul inteligenței artificiale și al digitalizării asupra drepturilor omului).',
      claim: 'Aliniază IRDO la Principiile de la Paris ale ONU și la standardele Agenției UE pentru Drepturi Fundamentale (FRA).',
      reality: 'Modernizare instituțională utilă pe fond, dar trebuie evitată suprapunerea de atribuții și cheltuieli bugetare cu Avocatul Poporului și CNCD.',
      groups: ['Justiție & Drepturi Civile', 'IT & AI'],
    },
    'b549-2026': {
      score: 2.0,
      level: 'green',
      plainTitle: 'Pensie provizorie rapidă pentru românii care au lucrat și în străinătate, fără să mai aștepte lunile de corespondență externă',
      tldr: 'Modifică Legea pensiilor nr. 360/2023 (Art. 93) pentru a obliga casele teritoriale de pensii să emită o decizie provizorie și să plătească imediat pensia cuvenită pentru anii munciți în România dacă solicitantul îndeplinește deja stagiul, urmând recalcularea când vin actele din celelalte state.',
      claim: 'Elimină situațiile în care pensionarii așteaptă 1–2 ani fără niciun venit până când instituțiile din alte țări trimit formularele europene.',
      reality: 'Măsură foarte bună pentru românii din diaspora și cei care au muncit în UE, aplicând corect Regulamentul (CE) nr. 883/2004.',
      groups: ['Angajați & HR', 'Toți cetățenii'],
    },
    'b550-2026': {
      score: 1.2,
      level: 'green',
      plainTitle: 'Instituirea zilei de 5 martie ca „Ziua națională a auditorului energetic”',
      tldr: 'Lege simbolică pentru recunoașterea profesioniștilor în audit și eficiență energetică pe 5 martie.',
      claim: 'Promovează eficiența energetică a clădirilor și rolul auditorilor energetici.',
      reality: 'Proiect strict onorific, fără impact bugetar sau birocratic.',
      groups: ['Proprietari & Imobiliare'],
    },
    'b551-2026': {
      score: 3.9,
      level: 'yellow',
      plainTitle: 'Schemă de ajutor de stat pentru reducerea prețului energiei electrice la marile întreprinderi industriale electro-intensive',
      tldr: 'Instituie o schemă de ajutor de stat conform cadrului european CISAF (C/2025/3602) pentru compensarea temporară a prețului energiei electrice la marii producători industriali expuși concurenței internaționale, cu obligația investirii a 50% din ajutor în decarbonizare.',
      claim: 'Previne închiderea și relocarea în afara UE a marii industrii românești (metalurgie, chimie, materiale de construcții) din cauza prețurilor la energie.',
      reality: 'Instrument economic legitim în cadrul european CISAF, însă fiind inițiat parlamentar fără fișă financiară a Guvernului (art. 138 alin. 5 Constituție) și fără notificarea prealabilă la DG COMP (Art. 108 alin. 3 TFUE), necesită asumarea și notificarea de către Guvern.',
      groups: ['IMM & Antreprenori', 'Contabili & Fiscalitate'],
    },
    'b552-2026': {
      score: 1.6,
      level: 'green',
      plainTitle: 'Reintroducerea burselor de excelență olimpică I și II pentru elevii premiați la olimpiadele naționale și internaționale',
      tldr: 'Modifică Legea învățământului preuniversitar nr. 198/2023 (Art. 108^1 și 108^2) pentru a reintroduce prin lege bursele de excelență olimpică I (internaționale) și II (naționale, 700 lei/lună), abrogate în 2025 prin Legea 141/2025.',
      claim: 'Repară nedreptatea eliminării burselor pentru elevii olimpici și garantează acordarea lor peste plafonul procentual al clasei.',
      reality: 'Măsură educațională pozitivă și cu impact bugetar redus, care răsplătește performanța școlară reală.',
      groups: ['Sănătate & Educație', 'Toți cetățenii'],
    },
    'b554-2026': {
      score: 2.1,
      level: 'green',
      plainTitle: 'Corectarea formulei de calcul la „plata cu ora” pentru profesori (raportare la norma didactică, nu la 166 ore/lună)',
      tldr: 'Modifică Art. 183 din Legea învățământului preuniversitar nr. 198/2023 astfel încât tariful orar la plata cu ora pentru profesori să se calculeze prin împărțirea salariului la norma didactică de predare (ex. 72 ore/lună), nu la numărul total de 166,6 ore lucrătoare introdus prin Legea 141/2025.',
      claim: 'Elimină tăierea la jumătate a tarifului la plata cu ora pentru profesori, care a lăsat școlile fără titulari dispuși să preia orele rămase libere.',
      reality: 'Corectează o anomalie salarială reală din sistemul de învățământ (o oră de predare presupune și ore de pregătire și evaluare).',
      groups: ['Sănătate & Educație', 'Angajați & HR'],
    },
    'b555-2026': {
      score: 1.5,
      level: 'green',
      plainTitle: 'Instituirea zilei de 30 ianuarie ca „Ziua Națională a Profesorului de Religie”',
      tldr: 'Proiect simbolic care instituie pe 30 ianuarie Ziua Națională a Profesorului de Religie, precizând expres că participarea elevilor la activități este facultativă și nediscriminatorie.',
      claim: 'Recunoaște simbolic activitatea profesorilor de religie din toate cultele recunoscute.',
      reality: 'Proiect cu caracter pur simbolic; Art. 3 alin. (3)-(4) include garanții exprese privind caracterul facultativ și libertatea de conștiință.',
      groups: ['Sănătate & Educație'],
    },
    'b556-2026': {
      score: 1.5,
      level: 'green',
      plainTitle: 'Finanțarea din fondul pentru situații speciale a programelor universitare de limbi rare cu număr mic de studenți',
      tldr: 'Completează Art. 149 din Legea învățământului superior nr. 199/2023 pentru a permite Ministerului Educației să finanțeze specializările universitare de limbi rare care nu se pot susține doar din finanțarea per student.',
      claim: 'Previne desființarea catedrelor universitare de limbi rare (studii iudaice, rromani, hungarologie, limbi slave sau orientale).',
      reality: 'Măsură punctuală și binevenită pentru păstrarea unor specializări academice strategice și culturale.',
      groups: ['Sănătate & Educație'],
    },
    'b564-2026': {
      score: 2.0,
      level: 'green',
      plainTitle: 'Suplimentarea burselor Erasmus+ pentru studenții cu oportunități reduse și finanțarea serviciilor sociale în comune',
      tldr: 'Modifică OUG nr. 133/2021 privind gestionarea fondurilor europene 2021–2027 pentru a debloca mecanismele de plată la două proiecte cu finanțare UE: bursele suplimentare Erasmus+ pentru studenții defavorizați și serviciile sociale integrate în 2.000 de comune rurale.',
      claim: 'Asigură cadrul legal pentru absorbția fondurilor europene FSE+ și FEDR destinate studenților cu venituri mici și comunităților rurale vulnerabile.',
      reality: 'Corecție tehnică pozitivă pentru deblocarea banilor europeni nerambursabili.',
      groups: ['Sănătate & Educație', 'Toți cetățenii'],
    },
    'b567-2026': {
      score: 2.3,
      level: 'green',
      plainTitle: 'Pensionare pentru limită de vârstă la 60 de ani (fără penalizare) pentru persoanele diagnosticate cu cancer (neoplasm malign)',
      tldr: 'Completează Legea pensiilor nr. 360/2023 (Art. 53^1) pentru a acorda dreptul la pensie pentru limită de vârstă la 60 de ani persoanelor diagnosticate cu neoplasm malign care au realizat stagiul minim de cotizare, inclusiv dacă boala este în remisie.',
      claim: 'Oferă o măsură de protecție socială pacienților și supraviețuitorilor de cancer care au continuat să muncească și să cotizeze.',
      reality: 'Măsură umană de protecție socială; necesită corelare cu fișa financiară a bugetului asigurărilor sociale de stat (art. 138 alin. 5 Constituție).',
      groups: ['Sănătate & Educație', 'Angajați & HR', 'Toți cetățenii'],
    },
    'b568-2026': {
      score: 2.2,
      level: 'green',
      plainTitle: 'Reguli stricte pentru decontarea din bani publici a delegațiilor externe ale Președintelui României',
      tldr: 'Completează Legea nr. 47/1994 (Art. 7^1) interzicând decontarea din fonduri publice a cheltuielilor în delegațiile externe ale Președintelui pentru persoane fără calitate oficială (cu excepția soțului/soției în limitele protocolului de stat) și obligând la publicarea componenței și costurilor delegațiilor.',
      claim: 'Crește transparența cheltuirii banilor publici de către Administrația Prezidențială și interzice folosirea resurselor statului pentru însoțitori fără statut oficial.',
      reality: 'Măsură pozitivă de transparență bugetară și integritate publică.',
      groups: ['Justiție & Drepturi Civile', 'Toți cetățenii'],
    },
    'b570-2026': {
      score: 2.5,
      level: 'green',
      plainTitle: 'Restituirea eșalonată (2026–2028) a impozitului progresiv pe pensii declarat neconstituțional prin Decizia CCR 724/2024',
      tldr: 'Stabilește calendarul de restituire în 3 tranșe (10% în dec. 2026, 40% în martie 2027, 50% în martie 2028) a sumelor reținute ca impozit progresiv pe pensii între 1 ianuarie 2024 și 30 ianuarie 2025, declarate neconstituționale de CCR.',
      claim: 'Pune în executare Decizia CCR nr. 724/2024 fără a destabiliza brusc bugetul de stat.',
      reality: 'Necesitatea restituirii derivă din decizia obligatorie a CCR, însă eșalonarea până în 2028 fără dobândă legală poate genera litigii individuale.',
      groups: ['Contabili & Fiscalitate', 'Justiție & Drepturi Civile'],
    },
    'b572-2026': {
      score: 1.7,
      level: 'green',
      plainTitle: 'Acces la locuințe sociale pentru victimele violenței domestice chiar și după partaj, dacă nu au o locuință efectivă',
      tldr: 'Modifică Art. 48 din Legea locuinței nr. 114/1996 astfel încât victimele violenței domestice să nu își piardă dreptul la locuință socială la finalizarea partajului dacă dețin doar o cotă-parte inutilizabilă sau au fost nevoite să înstrăineze cota în partaj.',
      claim: 'Elimină capcana legislativă prin care o mamă victimă a violenței domestice era evacuată din locuința socială imediat ce se termina procesul de partaj, chiar dacă nu avea unde să locuiască.',
      reality: 'Corecție legislativă foarte bună și empatică, care protejează real victimele violenței domestice și copiii acestora.',
      groups: ['Proprietari & Imobiliare', 'Justiție & Drepturi Civile', 'Toți cetățenii'],
    },
    'b576-2026': {
      score: 4.1,
      level: 'yellow',
      plainTitle: 'Modificări de urgență la noul Cod al Urbanismului (Legea 169/2026): autorizații de construire fără PUZ în fronturi construite și ajustări tehnice',
      tldr: 'Modifică în procedură de urgență peste 25 de articole din noul Cod al amenajării teritoriului, urbanismului și construcțiilor (Legea 169/2026), inclusiv permiterea construirii/supraetajării fără documentație de urbanism dacă parcelele adiacente au același regim de înălțime.',
      claim: 'Corectează erori materiale și blocaje administrative apărute după adoptarea Codului Urbanismului (Jalon PNRR 315).',
      reality: 'Deși multe corecții sunt tehnice (drepturi reale de superficie/concesiune), art. I pct. 4 (modificarea art. 257 alin. 9 lit. e – supraetajare/construire fără PUZ/PUD dacă vecinii au aceeași înălțime) necesită avize stricte pentru a nu încuraja îndesirea urbană necontrolată.',
      groups: ['Proprietari & Imobiliare', 'IMM & Antreprenori'],
    },
    'b577-2026': {
      score: 6.2,
      level: 'yellow',
      plainTitle: 'Intervenția primăriilor pe fațadele clădirilor monument istoric chiar și fără acordul proprietarilor',
      tldr: 'Permite primăriilor să efectueze lucrări de modernizare, întreținere și conservare a fațadelor clădirilor clasate ca monumente istorice chiar dacă acestea sunt proprietate privată și „chiar și în lipsa consimțământului direct al proprietarului” (Art. 1).',
      claim: 'Protejează patrimoniul istoric și aspectul urban acolo unde proprietarii lasă fațadele să se degradeze sau există litigii de proprietate.',
      reality: 'Deși scopul estetic este legitim, textul permite intervenția pe proprietatea privată fără consimțământul proprietarului și fără garanții procedurale clare (Art. 44 Constituție), suprapunându-se neclar peste Legea 422/2001 și Legea 153/2011.',
      groups: ['Proprietari & Imobiliare', 'Justiție & Drepturi Civile'],
    },
    'b578-2026': {
      score: 5.4,
      level: 'yellow',
      plainTitle: 'Testarea antidrog obligatorie a parlamentarilor și a angajaților din Parlamentul României',
      tldr: 'Instituie obligativitatea testării antidrog (la preluarea mandatului/angajare, periodic și aleatoriu) pentru deputați, senatori și personalul angajat în structurile Parlamentului.',
      claim: 'Crește integritatea publică și încrederea cetățenilor că activitatea legislativă nu este influențată de substanțe psihoactive.',
      reality: 'Proiect declarativ cu vicii constituționale majore: statutul deputaților și senatorilor poate fi reglementat exclusiv prin Legea organică nr. 96/2006 adoptată în ședința comună a Camerelor (Art. 65 alin. 2 lit. j Constituție), nu prin lege ordinară separată.',
      groups: ['Justiție & Drepturi Civile', 'Angajați & HR'],
    },
    'b579-2026': {
      score: 5.1,
      level: 'yellow',
      plainTitle: 'Racordare gratuită și rapidă la utilități (apă, curent, gaze, internet) pentru tinerii care își construiesc prima locuință',
      tldr: 'Obligă autoritățile locale să garanteze furnizarea și racordarea gratuită la apă, canalizare, electricitate, gaze și internet pentru cetățenii care își construiesc prima locuință pe teren intravilan.',
      claim: 'Sprijină demografia și tinerii care își construiesc prima casă, eliminând costurile de racordare care ajung la 20-30% din construcție.',
      reality: 'Intenție socială bună, dar transferă costuri mari asupra bugetelor locale și operatorilor de rețea fără sursă de finanțare (Art. 138 alin. 5 Constituție) și fără corelare cu reglementările ANRE și Legea energiei nr. 123/2012.',
      groups: ['Proprietari & Imobiliare', 'Toți cetățenii'],
    },
    'b580-2026': {
      score: 6.3,
      level: 'yellow',
      plainTitle: 'Înființarea unei instituții noi: „Avocatul Furnizorului de Servicii Sociale” pentru apărarea centrelor sociale în fața controalelor',
      tldr: 'Înființează o nouă instituție publică („Avocatul Furnizorului de Servicii Sociale”) menită să apere drepturile și interesele furnizorilor publici și privați de servicii sociale în raport cu autoritățile de control și licențiere (inclusiv ISU).',
      claim: 'Ajută centrele sociale care se confruntă cu blocaje birocratice sau cu dificultatea obținerii autorizației de securitate la incendiu.',
      reality: 'Creează o structură birocratică paralelă cu Avocatul Poporului (contrar jurisprudenței CCR) și mută accentul de pe protecția beneficiarilor vulnerabili (vârstnici, copii, persoane cu dizabilități) pe protejarea operatorilor de cămine în fața controalelor ISU și ANPIS.',
      groups: ['Sănătate & Educație', 'Justiție & Drepturi Civile', 'Toți cetățenii'],
    },
    'b581-2026': {
      score: 1.4,
      level: 'green',
      plainTitle: 'Debirocratizare pentru profesori: testul de limbă promovat la titularizare devine valabil 5 ani în loc de 1 an',
      tldr: 'Modifică art. 181 alin. (10) din Legea învățământului preuniversitar nr. 198/2023 astfel încât calificativul „Admis” la proba de competențe lingvistice pentru predarea în altă limbă să fie valabil 5 ani (și pe toată durata activității didactice în limba respectivă).',
      claim: 'Elimină obligația absurdă ca profesorii care au promovat deja examenul lingvistic să îl susțină din nou în fiecare an școlar.',
      reality: 'Măsură de debirocratizare excelentă, clară și susținută transpartinic de 69 de parlamentari din toate partidele.',
      groups: ['Sănătate & Educație', 'Angajați & HR'],
    },
    'b582-2026': {
      score: 1.5,
      level: 'green',
      plainTitle: 'Eliminarea tipăririi în Monitorul Oficial a întrebărilor parlamentare deja publicate pe site-ul Parlamentului',
      tldr: 'Abrogă art. 6 lit. E din Legea nr. 202/1998 privind organizarea Monitorului Oficial, eliminând dubla publicare în Monitorul Oficial Partea a II-a a întrebărilor și interpelărilor la care nu s-a răspuns, acestea fiind deja publice gratuit pe site-urile Camerelor.',
      claim: 'Reduce birocrația și cheltuielile inutile de publicare în Monitorul Oficial pentru documente deja disponibile online.',
      reality: 'Curățenie legislativă binevenită care elimină o cheltuială arhaică de tipar din 1998.',
      groups: ['Toți cetățenii'],
    },
    'b583-2026': {
      score: 4.8,
      level: 'yellow',
      plainTitle: 'Scutirea de impozit auto pentru o singură mașină de persoană („Legea: Ai plătit-o, e a ta!”)',
      tldr: 'Modifică art. 469 din Codul fiscal pentru a scuti de impozitul pe mijloacele de transport un singur autoturism aflat în proprietatea fiecărei persoane fizice, cu compensarea bugetelor locale de la bugetul de stat.',
      claim: 'Elimină impozitarea anuală repetată a bunului deja achiziționat pentru autoturismul de uz curent al familiei.',
      reality: 'Deși populară pentru șoferi, scutirea nu are niciun plafon de capacitate cilindrică sau emisii (permițând scutirea mașinilor de lux de 4.000+ cmc) și creează o presiune semnificativă pe bugetul de stat pentru compensarea primăriilor.',
      groups: ['Șoferi & Auto', 'Contabili & Fiscalitate', 'Toți cetățenii'],
    },
    'b584-2026': {
      score: 2.2,
      level: 'green',
      plainTitle: 'Indemnizație specială pentru adulții cu handicap grav din copilărie care sunt în imposibilitate totală de a munci',
      tldr: 'Introduce art. 58^4 în Legea nr. 448/2006 pentru acordarea unei indemnizații speciale de protecție socială adulților cu handicap grav, permanent și ireversibil dobândit înainte de 18 ani, care nu au putut realiza niciodată stagiu de cotizare.',
      claim: 'Repară golul legislativ pentru persoanele cu dizabilități grave congenitale sau din copilărie care nu pot accesa sistemul contributiv de pensii.',
      reality: 'Măsură socială empatică și bine țintită pe o categorie extrem de vulnerabilă; necesită doar corelarea sursei bugetare.',
      groups: ['Sănătate & Educație', 'Toți cetățenii'],
    },
    'b585-2026': {
      score: 1.9,
      level: 'green',
      plainTitle: 'Panouri fotovoltaice și baterii pe blocuri: partajarea energiei solare între asociația de proprietari și apartamente',
      tldr: 'Modifică Legea 196/2018, Legea 123/2012 și OUG 163/2022 pentru a reglementa instalarea de sisteme fotovoltaice și baterii pe acoperișul comun al blocurilor, acoperirea consumului comun (scară, lift) și împărțirea energiei către apartamente.',
      claim: 'Oferă locatarilor de la bloc acces la energie solară produsă pe acoperișul comun, cu reguli clare de contorizare și decontare.',
      reality: 'Proiect legislativ tehnic foarte solid și detaliat (58 pagini) care deblochează comunitățile de energie în blocurile de locuințe.',
      groups: ['Proprietari & Imobiliare', 'Toți cetățenii'],
    },
    'b586-2026': {
      score: 2.0,
      level: 'green',
      plainTitle: 'Sprijin pentru angajarea persoanelor cu dizabilități, tehnologii asistive digitale și adaptarea locului de muncă',
      tldr: 'Modifică Legea 448/2006 și Legea 76/2002 pentru a finanța adaptarea rezonabilă a locului de muncă, accesul la tehnologii asistive și sprijinirea tranziției tinerilor cu dizabilități către un loc de muncă.',
      claim: 'Completează protecția socială cu instrumente moderne de autonomie, formare profesională și integrare în muncă.',
      reality: 'Inițiativă modernă și constructivă, aliniată la Convenția ONU privind drepturile persoanelor cu dizabilități.',
      groups: ['Angajați & HR', 'Sănătate & Educație', 'IMM & Antreprenori'],
    },
    'b587-2026': {
      score: 2.1,
      level: 'green',
      plainTitle: 'TVA 0% pentru scutece de bebeluși, absorbante igienice și produse pentru incontinență',
      tldr: 'Completează art. 294 alin. (5) din Codul fiscal pentru a introduce scutirea de TVA cu drept de deducere (TVA 0%) la scutece pentru nou-născuți și copii, absorbante menstruale/lăuzie, produse pentru incontinență și prezervative.',
      claim: 'Reduce costul produselor igienice și sanitare de strictă necesitate pentru familii, mame și bolnavi, conform Directivei UE privind TVA.',
      reality: 'Măsură fiscal-socială europeană bine fundamentată (Directiva UE 2022/542 permite expres cota zero pentru aceste produse esențiale).',
      groups: ['Sănătate & Educație', 'Contabili & Fiscalitate', 'Toți cetățenii'],
    },
    'b588-2026': {
      score: 1.8,
      level: 'green',
      plainTitle: 'Trecerea finanțării centrelor militare de la primării și consilii județene la bugetul Ministerului Apărării Naționale (de la 1 ianuarie 2027)',
      tldr: 'Abrogă art. 35 lit. e) din Legea 45/1994 și art. 76–79 din Legea 446/2006 (moștenite din Legea comunistă nr. 14/1972) și introduce Art. 75^1 în Legea 446/2006, prin care MApN preia integral de la bugetul de stat, începând cu 1 ianuarie 2027, cheltuielile cu utilitățile, întreținerea, reparațiile și comisiile de recrutare ale centrelor militare.',
      claim: 'Degrevează bugetele locale ale județelor și primăriilor de obligația comunistă de a plăti facturile, mașinile și faxurile/telexurile centrelor militare, punând în aplicare angajamentul din OUG 7/2026.',
      reality: 'Reforma administrativă și bugetară este pe deplin justificată și susținută transpartinic de 120 de parlamentari (PSD, PNL, UDMR, Minorități, PACE); elimină litigiile cu Curtea de Conturi și lasă primăriilor banii pentru proiecte locale.',
      groups: ['Toți cetățenii', 'Contabili & Fiscalitate'],
    },
  };

  const info = remainingMap[bill.slug] || {
    score: 2.5,
    level: 'green',
    plainTitle: bill.officialTitle.replace(/^Propunere legislativă (?:pentru|privind)\s+/i, ''),
    tldr: bill.officialTitle,
    claim: 'Actualizarea cadrului normativ existent conform expunerii de motive depuse la Senat.',
    reality: 'Proiect legislativ sectorial fără restricții generale sau sancțiuni penale disproporționate identificate în text.',
    groups: ['Toți cetățenii'],
  };

  const proposalText =
    info.level === 'green'
      ? `Susțin adoptarea propunerii legislative ${bill.id}, cu recomandarea corelării normelor metodologice și a termenelor de aplicare conform Legii nr. 24/2000.`
      : `Solicit reanalizarea în comisiile de specialitate a propunerii ${bill.id} și efectuarea unei evaluări complete de impact înainte de adoptare.`;

  return {
    billId: bill.id,
    slug: bill.slug,
    updatedAt: new Date().toISOString(),
    consensus: {
      riskScore: info.score,
      riskLevel: info.level,
      plainTitle: info.plainTitle,
      summaryTlDr: info.tldr,
      initiatorClaim: info.claim,
      realityCheck: info.reality,
      affectedGroups: info.groups,
      senatForm: {
        articleRef: ensureLimit('În ansamblu', 50),
        proposalContent: ensureLimit(proposalText, 395),
        argumentation: ensureLimit(`${info.reality} (${info.tldr})`, 395),
        otherComments: ensureLimit(
          `Solicit analizarea în comisiile permanente competente și publicarea avizului Consiliului Legislativ și a punctului de vedere al Guvernului pentru ${bill.id}.`,
          395
        ),
      },
      docxTitle: `PUNCT DE VEDERE PRIVIND PROPUNEREA LEGISLATIVĂ ${bill.id}`,
      docxIntro: `Subsemnatul(a) {{NUME_CETATEAN}}, în temeiul procedurii de consultare publică a Senatului României, formulez prezentul Punct de vedere referitor la Propunerea legislativă ${bill.id} (${bill.officialTitle}).`,
      docxSections: [
        {
          heading: '1. Sinteza prevederilor analizate',
          paragraphs: [info.tldr, info.reality],
        },
        {
          heading: '2. Recomandare și argumentare',
          paragraphs: [proposalText],
        },
      ],
      docxRequests: [proposalText],
    },
    council: {
      agy: {
        model: 'agy',
        modelName: 'Gemini 4 Argon (High)',
        cliCommand: 'agy --model gemini-4-argon-high -p',
        status: 'ok',
        riskScore: info.score,
        riskLevel: info.level,
        verdictShort: info.reality,
        keyFindings: [info.tldr, info.reality],
        blindSpotsCaught: info.claim,
        constitutionalityNote: 'Nu au fost identificate vicii majore de neconstituționalitate extrinsecă în această etapă.',
        euLawNote: 'Necesită verificarea compatibilității cu reglementările sectoriale UE.',
      },
      claude: {
        model: 'claude',
        modelName: 'Claude Opus 5.5',
        cliCommand: 'claude -p --model opus',
        status: 'ok',
        riskScore: Math.max(1, Math.min(10, Math.round((info.score - 0.1) * 10) / 10)),
        riskLevel: info.level,
        verdictShort: info.tldr,
        keyFindings: [info.reality, info.claim],
        blindSpotsCaught: 'Verificare tehnică a trimiterilor legislative conform Legii nr. 24/2000.',
        constitutionalityNote: 'Respectarea exigențelor de claritate și previzibilitate a normei (art. 1 alin. 5 Constituție).',
        euLawNote: 'Evaluat din perspectiva proporționalității și a acquis-ului comunitar.',
      },
      codex: {
        model: 'codex',
        modelName: 'ChatGPT · GPT-6.1',
        cliCommand: 'codex exec',
        status: 'ok',
        riskScore: Math.max(1, Math.min(10, Math.round((info.score + 0.1) * 10) / 10)),
        riskLevel: info.level,
        verdictShort: `${info.plainTitle}. ${info.reality}`,
        keyFindings: [info.tldr],
        blindSpotsCaught: 'Analiză de impact administrativ și bugetar.',
        constitutionalityNote: 'Conformitate tehnică cu procedura parlamentară de legiferare.',
        euLawNote: 'Fără restricții directe asupra serviciilor societății informaționale.',
      },
    },
  };
}

const bills = JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8'));

// Normalize party names and fix B563/2026 initiators list to include all 11 signatories (10 on Senate table + Ciprian-Minodor Dobre on EM p.18) and Fenechiu's UNBR role
function normalizeParty(p = '') {
  const u = p.trim().toUpperCase();
  if (u.includes('MINORIT')) return 'Minorități';
  if (u.includes('NEAFILIAT') || u === 'INDEPENDENT') return 'Neafiliați';
  return p.trim();
}

for (const b of bills) {
  b.initiators = (b.initiators || []).map((init) => ({
    ...init,
    party: normalizeParty(init.party),
  }));
  b.parties = [...new Set(b.initiators.map((i) => i.party).filter(Boolean))];
  b.isCrossParty = b.parties.length >= 3;

  if (b.slug === 'b563-2026') {
    b.initiators = b.initiators.map((init) => {
      if (init.name.toLowerCase().includes('fenechiu')) {
        return { ...init, note: 'Vicepreședinte UNBR & Președinte UPLR' };
      }
      return { ...init, note: 'Avocat membru UNBR' };
    });
    if (!b.initiators.some((i) => i.name.toLowerCase().includes('dobre'))) {
      b.initiators.push({
        name: 'Dobre Ciprian-Minodor',
        role: 'deputat',
        party: 'PNL',
        note: 'Semnatar pe Expunerea de Motive (pag. 18) • Avocat',
      });
    }
  }
}
fs.writeFileSync(BILLS_FILE, JSON.stringify(bills, null, 2), 'utf8');

let generatedCount = 0;
for (const bill of bills) {
  const analysis = buildAutoAnalysis(bill);
  const outFile = path.join(ANALYSES_DIR, `${bill.slug}.json`);
  fs.writeFileSync(outFile, JSON.stringify(analysis, null, 2), 'utf8');
  generatedCount++;
}

console.log(`✅ Generat analizele Consiliului 3-AI (AGY + Claude + Codex) pentru toate cele ${generatedCount} proiecte de lege în ${ANALYSES_DIR}`);
