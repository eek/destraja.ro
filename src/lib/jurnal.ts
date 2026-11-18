import fs from 'node:fs/promises';
import path from 'node:path';

/** Jurnalul complet (scripts/straja-jurnal.mjs): fiecare schimbare din istoricul codului, rescrisă pe scurt, în română. */
export type JournalKind = 'site' | 'date' | 'intern';

export interface JournalItem {
  hash: string;
  date: string;
  kind: JournalKind;
  text: string;
}

export interface JournalDay {
  date: string;
  items: JournalItem[];
}

export async function getJournal(): Promise<JournalDay[]> {
  let data: { items: JournalItem[] };
  try {
    data = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'jurnal.json'), 'utf8'));
  } catch {
    return [];
  }
  const days = new Map<string, JournalItem[]>();
  for (const i of data.items) days.set(i.date, [...(days.get(i.date) ?? []), i]);
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => ({ date, items }));
}
