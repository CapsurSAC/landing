-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('REGISTERED', 'CRM_SYNCING', 'CRM_SYNCED', 'CRM_FAILED');

-- CreateEnum
CREATE TYPE "SubmissionOutcome" AS ENUM ('CREATED', 'DUPLICATE', 'REPLAYED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(16) NOT NULL,
    "brand" VARCHAR(32) NOT NULL,
    "promotion_id" VARCHAR(64) NOT NULL,
    "promotion_name" VARCHAR(120) NOT NULL,
    "promotion_headline" VARCHAR(120) NOT NULL,
    "campaign_id" VARCHAR(64),
    "full_name" VARCHAR(120) NOT NULL,
    "phone_e164" VARCHAR(20) NOT NULL,
    "phone_country" VARCHAR(2) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'REGISTERED',
    "crm_contact_id" VARCHAR(64),
    "crm_conversation_id" VARCHAR(64),
    "crm_synced_at" TIMESTAMPTZ(6),
    "crm_conversation_linked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_submissions" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "outcome" "SubmissionOutcome" NOT NULL,
    "response_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "contact_accepted" BOOLEAN NOT NULL,
    "marketing_accepted" BOOLEAN NOT NULL,
    "privacy_version" VARCHAR(32) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(512),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_attributions" (
    "lead_id" UUID NOT NULL,
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(150),
    "utm_content" VARCHAR(150),
    "utm_term" VARCHAR(150),
    "referrer" VARCHAR(500),
    "landing_path" VARCHAR(300),
    "fbclid" VARCHAR(200),
    "gclid" VARCHAR(200),

    CONSTRAINT "lead_attributions_pkey" PRIMARY KEY ("lead_id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "correlation_id" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" UUID NOT NULL,
    "brand" VARCHAR(32) NOT NULL,
    "event" VARCHAR(64) NOT NULL,
    "session_id" VARCHAR(64) NOT NULL,
    "lead_id" UUID,
    "promotion_id" VARCHAR(64),
    "attribution" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_reference_key" ON "leads"("reference");

-- CreateIndex
CREATE INDEX "leads_brand_phone_e164_promotion_id_created_at_idx" ON "leads"("brand", "phone_e164", "promotion_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_submissions_idempotency_key_key" ON "lead_submissions"("idempotency_key");

-- CreateIndex
CREATE INDEX "lead_submissions_lead_id_idx" ON "lead_submissions"("lead_id");

-- CreateIndex
CREATE INDEX "consent_records_lead_id_idx" ON "consent_records"("lead_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "outbox_events"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "tracking_events_brand_event_occurred_at_idx" ON "tracking_events"("brand", "event", "occurred_at");

-- AddForeignKey
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
