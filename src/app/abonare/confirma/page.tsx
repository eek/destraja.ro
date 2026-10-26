import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import ConfirmSubscription from '@/components/alerts/ConfirmSubscription';

export const metadata: Metadata = {
  title: 'Confirmă abonarea',
  robots: { index: false },
};

export default function ConfirmPage() {
  return (
    <Container className="max-w-[760px] py-16 sm:py-24">
      <h1 className="font-display text-[clamp(2.2rem,4.5vw,3.4rem)] font-normal leading-[1.08]">Alertele lastraja.ro</h1>
      <ConfirmSubscription />
    </Container>
  );
}
