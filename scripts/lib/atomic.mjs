// Scrieri întregi sau deloc: conținutul ajunge într-un fișier temporar din același folder, apoi ia locul celui vechi
// printr-o redenumire. Un proces oprit la mijloc (limita de timp a pasului, somnul Mac-ului) lasă fișierul vechi întreg.
import fs from 'node:fs';
import path from 'node:path';

/** Scrie `content` (text sau Buffer) în `file`. Formatul rămâne al apelantului: primește textul gata serializat. */
export function writeFileAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}
