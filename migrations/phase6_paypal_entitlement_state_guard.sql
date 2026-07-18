-- Final fail-closed entitlement guard for PayPal-backed membership.
-- Apply after phase5_member_experience.sql and phase6_paypal_subscriptions.sql.
-- The Worker derives entitlement_active, but this view also verifies the billing
-- state so an inconsistent row cannot preserve paid access.

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
  WHERE m.status='active'
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
  JOIN members m ON m.id=s.member_id
  LEFT JOIN paypal_subscription_state ps ON ps.subscription_id=s.id
  WHERE m.status='active'
    AND m.email_verified_at IS NOT NULL
    AND s.provider='paypal'
    AND (
      (
        ps.subscription_id IS NOT NULL
        AND ps.entitlement_active=1
        AND ps.billing_state IN ('active','past_due','cancelled_period_end')
        AND (ps.billing_state<>'past_due' OR ps.payment_failure_count<2)
        AND (
          ps.billing_state<>'cancelled_period_end'
          OR s.current_period_end IS NULL
          OR datetime(s.current_period_end)>datetime('now')
        )
      )
      OR (
        ps.subscription_id IS NULL
        AND LOWER(s.status) IN ('active','trialing')
        AND (s.current_period_end IS NULL OR datetime(s.current_period_end)>datetime('now'))
      )
    )
    AND COALESCE(ps.refund_hold,0)=0
    AND COALESCE(ps.reversal_hold,0)=0

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
  JOIN members m ON m.id=g.member_id
  WHERE m.status='active'
    AND m.email_verified_at IS NOT NULL
    AND g.status='active'
    AND datetime(g.starts_at)<=datetime('now')
    AND (g.expires_at IS NULL OR datetime(g.expires_at)>datetime('now'))
), ranked AS (
  SELECT member_id,MAX(tier_rank) AS tier_rank
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
  COALESCE(r.tier_rank,0) AS tier_rank,
  CASE COALESCE(r.tier_rank,0)
    WHEN 4 THEN 'research_pro_9'
    WHEN 3 THEN 'intelligence_6'
    WHEN 2 THEN 'supporter_3'
    WHEN 1 THEN 'registered'
    ELSE 'anonymous'
  END AS effective_tier,
  CASE WHEN m.role='admin' THEN 1 ELSE 0 END AS is_admin,
  CASE WHEN COALESCE(r.tier_rank,0)>=2 THEN 1 ELSE 0 END AS paid_access
FROM members m
LEFT JOIN ranked r ON r.member_id=m.id
WHERE m.status<>'deleted';
