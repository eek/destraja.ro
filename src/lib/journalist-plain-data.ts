import type { EnrichedBill, RiskLevel } from './types';

export const CLI_MODELS_META = {
  agy: {
    shortLabel: 'Gemini',
    fullModel: 'Gemini 4 Argon',
    command: 'Google DeepMind · Gemini 4 Argon',
    role: 'Tehnică legislativă, sancțiuni & impact cetățenesc',
  },
  claude: {
    shortLabel: 'Claude',
    fullModel: 'Claude Opus 5.5',
    command: 'Anthropic · Claude Opus 5.5',
    role: 'Constituționalitate & Drept UE (TRIS / 2018/958)',
  },
  codex: {
    shortLabel: 'ChatGPT',
    fullModel: 'ChatGPT (GPT-6.1)',
    command: 'OpenAI · GPT-6.1',
    role: 'Impact economic, IT/AI, IMM & fiscalitate',
  },
};

export const PARTY_META: Record<
  string,
  { name: string; fullName: string; badgeClass: string; barColor: string }
> = {
  PSD: {
    name: 'PSD',
    fullName: 'Partidul Social Democrat',
    badgeClass: 'bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/25',
    barColor: 'bg-red-600',
  },
  PNL: {
    name: 'PNL',
    fullName: 'Partidul Național Liberal',
    badgeClass: 'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25',
    barColor: 'bg-amber-500',
  },
  USR: {
    name: 'USR',
    fullName: 'Uniunea Salvați România',
    badgeClass: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25',
    barColor: 'bg-sky-500',
  },
  AUR: {
    name: 'AUR',
    fullName: 'Alianța pentru Unirea Românilor',
    badgeClass: 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/30',
    barColor: 'bg-yellow-500',
  },
  SOS: {
    name: 'SOS',
    fullName: 'Partidul S.O.S. România',
    badgeClass: 'bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/25',
    barColor: 'bg-purple-500',
  },
  UDMR: {
    name: 'UDMR',
    fullName: 'Uniunea Democrată Maghiară din România',
    badgeClass: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    barColor: 'bg-emerald-600',
  },
  POT: {
    name: 'POT',
    fullName: 'Partidul Oamenilor Tineri',
    badgeClass: 'bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25',
    barColor: 'bg-teal-500',
  },
  UPR: {
    name: 'UPR',
    fullName: 'Grupul Parlamentar Uniți pentru România',
    badgeClass: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border-cyan-500/25',
    barColor: 'bg-cyan-600',
  },
  PACE: {
    name: 'PACE',
    fullName: 'Grupul Parlamentar PACE — Întâi România',
    badgeClass: 'bg-orange-500/12 text-orange-700 dark:text-orange-300 border-orange-500/25',
    barColor: 'bg-orange-500',
  },
  Minorități: {
    name: 'Minorități',
    fullName: 'Grupul Parlamentar al Minorităților Naționale',
    badgeClass: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25',
    barColor: 'bg-indigo-500',
  },
  Neafiliați: {
    name: 'Neafiliați',
    fullName: 'Parlamentari Neafiliați',
    badgeClass: 'bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25',
    barColor: 'bg-slate-500',
  },
};

/**
 * 1-Sentence Plain Romanian translation for the "Average Joe" — zero legal jargon.
 */
export const CITIZEN_ONE_LINERS: Record<string, string> = {
  'b563-2026':
    'Nu vei mai putea înființa o firmă la ONRC, scrie un contract sau divorța cu copii fără să plătești obligatoriu un avocat, iar aplicațiile AI/online de documente pot fi blocate în 5 zile.',
  'b543-2026':
    'Dă voie să se construiască biserici și mănăstiri direct în Arii Naturale Protejate (Natura 2000), în extravilan, fără studiu de impact asupra mediului.',
  'b573-2026':
    'Elimină pragul electoral alternativ (20% în 4 județe), blocând accesul în Parlament al partidelor noi sau regionale care nu ating 5% la nivel național.',
  'b571-2026':
    'Angajații din MApN care gestionează achiziții primesc bonusuri salariale de 10% direct din amenzile și penalitățile pe care le aplică firmelor furnizoare.',
  'b565-2026':
    'Dacă ești concediat sau suspendat pe nedrept la privat și câștigi în instanță, ți se scad din despăgubiri banii câștigați în altă parte și pierzi dobânda legală.',
  'b574-2026':
    'Dacă ești funcționar public suspendat abuziv și câștigi procesul, statul îți taie din salariile restante orice venit obținut între timp și elimină dobânda legală.',
  'b553-2026':
    'Promite câte 2,5 hectare de teren de la stat pentru tinerii fermieri, dar fără criterii clare și fără terenuri disponibile în multe comune.',
  'b557-2026':
    'Reduce cu 50% impozitul pe o locuință și o mașină pentru donatorii de sânge, dar fără a compensa bugetele primăriilor (aviz negativ CES).',
  'b544-2026':
    'Introduce o oră obligatorie pe săptămână de „stil de viață sănătos” în toate școlile, predată de profesori de biologie și medici, fără buget alocat.',
  'b517-2026':
    'Amână până în 2028 noua rovinietă și taxarea camioanelor după poluare și kilometri parcurși (risc de blocaj pe banii din PNRR).',
  'b519-2026':
    'Șterge datoriile imputate mamelor cărora funcționarii statului le-au calculat greșit indemnizația de creștere a copilului.',
  'b533-2026':
    'Obligă instituțiile statului să publice datele publice în format deschis (API), nu ascunse în PDF-uri scanate imposibil de căutat.',
  'b534-2026':
    'Interzice primăriilor și instituțiilor să îți mai ceară la ghișeu adeverințe de venit pe care statul le are deja în baza de date ANAF.',
  'b566-2026':
    'Dacă îți intră hoțul în casă sau în curte prin efracție, ești protejat automat prin prezumția de legitimă apărare.',
  'b575-2026':
    'Protejează mamele și victimele violenței domestice să nu fie evacuate din locuința socială imediat după partaj dacă nu au unde locui.',
  'b576-2026':
    'Modifică în regim de urgență noul Cod al Urbanismului și permite construirea/supraetajarea fără PUZ dacă vecinii au aceeași înălțime.',
  'b518-2026':
    'Obligă magazinele să afișeze vizibil țara de origine și steagul pentru fructe, legume, carne și lactate.',
  'b520-2026':
    'Scutește de impozit pensiile sub 4.000 lei și aplică impozit progresiv pe partea care depășește acest prag.',
  'b521-2026':
    'Crește alocațiile de hrană și bursele pentru elevii cu cerințe educaționale speciale (CES).',
  'b522-2026':
    'Oferă tichete sociale și sprijin financiar pentru pensionarii cu venituri mici înaintea sărbătorilor.',
  'b523-2026':
    'Plafonează adaosul comercial la alimentele de bază românești în marile lanțuri de magazine.',
  'b524-2026':
    'Permite pensionarea anticipată fără penalizare pentru persoanele care au lucrat în condiții grele în zone poluate.',
  'b526-2026':
    'Simplifică angajarea sezonierilor și zilierilor în agricultură și HoReCa cu formalități reduse.',
  'b531-2026':
    'Reglementează vânzarea terenurilor agricole și dreptul de preempțiune pentru fermierii locali.',
  'b532-2026':
    'Actualizează regulile de finanțare și funcționare pentru cabinetele medicilor de familie din mediul rural.',
  'b535-2026':
    'Clarifică statutul și drepturile asistenților personali care îngrijesc persoane cu dizabilități grave.',
  'b538-2026':
    'Deblochează angajarea personalului medical și auxiliar în spitalele publice cu deficit acut de medici.',
  'b539-2026':
    'Acordă facilități fiscale firmelor care angajează tineri absolvenți la primul loc de muncă.',
  'b540-2026':
    'Actualizează normele de siguranță rutieră și semnalizare pentru drumurile județene și comunale.',
  'b545-2026':
    'Introduce deduceri din impozitul pe venit pentru părinții care plătesc creșă, grădiniță sau activități sportive pentru copii.',
  'b546-2026':
    'Simplifică autorizarea micilor producători locali care vând produse tradiționale direct din gospodărie.',
  'b547-2026':
    'Extinde programele de screening medical gratuit și prevenție decontate prin Casa de Asigurări de Sănătate.',
  'b548-2026':
    'Instituie reguli mai stricte pentru protecția pădurilor și trasabilitatea lemnului în sistemul SUMAL.',
  'b549-2026':
    'Elimină supra-impozitarea contractelor part-time pentru elevi, studenți, mame și persoane care au deja un loc de muncă.',
  'b554-2026':
    'Actualizează tarifele și procedurile pentru experții tehnici judiciari din procesele civile și penale.',
  'b555-2026':
    'Permite decontarea serviciilor de consiliere psihologică pentru elevi și tineri prin CNAS.',
  'b556-2026':
    'Clarifică regimul juridic al asociațiilor de proprietari și modul de recuperare a restanțelor la întreținere.',
  'b558-2026':
    'Introduce subvenții pentru irigații și sisteme de stocare a apei în fermele afectate de secetă.',
  'b564-2026':
    'Reglementează telemunca și dreptul la deconectare al angajaților în afara orelor de program.',
  'b567-2026':
    'Acordă reduceri la transportul feroviar și local pentru donatorii de sânge și studenți.',
  'b568-2026':
    'Simplifică racordarea prosumatorilor (panouri fotovoltaice pe casă) la rețeaua de distribuție a energiei.',
  'b572-2026':
    'Modifică regulile de organizare și salarizare pentru personalul din instituțiile publice de cultură.',
  'b577-2026':
    'Permite primăriilor să repare și să modifice fațadele clădirilor monument istoric chiar dacă sunt proprietate privată și fără acordul proprietarului.',
  'b578-2026':
    'Introduce testarea antidrog obligatorie și aleatorie pentru toți senatorii, deputații și angajații din Parlamentul României.',
  'b579-2026':
    'Obligă primăriile să racordeze gratuit și rapid la apă, curent, gaze și internet tinerii care își construiesc prima casă (fără sursă clară de buget).',
  'b580-2026':
    'Înființează o nouă instituție de stat („Avocatul Furnizorului de Servicii Sociale”) care să apere patronii și operatorii de cămine sociale în fața controalelor ISU și ANPIS.',
  'b581-2026':
    'Elimină birocrația pentru profesori: testul de limbă promovat la titularizare devine valabil 5 ani în loc să fie dat din nou în fiecare an.',
  'b582-2026':
    'Oprește tipărirea inutilă în Monitorul Oficial a întrebărilor parlamentare care sunt deja publicate gratuit pe site-ul Parlamentului.',
  'b583-2026':
    'Scutește de impozit auto o singură mașină pentru fiecare cetățean („Ai plătit-o, e a ta!”), dar fără plafon pentru mașinile de lux sau poluante.',
  'b584-2026':
    'Oferă o indemnizație specială adulților cu handicap grav din copilărie care nu au putut munci niciodată și nu au pensie.',
  'b585-2026':
    'Permite asociațiilor de proprietari să monteze panouri fotovoltaice și baterii pe bloc și să împartă curentul gratuit între lift/scară și apartamente.',
  'b586-2026':
    'Acordă sprijin financiar și tehnologii asistive pentru angajarea și adaptarea locului de muncă al persoanelor cu dizabilități.',
  'b587-2026':
    'Elimină TVA-ul (TVA 0%) pentru scutecele de bebeluși, absorbantele igienice, tampoane și produsele pentru incontinență.',
  'b588-2026':
    'Trece plata facturilor, reparațiilor și dotărilor centrelor militare de la primării și consilii județene direct la bugetul Ministerului Apărării Naționale de la 1 ianuarie 2027.',
};

export function getCitizenOneLiner(bill: EnrichedBill): string {
  if (bill.analysis.consensus.citizenOneLiner) {
    return bill.analysis.consensus.citizenOneLiner;
  }
  if (CITIZEN_ONE_LINERS[bill.slug]) {
    return CITIZEN_ONE_LINERS[bill.slug];
  }
  return bill.analysis.consensus.summaryTlDr;
}

export interface PartyStat {
  party: string;
  fullName: string;
  billsCount: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  emergencyCount: number;
  crossPartyCount: number;
  totalSignatures: number;
  avgRiskScore: number;
  topBill: { id: string; slug: string; plainTitle: string; riskScore: number } | null;
}

export interface MpStat {
  name: string;
  party: string;
  role: string;
  billsCount: number;
  redCount: number;
  avgRiskScore: number;
  billIds: string[];
}

export function computeJournalistStats(bills: EnrichedBill[]) {
  const partyMap = new Map<
    string,
    {
      bills: EnrichedBill[];
      signatures: number;
    }
  >();

  const mpMap = new Map<
    string,
    {
      name: string;
      party: string;
      role: string;
      bills: EnrichedBill[];
    }
  >();

  for (const bill of bills) {
    // Count parties on this bill
    const partiesInBill = new Set<string>(bill.parties);
    for (const p of partiesInBill) {
      if (!partyMap.has(p)) {
        partyMap.set(p, { bills: [], signatures: 0 });
      }
      partyMap.get(p)!.bills.push(bill);
    }

    for (const init of bill.initiators) {
      const p = init.party || 'Neafiliați';
      if (!partyMap.has(p)) {
        partyMap.set(p, { bills: [], signatures: 0 });
      }
      partyMap.get(p)!.signatures += 1;

      const mpKey = init.name.trim();
      if (!mpMap.has(mpKey)) {
        mpMap.set(mpKey, {
          name: mpKey,
          party: p,
          role: init.role,
          bills: [],
        });
      }
      const mpEntry = mpMap.get(mpKey)!;
      if (!mpEntry.bills.some((b) => b.id === bill.id)) {
        mpEntry.bills.push(bill);
      }
    }
  }

  const partyStats: PartyStat[] = [];
  for (const [party, data] of partyMap.entries()) {
    const bList = data.bills;
    if (bList.length === 0) continue;
    const redCount = bList.filter((b) => b.analysis.consensus.riskLevel === 'red').length;
    const yellowCount = bList.filter((b) => b.analysis.consensus.riskLevel === 'yellow').length;
    const greenCount = bList.filter((b) => b.analysis.consensus.riskLevel === 'green').length;
    const emergencyCount = bList.filter((b) => b.emergencyRequested).length;
    const crossPartyCount = bList.filter((b) => b.isCrossParty).length;
    const avgRiskScore =
      Math.round(
        (bList.reduce((acc, b) => acc + b.analysis.consensus.riskScore, 0) / bList.length) * 10
      ) / 10;

    const sortedByRisk = [...bList].sort(
      (a, b) => b.analysis.consensus.riskScore - a.analysis.consensus.riskScore
    );
    const top = sortedByRisk[0];

    partyStats.push({
      party,
      fullName: PARTY_META[party]?.fullName || party,
      billsCount: bList.length,
      redCount,
      yellowCount,
      greenCount,
      emergencyCount,
      crossPartyCount,
      totalSignatures: data.signatures,
      avgRiskScore,
      topBill: top
        ? {
            id: top.id,
            slug: top.slug,
            plainTitle: top.analysis.consensus.plainTitle,
            riskScore: top.analysis.consensus.riskScore,
          }
        : null,
    });
  }

  // Sort parties by redCount desc, then billsCount desc
  partyStats.sort((a, b) => {
    if (b.redCount !== a.redCount) return b.redCount - a.redCount;
    return b.billsCount - a.billsCount;
  });

  const mpStats: MpStat[] = [];
  for (const mp of mpMap.values()) {
    const redCount = mp.bills.filter((b) => b.analysis.consensus.riskLevel === 'red').length;
    const avgRiskScore =
      Math.round(
        (mp.bills.reduce((acc, b) => acc + b.analysis.consensus.riskScore, 0) / mp.bills.length) *
          10
      ) / 10;
    mpStats.push({
      name: mp.name,
      party: mp.party,
      role: mp.role,
      billsCount: mp.bills.length,
      redCount,
      avgRiskScore,
      billIds: mp.bills.map((b) => b.id),
    });
  }

  mpStats.sort((a, b) => {
    if (b.billsCount !== a.billsCount) return b.billsCount - a.billsCount;
    return b.redCount - a.redCount;
  });

  const crossPartyBills = bills
    .filter((b) => b.isCrossParty)
    .sort((a, b) => b.analysis.consensus.riskScore - a.analysis.consensus.riskScore);

  const cesNegativeBills = bills.filter((b) =>
    b.timeline.some((t) => t.action.toLowerCase().includes('negativ'))
  );

  return {
    partyStats,
    mpStats,
    crossPartyBills,
    cesNegativeBills,
  };
}
