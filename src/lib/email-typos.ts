// „Ai vrut să scrii …@gmail.com?” sub câmpul de e-mail al abonării. Adresele greșite se întorc ca bounce, iar
// bounce-urile strică reputația domeniului de trimitere (pe 28 octombrie 2026: gmial.com și altele). Doar sugerăm;
// omul decide.

const KNOWN = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.ro', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.ro', 'outlook.com', 'outlook.ro', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net', 'gmx.de', 'mail.com', 'email.com', 'aol.com',
  'yandex.com', 'zoho.com',
];
// Furnizori cu o singură terminație: gmail.cm sau icloud.co sunt sigur greșeli, chiar dacă .cm și .co există.
const SINGLE_TLD: Record<string, string> = { gmail: 'com', googlemail: 'com', icloud: 'com', protonmail: 'com', proton: 'me', ymail: 'com' };

const sld = (d: string) => d.slice(0, d.lastIndexOf('.'));
const tld = (d: string) => d.slice(d.lastIndexOf('.') + 1);

// Distanța de editare cu transpoziții (gmial → gmail e o singură greșeală).
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Adresa corectată, când domeniul seamănă cu unul cunoscut fără să fie el; altfel null. */
export function suggestEmail(email: string): string | null {
  const at = email.trim().lastIndexOf('@');
  if (at < 1) return null;
  const local = email.trim().slice(0, at);
  const domain = email.trim().slice(at + 1).toLowerCase();
  if (!domain.includes('.') || KNOWN.includes(domain)) return null;

  const single = SINGLE_TLD[sld(domain)];
  if (single) return `${local}@${sld(domain)}.${single}`;

  let best = '';
  let bestDist = Infinity;
  for (const k of KNOWN) {
    const dist = distance(domain, k);
    if (dist < bestDist) [best, bestDist] = [k, dist];
  }
  if (bestDist > 2 || (bestDist === 2 && best.length < 9)) return null;
  // yahoo.fr, hotmail.it: același furnizor, altă țară, deci probabil corect.
  if (sld(domain) === sld(best) && /^[a-z]{2}$/.test(tld(domain)) && tld(domain) !== 'co') return null;
  return `${local}@${best}`;
}
