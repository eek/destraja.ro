import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import ManageSubscription from '@/components/alerts/ManageSubscription';

export const metadata: Metadata = {
  title: 'Preferințele alertelor',
  robots: { index: false },
};

export default function PreferencesPage() {
  return (
    <Container className="max-w-[760px] py-16 sm:py-24">
      <h1 className="font-display text-[clamp(2.2rem,4.5vw,3.4rem)] font-normal leading-[1.08]">Preferințele alertelor</h1>
      <ManageSubscription />
    </Container>
  );
}
