'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ActionFeedback } from '@/components/ActionFeedback';
import { PromotionPreviewRow, type PreviewPromotion } from '@/components/PromotionCardPreview';
import { Field, fieldAria } from '@/components/ui';
import { useFormAction } from '@/components/useFormAction';
import { readPromotionForm, type PromotionFormValues } from '@/lib/catalog-forms';
import { solesToCents } from '@/lib/money';
import { savePromotionAction } from './actions';

const ICON_OPTIONS = [
  { value: 'layers', label: 'Capas (una especialidad)' },
  { value: 'gift', label: 'Regalo (2×1)' },
  { value: 'stack', label: 'Pila (pack)' },
];

export function PromotionForm({
  mode,
  initial,
  others,
}: {
  mode: 'create' | 'edit';
  initial: PromotionFormValues;
  others: PreviewPromotion[];
}) {
  const { state, onSubmit, pending } = useFormAction(savePromotionAction);
  const [values, setValues] = useState(initial);
  // Campos corregidos desde el último envío: su error deja de mostrarse al editarlos.
  const [edited, setEdited] = useState<{ forState: typeof state; fields: ReadonlySet<string> }>({ forState: state, fields: new Set() });
  const editedFields = edited.forState === state ? edited.fields : new Set<string>();
  const errors = Object.fromEntries(Object.entries(state.fieldErrors ?? {}).filter(([field]) => !editedFields.has(field)));

  const onChange = (e: FormEvent<HTMLFormElement>) => {
    setValues(readPromotionForm(new FormData(e.currentTarget)));
    const name = (e.target as HTMLInputElement).name;
    if (name) setEdited({ forState: state, fields: new Set([...editedFields, name]) });
  };
  const priceCents = solesToCents(values.price);
  const preview: PreviewPromotion = {
    id: values.id,
    name: values.name,
    headline: values.headline,
    bundleLabel: values.bundleLabel,
    icon: values.icon,
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <form method="post" onSubmit={onSubmit} onChange={onChange} className="card space-y-5 p-5" noValidate aria-label="Datos de la promoción">
        <input type="hidden" name="mode" value={mode} />
        <ActionFeedback state={state} />

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-bold text-ink-900">Identificación</legend>
          <Field id="id" label="Identificador (slug)" error={errors.id} hint={mode === 'edit' ? 'No se puede cambiar.' : 'p. ej. con-ia; se usa en enlaces y reportes.'}>
            <input
              {...fieldAria('id', errors.id, true)}
              name="id"
              defaultValue={initial.id}
              readOnly={mode === 'edit'}
              required
              maxLength={64}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              className="input font-mono read-only:bg-mist-50 read-only:text-ink-500"
            />
          </Field>
          <Field id="campaignId" label="Campaña (opcional)" error={errors.campaignId} hint="Slug de la campaña que la usa, si aplica.">
            <input {...fieldAria('campaignId', errors.campaignId, true)} name="campaignId" defaultValue={initial.campaignId} maxLength={64} className="input font-mono" />
          </Field>
          <Field id="name" label="Nombre comercial" error={errors.name} hint="Máx. 40 caracteres, p. ej. CON IA.">
            <input {...fieldAria('name', errors.name, true)} name="name" defaultValue={initial.name} required maxLength={40} className="input" />
          </Field>
          <Field id="headline" label="Titular de la tarjeta" error={errors.headline} hint="Máx. 20 caracteres, p. ej. S/249.">
            <input {...fieldAria('headline', errors.headline, true)} name="headline" defaultValue={initial.headline} required maxLength={20} className="input" />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-bold text-ink-900">Precio</legend>
          <Field
            id="price"
            label="Precio (S/)"
            error={errors.price}
            hint={priceCents !== null ? `Se guarda como ${priceCents} céntimos.` : 'Soles con hasta 2 decimales.'}
          >
            <input {...fieldAria('price', errors.price, true)} name="price" inputMode="decimal" defaultValue={initial.price} required className="input tabular-nums" />
          </Field>
          <Field id="listPrice" label="Precio de referencia tachado (S/, opcional)" error={errors.listPrice} hint="Debe ser mayor que el precio.">
            <input {...fieldAria('listPrice', errors.listPrice, true)} name="listPrice" inputMode="decimal" defaultValue={initial.listPrice} className="input tabular-nums" />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-bold text-ink-900">Qué incluye</legend>
          <Field id="specialtiesIncluded" label="Especialidades incluidas" error={errors.specialtiesIncluded}>
            <input
              {...fieldAria('specialtiesIncluded', errors.specialtiesIncluded)}
              name="specialtiesIncluded"
              type="number"
              min={1}
              max={10}
              defaultValue={initial.specialtiesIncluded}
              required
              className="input tabular-nums"
            />
          </Field>
          <Field id="bundleLabel" label="Texto de la tarjeta" error={errors.bundleLabel} hint='p. ej. "2 especialidades".'>
            <input {...fieldAria('bundleLabel', errors.bundleLabel, true)} name="bundleLabel" defaultValue={initial.bundleLabel} required maxLength={40} className="input" />
          </Field>
          <div className="sm:col-span-2">
            <fieldset aria-describedby={errors.allowedTracks ? 'allowedTracks-error' : undefined}>
              <legend className="label">Tipos de especialidad permitidos</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" name="allowedTracks" value="ia" defaultChecked={initial.allowedTracks.includes('ia')} className="size-4 accent-brand-600" />
                  Con IA
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="allowedTracks"
                    value="tradicional"
                    defaultChecked={initial.allowedTracks.includes('tradicional')}
                    className="size-4 accent-brand-600"
                  />
                  Tradicional
                </label>
              </div>
              {errors.allowedTracks && (
                <p id="allowedTracks-error" className="field-error">
                  {errors.allowedTracks}
                </p>
              )}
            </fieldset>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-bold text-ink-900">Vigencia (hora de Lima)</legend>
          <Field id="validFrom" label="Desde" error={errors.validFrom}>
            <input {...fieldAria('validFrom', errors.validFrom)} name="validFrom" type="datetime-local" defaultValue={initial.validFrom} required className="input" />
          </Field>
          <Field id="validUntil" label="Hasta (vacío = sin fecha de fin)" error={errors.validUntil}>
            <input {...fieldAria('validUntil', errors.validUntil)} name="validUntil" type="datetime-local" defaultValue={initial.validUntil} className="input" />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-bold text-ink-900">Presentación</legend>
          <Field id="icon" label="Icono" error={errors.icon}>
            <select {...fieldAria('icon', errors.icon)} name="icon" defaultValue={initial.icon} className="input">
              {ICON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="sortOrder" label="Orden" error={errors.sortOrder} hint="Menor = primero.">
            <input
              {...fieldAria('sortOrder', errors.sortOrder, true)}
              name="sortOrder"
              type="number"
              min={0}
              max={999}
              defaultValue={initial.sortOrder}
              className="input tabular-nums"
            />
          </Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="featured" defaultChecked={initial.featured} className="size-4 accent-brand-600" />
              Destacada
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="active" defaultChecked={initial.active} className="size-4 accent-brand-600" />
              Activa
            </label>
          </div>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2 border-t border-mist-100 pt-4">
          <Link href="/promociones" className="btn btn-secondary">
            Cancelar
          </Link>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Guardando…' : mode === 'create' ? 'Crear promoción' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      <aside aria-label="Vista previa" className="xl:sticky xl:top-6 xl:self-start">
        <h2 className="mb-2 text-sm font-semibold text-ink-700">Vista previa en la landing</h2>
        <PromotionPreviewRow current={preview} others={others} />
      </aside>
    </div>
  );
}
