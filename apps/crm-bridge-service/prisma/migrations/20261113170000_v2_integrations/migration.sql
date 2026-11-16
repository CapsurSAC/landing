-- v2 de crm-bridge-service:
--   C8  payload de sync_jobs cifrado (columna payload_encrypted; la columna JSON heredada pasa a
--       ser opcional y la vacía el paso de datos `prisma/encrypt-legacy-payloads.ts`, que se
--       ejecuta tras `prisma migrate deploy` y también al arrancar el servicio).
--   C9  marcas de anonimización.
--   A6  tabla de seguimientos con plantilla de WhatsApp.
--   A8  marca atómica de la respuesta automática.
--   A9  nombre del asesor asignado.
--   A17 tabla de idempotencia de Meta Conversions API.
--   C24 tabla de auditoría.
--   B29 índices revisados con EXPLAIN (ver README).

-- CreateEnum
CREATE TYPE "FollowupStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MetaCapiStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- B29: el índice simple por crm_contact_id se sustituye por uno compuesto que además cubre el
-- ORDER BY synced_at DESC de findByCrmContactId (evita el Sort).
DROP INDEX "crm_contact_links_crm_contact_id_idx";

-- AlterTable
ALTER TABLE "crm_contact_links" ADD COLUMN     "anonymized_at" TIMESTAMP(3),
ADD COLUMN     "assigned_to_name" TEXT,
ADD COLUMN     "auto_reply_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sync_jobs" ADD COLUMN     "anonymized_at" TIMESTAMP(3),
ADD COLUMN     "payload_encrypted" TEXT,
ALTER COLUMN "payload" DROP NOT NULL;

-- CreateTable
CREATE TABLE "whatsapp_followups" (
    "lead_id" TEXT NOT NULL,
    "status" "FollowupStatus" NOT NULL DEFAULT 'PENDING',
    "due_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "crm_conversation_id" TEXT,
    "template_name" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_followups_pkey" PRIMARY KEY ("lead_id")
);

-- CreateTable
CREATE TABLE "meta_capi_events" (
    "lead_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "status" "MetaCapiStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "fbtrace_id" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_capi_events_pkey" PRIMARY KEY ("lead_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "caller" TEXT NOT NULL,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (A6: candado FOR UPDATE SKIP LOCKED sobre los vencidos)
CREATE INDEX "whatsapp_followups_status_due_at_idx" ON "whatsapp_followups"("status", "due_at");

-- CreateIndex (A6: ¿la conversación la abrió el seguimiento?)
CREATE INDEX "whatsapp_followups_crm_conversation_id_idx" ON "whatsapp_followups"("crm_conversation_id");

-- CreateIndex (C24: GET /internal/admin/audit ORDER BY at DESC LIMIT n)
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at" DESC);

-- CreateIndex (B29: correlación del webhook por contacto, ORDER BY synced_at DESC LIMIT 1)
CREATE INDEX "crm_contact_links_crm_contact_id_synced_at_idx" ON "crm_contact_links"("crm_contact_id", "synced_at" DESC);

-- CreateIndex (A27: lastSyncAt = max(synced_at))
CREATE INDEX "crm_contact_links_synced_at_idx" ON "crm_contact_links"("synced_at" DESC);

-- CreateIndex (B29: GET /internal/integrations/jobs sin filtro, ORDER BY updated_at DESC LIMIT n)
CREATE INDEX "sync_jobs_updated_at_idx" ON "sync_jobs"("updated_at" DESC);

-- CreateIndex (C9: anonimización de webhooks por contacto o conversación)
CREATE INDEX "webhook_events_contact_id_idx" ON "webhook_events"("contact_id");

-- CreateIndex (C9)
CREATE INDEX "webhook_events_conversation_id_idx" ON "webhook_events"("conversation_id");
