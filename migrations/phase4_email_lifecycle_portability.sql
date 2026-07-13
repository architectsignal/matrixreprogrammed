-- Phase 4 D1 portability correction for the migration candidate.
-- Apply immediately after phase4_email_lifecycle.sql during review fixtures.
-- Before production approval these files should be consolidated into one reviewed migration.

DROP VIEW IF EXISTS email_campaign_recipient_candidates;
DROP VIEW IF EXISTS email_eligible_members;

CREATE VIEW email_eligible_members AS
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
      AND s.member_id=m.id
  );

CREATE VIEW email_campaign_recipient_candidates AS
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
