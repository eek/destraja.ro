#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx';

const ROOT = process.cwd();
const ANALYSES_DIR = path.join(ROOT, 'data', 'analyses');
const BILLS_FILE = path.join(ROOT, 'data', 'senat-bills.json');
const OUT_DIR = path.join(ROOT, 'public', 'docs');

async function generateDocxForBill(bill, analysis) {
  const c = analysis.consensus;
  const children = [];

  // Header
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: c.docxTitle || `PUNCT DE VEDERE AL SOCIETĂȚII CIVILE PRIVIND PROIECTUL ${bill.id}`,
          bold: true,
          size: 28,
          font: 'Calibri',
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      border: {
        bottom: { color: '999999', space: 8, style: BorderStyle.SINGLE, size: 6 },
      },
      children: [
        new TextRun({
          text: `${bill.officialTitle} (Cod Senat: ${bill.cod} | Termen dezbatere publică: ${bill.consultationDeadline})`,
          italics: true,
          size: 20,
          color: '444444',
          font: 'Calibri',
        }),
      ],
    })
  );

  // Addressee
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({
          text: 'Către: Biroul Permanent al Senatului României și Comisiile permanente sesizate în fond și pentru aviz',
          bold: true,
          size: 22,
          font: 'Calibri',
        }),
      ],
    })
  );

  // Intro
  children.push(
    new Paragraph({
      spacing: { after: 240 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text:
            c.docxIntro ||
            `În temeiul art. 7 din Legea nr. 52/2003 privind transparența decizională și al procedurii de consultare publică a Senatului României, formulăm prezentul punct de vedere tehnic și juridic referitor la propunerea legislativă ${bill.id}.`,
          size: 22,
          font: 'Calibri',
        }),
      ],
    })
  );

  // Synthesis box
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: `I. Sinteză Executivă (Scor Risc AI — Gemini + Claude + ChatGPT: ${c.riskScore.toFixed(1)}/10)`,
          bold: true,
          size: 24,
          font: 'Calibri',
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { after: 160 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({ text: 'Ce susțin inițiatorii: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: c.initiatorClaim, size: 22, font: 'Calibri' }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { after: 240 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({ text: 'Efectul real în practică: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: c.realityCheck, size: 22, font: 'Calibri' }),
      ],
    })
  );

  // Custom sections or AI Council findings
  const sections = c.docxSections && c.docxSections.length > 0
    ? c.docxSections
    : [
        {
          heading: 'II. Analiza Tehnică, Constituțională și de Drept European',
          paragraphs: [
            `Evaluare Gemini (Gemini 4 Argon): ${analysis.council.agy.verdictShort} — ${analysis.council.agy.constitutionalityNote} ${analysis.council.agy.euLawNote}`,
            `Evaluare Claude (Claude Opus 5.5): ${analysis.council.claude.verdictShort} — ${analysis.council.claude.constitutionalityNote} ${analysis.council.claude.euLawNote}`,
            `Evaluare ChatGPT (GPT-6.1): ${analysis.council.codex.verdictShort} — ${analysis.council.codex.constitutionalityNote} ${analysis.council.codex.euLawNote}`,
          ],
        },
        {
          heading: 'III. Propunere de Amendare / Reglementare și Argumentare',
          paragraphs: [
            `Articol vizat: ${c.senatForm.articleRef}`,
            `Conținut propunere: ${c.senatForm.proposalContent}`,
            `Argumentare: ${c.senatForm.argumentation}`,
            `Observații suplimentare: ${c.senatForm.otherComments}`,
          ],
        },
      ];

  for (const sec of sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: sec.heading,
            bold: true,
            size: 24,
            font: 'Calibri',
          }),
        ],
      })
    );

    for (const p of sec.paragraphs) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({
              text: p,
              size: 22,
              font: 'Calibri',
            }),
          ],
        })
      );
    }
  }

  // Requests
  const requests = c.docxRequests && c.docxRequests.length > 0
    ? c.docxRequests
    : [
        `Având în vedere argumentele de mai sus, solicităm Comisiilor raportoare analizarea prezentelor observații și ${c.riskLevel === 'red' ? 'emiterea unui raport de respingere / eliminare a prevederilor neconstituționale' : 'adoptarea amendamentelor tehnic-legislative propuse'}.`,
      ];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 120 },
      children: [
        new TextRun({
          text: 'Concluzii și Solicitări Oficiale',
          bold: true,
          size: 24,
          font: 'Calibri',
        }),
      ],
    })
  );

  for (const req of requests) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        bullet: { level: 0 },
        children: [
          new TextRun({
            text: req,
            bold: true,
            size: 22,
            font: 'Calibri',
          }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 360, after: 120 },
      children: [
        new TextRun({
          text: 'Cu deosebită considerație,',
          size: 22,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'Cetățean / Contribuabil / Reprezentant al Societății Civile',
          bold: true,
          size: 22,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generat prin platforma civică „La Straja Legii” • Referință proiect: ${bill.id} (Cod Senat ${bill.cod})`,
          italics: true,
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const billsRaw = JSON.parse(await fs.readFile(BILLS_FILE, 'utf8'));
  const bills = Array.isArray(billsRaw) ? billsRaw : billsRaw.bills;
  let count = 0;

  for (const bill of bills) {
    const analysisPath = path.join(ANALYSES_DIR, `${bill.slug}.json`);
    const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf8'));
    const buf = await generateDocxForBill(bill, analysis);
    const fileName = `Punct_de_vedere_${bill.slug.toUpperCase()}.docx`;
    await fs.writeFile(path.join(OUT_DIR, fileName), buf);
    count++;
  }

  console.log(`✅ Generat ${count} fișiere Word (.docx) în ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
