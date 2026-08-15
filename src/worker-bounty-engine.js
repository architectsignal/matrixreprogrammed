import { BountyCompletionDirector, normalizeBounty } from '../ai-management/value-hunter/bounty/bounty-completion-engine.mjs';
import { GitHubPaidIssueAdapter, OpireFeaturedBountyAdapter } from '../ai-management/value-hunter/bounty/bounty-source-adapters.mjs';
import { emitMatrixSystemEvent } from './matrix-event-emitter.js';

const ROOT_ROUTE = '/api/ai-management/admin/bounty-engine';
const ROUTES = new Set([
  ROOT_ROUTE, `${ROOT_ROUTE}/sources`, `${ROOT_ROUTE}/bounties`, `${ROOT_ROUTE}/rules`, `${ROOT_ROUTE}/platforms`,
  `${ROOT_ROUTE}/workspaces`, `${ROOT_ROUTE}/submissions`, `${ROOT_ROUTE}/receipts`, `${ROOT_ROUTE}/learning`,
  `${ROOT_ROUTE}/owner-actions`, `${ROOT_ROUTE}/doctor`
]);
const ACTIVE_STATES = Object.freeze(['SELECTED','CLAIMED','WORKING','TESTING','READY_TO_SUBMIT','READY_FOR_OWNER_SUBMISSION','SUBMITTED','CHANGES_REQUESTED','ACCEPTED','PAYMENT_PENDING']);

function clean(value, maximum = 1000) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum); }
function id(value, maximum = 180) { return clean(value, maximum).toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maximum); }
function integer(value, fallback = 0) { const number = Number(value); return Number.isSafeInteger(number) ? number : fallback; }
function enabled(value, fallback = false) { if (value === undefined || value === null || value === '') return fallback; return ['1','true','yes','on'].includes(String(value).trim().toLowerCase()); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function response(data, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-matrix-origin': 'matrix-bounty-engine' } }); }
async function rows(statement) { return (await statement.all())?.results || []; }
async function requestBody(request) { try { return await request.json(); } catch { return {}; } }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function forbiddenSecret(input) { return Object.keys(input || {}).some(key => /(token|secret|password|private.?key|seed|credential)$/i.test(key) && !/(reference)$/i.test(key)); }

async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  try {
    const found = await rows(env.MEMBERS_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('matrix_bounty_sources','matrix_bounties','matrix_bounty_cycles','matrix_bounty_receipts')"));
    return found.length === 4;
  } catch { return false; }
}

async function verifyRules(source, fetchImpl, now) {
  let url;
  try { url = new URL(source.rules_url); } catch { return { current: false, sha256: null, blocker: 'invalid-rules-url' }; }
  if (url.protocol !== 'https:') return { current: false, sha256: null, blocker: 'rules-url-must-use-https' };
  try {
    const result = await fetchImpl(url, { headers: { accept: 'text/html,text/plain,application/json', 'user-agent': 'Matrix-Reprogrammed-Bounty-Rules-Verifier' } });
    if (!result.ok) return { current: false, sha256: null, blocker: `rules-http-${result.status}` };
    const text = (await result.text()).slice(0, 2_000_000);
    if (text.length < 50) return { current: false, sha256: null, blocker: 'rules-document-empty' };
    return { current: true, sha256: await sha256(text), checked_at: now, content_bytes: text.length, url: url.href };
  } catch (error) {
    return { current: false, sha256: null, blocker: `rules-fetch-failed:${clean(error?.message || error, 160)}` };
  }
}

function adaptersFor(sources, fetchImpl) {
  const built = [];
  for (const source of sources) {
    if (source.adapter_id === 'github-paid-issue-v1') built.push({ source, adapter: new GitHubPaidIssueAdapter({ fetchImpl }) });
    if (source.adapter_id === 'opire-featured-v1') built.push({ source, adapter: new OpireFeaturedBountyAdapter({ fetchImpl }) });
  }
  return built;
}

async function persistBounty(db, source, bounty, now) {
  const normalized = normalizeBounty(bounty, now);
  await db.prepare(`INSERT INTO matrix_bounties(
      bounty_id,source_id,source_platform,external_id,title,description,repository,issue_url,bounty_url,reward_amount_minor,
      reward_currency,reward_eur_estimate_minor,deadline,program_rules_url,program_rules_sha256,ai_usage_allowed,automation_allowed,
      claim_required,claim_status,claim_cost_minor,task_type,skills_required_json,languages_json,estimated_complexity,
      estimated_compute_minutes,estimated_time_minutes,competition_count,acceptance_probability_ppm,payment_probability_ppm,
      expected_net_eur_minor,priority_score,security_bounty,status,blockers_json,source_evidence_json,discovered_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,'DISCOVERED','[]',?,?,?)
    ON CONFLICT(bounty_id) DO UPDATE SET title=excluded.title,description=excluded.description,repository=excluded.repository,
      issue_url=excluded.issue_url,bounty_url=excluded.bounty_url,reward_amount_minor=excluded.reward_amount_minor,
      reward_currency=excluded.reward_currency,reward_eur_estimate_minor=excluded.reward_eur_estimate_minor,deadline=excluded.deadline,
      program_rules_url=COALESCE(matrix_bounties.program_rules_url,excluded.program_rules_url),
      ai_usage_allowed=CASE WHEN matrix_bounties.ai_usage_allowed='unknown' THEN excluded.ai_usage_allowed ELSE matrix_bounties.ai_usage_allowed END,
      automation_allowed=CASE WHEN matrix_bounties.automation_allowed='unknown' THEN excluded.automation_allowed ELSE matrix_bounties.automation_allowed END,
      claim_required=excluded.claim_required,claim_cost_minor=excluded.claim_cost_minor,task_type=excluded.task_type,
      skills_required_json=excluded.skills_required_json,languages_json=excluded.languages_json,
      competition_count=excluded.competition_count,source_evidence_json=excluded.source_evidence_json,updated_at=excluded.updated_at`).bind(
    normalized.bounty_id, source.source_id, normalized.source_platform, normalized.external_id, normalized.title, normalized.description,
    normalized.repository, normalized.issue_url, normalized.bounty_url, normalized.reward_amount_minor, normalized.reward_currency,
    normalized.reward_eur_estimate_minor, normalized.deadline, normalized.program_rules_url || source.rules_url,
    normalized.program_rules_sha256, normalized.ai_usage_allowed, normalized.automation_allowed, normalized.claim_required ? 1 : 0,
    normalized.claim_status, normalized.claim_cost_minor, normalized.task_type, JSON.stringify(normalized.skills_required),
    JSON.stringify(normalized.languages), normalized.estimated_complexity, normalized.estimated_compute_minutes,
    normalized.estimated_time_minutes, normalized.competition_count, normalized.acceptance_probability_ppm,
    normalized.payment_probability_ppm, normalized.security_bounty ? 1 : 0, JSON.stringify(normalized.source_evidence),
    normalized.discovered_at, now
  ).run();
  return normalized;
}

async function evaluateBounties(db, now, maximumActive) {
  const candidates = await rows(db.prepare(`SELECT b.*,s.current_rules_sha256,s.last_checked_at,p.payout_identity_ready,p.terms_accepted,
      p.destination_id,p.external_writes_enabled,w.workspace_id,w.state workspace_state,w.matrix_repository_isolation_verified
    FROM matrix_bounties b JOIN matrix_bounty_sources s ON s.source_id=b.source_id
    LEFT JOIN matrix_bounty_platform_profiles p ON p.platform=b.source_platform
    LEFT JOIN matrix_bounty_workspaces w ON w.bounty_id=b.bounty_id
    WHERE b.status IN ('DISCOVERED','NORMALIZED','RULES_CHECK','FEASIBLE','SELECTED') ORDER BY b.updated_at DESC LIMIT 500`));
  const director = new BountyCompletionDirector();
  const result = director.plan(candidates.map(row => normalizeBounty({ ...row,
    labels: parseJson(row.labels_json, []), skills_required: parseJson(row.skills_required_json, []), languages: parseJson(row.languages_json, []),
    program_rules_sha256: row.program_rules_sha256 || row.current_rules_sha256, securityBounty: row.security_bounty === 1
  }, now)), bounty => {
    const row = candidates.find(item => item.bounty_id === bounty.bounty_id) || {};
    const workspaceReady = row.workspace_id && row.workspace_state === 'READY' && row.matrix_repository_isolation_verified === 1;
    return {
      testsAvailable: Boolean(workspaceReady), buildUnderstood: Boolean(workspaceReady), languageAvailable: Boolean(workspaceReady),
      requirementsClear: Boolean(workspaceReady), rewardOpen: true, maximumCompetition: 10,
      payoutDestinationReady: row.payout_identity_ready === 1 && Boolean(row.destination_id),
      identityAndTermsReady: row.payout_identity_ready === 1 && row.terms_accepted === 1
    };
  }, { maximumActive, expectedHumanCostMinor: 0, competitionPenaltyPerCompetitorMinor: 10 });
  const allowedSelected = result.selected.slice(0, Math.max(0, maximumActive));
  const selectedIds = new Set(allowedSelected.map(item => item.bounty.bounty_id));
  for (const item of result.evaluated) {
    const bounty = item.bounty;
    const security = bounty.security_bounty === true;
    const status = security ? 'REJECTED' : selectedIds.has(bounty.bounty_id) ? 'SELECTED' : item.selectable ? 'FEASIBLE' : 'RULES_CHECK';
    await db.prepare(`UPDATE matrix_bounties SET program_rules_sha256=COALESCE(program_rules_sha256,?),acceptance_probability_ppm=?,
      expected_net_eur_minor=?,priority_score=?,status=?,blockers_json=?,updated_at=? WHERE bounty_id=?`).bind(
      candidates.find(row => row.bounty_id === bounty.bounty_id)?.current_rules_sha256 || null,
      item.feasibility.completion_probability_ppm, item.economics.expected_net_eur_minor, item.priority_score, status,
      JSON.stringify(security ? ['security-bounty-execution-disabled'] : item.feasibility.blockers), now, bounty.bounty_id
    ).run();
    await db.prepare(`INSERT OR REPLACE INTO matrix_bounty_rules_checks(check_id,bounty_id,rules_url,rules_sha256,rules_current,reward_open,
      ai_usage_allowed,automation_allowed,payout_terms_ready,blockers_json,evidence_json,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      `rules-${bounty.bounty_id}-${now.slice(0,10)}`, bounty.bounty_id, bounty.program_rules_url,
      candidates.find(row => row.bounty_id === bounty.bounty_id)?.current_rules_sha256 || null,
      item.feasibility.checks.rules_current ? 1 : 0, 1, bounty.ai_usage_allowed, bounty.automation_allowed,
      item.feasibility.checks.identity_and_terms_ready ? 1 : 0, JSON.stringify(item.feasibility.blockers),
      JSON.stringify({ consequential_actions_executed: 0, security_execution: false }), now
    ).run();
  }
  return { ...result, selected: allowedSelected, maximum_active: maximumActive };
}

async function bountySummary(db) {
  const states = await rows(db.prepare('SELECT status,COUNT(*) count,SUM(reward_eur_estimate_minor) reward_eur_estimate_minor FROM matrix_bounties GROUP BY status ORDER BY status'));
  const receipts = await db.prepare('SELECT COUNT(*) count,COALESCE(SUM(eur_net_minor),0) net FROM matrix_bounty_receipts WHERE reconciled=1').first();
  const lastCycle = await db.prepare('SELECT * FROM matrix_bounty_cycles ORDER BY completed_at DESC LIMIT 1').first();
  const active = states.filter(item => ACTIVE_STATES.includes(item.status)).reduce((sum, item) => sum + integer(item.count), 0);
  return {
    engine_status: integer(receipts?.count) > 0 ? 'REAL_RECEIPT_VERIFIED' : active > 0 ? 'REAL_OPPORTUNITY_IN_PROGRESS' : 'ENGINE OPERATIONAL / FIRST RECEIPT PENDING',
    counts_by_state: states.map(item => ({ state: item.status, count: integer(item.count), reward_eur_estimate_minor: integer(item.reward_eur_estimate_minor) })),
    active_count: active, maximum_active: 3, reconciled_receipts: integer(receipts?.count), reconciled_net_eur_minor: integer(receipts?.net),
    external_claims_enabled: false, external_submissions_enabled: false, security_bounty_execution: false,
    consequential_actions_executed_by_worker: 0, last_cycle: lastCycle ? { ...lastCycle, report: parseJson(lastCycle.report_json, {}) } : null
  };
}

export async function runBountyCompletionCycle(env, { trigger = 'manual', now = new Date().toISOString(), adapters, fetchImpl = globalThis.fetch } = {}) {
  if (!(await schemaReady(env))) return { ok: false, skipped: true, reason: 'bounty-engine-schema-unavailable' };
  if (!enabled(env.MATRIX_BOUNTY_ENGINE_ENABLED, true)) return { ok: true, skipped: true, reason: 'bounty-engine-disabled' };
  const db = env.MEMBERS_DB;
  const cycleId = `bounty-cycle-${now.slice(0,10)}-${id(trigger, 60) || 'manual'}`;
  const existing = await db.prepare('SELECT report_json FROM matrix_bounty_cycles WHERE cycle_id=? LIMIT 1').bind(cycleId).first();
  if (existing) return { ok: true, duplicate: true, report: parseJson(existing.report_json, {}) };
  const sources = await rows(db.prepare('SELECT * FROM matrix_bounty_sources WHERE discovery_enabled=1 ORDER BY source_id'));
  const sourceAdapters = adapters || adaptersFor(sources, fetchImpl);
  let discovered = 0;
  const sourceReports = [];
  for (const entry of sourceAdapters) {
    const source = entry.source || sources.find(item => item.adapter_id === entry.adapter?.adapterId);
    if (!source || !entry.adapter?.discoverBounties) continue;
    const rules = await verifyRules(source, fetchImpl, now);
    await db.prepare('UPDATE matrix_bounty_sources SET current_rules_sha256=?,last_checked_at=?,updated_at=? WHERE source_id=?').bind(rules.sha256, now, now, source.source_id).run();
    let result;
    try { result = await entry.adapter.discoverBounties({ now }); }
    catch (error) { result = { ok: false, source: source.adapter_id, bounties: [], failure: clean(error?.message || error, 300) }; }
    for (const bounty of result.bounties || []) { await persistBounty(db, source, bounty, now); discovered += 1; }
    sourceReports.push({ source_id: source.source_id, adapter_id: source.adapter_id, discovery_ok: result.ok === true, discovered: (result.bounties || []).length, rules, failure: result.failure || null });
  }
  const activeBefore = await db.prepare(`SELECT COUNT(*) count FROM matrix_bounties WHERE status IN (${ACTIVE_STATES.map(() => '?').join(',')})`).bind(...ACTIVE_STATES).first();
  const maximumActive = Math.max(0, 3 - integer(activeBefore?.count));
  const evaluation = await evaluateBounties(db, now, maximumActive);
  const summary = await bountySummary(db);
  const feasible = evaluation.evaluated.filter(item => item.feasibility.feasible && item.economics.positive_expected_value).length;
  const selected = evaluation.selected.length;
  const accepted = await db.prepare("SELECT COUNT(*) count FROM matrix_bounties WHERE status IN ('ACCEPTED','PAYMENT_PENDING','PAID','RECONCILED')").first();
  const paid = await db.prepare("SELECT COUNT(*) count FROM matrix_bounties WHERE status IN ('PAID','RECONCILED')").first();
  const state = summary.reconciled_receipts > 0 ? 'REAL_RECEIPT_VERIFIED' : summary.active_count > 0 ? 'REAL_OPPORTUNITY_IN_PROGRESS' : 'ENGINE_OPERATIONAL_FIRST_RECEIPT_PENDING';
  const report = {
    ok: true, cycle_id: cycleId, trigger, started_at: now, completed_at: now, source_reports: sourceReports,
    discovered_count: discovered, feasible_count: feasible, selected_count: selected, ...summary,
    automatic_claims: false, automatic_submissions: false, security_execution: false, zero_spend: true,
    truth: summary.engine_status,
    next_actions: summary.reconciled_receipts ? [] : ['verify-current-bounty-rules-and-ai-permission','configure-isolated-workspace','complete-platform-identity-and-payout-onboarding','register-approved-payout-destination']
  };
  await db.prepare(`INSERT INTO matrix_bounty_cycles(cycle_id,trigger_name,sources_checked,discovered_count,feasible_count,selected_count,
    active_count,accepted_count,paid_count,reconciled_net_eur_minor,state,report_json,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    cycleId, clean(trigger, 100), sourceReports.length, discovered, feasible, selected, Math.min(3, summary.active_count), integer(accepted?.count),
    integer(paid?.count), summary.reconciled_net_eur_minor, state, JSON.stringify(report), now, now
  ).run();
  if (sourceReports.length) {
    await db.prepare(`INSERT OR IGNORE INTO matrix_bounty_learning(learning_id,bounty_id,learning_type,before_json,observation_json,after_json,behavior_changed,created_at)
      VALUES(?,NULL,'SOURCE_RANKING','{"source_evidence":"unmeasured"}',?, ?,1,?)`).bind(
      `bounty-source-learning-${cycleId}`, JSON.stringify({ source_reports: sourceReports }),
      JSON.stringify({ future_priority: [...sourceReports].sort((a,b) => b.discovered-a.discovered).map(item => item.source_id), basis: 'normalized-open-bounties-discovered' }), now
    ).run();
  }
  await emitMatrixSystemEvent(env, {
    eventType: 'value.cycle.completed', auditIdentifier: cycleId, origin: 'matrix-bounty-engine', actor: 'BountyCompletionDirector',
    payload: { change_summary: `Bounty scout checked ${sourceReports.length} official sources and normalized ${discovered} candidates; no external claim or submission was executed.`,
      discovered, feasible, selected, reconciled_net_eur_minor: summary.reconciled_net_eur_minor, security_execution: false }
  });
  return report;
}

async function configurePlatform(db, body, now) {
  if (forbiddenSecret(body)) throw new Error('Raw credentials and tokens are forbidden; provide a vault reference only');
  const platform = clean(body.platform, 80);
  if (!['github-paid-issue','opire'].includes(platform)) throw new Error('Supported platform is required');
  const vault = clean(body.credential_vault_reference || body.credentialVaultReference, 500) || null;
  if (vault && !vault.startsWith('vault://')) throw new Error('Credential vault reference must use vault://');
  const destination = id(body.destination_id || body.destinationId) || null;
  const payoutReady = body.payout_identity_ready === true || body.payoutIdentityReady === true;
  const termsAccepted = body.terms_accepted === true || body.termsAccepted === true;
  const writesRequested = body.external_writes_enabled === true || body.externalWritesEnabled === true;
  const writesEnabled = writesRequested && payoutReady && termsAccepted && Boolean(vault);
  await db.prepare(`UPDATE matrix_bounty_platform_profiles SET payout_identity_ready=?,terms_accepted=?,credential_vault_reference=?,
    destination_id=?,external_writes_enabled=?,status=?,evidence_json=?,updated_at=? WHERE platform=?`).bind(
    payoutReady ? 1 : 0, termsAccepted ? 1 : 0, vault, destination, writesEnabled ? 1 : 0,
    writesEnabled ? 'ACTIVE' : payoutReady && termsAccepted ? 'READY_FOR_OWNER_SUBMISSION' : 'DISCOVERY_ONLY',
    JSON.stringify({ configured_by_owner_api: true, raw_credentials_stored: false, method_scoped: true }), now, platform
  ).run();
  return { platform, configured: true, external_writes_enabled: writesEnabled, raw_credentials_stored: false };
}

async function configureRules(db, body, now) {
  const bountyId = id(body.bounty_id || body.bountyId);
  const digest = clean(body.rules_sha256 || body.rulesSha256, 64);
  const ai = clean(body.ai_usage_allowed || body.aiUsageAllowed, 20).toLowerCase();
  const automation = clean(body.automation_allowed || body.automationAllowed, 20).toLowerCase();
  if (!bountyId || !/^[a-f0-9]{64}$/i.test(digest) || !['allowed','prohibited'].includes(ai) || !['allowed','prohibited'].includes(automation)) throw new Error('Bounty ID, current 64-character rules SHA-256, and explicit allowed/prohibited AI and automation decisions are required');
  const result = await db.prepare(`UPDATE matrix_bounties SET program_rules_sha256=?,ai_usage_allowed=?,automation_allowed=?,status='RULES_CHECK',updated_at=? WHERE bounty_id=?`).bind(digest, ai, automation, now, bountyId).run();
  if (!Number(result?.meta?.changes || 0)) throw new Error('Bounty not found');
  return { bounty_id: bountyId, rules_registered: true, ai_usage_allowed: ai, automation_allowed: automation };
}

async function configureWorkspace(db, body, now) {
  const bountyId = id(body.bounty_id || body.bountyId);
  const workspaceReference = clean(body.isolated_workspace_reference || body.isolatedWorkspaceReference, 700);
  const baseSha = clean(body.base_sha || body.baseSha, 64) || null;
  if (!bountyId || !workspaceReference.startsWith('workspace://')) throw new Error('Bounty ID and workspace:// isolated reference are required');
  const bounty = await db.prepare('SELECT repository FROM matrix_bounties WHERE bounty_id=? LIMIT 1').bind(bountyId).first();
  if (!bounty) throw new Error('Bounty not found');
  const workspaceId = `workspace-${bountyId}`;
  await db.prepare(`INSERT INTO matrix_bounty_workspaces(workspace_id,bounty_id,repository,base_sha,branch_name,isolated_workspace_reference,
    matrix_repository_isolation_verified,dependency_install_allowed,state,created_at,updated_at) VALUES(?,?,?,?,?,?,1,0,'READY',?,?)
    ON CONFLICT(bounty_id) DO UPDATE SET base_sha=excluded.base_sha,isolated_workspace_reference=excluded.isolated_workspace_reference,
      matrix_repository_isolation_verified=1,state='READY',updated_at=excluded.updated_at`).bind(
    workspaceId, bountyId, bounty.repository, baseSha, `matrix-bounty/${bountyId.slice(0,80)}`, workspaceReference, now, now
  ).run();
  return { bounty_id: bountyId, workspace_id: workspaceId, state: 'READY', matrix_repository_isolation_verified: true };
}

export function isBountyEngineRoute(pathname = '') { return ROUTES.has(String(pathname || '').replace(/\/+$/, '') || '/'); }

export async function handleBountyEngineRoute(request, env) {
  if (!(await schemaReady(env))) return response({ ok: false, error: 'Bounty engine schema unavailable' }, 503);
  const db = env.MEMBERS_DB;
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  try {
    if (request.method === 'GET') {
      if (path === ROOT_ROUTE) return response({ ok: true, ...(await bountySummary(db)) });
      if (path.endsWith('/sources')) return response({ ok: true, sources: await rows(db.prepare('SELECT * FROM matrix_bounty_sources ORDER BY source_id')) });
      if (path.endsWith('/bounties')) return response({ ok: true, bounties: await rows(db.prepare('SELECT * FROM matrix_bounties ORDER BY priority_score DESC,updated_at DESC LIMIT 500')) });
      if (path.endsWith('/platforms')) return response({ ok: true, platforms: await rows(db.prepare('SELECT platform,payout_identity_ready,terms_accepted,credential_vault_reference,destination_id,external_writes_enabled,status,evidence_json,updated_at FROM matrix_bounty_platform_profiles ORDER BY platform')) });
      if (path.endsWith('/workspaces')) return response({ ok: true, workspaces: await rows(db.prepare('SELECT * FROM matrix_bounty_workspaces ORDER BY updated_at DESC LIMIT 100')) });
      if (path.endsWith('/submissions')) return response({ ok: true, submissions: await rows(db.prepare('SELECT * FROM matrix_bounty_submissions ORDER BY updated_at DESC LIMIT 100')) });
      if (path.endsWith('/receipts')) return response({ ok: true, receipts: await rows(db.prepare('SELECT * FROM matrix_bounty_receipts ORDER BY reconciled_at DESC LIMIT 100')), receipt_only: true });
      if (path.endsWith('/learning')) return response({ ok: true, learning: await rows(db.prepare('SELECT * FROM matrix_bounty_learning ORDER BY created_at DESC LIMIT 100')), logs_alone_do_not_count: true });
      if (path.endsWith('/owner-actions')) return response({ ok: true, actions: await rows(db.prepare('SELECT * FROM matrix_bounty_owner_actions ORDER BY status,platform,action_id')) });
      if (path.endsWith('/doctor')) return response({ ok: true, schema_ready: true, ...(await bountySummary(db)), immutable_boundaries: { law: 'CAUSE NO HARM OR LOSS.', security_execution: false, raw_credentials_in_d1: false, receipt_only: true } });
    }
    if (request.method === 'POST') {
      if (path === ROOT_ROUTE) return response(await runBountyCompletionCycle(env, { trigger: 'owner-api' }));
      const body = await requestBody(request);
      const now = new Date().toISOString();
      if (path.endsWith('/platforms')) return response({ ok: true, ...(await configurePlatform(db, body, now)) }, 201);
      if (path.endsWith('/rules')) return response({ ok: true, ...(await configureRules(db, body, now)) }, 201);
      if (path.endsWith('/workspaces')) return response({ ok: true, ...(await configureWorkspace(db, body, now)) }, 201);
    }
    return response({ ok: false, error: 'Method not allowed' }, 405);
  } catch (error) {
    return response({ ok: false, error: clean(error?.message || error, 500) }, 400);
  }
}

export function runScheduledBountyEngine(env) { return runBountyCompletionCycle(env, { trigger: 'scheduled-daily-cycle' }); }

export const bountyWorkerInternals = { clean, id, integer, enabled, parseJson, schemaReady, verifyRules, adaptersFor, persistBounty, evaluateBounties, bountySummary, configurePlatform, configureRules, configureWorkspace };
