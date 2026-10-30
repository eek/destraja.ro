import type { VersionItem } from '@/lib/types';

type Effect = VersionItem['effect'];

// Direcția se citește și fără culori: pătrat = mai rău, cerc = mai bine, romb = neutru (roșul și verdele site-ului se
// confundă pentru cine nu deosebește culorile).
export const EFFECT: Record<Effect, { label: string; text: string; mark: string }> = {
  mai_rau: { label: 'mai rău', text: 'text-risk-red-text', mark: 'rounded-[3px] bg-risk-red' },
  mai_bine: { label: 'mai bine', text: 'text-risk-green-text', mark: 'rounded-full bg-risk-green' },
  neutru: { label: 'neutru', text: 'text-muted', mark: 'rotate-45 scale-[0.8] rounded-[2px] bg-faint' },
};

export function Mark({ effect, big = false }: { effect: Effect; big?: boolean }) {
  return <span aria-hidden className={`inline-block shrink-0 ${big ? 'h-4 w-4' : 'h-3 w-3'} ${EFFECT[effect].mark}`} />;
}
