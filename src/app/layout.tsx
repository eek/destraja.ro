import type { Metadata, Viewport } from 'next';
import AppShellChrome from '@/components/AppShellChrome';
import './globals.css';

export const metadata: Metadata = {
  title: 'lastraja.ro — La Straja Legii · Radarul Cetățenesc al Senatului României',
  description:
    'Cele 49 de proiecte de lege aflate în dezbatere publică la Senat, traduse într-o propoziție pe înțelesul tuturor, cu statistici pe partide și analiză încrucișată cu Gemini, Claude și ChatGPT.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <head>
        {/* MANDATORY (dark-mode): Declare support for both light and dark themes before rendering */}
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="min-h-screen flex flex-col">
        <AppShellChrome>{children}</AppShellChrome>
      </body>
    </html>
  );
}
