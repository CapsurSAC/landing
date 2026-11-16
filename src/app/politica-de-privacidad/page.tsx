import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { privacyPolicyVersions } from '@/content/privacy-versions';
import { formatWhatsAppForDisplay, siteConfig } from '@/lib/config';
import { formatLongDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Cómo IEST Privado Sistemas del Sur trata los datos personales que dejas en el formulario de catálogo.',
  alternates: { canonical: '/politica-de-privacidad' },
};

/**
 * Versión {siteConfig.privacyPolicyVersion}. Cada cambio de fondo debe
 * incrementar NEXT_PUBLIC_PRIVACY_POLICY_VERSION: el backend guarda la versión
 * aceptada en cada registro de consentimiento.
 *
 * Los datos entre corchetes deben completarse con la información legal real
 * antes de publicar.
 */
export default function PrivacyPolicyPage() {
  const current = privacyPolicyVersions.find((v) => v.version === siteConfig.privacyPolicyVersion);
  return (
    <>
      <Header />
      <main className="container-x py-12 sm:py-16">
        <article className="prose-sis mx-auto max-w-3xl">
          <p className="text-sm font-semibold text-brand-600">
            Versión {siteConfig.privacyPolicyVersion}
            {current && <> · publicada el {formatLongDate(current.publishedOn)}</>} ·{' '}
            <Link href="/politica-de-privacidad/versiones" className="underline underline-offset-2 hover:text-brand-700">
              Historial de versiones
            </Link>
          </p>
          <h1 className="mt-2 text-balance text-4xl font-extrabold leading-tight text-ink-900">Política de privacidad</h1>
          <p className="mt-4 text-pretty text-lg text-ink-600">
            Esta política explica qué datos recogemos cuando solicitas información en nuestra web, para qué los usamos y qué derechos tienes,
            conforme a la Ley N.º 29733, Ley de Protección de Datos Personales, y su Reglamento aprobado por Decreto Supremo N.º 016-2024-JUS.
          </p>

          <Section title="1. Responsable del tratamiento">
            <p>
              {siteConfig.legalName} [RUC: completar], con domicilio en [dirección: completar], es el titular del banco de datos personales
              «Interesados en programas académicos» [código de inscripción: completar].
            </p>
          </Section>

          <Section title="2. Datos que recogemos">
            <ul>
              <li>Nombre y apellidos, número de WhatsApp y correo electrónico que escribes en el formulario.</li>
              <li>La promoción que elegiste y el código de solicitud que generamos.</li>
              <li>Datos de procedencia de la visita (campaña, fuente, página de llegada) y un identificador técnico de sesión.</li>
              <li>La versión de esta política que aceptaste, la fecha y una huella anonimizada de tu dirección IP, como registro de consentimiento.</li>
            </ul>
          </Section>

          <Section title="3. Para qué usamos tus datos">
            <ul>
              <li>Enviarte el catálogo y responder tu solicitud por WhatsApp a través de un asesor.</li>
              <li>Registrar y dar seguimiento a tu solicitud en nuestro sistema de atención.</li>
              <li>
                Solo si marcaste la casilla opcional: enviarte novedades y futuras promociones. Puedes retirar esta autorización en cualquier
                momento.
              </li>
              <li>Medir el funcionamiento de la web con datos agregados, sin identificarte.</li>
            </ul>
          </Section>

          <Section title="4. Base legal y conservación">
            <p>
              Tratamos tus datos con tu consentimiento, que otorgas al marcar la casilla y enviar el formulario. Conservamos la solicitud durante
              [plazo: completar] desde el último contacto, o hasta que solicites su supresión.
            </p>
          </Section>

          <Section title="5. Con quién compartimos tus datos">
            <p>
              Usamos proveedores que actúan por encargo nuestro para la atención por WhatsApp y el alojamiento de la plataforma. Pueden implicar
              transferencias internacionales a proveedores con medidas de seguridad adecuadas. No vendemos tus datos.
            </p>
          </Section>

          <Section title="6. Tus derechos">
            <p>
              Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición (ARCO), así como revocar tu consentimiento,
              escribiendo a [correo de protección de datos: completar] o al WhatsApp {formatWhatsAppForDisplay(siteConfig.whatsappNumber)}.
              También puedes hacerlo con el{' '}
              <Link href="/derechos-arco" className="font-semibold text-brand-600 underline underline-offset-2">
                formulario de derechos ARCO
              </Link>
              , que te entrega un código y la fecha límite de respuesta. Si consideras que no atendimos tu solicitud, puedes acudir a la
              Autoridad Nacional de Protección de Datos Personales.
            </p>
          </Section>

          <Section title="7. Seguridad">
            <p>
              Protegemos tu información con cifrado en tránsito, control de accesos por servicio, registros sin datos sensibles y copias de
              seguridad.
            </p>
          </Section>

          <p className="mt-10">
            <Link href="/#catalogo" className="font-semibold text-brand-600 underline underline-offset-2">
              Volver al formulario
            </Link>
          </p>
        </article>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 text-pretty leading-relaxed text-ink-700 [&_li]:mt-1.5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
      <h2 className="text-xl font-bold text-ink-900">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
