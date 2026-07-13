-- Phase 5 entitlement timestamp portability correction.
-- Apply immediately after phase5_member_experience.sql.
-- SQLite/D1 stores timestamps as TEXT; datetime(...) normalisation is required
-- when ISO-8601 values contain T/Z but datetime('now') contains a space.

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
    AND (s.current_period_end IS NULL OR datetime(s.current_period_end) > datetime('now'))

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
    AND datetime(g.starts_at) <= datetime('now')
    AND (g.expires_at IS NULL OR datetime(g.expires_at) > datetime('now'))
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
  SUM(CASE WHEN s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now') THEN 1 ELSE 0 END) AS active_sessions,
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
        AND datetime(pg.starts_at) <= datetime('now')
        AND (pg.expires_at IS NULL OR datetime(pg.expires_at) > datetime('now'))
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
