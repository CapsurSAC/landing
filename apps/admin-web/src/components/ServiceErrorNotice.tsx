import type { ServiceError } from '@/lib/server/services';
import { Notice } from './ui';

const TITLES: Record<ServiceError['kind'], string> = {
  config: 'Configuración incompleta',
  network: 'Servicio no disponible',
  timeout: 'El servicio tardó demasiado',
  http: 'El servicio devolvió un error',
  invalid: 'Respuesta inesperada del servicio',
};

/** Error de un servicio interno mostrado dentro de la página (nunca una pantalla de error). */
export function ServiceErrorNotice({ error, className }: { error: ServiceError; className?: string }) {
  return (
    <Notice tone="error" title={TITLES[error.kind]} className={className}>
      <p>{error.message}</p>
      {error.fieldErrors && error.fieldErrors.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {error.fieldErrors.map((f) => (
            <li key={`${f.path}-${f.message}`}>
              <code className="font-mono text-xs">{f.path}</code>: {f.message}
            </li>
          ))}
        </ul>
      )}
    </Notice>
  );
}
