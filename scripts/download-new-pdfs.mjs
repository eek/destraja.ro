#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const BILLS_FILE = path.join(ROOT_DIR, 'data', 'senat-bills.json');
const PDF_DIR = path.join(ROOT_DIR, 'data', 'pdfs');
const TEXT_DIR = path.join(ROOT_DIR, 'data', 'texts');

async function main() {
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = mod.default || mod;
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8'));

  for (const bill of bills) {
    const num = parseInt(bill.id.split('/')[0].replace(/\D/g, ''), 10);
    if (num < 577) continue;

    const billPdfDir = path.join(PDF_DIR, bill.slug);
    const billTextDir = path.join(TEXT_DIR, bill.slug);
    fs.mkdirSync(billPdfDir, { recursive: true });
    fs.mkdirSync(billTextDir, { recursive: true });

    console.log(`📥 Se descarcă PDF-urile pentru ${bill.id}...`);
    for (const pdf of bill.pdfs || []) {
      const filename = `${pdf.type}_${path.basename(pdf.url)}`;
      const filePath = path.join(billPdfDir, filename);
      const txtPath = path.join(billTextDir, `${pdf.type}.txt`);

      if (!fs.existsSync(filePath)) {
        const res = await fetch(pdf.url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(filePath, buf);
        }
      }
      if (fs.existsSync(filePath)) {
        try {
          const buf = fs.readFileSync(filePath);
          const parsed = await pdfParse(buf);
          if (parsed?.text && parsed.text.trim().length > 20) {
            fs.writeFileSync(txtPath, parsed.text.trim(), 'utf8');
          }
        } catch {
          // ignore
        }
      }
    }
  }
  console.log('✅ PDF-uri descărcate și extrase pentru B577-B587!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
