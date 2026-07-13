-- Matrix Reprogrammed Phase 4 email lifecycle schema
-- ADDITIVE MIGRATION CANDIDATE ONLY. Do not execute in production until the
-- complete lifecycle, rollback, idempotency and provider-failure suite passes.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS email_preferences (
  member_id TEXT PRIMARY KEY,
  public_daily_brief INTEGER NOT NULL DEFAULT 0 CHECK(public_daily_brief IN (0,1)),
  public_weekly_digest INTEGER NOT NULL DEFAULT 1 CHECK(public_weekly_digest IN (0,1)),
  release_notices INTEGER NOT NULL DEFAULT 1 CHECK(release_notices IN (0,1)),
  supporter_weekly_member_brief INTEGER NOT NULL DEFAULT 1 CHECK(supporter_weekly_member_brief IN (0,1)),
  intelligence_daily_member_brief INTEGER NOT NULL DEFAULT 1 CHECK(intelligence_daily_member_brief IN (0,1)),
  research_pro_reports INTEGER NOT NULL DEFAULT 1 CHECK(research_pro_reports IN (0,1)),
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  digest_day INTEGER CHECK(digest_day BETWEEN 0 AND 6),
  digest_hour INTEGER CHECK(digest_hour BETWEEN 0 AND 23),
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_preferences_updated ON email_preferences(updated_at);

CREATE TABLE IF NOT EXISTS email_action_tokens (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify_marketing','preferences','unsubscribe','resubscribe')),
  scope_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_action_tokens_member_purpose ON email_action_tokens(member_id,purpose,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_action_tokens_expiry ON email_action_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_action_tokens_used ON email_action_tokens(used_at);

CREATE TABLE IF NOT EXISTS email_provider_contacts (
  member_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'brevo',
  provider_contact_id TEXT,
  sync_status TEXT NOT NULL CHECK(sync_status IN ('pending','synced','retry','failed','suppressed')),
  provider_state_json TEXT NOT NULL DEFAULT '{}',
  local_state_hash TEXT NOT NULL,
  last_synced_at TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(member_id,provider),
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_provider_contacts_sync ON email_provider_contacts(sync_status,updated_at);
CREATE INDEX IF NOT EXISTS idx_email_provider_contacts_provider_id ON email_provider_contacts(provider_contact_id);

CREATE TABLE IF NOT EXISTS email_segments (
  id TEXT PRIMARY KEY,
  segment_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  minimum_tier TEXT NOT NULL,
  marketing INTEGER NOT NULL DEFAULT 1 CHECK(marketing IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  rules_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_segments_active ON email_segments(active,minimum_tier);

CREATE TABLE IF NOT EXISTS email_segment_memberships (
  segment_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('eligible','active','paused','removed','suppressed')),
  source TEXT NOT NULL,
  reason TEXT,
  eligible_at TEXT,
  activated_at TEXT,
  removed_at TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(segment_id,member_id),
  FOREIGN KEY(segment_id) REFERENCES email_segments(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_segment_memberships_member ON email_segment_memberships(member_id,state);
CREATE INDEX IF NOT EXISTS idx_email_segment_memberships_segment ON email_segment_memberships(segment_id,state);

CREATE TABLE IF NOT EXISTS email_campaign_content_versions (
  id TEXT PRIMARY KEY,
  campaign_kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT NOT NULL DEFAULT '',
  html_content TEXT NOT NULL,
  text_content TEXT NOT NULL,
  canonical_record_ids_json TEXT NOT NULL DEFAULT '[]',
  content_hash TEXT NOT NULL UNIQUE,
  evidence_checkpoint_at TEXT NOT NULL,
  fact_speculation_boundary_verified INTEGER NOT NULL DEFAULT 0 CHECK(fact_speculation_boundary_verified IN (0,1)),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_content_kind_created ON email_campaign_content_versions(campaign_kind,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_content_reviewed ON email_campaign_content_versions(reviewed_at);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY,
  campaign_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('verification','login','welcome','daily','weekly','release','monthly','test')),
  segment_id TEXT,
  content_version_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','review','test_sent','scheduled','sending','sent','partially_failed','failed','cancelled')),
  provider TEXT NOT NULL DEFAULT 'brevo',
  provider_campaign_id TEXT,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(segment_id) REFERENCES email_segments(id) ON DELETE RESTRICT,
  FOREIGN KEY(content_version_id) REFERENCES email_campaign_content_versions(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_schedule ON email_campaigns(status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_kind_created ON email_campaigns(kind,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_provider_id ON email_campaigns(provider_campaign_id);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  campaign_id TEXT,
  message_kind TEXT NOT NULL,
  recipient_email_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','retry','failed','cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  locked_at TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY(campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_ready ON email_outbox(status,available_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_member ON email_outbox(member_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_campaign ON email_outbox(campaign_id,status);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  member_id TEXT,
  recipient_email_hash TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','sent','delivered','deferred','opened','clicked','soft_bounce','hard_bounce','complaint','unsubscribed','failed')),
  queued_at TEXT NOT NULL,
  sent_at TEXT,
  delivered_at TEXT,
  opened_at TEXT,
  clicked_at TEXT,
  failed_at TEXT,
  last_event_at TEXT,
  failure_reason TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_campaign ON email_deliveries(campaign_id,status);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_member ON email_deliveries(member_id,status);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_provider_message ON email_deliveries(provider_message_id);

CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'brevo',
  provider_event_id TEXT NOT NULL,
  provider_message_id TEXT,
  campaign_id TEXT,
  member_id TEXT,
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed_at TEXT,
  processing_status TEXT NOT NULL CHECK(processing_status IN ('received','processed','ignored_duplicate','failed')),
  processing_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(provider,provider_event_id),
  FOREIGN KEY(campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_email_events_provider_message ON email_events(provider_message_id,event_at);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id,event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_member ON email_events(member_id,event_type);

CREATE TABLE IF NOT EXISTS email_suppressions (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  recipient_email_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('all_marketing','segment','provider')),
  segment_key TEXT,
  reason TEXT NOT NULL CHECK(reason IN ('unsubscribe','hard_bounce','complaint','admin','legal','provider','deleted_account')),
  source TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  suppressed_at TEXT NOT NULL,
  cleared_at TEXT,
  cleared_by_consent_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_hash ON email_suppressions(recipient_email_hash,active);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_member ON email_suppressions(member_id,active);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_scope ON email_suppressions(scope,segment_key,active);

CREATE TABLE IF NOT EXISTS email_webhook_receipts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'brevo',
  request_id TEXT NOT NULL,
  signature_valid INTEGER NOT NULL CHECK(signature_valid IN (0,1)),
  payload_hash TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  processing_status TEXT NOT NULL CHECK(processing_status IN ('received','processed','partially_failed','rejected')),
  received_at TEXT NOT NULL,
  processed_at TEXT,
  last_error TEXT,
  UNIQUE(provider,request_id)
);
CREATE INDEX IF NOT EXISTS idx_email_webhook_received ON email_webhook_receipts(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_webhook_status ON email_webhook_receipts(processing_status,received_at DESC);

CREATE TABLE IF NOT EXISTS email_reconciliation_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'brevo',
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','complete','partial','failed')),
  local_count INTEGER NOT NULL DEFAULT 0,
  provider_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_reconciliation_status ON email_reconciliation_runs(status,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_reconciliation_provider ON email_reconciliation_runs(provider,started_at DESC);

INSERT OR IGNORE INTO email_segments
  (id,segment_key,label,minimum_tier,marketing,active,rules_json,updated_at,created_at)
VALUES
  ('segment-public-daily','public_daily_brief','Public Daily Brief','public',1,1,'{"preference":"public_daily_brief"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('segment-public-weekly','public_weekly_digest','Public Weekly Digest','public',1,1,'{"preference":"public_weekly_digest"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('segment-registered-release','registered_release_notices','Registered Release Notices','registered',1,1,'{"preference":"release_notices"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('segment-supporter-weekly','supporter_weekly_member_brief','Supporter Weekly Member Brief','supporter_3',1,1,'{"preference":"supporter_weekly_member_brief"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('segment-intelligence-daily','intelligence_daily_member_brief','Intelligence Daily Member Brief','intelligence_6',1,1,'{"preference":"intelligence_daily_member_brief"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('segment-research-reports','research_pro_reports','Research Pro Reports','research_pro_9',1,1,'{"preference":"research_pro_reports"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('segment-transactional','transactional_account','Transactional Account Email','public',0,1,'{"transactional":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('segment-suppressed','suppressed_do_not_send','Suppressed — Do Not Send','public',0,1,'{"suppressed":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

CREATE VIEW IF NOT EXISTS email_eligible_members AS
SELECT
  m.id AS member_id,
  m.email,
  m.display_name,
  m.tier,
  m.status AS account_status,
  m.marketing_status,
  m.email_verified_at,
  p.public_daily_brief,
  p.public_weekly_digest,
  p.release_notices,
  p.supporter_weekly_member_brief,
  p.intelligence_daily_member_brief,
  p.research_pro_reports,
  p.locale,
  p.timezone
FROM members m
JOIN email_preferences p ON p.member_id=m.id
WHERE m.status='active'
  AND m.marketing_status='subscribed'
  AND m.email_verified_at IS NOT NULL
  AND (p.public_daily_brief=1 OR p.public_weekly_digest=1 OR p.release_notices=1 OR p.supporter_weekly_member_brief=1 OR p.intelligence_daily_member_brief=1 OR p.research_pro_reports=1)
  AND NOT EXISTS (
    SELECT 1 FROM email_suppressions s
    WHERE s.active=1
      AND s.scope='all_marketing'
      AND (s.member_id=m.id OR s.recipient_email_hash=lower(hex(sha3(m.email,256))))
  );

CREATE VIEW IF NOT EXISTS email_campaign_recipient_candidates AS
SELECT
  esm.segment_id,
  s.segment_key,
  esm.member_id,
  e.email,
  e.display_name,
  e.tier,
  esm.state,
  esm.updated_at AS segment_updated_at
FROM email_segment_memberships esm
JOIN email_segments s ON s.id=esm.segment_id AND s.active=1
JOIN email_eligible_members e ON e.member_id=esm.member_id
WHERE esm.state='active'
  AND s.marketing=1;

CREATE VIEW IF NOT EXISTS email_delivery_metrics AS
SELECT
  c.id AS campaign_id,
  c.campaign_key,
  c.kind,
  c.status AS campaign_status,
  COUNT(d.id) AS delivery_rows,
  SUM(CASE WHEN d.status IN ('sent','delivered','opened','clicked') THEN 1 ELSE 0 END) AS sent_or_better,
  SUM(CASE WHEN d.status IN ('delivered','opened','clicked') THEN 1 ELSE 0 END) AS delivered_or_better,
  SUM(CASE WHEN d.status IN ('opened','clicked') THEN 1 ELSE 0 END) AS opened_or_better,
  SUM(CASE WHEN d.status='clicked' THEN 1 ELSE 0 END) AS clicked,
  SUM(CASE WHEN d.status IN ('soft_bounce','hard_bounce','complaint','failed') THEN 1 ELSE 0 END) AS failed_or_suppressed
FROM email_campaigns c
LEFT JOIN email_deliveries d ON d.campaign_id=c.id
GROUP BY c.id,c.campaign_key,c.kind,c.status;

CREATE VIEW IF NOT EXISTS email_provider_reconciliation AS
SELECT
  m.id AS member_id,
  m.email,
  m.status AS account_status,
  m.marketing_status,
  p.provider,
  p.sync_status,
  p.provider_contact_id,
  p.last_synced_at,
  p.last_checked_at,
  p.last_error,
  CASE
    WHEN m.marketing_status IN ('unsubscribed','suppressed','bounced','complained') AND p.sync_status <> 'suppressed' THEN 'provider-suppression-required'
    WHEN m.marketing_status='subscribed' AND p.sync_status IN ('pending','retry','failed') THEN 'provider-sync-required'
    WHEN p.member_id IS NULL THEN 'provider-contact-missing'
    ELSE 'aligned-or-pending-check'
  END AS reconciliation_status
FROM members m
LEFT JOIN email_provider_contacts p ON p.member_id=m.id AND p.provider='brevo'
WHERE m.status <> 'deleted';
