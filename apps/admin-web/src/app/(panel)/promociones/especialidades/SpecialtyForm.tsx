'use client';

import Link from 'next/link';
import { ActionFeedback } from '@/components/ActionFeedback';
import { Field, fieldAria } from '@/components/ui';
import { useFormAction } from '@/components/useFormAction';
import type { SpecialtyFormValues } from '@/lib/catalog-forms';
import { saveSpecialtyAction } from '../actions';

export function SpecialtyForm({ initial }: { initial: SpecialtyFormValues }) {
  const { state, onSubmit, pending } = useFormAction(saveSpecialtyAction);
  const errors = state.fieldErrors ?? {};
  return (
    <form method="post" onSubmit={onSubmit} className="card max-w-3xl space-y-4 p-5" noValidate aria-label="Datos de la especialidad">
      <ActionFeedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="id" label="Identificador" hint="No se puede cambiar.">
          <input id="id" name="id" defaultValue={initial.id} readOnly className="input bg-mist-50 font-mono text-ink-500" aria-describedby="id-hint" />
        </Field>
        <Field id="track" label="Tipo" error={errors.track}>
          <select {...fieldAria('track', errors.track)} name="track" defaultValue={initial.track} className="input">
            <option value="ia">Con IA</option>
            <option value="tradicional">Tradicional</option>
          </select>
        </Field>
        <Field id="name" label="Nombre" error={errors.name}>
          <input {...fieldAria('name', errors.name)} name="name" defaultValue={initial.name} required maxLength={120} className="input" />
        </Field>
        <Field id="shortName" label="Nombre corto (opcional)" error={errors.shortName}>
          <input {...fieldAria('shortName', errors.shortName)} name="shortName" defaultValue={initial.shortName} maxLength={60} className="input" />
        </Field>
        <Field id="summary" label="Resumen" error={errors.summary} className="sm:col-span-2" hint="Entre 10 y 600 caracteres.">
          <textarea {...fieldAria('summary', errors.summary, true)} name="summary" defaultValue={initial.summary} rows={3} maxLength={600} className="input" />
        </Field>
        <Field id="audience" label="Dirigida a (una línea por perfil)" error={errors.audience} className="sm:col-span-2" hint="Máximo 12 líneas.">
          <textarea {...fieldAria('audience', errors.audience, true)} name="audience" defaultValue={initial.audience} rows={4} className="input" />
        </Field>
        <Field id="modality" label="Modalidad" error={errors.modality}>
          <input {...fieldAria('modality', errors.modality)} name="modality" defaultValue={initial.modality} required maxLength={60} className="input" />
        </Field>
        <Field id="endorsedBy" label="Respaldo (opcional)" error={errors.endorsedBy} hint="p. ej. Colegio de Ingenieros del Perú.">
          <input {...fieldAria('endorsedBy', errors.endorsedBy, true)} name="endorsedBy" defaultValue={initial.endorsedBy} maxLength={120} className="input" />
        </Field>
        <Field id="sortOrder" label="Orden" error={errors.sortOrder}>
          <input {...fieldAria('sortOrder', errors.sortOrder)} name="sortOrder" type="number" min={0} max={999} defaultValue={initial.sortOrder} className="input tabular-nums" />
        </Field>
        <div className="flex items-end text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={initial.active} className="size-4 accent-brand-600" />
            Activa (visible en la landing)
          </label>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-mist-100 pt-4">
        <Link href="/promociones/especialidades" className="btn btn-secondary">
          Cancelar
        </Link>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
