// Variante pentru blocul „Cum s-a votat”: același brief (brief.md + DESIGN.md + craft floor + codul actual + date) dat lui
// Gemini, ChatGPT și Muse, fără unelte. Fiecare răspuns ajunge în src/components/bills/variants/BillVotes<Nume>.tsx.
//
//   node design/voturi/run.mjs [gemini] [gpt] [muse]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runModel } from '../../scripts/lib/ai-cli.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const OUT = path.join(ROOT, 'src/components/bills/variants');
fs.mkdirSync(OUT, { recursive: true });

const types = read('src/lib/types.ts');
const voteTypes = types.slice(types.indexOf('export type VoteChoice'), types.indexOf('export interface BillVotes'));
const sample = JSON.parse(read('data/votes/plx-136-2026.json'));
for (const v of sample.votes) v.members = [...v.members.slice(0, 10), ...v.members.filter((m) => m.vote !== 'pentru').slice(0, 8)];

const prompt = [
  read('design/voturi/brief.md'),
  '## DESIGN.md (the site design system)\n\n' + read('DESIGN.md'),
  '## Craft floor (quality bar)\n\n' + fs.readFileSync(path.join(os.homedir(), '.claude/skills/impeccable/reference/craft-floor.md'), 'utf8'),
  '## Current component: src/components/bills/BillVotes.tsx\n\n```tsx\n' + read('src/components/bills/BillVotes.tsx') + '\n```',
  '## Types (@/lib/types)\n\n```ts\n' + voteTypes + types.slice(types.indexOf('export interface BillVotes')).split('\n}\n')[0] + '\n}\n```',
  '## Helpers (@/lib/vote-text)\n\n```ts\n' + read('src/lib/vote-text.ts') + '\n```',
  "## From @/components/ui\n\n```tsx\nexport const panel = 'rounded-2xl border border-line bg-surface';\nexport function PartyTag({ party }: { party: string }) // 11px semibold initials in a 6px-cornered hairline outline\n```",
  "## From @/lib/site\n\n```ts\nexport const PARTY_ORDER = ['PSD', 'PNL', 'USR', 'UDMR', 'Minorități', 'AUR', 'SOS', 'POT', 'PACE', 'UPR', 'Neafiliați'];\n```",
  '## Sample data (data/votes/plx-136-2026.json; members trimmed here, real lists have 110–261 names)\n\n```json\n' + JSON.stringify(sample, null, 1) + '\n```',
  'Componenta rulează pe pagini statice (Next.js, export static). Textul de mai sus e brief-ul tău; nu ai unelte: răspunde direct cu fișierul.',
].join('\n\n');
fs.writeFileSync(path.join(ROOT, 'design/voturi/prompt.md'), prompt);

function extract(text) {
  const m = text.match(/```(?:tsx|typescript|ts|jsx)?\n([\s\S]*?)```/g);
  if (!m) return null;
  const longest = m.sort((a, b) => b.length - a.length)[0];
  return longest.replace(/^```\w*\n/, '').replace(/```$/, '');
}

function muse() {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.homedir(), '.cache-muse-'));
    fs.writeFileSync(path.join(dir, 'prompt.md'), prompt);
    const child = spawn('muse', ['exec', '--preset', 'empty', '--prompt-file', path.join(dir, 'prompt.md')], { cwd: dir });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    const timer = setTimeout(() => child.kill('SIGTERM'), 30 * 60_000);
    child.on('close', () => {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
      resolve(out);
    });
  });
}

const want = process.argv.slice(2);
const jobs = {
  gemini: async () => {
    const r = await runModel('agy', prompt, { mode: 'offline', timeoutMs: 30 * 60_000, text: true, label: 'variante voturi' });
    return r.status === 'ok' ? (typeof r.data === 'string' ? r.data : r.text) : `EROARE ${r.error}`;
  },
  gpt: async () => {
    const r = await runModel('codex', prompt, { mode: 'offline', timeoutMs: 30 * 60_000, text: true, label: 'variante voturi' });
    return r.status === 'ok' ? (typeof r.data === 'string' ? r.data : r.text) : `EROARE ${r.error}`;
  },
  muse,
};
const names = { gemini: 'Gemini', gpt: 'Gpt', muse: 'Muse' };
await Promise.all(
  Object.entries(jobs)
    .filter(([k]) => !want.length || want.includes(k))
    .map(async ([k, fn]) => {
      const t = Date.now();
      const text = String(await fn());
      fs.writeFileSync(path.join(ROOT, `design/voturi/raspuns-${k}.md`), text);
      const code = extract(text);
      if (code) fs.writeFileSync(path.join(OUT, `BillVotes${names[k]}.tsx`), code);
      console.log(`${k}: ${code ? 'fișier scris' : 'fără bloc de cod'} (${Math.round((Date.now() - t) / 1000)}s)`);
    }),
);
