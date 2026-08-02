-- Repair ISO-8601 timestamp comparisons in the authoritative entitlement view.
-- SQLite's datetime() normalization prevents same-day values containing "T"
-- from being compared lexicographically against datetime('now') values.

DROP VIEW IF EXISTS member_effective_entitlements;
CREATE VIEW member_effective_entitlements AS
WITH entitlement_candidates AS (
  SELECT m.id AS member_id, 1 AS tier_rank, 'registered' AS effective_tier,
         'verified_account' AS entitlement_source, NULL AS entitlement_reference
  FROM members m
  WHERE m.status = 'active' AND m.email_verified_at IS NOT NULL

  UNION ALL

  SELECT s.member_id,
         CASE s.tier WHEN 'supporter' THEN 2 WHEN 'intelligence' THEN 3 WHEN 'research_pro' THEN 4 ELSE 1 END,
         CASE s.tier WHEN 'supporter' THEN 'supporter_3' WHEN 'intelligence' THEN 'intelligence_6' WHEN 'research_pro' THEN 'research_pro_9' ELSE 'registered' END,
         'active_subscription', s.provider_subscription_id
  FROM subscriptions s
  JOIN members m ON m.id = s.member_id
  WHERE m.status = 'active'
    AND m.email_verified_at IS NOT NULL
    AND LOWER(s.status) IN ('active', 'trialing')
    AND (s.current_period_end IS NULL OR datetime(s.current_period_end) > datetime('now'))

  UNION ALL

  SELECT g.member_id,
         CASE g.tier WHEN 'supporter' THEN 2 WHEN 'intelligence' THEN 3 WHEN 'research_pro' THEN 4 ELSE 1 END,
         CASE g.tier WHEN 'supporter' THEN 'supporter_3' WHEN 'intelligence' THEN 'intelligence_6' WHEN 'research_pro' THEN 'research_pro_9' ELSE 'registered' END,
         'audited_access_grant', g.id
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
SELECT m.id AS member_id, m.email, m.display_name, m.role, m.status, m.email_verified_at,
       COALESCE(r.tier_rank, 0) AS tier_rank,
       CASE COALESCE(r.tier_rank, 0)
         WHEN 4 THEN 'research_pro_9' WHEN 3 THEN 'intelligence_6'
         WHEN 2 THEN 'supporter_3' WHEN 1 THEN 'registered' ELSE 'anonymous'
       END AS effective_tier,
       CASE WHEN m.role = 'admin' THEN 1 ELSE 0 END AS is_admin,
       CASE WHEN COALESCE(r.tier_rank, 0) >= 2 THEN 1 ELSE 0 END AS paid_access
FROM members m
LEFT JOIN ranked r ON r.member_id = m.id
WHERE m.status <> 'deleted';
