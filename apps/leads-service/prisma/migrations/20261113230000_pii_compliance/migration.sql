-- v2: datos personales cifrados (C8), retención y ARCO (C9), consentimiento
-- append-only (C11), libro de reclamaciones (A5), auditoría (C24), correo de
-- confirmación (A7), sede/especialidades/experimentos/encuesta (A3, A4, A18, A21).
--
-- Las columnas personales pasan a TEXT para alojar el formato de PiiCipher
-- (`v1.<iv>.<tag>.<ciphertext>`). Los datos existentes NO se cifran aquí (la
-- clave vive en la aplicación): lo hace `prisma/backfill-pii.ts`, que también
-- ejecuta el servicio al arrancar y es idempotente.

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- leads: columnas cifradas, hashes y campos nuevos
ALTER TABLE "leads"
    ALTER COLUMN "full_name" SET DATA TYPE TEXT,
    ALTER COLUMN "phone_e164" SET DATA TYPE TEXT,
    ALTER COLUMN "email" SET DATA TYPE TEXT,
    ADD COLUMN "price_amount" INTEGER,
    ADD COLUMN "campus" VARCHAR(16) NOT NULL DEFAULT 'tacna',
    ADD COLUMN "specialties" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "phone_hash" VARCHAR(64),
    ADD COLUMN "email_hash" VARCHAR(64),
    ADD COLUMN "experiment_id" VARCHAR(64),
    ADD COLUMN "experiment_variant" VARCHAR(32),
    ADD COLUMN "crm_advisor_name" VARCHAR(120),
    ADD COLUMN "feedback_source" VARCHAR(32),
    ADD COLUMN "feedback_detail" VARCHAR(120),
    ADD COLUMN "feedback_at" TIMESTAMPTZ(6),
    ADD COLUMN "anonymized_at" TIMESTAMPTZ(6);

-- El índice de duplicados por teléfono en claro deja de tener sentido (se busca por hash).
DROP INDEX "leads_brand_phone_e164_promotion_id_created_at_idx";

-- lead_submissions: la respuesta guardada lleva el teléfono → cifrada (JSON en texto)
ALTER TABLE "lead_submissions" ALTER COLUMN "response_snapshot" SET DATA TYPE TEXT USING "response_snapshot"::text;

-- outbox_events: el payload de lead.created.v1 lleva nombre, teléfono y correo → cifrado
ALTER TABLE "outbox_events" ALTER COLUMN "payload" SET DATA TYPE TEXT USING "payload"::text;

-- tracking_events: especialidad y experimento (A18)
ALTER TABLE "tracking_events"
    ADD COLUMN "specialty_id" VARCHAR(64),
    ADD COLUMN "experiment_id" VARCHAR(64),
    ADD COLUMN "experiment_variant" VARCHAR(32);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "template" VARCHAR(64) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_sequences" (
    "brand" VARCHAR(32) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "compliance_sequences_pkey" PRIMARY KEY ("brand","kind","year")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "brand" VARCHAR(32) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'received',
    "full_name" TEXT NOT NULL,
    "document_type" VARCHAR(16) NOT NULL,
    "document_number" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_hash" VARCHAR(64) NOT NULL,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "guardian_name" TEXT,
    "item_type" VARCHAR(16) NOT NULL,
    "item_description" VARCHAR(300) NOT NULL,
    "item_amount" INTEGER,
    "detail" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "ip_hash" VARCHAR(64),
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "response_due_by" TIMESTAMPTZ(6) NOT NULL,
    "response" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "responded_by" VARCHAR(254),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "brand" VARCHAR(32) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'received',
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_hash" VARCHAR(64) NOT NULL,
    "phone" TEXT,
    "phone_hash" VARCHAR(64),
    "reference" VARCHAR(20),
    "detail" TEXT,
    "ip_hash" VARCHAR(64),
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "response_due_by" TIMESTAMPTZ(6) NOT NULL,
    "resolution" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" VARCHAR(254),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "caller" VARCHAR(64) NOT NULL,
    "actor" VARCHAR(254),
    "action" VARCHAR(64) NOT NULL,
    "target" VARCHAR(128),
    "metadata" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_status_next_attempt_at_idx" ON "notifications"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notifications_lead_id_idx" ON "notifications"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_code_key" ON "complaints"("code");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_requests_code_key" ON "privacy_requests"("code");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- consent_records append-only (C11): se rechaza DELETE y cualquier UPDATE que
-- no consista únicamente en poner ip_hash y/o user_agent a NULL (anonimización).
-- TRUNCATE no dispara triggers de fila (solo lo usa el entorno de pruebas).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "consent_records_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'consent_records es append-only: no se permite DELETE'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."lead_id" IS DISTINCT FROM OLD."lead_id"
        OR NEW."contact_accepted" IS DISTINCT FROM OLD."contact_accepted"
        OR NEW."marketing_accepted" IS DISTINCT FROM OLD."marketing_accepted"
        OR NEW."privacy_version" IS DISTINCT FROM OLD."privacy_version"
        OR NEW."accepted_at" IS DISTINCT FROM OLD."accepted_at"
        OR (NEW."ip_hash" IS DISTINCT FROM OLD."ip_hash" AND NEW."ip_hash" IS NOT NULL)
        OR (NEW."user_agent" IS DISTINCT FROM OLD."user_agent" AND NEW."user_agent" IS NOT NULL)
    THEN
        RAISE EXCEPTION 'consent_records es append-only: solo se permite poner ip_hash/user_agent a NULL'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "consent_records_append_only"
    BEFORE UPDATE OR DELETE ON "consent_records"
    FOR EACH ROW EXECUTE FUNCTION "consent_records_append_only"();
