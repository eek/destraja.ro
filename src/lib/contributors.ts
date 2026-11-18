import { SOURCE_URL } from './site';

/**
 * Cine a ajutat la destrajă.ro, pentru pagina /contributori. Doar contribuții publice (propuneri și cod pe GitHub),
 * cu numele public al contului; cititorii care trimit rapoarte nu apar cu numele aici, ci la rezultatul raportului.
 */
export interface Contribution {
  /** Numele public al contului, altfel numele contului. */
  name: string;
  github: string;
  what: string;
  links: { label: string; href: string }[];
}

const repo = SOURCE_URL ?? 'https://github.com/eek/destraja.ro';
const pr = (n: number) => ({ label: `cod #${n}`, href: `${repo}/pull/${n}` });
const issue = (n: number, label = 'propunerea') => ({ label: `${label} #${n}`, href: `${repo}/issues/${n}` });

export const CONTRIBUTIONS: Contribution[] = [
  {
    name: 'rboarescu',
    github: 'rboarescu',
    what: 'Textul în vigoare al articolelor pe care le schimbă un proiect, de pe legislatie.just.ro, ca analizele să compare proiectul cu legea pe care o modifică. Și ideea capcanelor din proiect, fiecare cu articolul și citatul exact, verificate față de text.',
    links: [pr(5), issue(1), issue(6)],
  },
  {
    name: 'Gabi Udrescu',
    github: 'gabiudrescu',
    what: 'Un skill pentru Claude Code care scrie punctul de vedere împreună cu cititorul, pas cu pas. În lucru.',
    links: [issue(3), pr(4)],
  },
  {
    name: 'pdumitri',
    github: 'pdumitri',
    what: 'Observații despre site și despre descărcarea punctului de vedere.',
    links: [issue(2, 'observația'), issue(7, 'observația')],
  },
];
