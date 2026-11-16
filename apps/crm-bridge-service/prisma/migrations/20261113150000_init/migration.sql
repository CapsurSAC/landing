-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('SUCCESS', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE');

-- CreateTable
CREATE TABLE "sync_jobs" (
    "lead_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("lead_id")
);

-- CreateTable
CREATE TABLE "crm_contact_links" (
    "id" UUID NOT NULL,
    "lead_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "crm_account_id" TEXT NOT NULL,
    "crm_contact_id" TEXT NOT NULL,
    "crm_conversation_id" TEXT,
    "crm_inbox_id" TEXT,
    "assigned_to" TEXT,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "synced_at" TIMESTAMP(3) NOT NULL,
    "conversation_linked_at" TIMESTAMP(3),

    CONSTRAINT "crm_contact_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_attempts" (
    "id" UUID NOT NULL,
    "lead_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL,
    "http_status" INTEGER,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "conversation_id" TEXT,
    "contact_id" TEXT,
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_jobs_status_updated_at_idx" ON "sync_jobs"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_contact_links_lead_id_key" ON "crm_contact_links"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_contact_links_reference_key" ON "crm_contact_links"("reference");

-- CreateIndex
CREATE INDEX "crm_contact_links_crm_contact_id_idx" ON "crm_contact_links"("crm_contact_id");

-- CreateIndex
CREATE INDEX "integration_attempts_lead_id_idx" ON "integration_attempts"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_dedupe_key_key" ON "webhook_events"("dedupe_key");

