import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Container, linkCls, panel } from '@/components/ui';
import CopyLine from '@/components/mcp/CopyLine';
import { CONTENT_LICENSE, SITE_URL, SOURCE_URL } from '@/lib/site';

// Pagina pentru cititori a MCP-ului public (worker/mcp.ts): ce e, adresa, cum îl adaugi în Claude, ChatGPT și alți
// clienți, uneltele cu câte o întrebare de probă, limitele, licența și ce date primești. Numele și limitele uneltelor
// trebuie să rămână la fel ca în worker/mcp-tools.ts și wrangler.jsonc (MCP_LIMIT, MCP_SEARCH_LIMIT).

const MCP_URL = `${SITE_URL}/api/mcp`;
const DESCRIPTION =
  'Adresa MCP a destrajă.ro: asistentul tău AI (Claude, ChatGPT și alții) poate căuta proiectele de lege, citi analizele și afla unde și până când trimiți un punct de vedere. Gratuit, fără cont, doar citire.';

export const metadata: Metadata = {
  title: 'MCP: destrajă.ro în asistentul tău AI',
  description: DESCRIPTION,
  alternates: { canonical: '/mcp' },
  openGraph: { title: 'MCP: destrajă.ro în asistentul tău AI · destrajă.ro', description: DESCRIPTION },
};

const h2 = 'font-display text-2xl font-normal sm:text-3xl';
const p = 'mt-3 text-[15px] leading-7 text-body';

const TOOLS = [
  {
    name: 'search_bills',
    what: 'Caută proiecte după număr (B563/2026, PL-x nr. 110/2026), după adresa unei pagini, după numele unui inițiator sau după o întrebare obișnuită. Întoarce și pasajul din text care se potrivește.',
    ask: 'Ce proiecte de lege sunt despre chirii pentru tineri?',
  },
  {
    name: 'list_bills',
    what: 'Listează proiectele încă în dezbatere, cu termenul cel mai apropiat întâi. Poți păstra doar o cameră, un nivel de risc sau doar proiectele cu consultarea publică deschisă.',
    ask: 'Ce proiecte cu risc ridicat au consultarea publică deschisă săptămâna asta?',
  },
  {
    name: 'get_bill',
    what: 'Dosarul unui proiect: unde e acum, ce termene are, rezumatul analizei și ce a găsit fiecare dintre cele trei modele, cu legătura la textul oficial.',
    ask: 'Explică-mi pe scurt PL-x nr. 110/2026: unde e acum și ce probleme au găsit modelele?',
  },
  {
    name: 'get_submission_context',
    what: 'Tot ce trebuie pentru un punct de vedere: dacă e deschisă o consultare publică și până când, unde se depune, comisia căreia îi poți scrie, câmpurile pregătite și memoriul .docx.',
    ask: 'Ajută-mă să scriu un punct de vedere la B563/2026. Cui îl trimit și până când?',
  },
];

const CLIENTS: { name: string; steps: string; copy?: { text: string; item: string; what: string }; note?: string }[] = [
  {
    name: 'Claude (claude.ai și aplicațiile Claude)',
    steps: 'Deschide Customize → Connectors, apasă „+ Add”, apoi „Add custom connector”. Scrie numele destrajă.ro și adresa de mai sus, apoi, la autentificare, alege „No sign in”.',
    note: 'Merge și pe planul gratuit (acolo, cu un singur conector personalizat). În Team și Enterprise, conectorul îl adaugă administratorul, în Organization settings → Connectors.',
  },
  { name: 'Claude Code', steps: 'În terminal:', copy: { text: `claude mcp add --transport http destraja ${MCP_URL}`, item: 'claude-code', what: 'comanda pentru Claude Code' } },
  {
    name: 'ChatGPT',
    steps: 'Pe chatgpt.com/plugins, apasă „+”, apoi „Add custom MCP server”. Scrie numele destrajă.ro și, la Server URL, adresa de mai sus; la autentificare alege „No authentication”, confirmă avertismentul și alege „Create as a plugin”.',
    note: 'Depinde de abonament și de setările spațiului de lucru; administratorul unei organizații îl poate opri.',
  },
  { name: 'Gemini CLI', steps: 'În terminal:', copy: { text: `gemini mcp add --transport http destraja ${MCP_URL}`, item: 'gemini-cli', what: 'comanda pentru Gemini CLI' } },
  { name: 'Codex', steps: 'În terminal:', copy: { text: `codex mcp add destraja --url ${MCP_URL}`, item: 'codex', what: 'comanda pentru Codex' } },
  {
    name: 'Cursor, VS Code și alți clienți',
    steps: 'În fișierul de configurare MCP al clientului (.cursor/mcp.json la Cursor), un server la distanță cu adresa de mai sus:',
    copy: { text: `{ "mcpServers": { "destraja": { "url": "${MCP_URL}" } } }`, item: 'json', what: 'configurația JSON' },
    note: 'La VS Code, în .vscode/mcp.json: { "servers": { "destraja": { "type": "http", "url": "…" } } }.',
  },
];

const CURL = `curl -s ${MCP_URL} -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H 'mcp-protocol-version: 2025-06-18' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

export default function McpPage() {
  return (
    <>
      <section aria-labelledby="mcp-title" className="border-b border-line">
        <Container className="pt-10 pb-10 sm:pt-14 sm:pb-14">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Pentru asistenții AI</p>
          <h1 id="mcp-title" className="font-display mt-3 max-w-[18ch] text-[clamp(2.4rem,5.6vw,4rem)] font-normal leading-[1.03] tracking-[-0.03em]">
            destrajă.ro în asistentul tău AI
          </h1>
          <p className="mt-4 max-w-[62ch] text-lg leading-8 text-body">
            Adaugi o adresă în Claude, ChatGPT sau alt asistent și îl poți întreba despre proiectele de lege urmărite aici: ce face un proiect,
            unde e acum, ce au găsit cele trei modele și cum îți spui părerea. Asistentul citește datele destrajă.ro prin MCP (Model Context
            Protocol), standardul prin care asistenții AI folosesc surse din afară.
          </p>
          <div className="mt-7 max-w-[62ch]">
            <p className="mb-2 text-sm font-semibold text-ink">Adresa serverului MCP</p>
            <CopyLine text={MCP_URL} item="url" what="adresa serverului MCP" />
            <p className="mt-3 text-sm leading-6 text-muted">Gratuit, fără cont și fără cheie. Doar citire: asistentul nu poate trimite nimic în numele tău.</p>
          </div>
        </Container>
      </section>

      <Container className="py-10 sm:py-14">
        <section aria-labelledby="adauga" className="max-w-[76ch]">
          <h2 id="adauga" className={h2}>
            Cum îl adaugi
          </h2>
          <p className={p}>Pașii diferă puțin de la un asistent la altul. Peste tot ai nevoie doar de adresa de mai sus.</p>
          <ul className={`${panel} mt-5 divide-y divide-line`}>
            {CLIENTS.map((c) => (
              <li key={c.name} className="p-5 sm:p-6">
                <h3 className="text-base font-semibold text-ink">{c.name}</h3>
                <p className="mt-1.5 text-[15px] leading-7 text-body">{c.steps}</p>
                {c.copy && (
                  <div className="mt-3">
                    <CopyLine text={c.copy.text} item={c.copy.item} what={c.copy.what} />
                  </div>
                )}
                {c.note && <p className="mt-2 text-sm leading-6 text-muted">{c.note}</p>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="unelte" className="mt-14">
          <h2 id="unelte" className={h2}>
            Ce poate face
          </h2>
          <p className={`${p} max-w-[68ch]`}>
            Asistentul alege singur unealta potrivită. Le poți încerca cu întrebările de mai jos, scrise așa cum le-ai scrie unui om.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {TOOLS.map((t) => (
              <article key={t.name} className={`${panel} flex flex-col p-5 sm:p-6`}>
                <h3 className="font-mono text-sm font-semibold text-ink">{t.name}</h3>
                <p className="mt-2 text-[15px] leading-7 text-body">{t.what}</p>
                <p className="mt-auto pt-4 text-[15px] leading-7 text-ink">
                  <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted">Întreabă de exemplu</span>„{t.ask}”
                </p>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <section aria-labelledby="date">
            <h2 id="date" className={h2}>
              Ce primește asistentul
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-body marker:text-muted">
              <li>
                <span className="font-semibold text-ink">Analize făcute cu AI.</span> Rezumatul și scorul de risc vin de la trei modele (Gemini,
                Claude și ChatGPT), cu ce a găsit fiecare. Pot greși și nu sunt consultanță juridică; fiecare răspuns are legătura la textul oficial
                de pe senat.ro sau cdep.ro.
              </li>
              <li>
                <span className="font-semibold text-ink">Unde e proiectul acum,</span> din fișele oficiale ale Senatului și ale Camerei, citite
                în fiecare zi lucrătoare. Un proiect cu numere la ambele camere are un singur dosar.
              </li>
              <li>
                <span className="font-semibold text-ink">Termene care spun pentru cine sunt:</span> consultarea publică (canalul dedicat
                cetățenilor) e separată de termenele Parlamentului, cum sunt amendamentele deputaților sau ședințele programate. Un termen
                lipsă înseamnă că nu-l știm, nu că e deschis.
              </li>
              <li>
                <span className="font-semibold text-ink">Adresele comisiilor,</span> luate de pe paginile lor oficiale, cu sursa. Câmpurile
                pentru formular și memoriul .docx sunt pregătite de AI: citește-le și schimbă-le înainte să le trimiți tu.
              </li>
              <li>
                <span className="font-semibold text-ink">Date actualizate în fiecare zi lucrătoare,</span> dimineața. Fiecare răspuns spune
                când au fost construite datele (built_at), iar dosarul unui proiect spune și când a fost făcută analiza (analyzed_at). O
                consultare încheiată între timp apare închisă.
              </li>
            </ul>
          </section>

          <section aria-labelledby="limite">
            <h2 id="limite" className={h2}>
              Limite și licență
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-body marker:text-muted">
              <li>
                Cel mult 180 de cereri pe minut de la aceeași adresă; o conversație folosește de obicei între 4 și 10. Căutarea după sens are 30
                pe minut, după care asistentul primește rezultatele căutării în titluri, cu mențiunea asta.
              </li>
              <li>
                Datele sunt sub licența{' '}
                <a href={CONTENT_LICENSE.url} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {CONTENT_LICENSE.name}
                </a>
                : le poți folosi oricum, cu sursa „destrajă.ro” și legătura la pagina proiectului.{' '}
                <Link href="/presa#citare" className={linkCls}>
                  Cum ne citezi
                </Link>
                .
              </li>
              <li>
                Nu păstrăm ce întrebi. Textul unei căutări ajunge doar la serverul nostru de căutare, ca să găsească proiectele; adresa IP trece
                doar prin limita pe minut.{' '}
                <Link href="/confidentialitate#mcp" className={linkCls}>
                  Detalii în politica de confidențialitate
                </Link>
                . Conversația cu asistentul rămâne la firma care îl face.
              </li>
              <li>
                Dacă vezi o greșeală, folosește „Semnalează o greșeală” pe pagina proiectului
                {SOURCE_URL && (
                  <>
                    {' '}sau scrie-ne pe{' '}
                    <a href={`${SOURCE_URL}/issues`} target="_blank" rel="noopener noreferrer" className={linkCls}>
                      GitHub
                    </a>
                  </>
                )}
                .
              </li>
            </ul>
          </section>
        </div>

        <section aria-labelledby="tehnic" className={`${panel} mt-14 p-5 sm:p-7`}>
          <h2 id="tehnic" className="text-lg font-semibold text-ink">
            Pentru programatori
          </h2>
          <ul className="mt-3 space-y-2 text-[15px] leading-7 text-body">
            <li>
              Protocolul MCP 2025-06-18 (acceptă și 2025-03-26), transport Streamable HTTP fără sesiuni: fiecare POST are un singur mesaj
              JSON-RPC, iar răspunsul e JSON, fără SSE. Clientul trimite antetul <code className="font-mono text-[13px]">Accept: application/json, text/event-stream</code>;
              un GET primește 405.
            </li>
            <li>Toate cele patru unelte sunt doar citire. Răspunsurile au atât text, cât și structuredContent, cu built_at, licența și sursele.</li>
            <li>
              Pentru analize pe toate proiectele, ia direct fișierele JSON: lista lor e în{' '}
              <a href={`${SITE_URL}/date/manifest.json`} className={`${linkCls} break-all`}>
                /date/manifest.json
              </a>
              .
            </li>
          </ul>
          <p className="mt-4 text-sm font-semibold text-ink">Probă rapidă a transportului</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Un client MCP adevărat trimite întâi initialize și notifications/initialized; serverul n-are sesiuni, deci și o cerere directă
            primește răspuns.
          </p>
          <div className="mt-2">
            <CopyLine text={CURL} item="curl" what="comanda de probă" />
          </div>
          {SOURCE_URL && (
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className={`${linkCls} mt-4 inline-flex items-center gap-1 text-sm`}>
              Codul sursă (AGPL-3.0)
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </section>
      </Container>
    </>
  );
}
