PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS member_access_grants (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('supporter', 'intelligence', 'research_pro')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'complimentary', 'migration', 'promotion', 'support')),
  source_reference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS member_product_grants (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('purchase', 'manual', 'complimentary', 'migration', 'support')),
  source_reference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'expired', 'revoked', 'refunded')),
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (member_id, product_key, source_reference),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS member_saved_items (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'content',
  title TEXT NOT NULL,
  route TEXT NOT NULL,
  minimum_tier TEXT NOT NULL DEFAULT 'registered' CHECK (minimum_tier IN ('registered', 'supporter_3', 'intelligence_6', 'research_pro_9', 'separate_product')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (member_id, canonical_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_entity_follows (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'entity',
  label TEXT NOT NULL,
  route TEXT,
  minimum_tier TEXT NOT NULL DEFAULT 'registered' CHECK (minimum_tier IN ('registered', 'supporter_3', 'intelligence_6', 'research_pro_9')),
  notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (member_id, entity_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_watch_items (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('entity', 'topic', 'institution', 'jurisdiction', 'policy', 'record', 'source_change')),
  label TEXT NOT NULL,
  route TEXT,
  criteria_json TEXT NOT NULL DEFAULT '{}',
  minimum_tier TEXT NOT NULL DEFAULT 'intelligence_6' CHECK (minimum_tier IN ('intelligence_6', 'research_pro_9')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (member_id, target_type, target_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_archive_entries (
  id TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL,
  minimum_tier TEXT NOT NULL DEFAULT 'registered' CHECK (minimum_tier IN ('registered', 'supporter_3', 'intelligence_6', 'research_pro_9')),
  claim_class TEXT,
  evidence_grade TEXT,
  speculative_label TEXT,
  publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft', 'published', 'superseded', 'withdrawn')),
  published_at TEXT,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS member_download_catalog (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  minimum_tier TEXT NOT NULL DEFAULT 'registered' CHECK (minimum_tier IN ('registered', 'supporter_3', 'intelligence_6', 'research_pro_9', 'separate_product')),
  product_key TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  CHECK ((minimum_tier = 'separate_product' AND product_key IS NOT NULL) OR minimum_tier <> 'separate_product')
);

CREATE TABLE IF NOT EXISTS member_download_events (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  download_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('allowed', 'denied', 'missing', 'failed')),
  denial_reason TEXT,
  effective_tier TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (download_id) REFERENCES member_download_catalog(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_activity_history (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('view', 'save', 'unsave', 'follow', 'unfollow', 'watch', 'unwatch', 'download', 'login', 'logout', 'session_revoke', 'access_denied')),
  target_type TEXT,
  target_id TEXT,
  route TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_grants_active ON member_access_grants(member_id, status, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_member_product_grants_active ON member_product_grants(member_id, product_key, status, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_member_saved_items_member ON member_saved_items(member_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_entity_follows_member ON member_entity_follows(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_watch_items_member ON member_watch_items(member_id, active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_archive_tier_date ON member_archive_entries(minimum_tier, publication_status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_download_catalog_tier ON member_download_catalog(minimum_tier, active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_download_events_member ON member_download_events(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_activity_history_member ON member_activity_history(member_id, created_at DESC);

DROP VIEW IF EXISTS member_effective_entitlements;
CREATE VIEW member_effective_entitlements AS
WITH entitlement_candidates AS (
  SELECT
    m.id AS member_id,
    1 AS tier_rank,
    'registered' AS effective_tier,
    'verified_account' AS entitlement_source,
    NULL AS entitlement_reference
  FROM members m
  WHERE m.status = 'active'
    AND m.email_verified_at IS NOT NULL

  UNION ALL

  SELECT
    s.member_id,
    CASE s.tier
      WHEN 'supporter' THEN 2
      WHEN 'intelligence' THEN 3
      WHEN 'research_pro' THEN 4
      ELSE 1
    END AS tier_rank,
    CASE s.tier
      WHEN 'supporter' THEN 'supporter_3'
      WHEN 'intelligence' THEN 'intelligence_6'
      WHEN 'research_pro' THEN 'research_pro_9'
      ELSE 'registered'
    END AS effective_tier,
    'active_subscription' AS entitlement_source,
    s.provider_subscription_id AS entitlement_reference
  FROM subscriptions s
  JOIN members m ON m.id = s.member_id
  WHERE m.status = 'active'
    AND m.email_verified_at IS NOT NULL
    AND LOWER(s.status) IN ('active', 'trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > datetime('now'))

  UNION ALL

  SELECT
    g.member_id,
    CASE g.tier
      WHEN 'supporter' THEN 2
      WHEN 'intelligence' THEN 3
      WHEN 'research_pro' THEN 4
      ELSE 1
    END AS tier_rank,
    CASE g.tier
      WHEN 'supporter' THEN 'supporter_3'
      WHEN 'intelligence' THEN 'intelligence_6'
      WHEN 'research_pro' THEN 'research_pro_9'
      ELSE 'registered'
    END AS effective_tier,
    'audited_access_grant' AS entitlement_source,
    g.id AS entitlement_reference
  FROM member_access_grants g
  JOIN members m ON m.id = g.member_id
  WHERE m.status = 'active'
    AND m.email_verified_at IS NOT NULL
    AND g.status = 'active'
    AND g.starts_at <= datetime('now')
    AND (g.expires_at IS NULL OR g.expires_at > datetime('now'))
), ranked AS (
  SELECT member_id, MAX(tier_rank) AS tier_rank
  FROM entitlement_candidates
  GROUP BY member_id
)
SELECT
  m.id AS member_id,
  m.email,
  m.display_name,
  m.role,
  m.status,
  m.email_verified_at,
  COALESCE(r.tier_rank, 0) AS tier_rank,
  CASE COALESCE(r.tier_rank, 0)
    WHEN 4 THEN 'research_pro_9'
    WHEN 3 THEN 'intelligence_6'
    WHEN 2 THEN 'supporter_3'
    WHEN 1 THEN 'registered'
    ELSE 'anonymous'
  END AS effective_tier,
  CASE WHEN m.role = 'admin' THEN 1 ELSE 0 END AS is_admin,
  CASE WHEN COALESCE(r.tier_rank, 0) >= 2 THEN 1 ELSE 0 END AS paid_access
FROM members m
LEFT JOIN ranked r ON r.member_id = m.id
WHERE m.status <> 'deleted';

DROP VIEW IF EXISTS member_session_summary;
CREATE VIEW member_session_summary AS
SELECT
  m.id AS member_id,
  COUNT(s.id) AS total_sessions,
  SUM(CASE WHEN s.revoked_at IS NULL AND s.expires_at > datetime('now') THEN 1 ELSE 0 END) AS active_sessions,
  MAX(s.last_seen_at) AS last_session_seen_at
FROM members m
LEFT JOIN member_sessions s ON s.member_id = m.id
GROUP BY m.id;

DROP VIEW IF EXISTS member_download_eligibility;
CREATE VIEW member_download_eligibility AS
SELECT
  e.member_id,
  d.id AS download_id,
  d.title,
  d.file_name,
  d.mime_type,
  d.minimum_tier,
  d.product_key,
  CASE d.minimum_tier
    WHEN 'registered' THEN 1
    WHEN 'supporter_3' THEN 2
    WHEN 'intelligence_6' THEN 3
    WHEN 'research_pro_9' THEN 4
    ELSE 99
  END AS required_rank,
  CASE
    WHEN d.active <> 1 THEN 0
    WHEN d.minimum_tier = 'separate_product' THEN EXISTS (
      SELECT 1
      FROM member_product_grants pg
      WHERE pg.member_id = e.member_id
        AND pg.product_key = d.product_key
        AND pg.status = 'active'
        AND pg.starts_at <= datetime('now')
        AND (pg.expires_at IS NULL OR pg.expires_at > datetime('now'))
    )
    WHEN e.tier_rank >= CASE d.minimum_tier
      WHEN 'registered' THEN 1
      WHEN 'supporter_3' THEN 2
      WHEN 'intelligence_6' THEN 3
      WHEN 'research_pro_9' THEN 4
      ELSE 99
    END THEN 1
    ELSE 0
  END AS eligible
FROM member_effective_entitlements e
CROSS JOIN member_download_catalog d;
