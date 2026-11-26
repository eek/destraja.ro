import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import AdminReports from '@/components/admin/AdminReports';
import AdminActReports from '@/components/admin/AdminActReports';
import AdminFreshness from '@/components/admin/AdminFreshness';

// Panoul rapoartelor cititorilor. Pagina e statică și goală: datele vin din /api/admin/*, după Cloudflare Access și
// verificarea JWT-ului în Worker (worker/access.ts). Nu are link de pe site și nu se indexează.
export const metadata: Metadata = {
  title: 'Rapoarte · administrare',
  robots: { index: false, follow: false },
};

export default function AdminReportsPage() {
  return (
    <Container className="py-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Administrare</p>
      <h1 className="mt-2 font-display text-[clamp(2rem,4vw,2.8rem)] font-normal leading-[1.08]">Rapoartele cititorilor</h1>
      <AdminReports />
      <AdminActReports />
      <AdminFreshness />
    </Container>
  );
}
