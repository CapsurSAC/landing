'use client';

import type { ComplaintResponse } from '@capsur/api-contracts';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Field, FiledConfirmation, Honeypot } from '@/components/forms/Field';
import { Spinner } from '@/components/Spinner';
import { Turnstile } from '@/components/Turnstile';
import { ApiRequestError, submitComplaint } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import {
  complaintFieldFromPath,
  INITIAL_COMPLAINT,
  toComplaintInput,
  validateComplaint,
  type ComplaintFormValues,
  type FormErrors,
} from '@/lib/compliance-forms';
import { siteConfig } from '@/lib/config';
import { formatLongDate } from '@/lib/format';

const FIELD_ORDER = [
  'fullName',
  'documentNumber',
  'address',
  'phone',
  'email',
  'guardianName',
  'itemDescription',
  'amount',
  'detail',
  'request',
  'acceptsTerms',
];

/**
 * Hoja de reclamación virtual (A5) según ComplaintRequestSchema. Validación
 * ligera en el navegador; el backend asigna el código correlativo y calcula
 * la fecha límite (15 días hábiles).
 */
export function ComplaintForm() {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ComplaintFormValues>(INITIAL_COMPLAINT);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<ComplaintResponse | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  const set = <K extends keyof ComplaintFormValues>(key: K, value: ComplaintFormValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateComplaint(next));
  };

  const focusFirst = (errs: FormErrors) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setBanner(null);
    const errs = validateComplaint(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirst(errs);
      setBanner('Revisa los campos marcados.');
      return;
    }
    if (siteConfig.turnstileSiteKey && !captchaToken) {
      setBanner('Estamos verificando que no eres un robot. Espera un momento y vuelve a enviar.');
      return;
    }
    setPending(true);
    try {
      const website = (new FormData(e.currentTarget).get('website') as string | null) ?? '';
      const response = await submitComplaint(toComplaintInput(values, { captchaToken: captchaToken ?? undefined, website }));
      setResult(response);
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 400 && (error.problem?.errors?.length ?? 0) > 0) {
        const mapped: FormErrors = {};
        for (const err of error.problem?.errors ?? []) mapped[complaintFieldFromPath(err.path)] = err.message;
        setErrors(mapped);
        focusFirst(mapped);
        setBanner('Revisa los campos marcados.');
      } else if (error instanceof ApiRequestError && error.status === 429) {
        setBanner('Hiciste demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.');
      } else {
        setBanner('No pudimos registrar tu hoja de reclamación. Inténtalo de nuevo en unos minutos; tus datos siguen en el formulario.');
      }
      if (siteConfig.turnstileSiteKey) setCaptchaReset((n) => n + 1);
    } finally {
      setPending(false);
    }
  };

  if (result) {
    return (
      <FiledConfirmation
        title="Hoja de reclamación registrada"
        code={result.code}
        receivedAt={formatLongDate(result.receivedAt)}
        dueBy={formatLongDate(result.responseDueBy)}
      >
        Guarda tu código. Te responderemos al correo que indicaste a más tardar en la fecha límite (15 días hábiles). La formulación del
        reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el
        INDECOPI.
      </FiledConfirmation>
    );
  }

  const input = 'field-area';
  const f = (name: string) => `${id}-${name}`;

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} aria-busy={pending} className="flex flex-col gap-6" data-testid="complaint-form">
      <Honeypot id={id} />

      <fieldset className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:p-6">
        <legend className="float-left mb-3 w-full text-lg font-extrabold text-ink-900">1. Identificación del consumidor reclamante</legend>
        <div className="clear-both grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id={f('fullName')} label="Nombres y apellidos" error={errors.fullName} required>
              {(p) => (
                <input {...p} data-field="fullName" className={input} autoComplete="name" maxLength={120} value={values.fullName} onChange={(e) => set('fullName', e.target.value)} />
              )}
            </Field>
          </div>
          <Field id={f('documentType')} label="Tipo de documento" required>
            {(p) => (
              <select {...p} className={input} value={values.documentType} onChange={(e) => set('documentType', e.target.value as ComplaintFormValues['documentType'])}>
                <option value="DNI">DNI</option>
                <option value="CE">Carné de extranjería</option>
                <option value="PASAPORTE">Pasaporte</option>
              </select>
            )}
          </Field>
          <Field id={f('documentNumber')} label="Número de documento" error={errors.documentNumber} required>
            {(p) => (
              <input {...p} data-field="documentNumber" className={input} inputMode={values.documentType === 'DNI' ? 'numeric' : 'text'} maxLength={20} autoComplete="off" value={values.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field id={f('address')} label="Domicilio" error={errors.address} required>
              {(p) => (
                <input {...p} data-field="address" className={input} autoComplete="street-address" maxLength={200} value={values.address} onChange={(e) => set('address', e.target.value)} />
              )}
            </Field>
          </div>
          <Field id={f('phone')} label="Teléfono" error={errors.phone} required>
            {(p) => (
              <input {...p} data-field="phone" type="tel" className={input} autoComplete="tel" maxLength={25} value={values.phone} onChange={(e) => set('phone', e.target.value)} />
            )}
          </Field>
          <Field id={f('email')} label="Correo electrónico" hint="Te enviaremos la respuesta a este correo." error={errors.email} required>
            {(p) => (
              <input {...p} data-field="email" type="email" className={input} autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={160} value={values.email} onChange={(e) => set('email', e.target.value)} />
            )}
          </Field>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-start gap-2.5 text-[0.9rem] text-ink-900">
              <input type="checkbox" checked={values.isMinor} onChange={(e) => set('isMinor', e.target.checked)} className="mt-0.5 size-5 shrink-0 rounded accent-brand-500" />
              Soy menor de edad
            </label>
          </div>
          {values.isMinor && (
            <div className="sm:col-span-2">
              <Field id={f('guardianName')} label="Nombre del padre, madre o apoderado" error={errors.guardianName} required>
                {(p) => (
                  <input {...p} data-field="guardianName" className={input} maxLength={120} value={values.guardianName} onChange={(e) => set('guardianName', e.target.value)} />
                )}
              </Field>
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:p-6">
        <legend className="float-left mb-3 w-full text-lg font-extrabold text-ink-900">2. Identificación del bien contratado</legend>
        <div className="clear-both grid gap-4 sm:grid-cols-2">
          <fieldset className="sm:col-span-2">
            <legend className="text-[0.88rem] font-semibold text-ink-900">Tipo</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(['servicio', 'producto'] as const).map((t) => (
                <label key={t} className="choice-chip">
                  <input type="radio" name={f('itemType')} value={t} checked={values.itemType === t} onChange={() => set('itemType', t)} className="sr-only" />
                  {t === 'servicio' ? 'Servicio' : 'Producto'}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <Field id={f('itemDescription')} label="Descripción" hint="Por ejemplo, el nombre de la especialidad o promoción." error={errors.itemDescription} required>
              {(p) => (
                <input {...p} data-field="itemDescription" className={input} maxLength={300} value={values.itemDescription} onChange={(e) => set('itemDescription', e.target.value)} />
              )}
            </Field>
          </div>
          <Field id={f('amount')} label="Monto reclamado (S/)" error={errors.amount}>
            {(p) => (
              <input {...p} required={false} data-field="amount" className={input} inputMode="decimal" placeholder="0.00" maxLength={12} value={values.amount} onChange={(e) => set('amount', e.target.value)} />
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:p-6">
        <legend className="float-left mb-3 w-full text-lg font-extrabold text-ink-900">3. Detalle de la reclamación y pedido</legend>
        <div className="clear-both flex flex-col gap-4">
          <fieldset>
            <legend className="text-[0.88rem] font-semibold text-ink-900">
              Tipo <span aria-hidden="true" className="text-danger-600">*</span>
            </legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {(
                [
                  { value: 'reclamo', title: 'Reclamo', text: 'Disconformidad relacionada con el producto o servicio contratado.' },
                  { value: 'queja', title: 'Queja', text: 'Malestar o descontento respecto a la atención al público.' },
                ] as const
              ).map((k) => (
                <label
                  key={k.value}
                  className={cn(
                    'relative flex cursor-pointer flex-col rounded-2xl border bg-white p-3.5 transition-colors has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-cyan-400',
                    values.kind === k.value ? 'border-brand-500 bg-mist-50' : 'border-mist-200 hover:border-brand-400',
                  )}
                >
                  <input type="radio" name={f('kind')} value={k.value} checked={values.kind === k.value} onChange={() => set('kind', k.value)} className="sr-only" />
                  <span className="font-bold text-ink-900">{k.title}</span>
                  <span className="text-[0.82rem] text-ink-600">{k.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field id={f('detail')} label="Detalle" hint="Describe con claridad lo ocurrido." error={errors.detail} required>
            {(p) => (
              <textarea {...p} data-field="detail" rows={5} maxLength={3000} className={input} value={values.detail} onChange={(e) => set('detail', e.target.value)} />
            )}
          </Field>
          <Field id={f('request')} label="Pedido" hint="¿Qué solución solicitas?" error={errors.request} required>
            {(p) => (
              <textarea {...p} data-field="request" rows={3} maxLength={1500} className={input} value={values.request} onChange={(e) => set('request', e.target.value)} />
            )}
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-col gap-4">
        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-[0.9rem] text-ink-900">
            <input
              type="checkbox"
              data-field="acceptsTerms"
              checked={values.acceptsTerms}
              onChange={(e) => set('acceptsTerms', e.target.checked)}
              aria-invalid={Boolean(errors.acceptsTerms)}
              aria-describedby={errors.acceptsTerms ? f('terms-error') : undefined}
              className="mt-0.5 size-5 shrink-0 rounded accent-brand-500"
            />
            <span>
              Declaro que los datos consignados son verdaderos. Autorizo su uso para atender esta hoja de reclamación conforme a la{' '}
              <a href="/politica-de-privacidad" className="font-semibold text-brand-600 underline underline-offset-2" target="_blank">
                política de privacidad
              </a>
              .
            </span>
          </label>
          {errors.acceptsTerms && (
            <p id={f('terms-error')} className="error-msg">
              <span aria-hidden="true">⚠</span>
              {errors.acceptsTerms}
            </p>
          )}
        </div>

        <Turnstile onToken={setCaptchaToken} resetSignal={captchaReset} action="complaint" />

        {banner && (
          <p role="alert" className="rounded-xl border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
            {banner}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-500 px-6 font-bold text-white shadow-[var(--shadow-card)] transition-colors hover:bg-brand-600 disabled:cursor-progress disabled:opacity-90 sm:w-auto sm:self-start"
          data-testid="submit-complaint"
        >
          {pending ? (
            <>
              <Spinner label="Enviando" className="text-white" />
              Registrando…
            </>
          ) : (
            'Enviar hoja de reclamación'
          )}
        </button>
      </div>
    </form>
  );
}
