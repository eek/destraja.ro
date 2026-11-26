import type { Metadata } from 'next';

// Șablonul paginilor de pe destraja.ro/acte: antetul și subsolul site-ului în jurul locului <!--ACT:MAIN-->.
// acte-server/tools/template.mjs îl transformă după build în template.html (fără scripturile Next, cu legături
// absolute spre destraja.ro și CSS-ul copiat sub /acte/_static). Pagina însăși nu e pentru vizitatori.
export const metadata: Metadata = {
  title: 'ACTE_SHELL',
  robots: { index: false, follow: false },
};

export default function ActeShell() {
  return <div id="act-root" dangerouslySetInnerHTML={{ __html: '<!--ACT:MAIN-->' }} />;
}
