// Google Analytics pornește doar după ce vizitatorul acceptă statisticile. Până atunci nu se
// încarcă niciun script de la Google și nu se setează niciun cookie.
//
// Evenimentele se marchează pe elemente cu trackAttrs(); un singur ascultător de click din
// AnalyticsBoot le trimite. track() direct doar unde nu e un click (liste derulante, tastatură).
// Parametrii conțin doar identificatori publici (B563/2026, PSD, numele câmpului), niciodată
// texte scrise de vizitator: numele din .docx, căutările sau textele editate rămân în browser.
//
// Evenimente: senat_form_open, docx_download, text_copy, email_open, kit_tab, ai_model_view,
// official_source_open, bill_open, radar_select, village_select, list_shortcut, bill_filter, party_select,
// party_chart_metric, coalition_select, press_copy, csv_download, mp_filter, theme_change, faq_open,
// report_open, report_sent, risk_reason_open, news_open, news_more, alerts_open, subscribe_sent,
// subscribe_confirmed, alert_level_change, unsubscribe. Niciodată adresa de e-mail.

export const GA_ID = 'G-237KQ8L2FE';
export const GA_COOKIES = ['_ga', `_ga_${GA_ID.slice(2)}`];
export const CONSENT_KEY = 'lastraja-consent';
export const CONSENT_EVENT = 'lastraja-consent';
// Cookie-urile _ga și alegerea expiră deodată, după 13 luni; apoi întrebăm din nou.
export const CONSENT_DAYS = 395;

export type Consent = 'granted' | 'denied';
type Param = string | number | boolean;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let loaded = false;
let active = false;

export function readConsent(): Consent | null {
  try {
    const [choice, at] = (localStorage.getItem(CONSENT_KEY) ?? '').split(':');
    if ((choice === 'granted' || choice === 'denied') && Date.now() - Number(at) < CONSENT_DAYS * 864e5) return choice;
  } catch {
    // Fără stocare locală nu avem acord salvat.
  }
  return null;
}

export function saveConsent(choice: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, `${choice}:${Date.now()}`);
    // Mesajul vechi, doar informativ, din prima versiune a site-ului.
    localStorage.removeItem('lastraja-cookie-notice');
  } catch {
    // Fără stocare locală alegerea ține până la închiderea paginii.
  }
  if (choice === 'granted') startAnalytics();
  else stopAnalytics();
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
}

export function clearConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Nimic de șters dacă stocarea locală e blocată.
  }
  stopAnalytics();
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
}

export function startAnalytics() {
  active = true;
  setDisabled(false);
  if (loaded) {
    window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    return;
  }
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js cere obiectul arguments, nu un array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  // Doar statistici: tot ce ține de reclame rămâne refuzat.
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: CONSENT_DAYS * 86400,
    cookie_flags: 'SameSite=Lax;Secure',
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

function stopAnalytics() {
  active = false;
  setDisabled(true);
  window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  const domains = ['', location.hostname, `.${location.hostname.replace(/^www\./, '')}`];
  for (const name of GA_COOKIES) {
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
  }
}

function setDisabled(off: boolean) {
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = off;
}

export function track(event: string, params: Record<string, Param> = {}) {
  if (active) window.gtag?.('event', event, params);
}

/** Atributele data-track pentru un link sau buton; cheile parametrilor sunt în snake_case. */
export function trackAttrs(event: string, params: Record<string, Param> = {}) {
  const attrs: Record<string, string> = { 'data-track': event };
  for (const [k, v] of Object.entries(params)) attrs[`data-track-${k.replace(/_/g, '-')}`] = String(v);
  return attrs;
}

/** Citește înapoi parametrii scriși de trackAttrs: data-track-bill-id devine bill_id. */
export function paramsFromDataset(el: HTMLElement | SVGElement) {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(el.dataset)) {
    if (k === 'track' || !k.startsWith('track') || v === undefined) continue;
    params[k.slice(5).replace(/[A-Z]/g, (c, i) => (i ? '_' : '') + c.toLowerCase())] = v;
  }
  return params;
}
