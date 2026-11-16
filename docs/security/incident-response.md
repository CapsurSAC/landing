# Plan de respuesta a incidentes de datos personales (C30)

Aplica a cualquier evento que comprometa la confidencialidad, integridad o disponibilidad de datos personales tratados por la plataforma (leads, consentimientos, reclamaciones, solicitudes ARCO, copias de seguridad) o de los secretos que los protegen.

Marco: Ley N.º 29733 y su Reglamento (D.S. N.º 016-2024-JUS), que exige comunicar los incidentes de seguridad a la **Autoridad Nacional de Protección de Datos Personales (ANPD)** del Ministerio de Justicia y Derechos Humanos y, cuando afecten significativamente sus derechos, a los **titulares**. Los plazos de este documento (48 horas a la ANPD) deben confirmarse con el área legal en cada revisión anual.

## Roles

| Rol                            | Titular                  | Suplente                        | Responsabilidad                                         |
| ------------------------------ | ------------------------ | ------------------------------- | ------------------------------------------------------- |
| Coordinador del incidente      | Jefatura de sistemas     | Coordinación de infraestructura | Dirige, decide contención, convoca                      |
| Responsable técnico            | Desarrollador de guardia | Otro miembro del equipo         | Investigación, contención y recuperación técnica        |
| Oficial de protección de datos | (designar)               | (designar)                      | Evaluación de riesgo, notificaciones a ANPD y titulares |
| Comunicación                   | Marketing / dirección    | Gerencia                        | Mensajes a titulares y, si procede, comunicado público  |
| Legal                          | Asesoría legal           | —                               | Validación de notificaciones y plazos                   |

Directorio de contacto (teléfonos, correos) en el gestor de secretos, carpeta «Incidentes»; revisarlo cada semestre.

## Fases

### 1. Detección (T0)

Fuentes: alertas de Sentry (picos de 5xx, fallos de firma/token del webhook, mensajes en DLQ), alertas de monitorización (infrastructure/monitoring/README.md), hallazgos de `gitleaks`/Trivy/ZAP, reportes de asesores o de titulares, avisos de proveedores (Chatwoot, Meta, hosting).

Acción inmediata: abrir un registro del incidente (plantilla abajo) con hora de detección; **no borrar evidencias** (logs, contenedores, volúmenes).

### 2. Contención (objetivo: < 4 h desde T0)

Según el vector:

- **Credencial o secreto filtrado:** rotar (docs/security/secrets.md) — tokens entre servicios, contraseñas de BD/Redis/RabbitMQ, `CHATWOOT_*`, `ADMIN_SESSION_SECRET` (cierra todas las sesiones del panel).
- **Acceso indebido al panel:** retirar al usuario de `ADMIN_USERS_JSON`, rotar `ADMIN_SESSION_SECRET`, activar/restringir `ADMIN_IP_ALLOWLIST`.
- **Explotación de un servicio:** escalar a 0 réplicas o bloquear la ruta en el gateway (router con `deny-all`); preservar el contenedor (`docker commit`/`docker export`) antes de recrearlo.
- **Exfiltración de base de datos o copia:** confirmar si los datos estaban cifrados (ADR 0009) y si `PII_ENCRYPTION_KEY` pudo verse comprometida; si sí, rotarla y re-cifrar.
- **Proveedor externo comprometido (Chatwoot/Meta):** suspender la integración (`META_*` vacío, detener crm-bridge) hasta aclarar.

### 3. Evaluación (objetivo: < 24 h desde T0)

Responder y registrar:

1. ¿Qué datos y de cuántos titulares? (consultas por rango de fechas en leads-service; nunca exportar datos para la evaluación fuera del panel).
2. ¿Estaban cifrados y la clave sigue segura? (si sí, el riesgo baja notablemente).
3. ¿Hubo acceso efectivo, copia o solo exposición potencial?
4. Riesgo para los titulares: bajo / medio / alto (suplantación, fraude, _phishing_ dirigido con nombre + teléfono).
5. ¿Afecta a menores de edad u otros datos sensibles? (no deberían existir en la plataforma; si aparecen, riesgo alto).

### 4. Notificación

- **ANPD:** si hay riesgo para los derechos de los titulares, comunicar dentro de las **48 horas** desde que se tuvo conocimiento, por el canal que la ANPD tenga habilitado (mesa de partes virtual del MINJUSDH), con la información disponible y ampliarla después.
- **Titulares:** sin demora indebida cuando el riesgo sea alto, por el canal por el que dejaron sus datos (correo y/o WhatsApp de la bandeja SIS), en lenguaje claro.
- **Proveedores y aliados** afectados (Chatwoot, Meta) según contrato.
- Toda notificación la valida el oficial de protección de datos y legal.

### 5. Recuperación y cierre

- Restaurar servicio desde imágenes conocidas y, si hubo alteración de datos, desde backup verificado (docs/operations/backups.md).
- Corregir la causa raíz; añadir prueba/regla que lo detecte (CI, alerta).
- Revisión post-incidente sin culpables en ≤ 10 días hábiles; actualizar este plan.

## Plantillas

### Registro del incidente

```
ID: INC-AAAA-NNN
Detectado: AAAA-MM-DD HH:MM (America/Lima) · por: <persona/sistema>
Descripción breve:
Sistemas afectados: [web-sis | admin-web | promotions | leads | crm-bridge | postgres | redis | rabbitmq | backups | chatwoot | meta]
Datos afectados: [nombre | teléfono | correo | consentimiento | reclamaciones | ARCO | ninguno]
Nº estimado de titulares:
¿Datos cifrados? sí/no · ¿Clave comprometida? sí/no/desconocido
Contención (acciones y hora):
Evaluación de riesgo: bajo/medio/alto · justificación:
Notificación ANPD: sí/no · fecha/hora · nº de trámite
Notificación a titulares: sí/no · fecha · canal · nº de destinatarios
Causa raíz:
Acciones correctivas (responsable, fecha):
Cierre: fecha · aprobado por:
```

### Comunicación a la ANPD (borrador)

```
Asunto: Comunicación de incidente de seguridad de datos personales – <razón social>, RUC <...>

1. Responsable del tratamiento y contacto: <razón social, dirección, oficial de datos, correo, teléfono>.
2. Fecha y hora del incidente y de su detección: <...>.
3. Naturaleza del incidente: <acceso no autorizado / pérdida / divulgación / alteración>.
4. Categorías y número aproximado de titulares y de registros afectados: <...>.
5. Datos afectados y medidas de protección existentes (cifrado AES-256-GCM en reposo, etc.): <...>.
6. Posibles consecuencias para los titulares: <...>.
7. Medidas adoptadas y propuestas para mitigar los efectos: <...>.
8. Comunicación a los titulares: <realizada / prevista / no necesaria y motivo>.
```

### Comunicación a titulares (borrador)

```
Hola, <nombre o "estimado/a usuario/a">:

El <fecha> detectamos un incidente de seguridad que pudo afectar los datos que nos dejaste al solicitar
información de <promoción> en Sistemas del Sur: <datos afectados>. <No / Sí> incluye contraseñas ni datos de pago
(la plataforma no los solicita).

Qué hicimos: <contención, corrección>. Qué te recomendamos: desconfía de mensajes que digan venir de SIS y te
pidan pagos o datos adicionales; nuestros canales oficiales son <WhatsApp oficial> y <web>.

Puedes ejercer tus derechos de acceso, rectificación, cancelación u oposición en <URL de "Tus datos"> o escribiendo a
<correo de protección de datos>. Disculpa las molestias.
```

## Ejercicios

- Simulacro anual (tabletop) con un escenario: token del webhook filtrado, copia de seguridad expuesta o cuenta del panel comprometida.
- Verificar en cada simulacro que la rotación de secretos y la restauración de backups funcionan en los tiempos previstos.
