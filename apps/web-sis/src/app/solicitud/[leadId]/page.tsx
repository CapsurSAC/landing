import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { LeadStatusView } from './LeadStatusView';

export const metadata: Metadata = {
  title: 'Tu solicitud',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ leadId: string }>;
}

export default async function LeadRequestPage({ params }: PageProps) {
  const { leadId } = await params;
  return (
    <>
      <Header />
      <main className="container-x py-12 sm:py-16">
        <div className="mx-auto max-w-xl rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:p-8">
          <LeadStatusView leadId={leadId} />
        </div>
      </main>
      <Footer />
    </>
  );
}
