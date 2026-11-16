import type { ReactNode } from 'react';

/** Dimensiones estándar Open Graph. */
export const OG_SIZE = { width: 1200, height: 630 };

const NAVY = '#061737';
const BRAND = '#0060d8';
const CYAN = '#22cbf2';

/**
 * Plantilla de la imagen Open Graph (A24) con el sistema visual de la marca:
 * degradado azul marino, acento cian y tarjeta blanca. Se renderiza con
 * `ImageResponse` (Satori): solo flexbox y estilos en línea.
 */
export function OgFrame({ eyebrow, title, highlight, footer, badge }: {
  eyebrow: string;
  title: string;
  highlight?: string;
  footer: string;
  badge?: ReactNode;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        color: 'white',
        background: `linear-gradient(118deg, ${NAVY} 0%, #0a2452 48%, #003090 100%)`,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, fontWeight: 700, letterSpacing: 6 }}>
        <span style={{ color: CYAN }}>/</span>
        <span>{eyebrow.toUpperCase()}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: badge ? 680 : 1000 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.04 }}>{title}</div>
          {highlight && <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.04, color: CYAN }}>{highlight}</div>}
        </div>
        {badge}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 26 }}>
        <span style={{ fontWeight: 700 }}>IEST Privado Sistemas del Sur</span>
        <span style={{ display: 'flex', padding: '10px 22px', borderRadius: 999, background: BRAND, fontWeight: 700 }}>{footer}</span>
      </div>
    </div>
  );
}

export function OgPriceCard({ name, headline, label }: { name: string; headline: string; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 340,
        padding: '36px 24px',
        borderRadius: 32,
        background: `linear-gradient(160deg, ${BRAND} 0%, #003090 100%)`,
        boxShadow: `0 0 0 6px ${CYAN}`,
      }}
    >
      <div style={{ fontSize: 36, fontWeight: 800 }}>{name}</div>
      <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>{headline}</div>
      <div style={{ fontSize: 28, opacity: 0.9 }}>{label}</div>
    </div>
  );
}
