import { AboutSection } from '@/components/AboutSection';
import { FaqSection } from '@/components/FaqSection';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { JsonLd } from '@/components/JsonLd';
import { LeadCapture } from '@/components/LeadCapture';
import { MobileActions } from '@/components/MobileActions';
import { PromotionComparison } from '@/components/PromotionComparison';
import { SpecialtiesSection } from '@/components/SpecialtiesSection';
import { StartDatesSection } from '@/components/StartDatesSection';
import { TestimonialsSection } from '@/components/TestimonialsSection';
import { institution } from '@/content/institution';
import { getPromotions, getSpecialties } from '@/lib/catalog';
import { siteConfig } from '@/lib/config';

interface LandingViewProps {
  /** Promoción preseleccionada (A30): `?promo=` o /promociones/[id]. */
  initialPromotionId?: string | null;
}

/** Landing completa; la usan `/` y `/promociones/[id]`. */
export async function LandingView({ initialPromotionId = null }: LandingViewProps) {
  const [promotions, specialties] = await Promise.all([getPromotions(), getSpecialties()]);
  const campus = institution.campus.tacna;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: siteConfig.legalName,
    alternateName: 'SIS',
    url: siteConfig.siteUrl,
    parentOrganization: { '@type': 'Organization', name: 'GRUPO CAPSUR' },
    address: {
      '@type': 'PostalAddress',
      streetAddress: campus.address,
      addressLocality: campus.city,
      addressCountry: 'PE',
    },
    telephone: campus.phoneE164,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'admissions',
      telephone: `+${siteConfig.whatsappNumber}`,
      availableLanguage: 'es',
    },
    makesOffer: promotions.items.map((p) => ({
      '@type': 'Offer',
      name: `${p.name} · ${p.bundle.label}`,
      price: (p.price.amount / 100).toFixed(2),
      priceCurrency: p.price.currency,
      availability: 'https://schema.org/InStock',
      ...(p.validUntil ? { priceValidUntil: p.validUntil.slice(0, 10) } : {}),
    })),
  };

  return (
    <>
      <Header anchorBase="" />
      <main>
        <Hero />
        <LeadCapture promotions={promotions.items} specialties={specialties.items} initialPromotionId={initialPromotionId} />
        <SpecialtiesSection specialties={specialties.items} />
        <PromotionComparison promotions={promotions.items} specialties={specialties.items} />
        <StartDatesSection specialties={specialties.items} />
        <TestimonialsSection />
        <FaqSection />
        <AboutSection />
      </main>
      <Footer />
      <MobileActions targetId="catalogo" />
      <JsonLd data={jsonLd} />
    </>
  );
}
