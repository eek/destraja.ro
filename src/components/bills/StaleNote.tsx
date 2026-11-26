import { RefreshCw } from 'lucide-react';

// Nota de lângă un rezultat făcut dintr-o analiză mai veche decât cea de acum (src/lib/fresh.ts): discretă, un rând.
export default function StaleNote({ what, text, className = 'mt-2' }: { what?: string; text?: string; className?: string }) {
  return (
    <p className={`${className} flex items-center gap-1.5 text-[13px] leading-5 text-muted`}>
      <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{text ?? (what ? `${what}: din analiza anterioară, se actualizează.` : 'Din analiza anterioară, se actualizează.')}</span>
    </p>
  );
}
