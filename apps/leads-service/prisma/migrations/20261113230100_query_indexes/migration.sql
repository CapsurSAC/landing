-- Índices revisados con EXPLAIN (B12, B29). Ver README («Consultas e índices»).

-- Duplicados (C8): misma marca + phone_hash + promoción en las últimas 24 h.
CREATE INDEX "leads_duplicate_lookup_idx" ON "leads"("brand", "phone_hash", "promotion_id", "created_at");

-- Lista del panel (A2) y reportes: rango de fechas, más reciente primero. Hoy
-- hay una sola marca, así que `brand` no es selectiva: basta con created_at.
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at" DESC);

-- Búsqueda exacta del panel y ARCO por correo/teléfono (hashes).
CREATE INDEX "leads_email_hash_idx" ON "leads"("email_hash");
CREATE INDEX "leads_phone_hash_idx" ON "leads"("phone_hash");

-- Filtro por campaña del panel y agrupación del embudo.
CREATE INDEX "lead_attributions_utm_campaign_idx" ON "lead_attributions"("utm_campaign");

-- Serie diaria de envíos/duplicados del embudo y reporte diario.
CREATE INDEX "lead_submissions_created_at_outcome_idx" ON "lead_submissions"("created_at", "outcome");

-- Limpieza de payloads al anonimizar un lead.
CREATE INDEX "outbox_events_correlation_id_idx" ON "outbox_events"("correlation_id");

-- Embudo: sesiones únicas por evento en un rango (permite index-only scan).
DROP INDEX "tracking_events_brand_event_occurred_at_idx";
CREATE INDEX "tracking_events_funnel_idx" ON "tracking_events"("brand", "event", "occurred_at", "session_id");

-- Paneles de reclamaciones y ARCO filtrados por estado.
CREATE INDEX "complaints_brand_status_received_idx" ON "complaints"("brand", "status", "received_at" DESC);
CREATE INDEX "privacy_requests_brand_status_received_idx" ON "privacy_requests"("brand", "status", "received_at" DESC);

-- Auditoría: últimas entradas.
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at" DESC);
