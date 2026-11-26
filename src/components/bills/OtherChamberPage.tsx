import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ChamberPair } from '@/lib/cross-chamber';
import { panel } from '@/components/ui';

/**
 * Pe pagina care nu e canonică a unui proiect cu pagină la ambele camere (src/lib/cross-chamber.ts): linkul spre pagina
 * principală, sus, înaintea fișei. Pagina rămâne cu tot ce are; doar Google știe din canonical care e cea de căutat.
 */
export default function OtherChamberPage({ pair, here }: { pair: ChamberPair; here: 'senat' | 'camera' }) {
  const toSenate = here === 'camera';
  const target = toSenate ? pair.senat : pair.camera;
  const label = toSenate ? `${pair.senat.id}, pagina de la Senat` : `${pair.camera.numar}, pagina de la Cameră`;
  return (
    <aside className={`${panel} mt-4 flex flex-wrap items-center justify-between gap-3 border-brand/40 px-5 py-4 sm:px-6`}>
      <p className="text-sm leading-6 text-body">
        Proiectul a fost înregistrat întâi la {toSenate ? 'Senat' : 'Camera Deputaților'}, iar pagina lui principală e cea de
        acolo. Aici e fișa de la {toSenate ? 'Camera Deputaților' : 'Senat'}.
      </p>
      <Link href={target.path} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link underline underline-offset-4">
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </aside>
  );
}
