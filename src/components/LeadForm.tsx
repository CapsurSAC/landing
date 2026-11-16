'use client';

import type { Campus, Promotion } from '@capsur/api-contracts';
import { ArrowRight, ChevronDown, Mail, MapPin, Phone, User } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { institution } from '@/content/institution';
import { phoneCountries, siteConfig, type PhoneCountryCode } from '@/lib/config';
import { LEAD_REGISTERED_EVENT } from '@/lib/events';
import { INITIAL_LEAD_FORM, nationalPhoneDigits, validateLeadForm, type LeadFieldName, type LeadFormValues } from '@/lib/lead-form';
import { clearDraft, leadKey, loadDraft, resetLeadKey, saveDraft } from '@/lib/session-store';
import { rememberAttribution } from '@/lib/attribution';
import { track } from '@/lib/tracking';
import { buildCatalogRequestMessage, buildWhatsAppUrl } from '@/lib/whatsapp';

/** Reexportado para las pruebas y para quien ya lo importaba desde aquí. */
export { validateLeadForm } from '@/lib/lead-form';

type FieldName = LeadFieldName;
const FIELD_ORDER: FieldName[] = ['fullName', 'phone', 'email', 'contactAccepted'];

interface LeadFormProps {
  promotion: Promotion | null;
  /** Especialidades elegidas en el selector (vacío = «lo decido con un asesor»). */
  specialtyIds: string[];
  /** Nombres de esas especialidades, para el mensaje de WhatsApp. */
  specialtyNames: string[];
  /** Se invoca cuando el usuario intenta enviar sin promoción, para marcar el selector. */
  onMissingPromotion: () => void;
}

export function LeadForm({ promotion, specialtyIds, specialtyNames, onMissingPromotion }: LeadFormProps) {
  const id = useId();
  const [values, setValues] = useState<LeadFormValues>(INITIAL_LEAD_FORM);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const startedRef = useRef(false);
  const dirtyRef = useRef(false);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});

  const pendingSaveRef = useRef<number | null>(null);
  const flushRef = useRef<(() => void) | null>(null);

  // Restaurar el borrador guardado en este navegador (solo en el cliente, tras hidratar).
  useEffect(() => {
    const draft = loadDraft();
    // Restauración tras hidratar: localStorage no existe en el servidor, así que no puede ser estado inicial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setValues(draft.values);
  }, []);

  /** Envía el formulario (completo o a medias) al panel. Nunca bloquea ni lanza errores. */
  const sendLead = useCallback(
    (whatsappSent: boolean) => {
      const attribution = rememberAttribution();
      void fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          clientKey: leadKey(),
          whatsappSent,
          fullName: values.fullName.trim(),
          phoneCountry: values.phoneCountry,
          phone: nationalPhoneDigits(values).slice(0, 15),
          email: values.email.trim().toLowerCase(),
          campus: values.campus,
          promotionId: promotion?.id ?? '',
          specialtyIds,
          attribution: {
            utmSource: attribution.utmSource,
            utmMedium: attribution.utmMedium,
            utmCampaign: attribution.utmCampaign,
            referrer: attribution.referrer,
          },
        }),
      }).catch(() => undefined);
    },
    [values, promotion?.id, specialtyIds],
  );

  // Mientras se escribe: borrador local al instante y, con autorización de contacto, copia al panel 1,2 s después de la última tecla.
  useEffect(() => {
    if (!dirtyRef.current) return;
    saveDraft({ values, promotionId: promotion?.id ?? null, specialtyIds });
    if (pendingSaveRef.current !== null) window.clearTimeout(pendingSaveRef.current);
    if (!values.contactAccepted) {
      pendingSaveRef.current = null;
      flushRef.current = null;
      return;
    }
    const flush = () => {
      if (pendingSaveRef.current !== null) window.clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
      flushRef.current = null;
      sendLead(false);
    };
    flushRef.current = flush;
    pendingSaveRef.current = window.setTimeout(flush, 1200);
  }, [values, promotion?.id, specialtyIds, sendLead]);

  // Si cierra o recarga la página antes de que venza la espera, se guarda igual.
  useEffect(() => {
    const onHide = () => flushRef.current?.();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  const clientErrors = useMemo(() => validateLeadForm(values), [values]);
  const country = phoneCountries.find((c) => c.code === values.phoneCountry) ?? phoneCountries[0];

  const visibleError = (field: FieldName): string | undefined => {
    if (touched[field] || submitted) return clientErrors[field];
    return undefined;
  };

  const update = <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) => {
    dirtyRef.current = true;
    setValues((v) => ({ ...v, [key]: value }));
  };

  const onFocusAny = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('form_started', promotion ? { promotionId: promotion.id } : {});
  }, [promotion]);

  const onBlur = (field: FieldName) => (_e: FocusEvent) => {
    setTouched((t) => ({ ...t, [field]: true }));
    const message = clientErrors[field];
    if (message) setAnnouncement(`${labelFor(field)}: ${message}`);
  };

  const focusFirstInvalid = (errors: Partial<Record<FieldName, string>>) => {
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (first) fieldRefs.current[first]?.focus();
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);

    if (!promotion) {
      onMissingPromotion();
      setAnnouncement('Elige una promoción para continuar.');
      return;
    }
    if (Object.keys(clientErrors).length > 0) {
      focusFirstInvalid(clientErrors);
      setAnnouncement('Revisa los campos marcados antes de enviar.');
      return;
    }
    // Se guarda para el panel sin esperar la respuesta: WhatsApp debe abrirse en el mismo clic (si no, el navegador lo bloquea).
    if (pendingSaveRef.current !== null) window.clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = null;
    flushRef.current = null;
    sendLead(true);
    resetLeadKey();

    const message = buildCatalogRequestMessage({
      brandName: siteConfig.brandName,
      fullName: values.fullName.trim(),
      promotionName: promotion.name,
      promotionHeadline: promotion.headline,
      specialtyNames,
    });
    const url = buildWhatsAppUrl(siteConfig.whatsappNumber, message);
    dirtyRef.current = false;
    clearDraft();
    track('form_submitted', { promotionId: promotion.id });
    window.dispatchEvent(new Event(LEAD_REGISTERED_EVENT));
    // Si el navegador bloquea la pestaña nueva, se abre WhatsApp en la misma.
    const tab = window.open(url, '_blank');
    if (tab) tab.opener = null;
    else window.location.assign(url);
  };

  const errorIds = {
    fullName: `${id}-fullName-error`,
    phone: `${id}-phone-error`,
    email: `${id}-email-error`,
    contactAccepted: `${id}-consent-error`,
  } as const;

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      onFocus={onFocusAny}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-2"
      data-testid="lead-form"
    >
      <div className="flex items-start gap-4">
        <WhatsAppIcon className="mt-0.5 size-10 shrink-0 text-wa-500" />
        <div>
          <h2 id={`${id}-title`} className="text-xl leading-tight font-extrabold text-ink-900 sm:text-[1.5rem]">
            Obtén tu catálogo ahora
          </h2>
          <p className="mt-1 text-pretty text-[0.92rem] text-ink-600">
            Déjanos tus datos y un asesor te enviará toda la información por WhatsApp.
          </p>
          <span aria-hidden="true" className="mt-2 block h-1 w-14 rounded-full bg-brand-500" />
        </div>
      </div>


      <div className="mt-1">
        <label htmlFor={`${id}-fullName`} className="visually-hidden">
          Nombre y apellidos
        </label>
        <div className="field-shell" data-invalid={Boolean(visibleError('fullName'))}>
          <User className="size-5 shrink-0 text-brand-500" aria-hidden="true" />
          <input
            ref={(el) => {
              fieldRefs.current.fullName = el;
            }}
            id={`${id}-fullName`}
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder="Nombre y apellidos"
            required
            minLength={3}
            maxLength={120}
            enterKeyHint="next"
            value={values.fullName}
            onChange={(e) => update('fullName', e.target.value)}
            onBlur={onBlur('fullName')}
            aria-invalid={Boolean(visibleError('fullName'))}
            aria-describedby={visibleError('fullName') ? errorIds.fullName : undefined}
          />
        </div>
        <FieldError id={errorIds.fullName} message={visibleError('fullName')} />
      </div>

      <div>
        {/* Móvil: columnas que pueden encogerse (evita el desborde horizontal a 375 px); desde sm, la rejilla aprobada. */}
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-2.5 sm:grid-cols-[minmax(8.75rem,auto)_1fr]">
          <div className="field-shell relative pr-3" data-invalid={Boolean(visibleError('phone'))}>
            <Phone className="size-5 shrink-0 text-brand-500" aria-hidden="true" />
            <label htmlFor={`${id}-country`} className="visually-hidden">
              Código de país
            </label>
            <select
              id={`${id}-country`}
              name="phoneCountry"
              value={values.phoneCountry}
              onChange={(e) => update('phoneCountry', e.target.value as PhoneCountryCode)}
              className="min-w-0 flex-1 pr-9 font-bold sm:flex-none"
              autoComplete="tel-country-code"
            >
              {phoneCountries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.dial} {c.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-4 text-ink-600" aria-hidden="true" />
          </div>
          <div className="field-shell" data-invalid={Boolean(visibleError('phone'))}>
            <label htmlFor={`${id}-phone`} className="visually-hidden">
              Número de WhatsApp
            </label>
            <input
              ref={(el) => {
                fieldRefs.current.phone = el;
              }}
              id={`${id}-phone`}
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder={country.placeholder}
              required
              enterKeyHint="next"
              value={values.phone}
              onChange={(e) => update('phone', e.target.value)}
              onBlur={onBlur('phone')}
              aria-invalid={Boolean(visibleError('phone'))}
              aria-describedby={visibleError('phone') ? errorIds.phone : undefined}
            />
          </div>
        </div>
        <FieldError id={errorIds.phone} message={visibleError('phone')} />
      </div>

      <div>
        <label htmlFor={`${id}-email`} className="visually-hidden">
          Correo electrónico
        </label>
        <div className="field-shell" data-invalid={Boolean(visibleError('email'))}>
          <Mail className="size-5 shrink-0 text-brand-500" aria-hidden="true" />
          <input
            ref={(el) => {
              fieldRefs.current.email = el;
            }}
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Correo electrónico"
            required
            enterKeyHint="done"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            onBlur={onBlur('email')}
            aria-invalid={Boolean(visibleError('email'))}
            aria-describedby={visibleError('email') ? errorIds.email : undefined}
          />
        </div>
        <FieldError id={errorIds.email} message={visibleError('email')} />
      </div>

      {/* A4: sede donde quiere ser atendido (enruta la conversación a la bandeja de esa sede). */}
      <fieldset className="flex flex-wrap items-center gap-2" data-testid="campus-picker">
        <legend className="visually-hidden">Sede de atención</legend>
        <span aria-hidden="true" className="mr-1 inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-ink-700">
          <MapPin className="size-4 text-brand-500" />
          Sede:
        </span>
        {institution.campusOptions.map((option) => (
          <label key={option.value} className="choice-chip">
            <input
              type="radio"
              name="campus"
              value={option.value}
              checked={values.campus === option.value}
              onChange={() => update('campus', option.value as Campus)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="mt-1 flex flex-col gap-2.5">
        <legend className="visually-hidden">Autorizaciones</legend>
        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-[0.85rem] text-ink-900">
            <input
              ref={(el) => {
                fieldRefs.current.contactAccepted = el;
              }}
              type="checkbox"
              name="contactAccepted"
              checked={values.contactAccepted}
              onChange={(e) => {
                update('contactAccepted', e.target.checked);
                setTouched((t) => ({ ...t, contactAccepted: true }));
              }}
              className="mt-0.5 size-5 shrink-0 rounded accent-brand-500"
              aria-invalid={Boolean(visibleError('contactAccepted'))}
              aria-describedby={visibleError('contactAccepted') ? errorIds.contactAccepted : undefined}
              required
            />
            <span>
              Acepto ser contactado por SIS.{' '}
              <Link
                href="/politica-de-privacidad"
                className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
                target="_blank"
              >
                Política de privacidad
              </Link>
            </span>
          </label>
          <FieldError id={errorIds.contactAccepted} message={visibleError('contactAccepted')} />
        </div>
        {siteConfig.showMarketingConsent && (
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-600">
            <input
              type="checkbox"
              name="marketingAccepted"
              checked={values.marketingAccepted}
              onChange={(e) => update('marketingAccepted', e.target.checked)}
              className="mt-0.5 size-5 shrink-0 rounded accent-brand-500"
            />
            <span>Quiero recibir novedades y futuras promociones de SIS (opcional).</span>
          </label>
        )}
      </fieldset>

      <button
        type="submit"
        className="wa-gradient mt-1 inline-flex min-h-[2.95rem] w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-[clamp(0.95rem,4vw,1.02rem)] font-bold text-white shadow-[var(--shadow-cta)] transition-[transform,filter] hover:brightness-105 active:scale-[0.99]"
        data-testid="submit-lead"
      >
        <WhatsAppIcon className="size-6" />
        Recibir catálogo por WhatsApp
        <ArrowRight className="size-5" aria-hidden="true" />
      </button>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="error-msg">
      <span aria-hidden="true">⚠</span>
      {message}
    </p>
  );
}

function labelFor(field: FieldName): string {
  switch (field) {
    case 'fullName':
      return 'Nombre y apellidos';
    case 'phone':
      return 'Número de WhatsApp';
    case 'email':
      return 'Correo electrónico';
    case 'contactAccepted':
      return 'Autorización de contacto';
  }
}
