'use client';

import type { Campus, CreateLeadInput, Promotion } from '@capsur/api-contracts';
import { ArrowRight, ChevronDown, Mail, MapPin, Phone, User } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Spinner } from '@/components/Spinner';
import { Turnstile } from '@/components/Turnstile';
import { institution } from '@/content/institution';
import { LeadApiError, submitLead, type SubmitLeadResult } from '@/lib/api-client';
import { rememberAttribution } from '@/lib/attribution';
import { cn } from '@/lib/cn';
import { phoneCountries, siteConfig, type PhoneCountryCode } from '@/lib/config';
import { INITIAL_LEAD_FORM, validateLeadForm, type LeadFieldName, type LeadFormValues } from '@/lib/lead-form';
import { clearDraft, loadDraft, saveDraft } from '@/lib/session-store';
import { currentExperiment, track } from '@/lib/tracking';

/** Reexportado para las pruebas y para quien ya lo importaba desde aquí. */
export { validateLeadForm } from '@/lib/lead-form';

type FieldName = LeadFieldName;
const FIELD_ORDER: FieldName[] = ['fullName', 'phone', 'email', 'contactAccepted'];

interface LeadFormProps {
  promotion: Promotion | null;
  /** Especialidades elegidas en el selector (vacío = «lo decido con un asesor»). */
  specialtyIds: string[];
  onSuccess: (result: SubmitLeadResult) => void;
  onPromotionUnavailable: () => void;
  /** Se invoca cuando el usuario intenta enviar sin promoción, para marcar el selector. */
  onMissingPromotion: () => void;
  /** Error del backend sobre las especialidades elegidas. */
  onSpecialtyError?: (message: string) => void;
}

export function LeadForm({
  promotion,
  specialtyIds,
  onSuccess,
  onPromotionUnavailable,
  onMissingPromotion,
  onSpecialtyError,
}: LeadFormProps) {
  const id = useId();
  const [values, setValues] = useState<LeadFormValues>(INITIAL_LEAD_FORM);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const startedRef = useRef(false);
  const dirtyRef = useRef(false);
  const idempotencyKeyRef = useRef<string>('');
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});

  // A15: restaurar el borrador de esta sesión (solo en el cliente, tras hidratar).
  useEffect(() => {
    const draft = loadDraft();
    // Restauración tras hidratar: sessionStorage no existe en el servidor, así que no puede ser estado inicial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setValues(draft.values);
  }, []);

  // A15: guardar el borrador mientras se escribe (nunca después de un envío exitoso).
  useEffect(() => {
    if (!dirtyRef.current) return;
    saveDraft({ values, promotionId: promotion?.id ?? null, specialtyIds });
  }, [values, promotion?.id, specialtyIds]);

  const clientErrors = useMemo(() => validateLeadForm(values), [values]);
  const country = phoneCountries.find((c) => c.code === values.phoneCountry) ?? phoneCountries[0];

  const visibleError = (field: FieldName): string | undefined => {
    if (serverErrors[field]) return serverErrors[field];
    if (touched[field] || submitted) return clientErrors[field];
    return undefined;
  };

  const update = <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) => {
    dirtyRef.current = true;
    setValues((v) => ({ ...v, [key]: value }));
    if (key in serverErrors) setServerErrors((e) => ({ ...e, [key]: undefined }));
    if (banner) setBanner(null);
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setBanner(null);

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
    if (siteConfig.turnstileSiteKey && !captchaToken) {
      setBanner('Estamos verificando que no eres un robot. Espera un momento y vuelve a enviar.');
      return;
    }

    const experiment = currentExperiment();
    const payload: CreateLeadInput = {
      brand: siteConfig.brand,
      promotionId: promotion.id,
      specialtyIds,
      campus: values.campus,
      fullName: values.fullName.trim(),
      phone: values.phone.replace(/\D/g, ''),
      phoneCountry: values.phoneCountry,
      email: values.email.trim().toLowerCase(),
      consent: {
        contactAccepted: true,
        marketingAccepted: values.marketingAccepted,
        privacyVersion: siteConfig.privacyPolicyVersion,
      },
      attribution: rememberAttribution(),
      ...(experiment ? { experiment } : {}),
      ...(captchaToken ? { captchaToken } : {}),
      website: (new FormData(e.currentTarget).get('website') as string | null) ?? '',
    };

    // Una clave por intento lógico: se conserva en reintentos tras un fallo de red.
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    setPending(true);
    try {
      const result = await submitLead(payload, idempotencyKeyRef.current);
      idempotencyKeyRef.current = '';
      dirtyRef.current = false;
      clearDraft();
      track('form_submitted', { promotionId: promotion.id, leadId: result.response.leadId });
      onSuccess(result);
    } catch (error) {
      handleError(error);
      if (siteConfig.turnstileSiteKey) setCaptchaReset((n) => n + 1);
    } finally {
      setPending(false);
    }
  };

  const handleError = (error: unknown) => {
    if (error instanceof LeadApiError) {
      // Cualquier respuesta definitiva del servidor cierra el intento: el siguiente envío es otro intento.
      idempotencyKeyRef.current = '';
      const fieldErrors = error.fieldErrors;
      if (error.status === 400 && fieldErrors.specialtyIds) {
        onSpecialtyError?.(fieldErrors.specialtyIds);
        setAnnouncement(fieldErrors.specialtyIds);
        setBanner('Revisa las especialidades elegidas para esta promoción.');
        return;
      }
      if (error.status === 400 && (error.code === 'CAPTCHA_INVALID' || fieldErrors.captchaToken)) {
        setBanner('No pudimos verificar que no eres un robot. Vuelve a intentarlo.');
        return;
      }
      if (error.status === 400 && Object.keys(fieldErrors).length > 0) {
        const mapped: Partial<Record<FieldName, string>> = {};
        for (const [path, message] of Object.entries(fieldErrors)) {
          const key = path === 'consent' ? 'contactAccepted' : (path as FieldName);
          if (FIELD_ORDER.includes(key)) mapped[key] = message;
        }
        if (Object.keys(mapped).length > 0) {
          setServerErrors(mapped);
          focusFirstInvalid(mapped);
          setAnnouncement('Revisa los campos marcados antes de enviar.');
          return;
        }
      }
      if (error.code === 'PROMOTION_NOT_AVAILABLE') {
        setBanner('Esta promoción ya no está disponible. Elige otra y vuelve a enviar.');
        onPromotionUnavailable();
        return;
      }
      if (error.status === 429) {
        setBanner('Hiciste demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.');
        return;
      }
      if (error.status === 503) {
        setBanner(
          error.code === 'CAPTCHA_UNAVAILABLE'
            ? 'No pudimos completar la verificación anti-robots. Inténtalo de nuevo en unos segundos.'
            : 'No pudimos verificar la promoción en este momento. Inténtalo de nuevo en unos segundos.',
        );
        return;
      }
      setBanner('No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbenos directamente por WhatsApp.');
      return;
    }
    setBanner('Sin conexión. Revisa tu internet y vuelve a intentarlo; tus datos siguen en el formulario.');
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
      aria-busy={pending}
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

      {/* Honeypot: invisible para personas y tecnologías de asistencia. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Sitio web</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
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

      <Turnstile onToken={setCaptchaToken} resetSignal={captchaReset} action="lead" />

      {banner && (
        <p role="alert" className="rounded-xl border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
          {banner}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={cn(
          'wa-gradient mt-1 inline-flex min-h-[2.95rem] w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-[clamp(0.95rem,4vw,1.02rem)] font-bold text-white shadow-[var(--shadow-cta)] transition-[transform,filter] hover:brightness-105 active:scale-[0.99]',
          pending && 'cursor-progress opacity-90',
        )}
        data-testid="submit-lead"
      >
        {pending ? (
          <>
            <Spinner label="Enviando" className="text-white" />
            Registrando tu solicitud…
          </>
        ) : (
          <>
            <WhatsAppIcon className="size-6" />
            Recibir catálogo por WhatsApp
            <ArrowRight className="size-5" aria-hidden="true" />
          </>
        )}
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
