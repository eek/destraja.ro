'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers } from 'lucide-react';

const VARIANTS = [
  { href: '/', label: 'V1 · Actual (Gemini 4 Argon)' },
  { href: '/claude', label: 'V2 · Claude Opus 5.5 (Blind)' },
  { href: '/gpt', label: 'V3 · GPT-6.1-sol Codex (Blind)' },
];

export default function DesignSwitcherBar() {
  const pathname = usePathname();

  // Only show on main landing variants
  if (pathname.startsWith('/legi/')) {
    return null;
  }

  return (
    <div className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-1.5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-secondary)] shrink-0">
          <Layers className="w-3.5 h-3.5 text-red-600" />
          <span className="hidden sm:inline">Comută versiunea de design (Blind Test):</span>
          <span className="sm:hidden">Design:</span>
        </div>

        <div className="inline-flex items-center gap-1 shrink-0">
          {VARIANTS.map((v) => {
            const active = pathname === v.href;
            return (
              <Link
                key={v.href}
                href={v.href}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--text-primary)] text-[var(--surface-canvas)] font-bold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)]'
                }`}
              >
                {v.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
