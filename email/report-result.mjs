// Mesajul cu rezultatul verificării, pentru cine și-a lăsat e-mailul în formularul „Semnalează o greșeală”.
// Îl face scripts/straja-reports.mjs din intrarea publică (data/reports/<slug>.json), deci conține doar ce apare
// și pe pagină: fraza noastră, citatul oficial și corectura. Îl trimite Worker-ul (POST /api/report/result).
import { C, SANS, SERIF, SITE, REPLY_TO, button, emailLayout, esc, footerHtml } from './layout.mjs';

const MODEL_NAMES = { agy: 'Gemini', claude: 'Claude', codex: 'ChatGPT' };

export const billUrl = (slug) => `${SITE}/${slug.startsWith('plx-') ? 'camera' : 'legi'}/${slug}`;

/** „concluzia comună și analizele Gemini, Claude și ChatGPT” */
export function targetsText(targets) {
  const models = Object.keys(MODEL_NAMES).filter((t) => targets.includes(t)).map((t) => MODEL_NAMES[t]);
  const list = models.length > 1 ? `${models.slice(0, -1).join(', ')} și ${models.at(-1)}` : models[0];
  const part = list ? `${models.length > 1 ? 'analizele' : 'analiza'} ${list}` : '';
  return [targets.includes('consensus') ? 'concluzia comună' : '', part].filter(Boolean).join(' și ');
}

/**
 * @param {{ id: string, slug: string }} bill
 * @param {{ status: 'fixed' | 'rejected', targets: string[], claim: string, quote: string, before?: string, after?: string, name?: string }} entry
 */
export function reportResultEmail(bill, raw) {
  const bare = (s = '') => s.trim().replace(/^[„“"«]+|[”“"»]+$/g, '');
  const entry = { ...raw, claim: bare(raw.claim), quote: bare(raw.quote), before: bare(raw.before), after: bare(raw.after) };
  const url = `${billUrl(bill.slug)}?utm_source=raport&utm_medium=email#greseli`;
  const p = (html) => `<p class="lt-body" style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body}">${html}</p>`;
  const h1 = (text) => `<h1 class="lt-ink lt-h1" style="margin:0 0 16px;font-family:${SERIF};font-size:28px;font-weight:400;line-height:34px;color:${C.ink}">${esc(text)}</h1>`;
  const label = (text) => `<p class="lt-muted" style="margin:0 0 4px;font-family:${SANS};font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}">${esc(text)}</p>`;
  const line = (html, last) =>
    `<p class="lt-ink" style="margin:0 0 ${last ? 0 : 14}px;font-family:${SERIF};font-size:16px;line-height:25px;color:${C.ink}">${html}</p>`;
  const box = (rows) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px"><tr><td class="lt-sunken" bgcolor="${C.sunken}" style="background:${C.sunken};border-radius:12px;padding:18px 20px">${rows}</td></tr></table>`;
  const name = entry.name ? `, ${esc(entry.name)}` : '';
  const where = targetsText(entry.targets);

  let subject;
  let body;
  let text;
  if (entry.status === 'fixed') {
    subject = `Ai avut dreptate: am corectat analiza pentru ${bill.id}`;
    body =
      h1('Ai avut dreptate. Am corectat analiza.') +
      p(`Mulțumim${name}! Gemini, Claude și ChatGPT au comparat raportul tău cu textul oficial al proiectului <strong>${esc(bill.id)}</strong> și au confirmat greșeala. Am corectat ${esc(where)}, iar textul nou l-au aprobat Gemini și ChatGPT.`) +
      box(
        label('Am scris') +
        line(`<s>„${esc(entry.before)}”</s>`) +
        label('Acum scrie') +
        line(`„${esc(entry.after)}”`) +
        label('Textul oficial') +
        line(`„${esc(entry.quote)}”`, true),
      ) +
      p(`Corectura apare pe pagina proiectului${entry.name ? ', cu numele tău' : ''}, la „Greșeli semnalate”.`) +
      button(url, 'Vezi pagina proiectului');
    text = `Ai avut dreptate. Am corectat analiza.\n\nMulțumim${entry.name ? `, ${entry.name}` : ''}! Gemini, Claude și ChatGPT au comparat raportul tău cu textul oficial al proiectului ${bill.id} și au confirmat greșeala. Am corectat ${where}, iar textul nou l-au aprobat Gemini și ChatGPT.\n\nAm scris: „${entry.before}”\nAcum scrie: „${entry.after}”\nTextul oficial: „${entry.quote}”\n\nPagina proiectului: ${url}`;
  } else {
    subject = `Am verificat raportul tău despre ${bill.id}`;
    body =
      h1('Am verificat raportul tău') +
      p(`Mulțumim${name} că ai semnalat. Gemini, Claude și ChatGPT au comparat raportul cu textul oficial al proiectului <strong>${esc(bill.id)}</strong> și au ajuns toate trei la aceeași concluzie: pe acest punct, ${esc(where)} se potrivește cu textul.`) +
      box((entry.claim ? label('Ce scrie în analiză') + line(`„${esc(entry.claim)}”`, !entry.quote) : '') + (entry.quote ? label('Textul oficial') + line(`„${esc(entry.quote)}”`, true) : '')) +
      p(`Dacă tot crezi că am greșit, răspunde la acest mesaj și ne uităm noi.`) +
      button(url, 'Vezi pagina proiectului');
    text = `Am verificat raportul tău.\n\nMulțumim${entry.name ? `, ${entry.name},` : ''} că ai semnalat. Gemini, Claude și ChatGPT au comparat raportul cu textul oficial al proiectului ${bill.id} și au ajuns toate trei la aceeași concluzie: pe acest punct, ${where} se potrivește cu textul.\n\n${entry.claim ? `Ce scrie în analiză: „${entry.claim}”\n` : ''}${entry.quote ? `Textul oficial: „${entry.quote}”\n` : ''}\nDacă tot crezi că am greșit, răspunde la acest mesaj și ne uităm noi.\n\nPagina proiectului: ${url}`;
  }
  const reason =
    'Primești acest mesaj pentru că ți-ai lăsat adresa când ai semnalat o greșeală pe destrajă.ro. Îți scriem o singură dată: după acest mesaj am șters adresa și nu te-am abonat la nimic.';
  const html = emailLayout({
    title: subject,
    preheader: entry.status === 'fixed' ? 'Greșeala s-a confirmat în textul oficial.' : 'Rezultatul verificării, cu citatul din textul oficial.',
    eyebrow: 'Greșeli semnalate',
    body,
    footer: footerHtml({ reason }),
  });
  return { subject, html, text: `${text}\n\n—\n${reason}\ndestrajă (destraja.ro) · proiect civic independent · ${REPLY_TO}` };
}
