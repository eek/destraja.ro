import fs from 'node:fs/promises';
import path from 'node:path';

/** Date de contact copiate de pe fișa oficială a parlamentarului (scripts/straja-mps.mjs). */
export interface MpOffice {
  address: string;
  phone?: string;
  email?: string;
}

export interface MpConstituency {
  number: number | null;
  name: string | null;
  // Deputații minorităților sunt aleși la nivel național, pentru o organizație.
  national?: string | null;
}

export type Chamber = 'cdep' | 'senat';

export interface MpContact {
  matched: boolean;
  reason?: string;
  // Data încetării mandatului (YYYY-MM-DD), pentru parlamentarii care nu mai sunt în funcție.
  endedOn?: string;
  matchedBy?: string;
  officialName?: string;
  note?: string;
  chamber: Chamber;
  source: string;
  checkedAt: string;
  constituency: MpConstituency | null;
  emails: string[];
  phones: string[];
  offices: MpOffice[];
}

// Adresele poștale ale camerelor, așa cum apar în subsolul fișelor oficiale.
export const CHAMBERS: Record<Chamber, { site: string; name: string; list: string; postal: string }> = {
  cdep: {
    site: 'cdep.ro',
    name: 'Camera Deputaților',
    list: 'https://www.cdep.ro/ords/pls/parlam/structura2015.de?cam=2&leg=2024&idl=1',
    postal: 'Palatul Parlamentului, str. Izvor nr. 2-4, sector 5, București',
  },
  senat: {
    site: 'senat.ro',
    name: 'Senatul României',
    list: 'https://www.senat.ro/FisaSenatori.aspx',
    postal: 'Calea 13 Septembrie nr. 1-3, sector 5, București, cod poștal 050711',
  },
};

const FILE = path.join(process.cwd(), 'data', 'mp-contacts.json');
let cache: Promise<Record<string, MpContact>> | null = null;

export function getMpContacts(): Promise<Record<string, MpContact>> {
  cache ??= fs
    .readFile(FILE, 'utf8')
    .then((raw) => JSON.parse(raw) as Record<string, MpContact>)
    .catch(() => ({}));
  return cache;
}

export async function getMpContact(name: string): Promise<MpContact | null> {
  return (await getMpContacts())[name] ?? null;
}

/** „021 316 0300” → „+40213160300”, pentru linkurile tel:. */
export function telHref(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('40') ? digits.slice(2) : digits.replace(/^0/, '');
  return `tel:+40${national}`;
}
