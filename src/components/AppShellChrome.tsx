'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, ShieldAlert, BarChart3 } from 'lucide-react';
import { LastrajaLogo, LastrajaTowerIcon } from '@/components/LastrajaLogo';
import DesignSwitcherBar from '@/components/DesignSwitcherBar';

export default function AppShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBlindStandalone = pathname === '/claude' || pathname === '/gpt';

  if (isBlindStandalone) {
    return (
      <>
        <DesignSwitcherBar />
        {children}
      </>
    );
  }

  return (
    <>
      <DesignSwitcherBar />

      {/* Clean, single-tier sticky header with the lastraja.ro watchtower wordmark */}
      <header className="sticky top-0 z-40 bg-[var(--surface-canvas)]/95 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 sm:h-[68px] flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-3 group min-h-[44px]"
            aria-label="lastraja.ro — Pagina principală"
          >
            <LastrajaLogo className="h-8 sm:h-9 w-auto text-[var(--text-primary)] group-hover:opacity-85 transition-opacity shrink-0" />
            <div className="hidden md:flex flex-col border-l border-[var(--border-subtle)] pl-3 leading-tight">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Radarul Senatului României
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                49 legi în consultare · Analiză Gemini + Claude + ChatGPT
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Link
              href="/"
              className="touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[var(--text-muted)] hidden sm:inline" />
              <span>Legi & Partide (49)</span>
            </Link>
            <Link
              href="/legi/b563-2026"
              className="touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold bg-red-600/10 text-red-700 dark:text-red-400 hover:bg-red-600/15 transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Alertă B563</span>
            </Link>
            <a
              href="https://www.senat.ro/LegiProiect.aspx"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <span>Senat.ro</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Quiet, structured editorial footer with lastraja.ro wordmark */}
      <footer className="mt-20 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-xs text-[var(--text-muted)]">
          <div className="space-y-2.5 max-w-lg">
            <div className="flex items-center gap-3">
              <LastrajaTowerIcon className="h-6 w-auto text-[var(--text-primary)]" />
              <span className="font-bold text-sm text-[var(--text-primary)]">
                lastraja.ro — La Straja Legii
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[11px] font-medium text-[var(--text-secondary)]">
                Actualizat 23 oct. 2026
              </span>
            </div>
            <p className="leading-relaxed">
              Platformă civică independentă care monitorizează proiectele de lege aflate în consultare publică pe{' '}
              <a
                href="https://www.senat.ro/LegiProiect.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--text-primary)]"
              >
                senat.ro/LegiProiect.aspx
              </a>
              . Fiecare lege este tradusă într-o propoziție clară și analizată încrucișat cu{' '}
              <strong>Gemini 4 Argon</strong>, <strong>Claude Opus 5.5</strong> și{' '}
              <strong>ChatGPT (GPT-6.1)</strong>.
            </p>
          </div>

          <div className="bg-[var(--surface-elevated)] px-4 py-3 rounded-xl border border-[var(--border-subtle)] space-y-1.5 w-full md:w-auto">
            <div className="text-[var(--text-primary)] font-semibold">
              Modele AI de analiză legislativă:
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
              <span className="px-2 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)]">
                Gemini 4 Argon
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)]">
                Claude Opus 5.5
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)]">
                ChatGPT (GPT-6.1)
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
