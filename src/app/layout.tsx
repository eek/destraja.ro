import type { Metadata, Viewport } from 'next';
import { Public_Sans, Source_Serif_4 } from 'next/font/google';
import SiteHeader from '@/components/site/SiteHeader';
import SiteFooter from '@/components/site/SiteFooter';
import CookieNotice from '@/components/site/CookieNotice';
import AnalyticsBoot from '@/components/site/AnalyticsBoot';
import { getDataSyncedAt } from '@/lib/bills';
import { SITE_URL } from '@/lib/site';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import './globals.css';

const serif = Source_Serif_4({
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Public_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-public',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'lastraja.ro · La Straja Legii',
    template: '%s · lastraja.ro',
  },
  description:
    'Proiectele de lege aflate în consultare publică la Senatul României, explicate într-o propoziție, evaluate de Gemini, Claude și ChatGPT, cu obiecția oficială pregătită în 60 de secunde.',
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    siteName: 'lastraja.ro',
    title: 'lastraja.ro · La Straja Legii',
    description: 'Ce legi pregătește Senatul, ce înseamnă pentru tine și cum îți spui părerea oficial.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ee' },
    { media: '(prefers-color-scheme: dark)', color: '#1b2230' },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const syncedAt = await getDataSyncedAt();
  return (
    <html lang="ro" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#continut"
          className="sr-only z-[60] rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Sari la conținut
        </a>
        <SiteHeader />
        <main id="continut" className="flex-1">
          {children}
        </main>
        <SiteFooter syncedAt={syncedAt} />
        <CookieNotice />
        <AnalyticsBoot />
      </body>
    </html>
  );
}
