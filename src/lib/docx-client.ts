import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx';
import type { EnrichedBill } from './types';

export async function downloadPersonalizedDocx(
  bill: EnrichedBill,
  citizenName: string,
  citizenRole: string
): Promise<void> {
  const c = bill.analysis.consensus;
  const signerName = citizenName.trim() || 'Cetățean / Contribuabil Român';
  const signerRole =
    citizenRole.trim() || 'Participant la procedura de consultare publică a Senatului României';

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text:
            c.docxTitle ||
            `PUNCT DE VEDERE AL SOCIETĂȚII CIVILE PRIVIND PROIECTUL ${bill.id}`,
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

  children.push(
    new Paragraph({
      spacing: { after: 240 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text: `Subsemnatul/a ${signerName} (${signerRole}), în cadrul consultării publice organizate de Senatul României și în exercitarea dreptului de petiționare prevăzut de art. 51 din Constituția României, formulez prezentul punct de vedere tehnic și juridic referitor la propunerea legislativă ${bill.id}:`,
          size: 22,
          font: 'Calibri',
        }),
      ],
    })
  );

  // Introducerea scrisă de modele, când începe cu „Subsemnatul(a) {{NUME_CETATEAN}}”, repetă paragraful de mai sus, care
  // are deja numele: o sărim, altfel ar apărea două „Subsemnatul”, al doilea fără nume (issue #7).
  if (c.docxIntro && !c.docxIntro.includes('{{NUME_CETATEAN}}')) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun({
            text: c.docxIntro,
            size: 22,
            font: 'Calibri',
          }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          // Documentul e al cetățeanului care îl semnează: modelele AI apar doar în nota de la final.
          text: 'I. Sinteză Executivă',
          bold: true,
          size: 24,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 160 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({ text: 'Ce susțin inițiatorii: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: c.initiatorClaim, size: 22, font: 'Calibri' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({ text: 'Efectul real în practică: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: c.realityCheck, size: 22, font: 'Calibri' }),
      ],
    })
  );

  const sections =
    c.docxSections && c.docxSections.length > 0
      ? c.docxSections
      : [
          {
            heading: 'II. Analiza Tehnică, Constituțională și de Drept European',
            paragraphs: [
              // Câte o perspectivă, după rolul fiecărui model, fără numele lui.
              `Tehnică legislativă și impactul asupra cetățenilor: ${bill.analysis.council.agy.verdictShort} — ${bill.analysis.council.agy.constitutionalityNote} ${bill.analysis.council.agy.euLawNote}`,
              `Constituționalitate și drept european: ${bill.analysis.council.claude.verdictShort} — ${bill.analysis.council.claude.constitutionalityNote} ${bill.analysis.council.claude.euLawNote}`,
              `Impact economic și fiscal: ${bill.analysis.council.codex.verdictShort} — ${bill.analysis.council.codex.constitutionalityNote} ${bill.analysis.council.codex.euLawNote}`,
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

  const requests =
    c.docxRequests && c.docxRequests.length > 0
      ? c.docxRequests
      : [
          `Având în vedere argumentele de mai sus, solicit Comisiilor raportoare analizarea prezentelor observații și ${
            c.riskLevel === 'red'
              ? 'emiterea unui raport de respingere / eliminare a prevederilor neconstituționale'
              : 'adoptarea amendamentelor tehnic-legislative propuse'
          }.`,
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
      spacing: { before: 360, after: 100 },
      children: [
        new TextRun({
          text: 'Cu deosebită considerație,',
          size: 22,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: signerName,
          bold: true,
          size: 24,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: signerRole,
          italics: true,
          size: 20,
          color: '444444',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 240 },
      children: [
        new TextRun({
          text: `Pregătit cu destrajă.ro, pe baza analizei a trei modele AI • Referință proiect: ${bill.id} (Cod Senat ${bill.cod})`,
          italics: true,
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Punct_de_vedere_${bill.slug.toUpperCase()}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
