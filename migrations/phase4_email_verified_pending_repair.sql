-- Restore verified subscribers that a repeat signup incorrectly reset to pending.
-- This migration is deliberately narrow: it requires an active account, a verified
-- address, the latest recorded marketing consent to be granted, and no active
-- all-marketing suppression. Explicit unsubscribe, bounce and complaint states
-- are never changed.

PRAGMA foreign_keys = ON;

UPDATE members
SET marketing_status = 'subscribed',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status = 'active'
  AND email_verified_at IS NOT NULL
  AND marketing_status = 'pending'
  AND COALESCE((
    SELECT ec.granted
    FROM email_consents ec
    WHERE ec.member_id = members.id
      AND ec.consent_type = 'marketing_email'
    ORDER BY ec.created_at DESC
    LIMIT 1
  ), 0) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM email_suppressions es
    WHERE es.member_id = members.id
      AND es.active = 1
      AND es.scope = 'all_marketing'
  );

-- Re-activate the two scheduled public briefing segments for every safely restored
-- subscriber according to their saved preferences. Upserts make the repair
-- idempotent and also recreate a missing membership row.
INSERT INTO email_segment_memberships
  (segment_id,member_id,state,source,reason,eligible_at,activated_at,removed_at,updated_at,created_at)
SELECT
  'segment-public-daily',m.id,'active','verified-pending-repair','verified-consent-preference-restored',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM members m
JOIN email_preferences p ON p.member_id = m.id
WHERE m.status = 'active'
  AND m.marketing_status = 'subscribed'
  AND m.email_verified_at IS NOT NULL
  AND p.public_daily_brief = 1
  AND NOT EXISTS (
    SELECT 1 FROM email_suppressions es
    WHERE es.member_id = m.id AND es.active = 1 AND es.scope = 'all_marketing'
  )
ON CONFLICT(segment_id,member_id) DO UPDATE SET
  state = 'active',
  source = 'verified-pending-repair',
  reason = 'verified-consent-preference-restored',
  eligible_at = excluded.eligible_at,
  activated_at = excluded.activated_at,
  removed_at = NULL,
  updated_at = excluded.updated_at;

INSERT INTO email_segment_memberships
  (segment_id,member_id,state,source,reason,eligible_at,activated_at,removed_at,updated_at,created_at)
SELECT
  'segment-public-weekly',m.id,'active','verified-pending-repair','verified-consent-preference-restored',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM members m
JOIN email_preferences p ON p.member_id = m.id
WHERE m.status = 'active'
  AND m.marketing_status = 'subscribed'
  AND m.email_verified_at IS NOT NULL
  AND p.public_weekly_digest = 1
  AND NOT EXISTS (
    SELECT 1 FROM email_suppressions es
    WHERE es.member_id = m.id AND es.active = 1 AND es.scope = 'all_marketing'
  )
ON CONFLICT(segment_id,member_id) DO UPDATE SET
  state = 'active',
  source = 'verified-pending-repair',
  reason = 'verified-consent-preference-restored',
  eligible_at = excluded.eligible_at,
  activated_at = excluded.activated_at,
  removed_at = NULL,
  updated_at = excluded.updated_at;
