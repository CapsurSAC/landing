'use client';

import type { PrivacyRequestType } from '@capsur/api-contracts';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Field, FiledConfirmation } from '@/components/forms/Field';
import { FilingActions } from '@/components/forms/FilingActions';
import { cn } from '@/lib/cn';
import { buildPrivacyMessage, INITIAL_PRIVACY, validatePrivacyRequest, type FormErrors, type PrivacyFormValues } from '@/lib/compliance-forms';
import { siteConfig } from '@/lib/config';
import { newFiling, PRIVACY_RESPONSE_BUSINESS_DAYS, type Filing } from '@/lib/filing';
import { formatLongDate } from '@/lib/format';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

const TYPES: Array<{ value: PrivacyRequestType; title: string; text: string }> = [
  { value: 'access', title: 'Acceso', text: 'Saber qué datos tuyos tratamos y para qué.' },
  { value: 'rectification', title: 'Rectificación', text: 'Corregir datos inexactos o incompletos.' },
  { value: 'cancellation', title: 'Cancelación', text: 'Suprimir tus datos cuando ya no sean necesarios.' },
  { value: 'opposition', title: 'Oposición', text: 'Oponerte a un tratamiento concreto de tus datos.' },
  { value: 'revoke_consent', title: 'Revocar consentimiento', text: 'Retirar la autorización que nos diste.' },
];

const FIELD_ORDER = ['fullName', 'email', 'phone', 'reference', 'detail'];

/** Solicitud de derechos ARCO (Ley 29733) según PrivacyRequestSchema. */
export function PrivacyRequestForm() {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<PrivacyFormValues>(INITIAL_PRIVACY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<{ filing: Filing; message: string } | null>(null);

  const set = <K extends keyof PrivacyFormValues>(key: K, value: PrivacyFormValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validatePrivacyRequest(next));
  };

  const focusFirst = (errs: FormErrors) => {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setBanner(null);
    const errs = validatePrivacyRequest(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirst(errs);
      setBanner('Revisa los campos marcados.');
      return;
    }
    const filing = newFiling('ARCO', PRIVACY_RESPONSE_BUSINESS_DAYS);
    const message = buildPrivacyMessage(values, filing);
    setResult({ filing, message });
    window.open(buildWhatsAppUrl(siteConfig.whatsappNumber, message), '_blank', 'noopener');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (result) {
    return (
      <FiledConfirmation
        title="Solicitud generada"
        code={result.filing.code}
        receivedAt={formatLongDate(result.filing.receivedAt.toISOString())}
        dueBy={formatLongDate(result.filing.dueBy.toISOString())}
      >
        <strong>Para registrarla, envía el mensaje por WhatsApp</strong> (si no se abrió solo, usa el botón). Guarda tu código. Te
        responderemos al correo que indicaste dentro del plazo legal. Si consideras que no atendimos tu solicitud, puedes acudir a la
        Autoridad Nacional de Protección de Datos Personales.
        <FilingActions message={result.message} />
      </FiledConfirmation>
    );
  }

  const input = 'field-area';
  const f = (name: string) => `${id}-${name}`;

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} className="flex flex-col gap-6" data-testid="privacy-form">
      <fieldset className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:p-6">
        <legend className="float-left mb-3 w-full text-lg font-extrabold text-ink-900">¿Qué derecho quieres ejercer?</legend>
        <div className="clear-both grid gap-2 sm:grid-cols-2">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={cn(
                'relative flex cursor-pointer flex-col rounded-2xl border bg-white p-3.5 transition-colors has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-cyan-400',
                values.type === t.value ? 'border-brand-500 bg-mist-50' : 'border-mist-200 hover:border-brand-400',
              )}
            >
              <input type="radio" name={f('type')} value={t.value} checked={values.type === t.value} onChange={() => set('type', t.value)} className="sr-only" />
              <span className="font-bold text-ink-900">{t.title}</span>
              <span className="text-[0.82rem] text-ink-600">{t.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:p-6">
        <legend className="float-left mb-3 w-full text-lg font-extrabold text-ink-900">Tus datos</legend>
        <div className="clear-both grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id={f('fullName')} label="Nombres y apellidos" error={errors.fullName} required>
              {(p) => <input {...p} data-field="fullName" className={input} autoComplete="name" maxLength={120} value={values.fullName} onChange={(e) => set('fullName', e.target.value)} />}
            </Field>
          </div>
          <Field id={f('email')} label="Correo electrónico" hint="Te responderemos a este correo." error={errors.email} required>
            {(p) => (
              <input {...p} data-field="email" type="email" className={input} autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={160} value={values.email} onChange={(e) => set('email', e.target.value)} />
            )}
          </Field>
          <Field id={f('phone')} label="Teléfono o WhatsApp" error={errors.phone}>
            {(p) => <input {...p} data-field="phone" type="tel" className={input} autoComplete="tel" maxLength={25} value={values.phone} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
          <Field id={f('reference')} label="Código de solicitud" hint="Si lo tienes, por ejemplo SIS-7K3M2." error={errors.reference}>
            {(p) => <input {...p} data-field="reference" className={input} autoComplete="off" maxLength={20} value={values.reference} onChange={(e) => set('reference', e.target.value)} />}
          </Field>
          <div className="sm:col-span-2">
            <Field
              id={f('detail')}
              label="Detalle"
              hint="Indica qué datos quieres consultar, corregir o suprimir."
              error={errors.detail}
              required={values.type === 'rectification' || values.type === 'opposition'}
            >
              {(p) => <textarea {...p} data-field="detail" rows={4} maxLength={1000} className={input} value={values.detail} onChange={(e) => set('detail', e.target.value)} />}
            </Field>
          </div>
        </div>
      </fieldset>

      {banner && (
        <p role="alert" className="rounded-xl border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
          {banner}
        </p>
      )}

      <button
        type="submit"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-500 px-6 font-bold text-white shadow-[var(--shadow-card)] transition-colors hover:bg-brand-600 sm:w-auto sm:self-start"
        data-testid="submit-privacy"
      >
        Enviar solicitud
      </button>
    </form>
  );
}
