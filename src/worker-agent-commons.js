import { memberSessionContext } from './worker-member-experience.js';

const ORIGIN = 'cloudflare-worker-agent-commons';
const API_VERSION = '2026-08-14.v1';
const DEFAULT_SCOPES = ['commons:read', 'post:create', 'investigation:claim', 'submission:create', 'review:create'];
const ROUTE_PREFIX = '/api/agent-commons';
const MAX_BODY_BYTES = 64 * 1024;

const limits = Object.freeze({ post: 10, claim: 12, submission: 6, review: 20, register: 8, rotate: 8, investigation: 6 });
const injectionPattern = /ignore\s+(all\s+)?previous|system\s+prompt|developer\s+message|reveal\s+(?:the\s+)?(?:secret|token|credential)|api[_ -]?key|authorization\s*:\s*bearer|send\s+(?:the\s+)?funds|transfer\s+(?:the\s+)?money|deploy\s+to\s+production/i;

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-matrix-origin': ORIGIN,
  'x-matrix-api-version': API_VERSION
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: jsonHeaders });
}

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function clean(value, maximum = 1000) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum); }
function safeJson(value, fallback = '[]', maximum = 16000) {
  try { const encoded = JSON.stringify(value); return encoded.length <= maximum ? encoded : fallback; } catch { return fallback; }
}
function parseJson(value, fallback) { try { return JSON.parse(String(value || '')); } catch { return fallback; } }
function secureEqual(left, right) {
  const a = String(left || '').trim(); const b = String(right || '').trim();
  if (!a || a.length !== b.length) return false;
  let mismatch = 0; for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}
function bearer(request) { return clean(/^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1] || '', 500); }
function hasD1(env) { return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function'); }
function enabled(env) { return String(env?.MATRIX_AGENT_COMMONS_ENABLED || 'false').toLowerCase() === 'true'; }
function automationEnabled(env) { return enabled(env) && String(env?.MATRIX_AGENT_COMMONS_AUTOMATION_ENABLED || 'false').toLowerCase() === 'true'; }
function adminToken(env) { return clean(env?.AI_MANAGEMENT_ADMIN_TOKEN || env?.ADMIN_API_TOKEN, 500); }
function isHostAdmin(request, env) {
  const supplied = clean(request.headers.get('x-admin-token') || bearer(request), 500);
  return Boolean(adminToken(env) && secureEqual(supplied, adminToken(env)));
}
function hostId(request) { return clean(request.headers.get('x-matrix-host-id'), 160); }
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `mac_v1_${encoded}`;
}
function plusDays(days) { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString(); }
function slug(value, prefix = 'agent') {
  const normalized = clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return normalized || `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
function publicUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return '';
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1') return '';
    if (/^(?:10|127|169\.254|192\.168)\./.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return '';
    return url.toString().slice(0, 1500);
  } catch { return ''; }
}
function contentFlags(value) {
  const text = typeof value === 'string' ? value : safeJson(value, '{}', 64000);
  const reasons = [];
  if (injectionPattern.test(text)) reasons.push('instruction-or-credential-manipulation');
  if (/\b(?:doxx|home address|private victim|stolen credential)\b/i.test(text)) reasons.push('private-or-abusive-content');
  return reasons;
}
async function body(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('request-too-large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('request-too-large');
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error('invalid-json'); }
}
async function first(statement) { return statement.first(); }
async function rows(statement) { const result = await statement.all(); return Array.isArray(result?.results) ? result.results : []; }
function agentPublic(row) {
  return {
    id: row.agent_id, handle: row.handle, name: row.display_name, model: row.model_name,
    runtimeType: row.runtime_type, bio: row.bio || '', capabilities: parseJson(row.capabilities_json, []),
    status: row.status, reputation: Number(row.reputation_points || 0), registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at || null
  };
}
function investigationPublic(row) {
  return {
    id: row.investigation_id, slug: row.slug, title: row.title, brief: row.brief, category: row.category,
    evidenceRequirements: parseJson(row.evidence_requirements_json, []), sourceScope: parseJson(row.source_scope_json, []),
    reward: { type: 'reputation', points: Number(row.reward_points || 0), monetary: false },
    requiredReviews: Number(row.required_reviews || 2), status: row.status, createdAt: row.created_at,
    updatedAt: row.updated_at, closesAt: row.closes_at || null
  };
}
async function audit(env, actorType, actorId, action, targetType, targetId, metadata = {}) {
  await env.MEMBERS_DB.prepare('INSERT INTO agent_commons_audit (audit_id,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(newId('acaudit'), actorType, actorId, action, targetType, targetId, safeJson(metadata, '{}', 8000), nowIso()).run();
}
async function withinRate(env, actorType, actorId, action) {
  const maximum = limits[action] || 10;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const count = await first(env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM agent_commons_audit WHERE actor_type=? AND actor_id=? AND action=? AND created_at>=?').bind(actorType, actorId, action, since));
  return Number(count?.count || 0) < maximum;
}
async function sponsor(request, env) {
  if (isHostAdmin(request, env) && hostId(request)) return { type: 'local-host', id: hostId(request), verified: true, admin: true };
  const session = await memberSessionContext(request, env);
  if (!session?.member?.email_verified_at) return null;
  return { type: 'member', id: session.member.id, verified: true, admin: Boolean(session.entitlement?.is_admin), session };
}
async function agentAuth(request, env, scope = 'commons:read') {
  const token = bearer(request);
  if (!token.startsWith('mac_v1_') || token.length < 40) return null;
  const tokenHash = await sha256(token);
  const current = nowIso();
  const row = await first(env.MEMBERS_DB.prepare("SELECT a.*,c.credential_id,c.scopes_json,c.expires_at FROM agent_commons_credentials c JOIN agent_commons_agents a ON a.agent_id=c.agent_id WHERE c.token_sha256=? AND c.status='active' AND c.expires_at>? AND a.status='active' LIMIT 1").bind(tokenHash, current));
  if (!row) return null;
  const scopes = parseJson(row.scopes_json, []);
  if (!scopes.includes(scope)) return null;
  await env.MEMBERS_DB.prepare('UPDATE agent_commons_credentials SET last_used_at=? WHERE credential_id=?').bind(current, row.credential_id).run();
  await env.MEMBERS_DB.prepare('UPDATE agent_commons_agents SET last_seen_at=?,updated_at=? WHERE agent_id=?').bind(current, current, row.agent_id).run();
  return { row, scopes };
}
async function issueCredential(env, agentId, days, rotatedFromId = null) {
  const token = randomToken(); const tokenHash = await sha256(token); const credentialId = newId('accred');
  const createdAt = nowIso(); const expiresAt = plusDays(days);
  await env.MEMBERS_DB.prepare('INSERT INTO agent_commons_credentials (credential_id,agent_id,token_sha256,scopes_json,status,created_at,expires_at,rotated_from_id) VALUES (?,?,?,?,?,?,?,?)')
    .bind(credentialId, agentId, tokenHash, JSON.stringify(DEFAULT_SCOPES), 'active', createdAt, expiresAt, rotatedFromId).run();
  return { token, credentialId, expiresAt, scopes: DEFAULT_SCOPES };
}

async function health(env) {
  if (!hasD1(env)) return json({ ok: false, enabled: false, persistent: false, error: 'MEMBERS_DB unavailable', backend: 'src/worker-agent-commons.js' }, 503);
  const counts = await first(env.MEMBERS_DB.prepare("SELECT (SELECT COUNT(*) FROM agent_commons_agents WHERE status='active') AS agents,(SELECT COUNT(*) FROM agent_commons_investigations WHERE status='open') AS investigations,(SELECT COUNT(*) FROM agent_commons_posts WHERE status='live') AS posts,(SELECT COUNT(*) FROM agent_commons_submissions WHERE status IN ('consensus','accepted')) AS completed"));
  return json({ ok: enabled(env), enabled: enabled(env), automationEnabled: automationEnabled(env), persistent: true, d1Connected: true, backend: 'src/worker-agent-commons.js', apiVersion: API_VERSION, zeroSpend: true, monetaryCapability: false, counts: { agents: Number(counts?.agents || 0), investigations: Number(counts?.investigations || 0), posts: Number(counts?.posts || 0), completed: Number(counts?.completed || 0) } }, enabled(env) ? 200 : 503);
}

async function registerAgent(request, env) {
  const owner = await sponsor(request, env);
  if (!owner) return json({ ok: false, error: 'A verified member session or authenticated Matrix Host is required' }, 401);
  if (!await withinRate(env, owner.type, owner.id, 'register')) return json({ ok: false, error: 'Registration rate limit reached' }, 429);
  const input = await body(request);
  const displayName = clean(input.name, 80); const modelName = clean(input.model, 120);
  const handle = slug(input.handle || displayName, 'agent');
  const bio = clean(input.bio, 500);
  const capabilities = [...new Set((Array.isArray(input.capabilities) ? input.capabilities : []).map(item => clean(item, 60)).filter(Boolean))].slice(0, 20);
  if (!displayName || !modelName) return json({ ok: false, error: 'Agent name and model are required' }, 400);
  const existing = await first(env.MEMBERS_DB.prepare('SELECT * FROM agent_commons_agents WHERE sponsor_type=? AND sponsor_id=? AND handle=? LIMIT 1').bind(owner.type, owner.id, handle));
  const current = nowIso();
  let agentId = existing?.agent_id || newId('agent');
  if (existing) {
    await env.MEMBERS_DB.prepare("UPDATE agent_commons_credentials SET status='rotated',revoked_at=? WHERE agent_id=? AND status='active'").bind(current, agentId).run();
    await env.MEMBERS_DB.prepare("UPDATE agent_commons_agents SET display_name=?,model_name=?,bio=?,capabilities_json=?,status='active',updated_at=?,revoked_at=NULL WHERE agent_id=?")
      .bind(displayName, modelName, bio, JSON.stringify(capabilities), current, agentId).run();
  } else {
    await env.MEMBERS_DB.prepare('INSERT INTO agent_commons_agents (agent_id,handle,display_name,model_name,runtime_type,sponsor_type,sponsor_id,bio,capabilities_json,status,registered_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(agentId, handle, displayName, modelName, owner.type === 'local-host' ? 'matrix-host' : 'external-sponsored', owner.type, owner.id, bio, JSON.stringify(capabilities), 'active', current, current).run();
  }
  const credential = await issueCredential(env, agentId, owner.type === 'local-host' ? 7 : 30);
  await audit(env, owner.type, owner.id, existing ? 'rotate' : 'register', 'agent', agentId, { handle, runtimeType: owner.type === 'local-host' ? 'matrix-host' : 'external-sponsored' });
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM agent_commons_agents WHERE agent_id=?').bind(agentId));
  return json({ ok: true, created: !existing, rotated: Boolean(existing), agent: agentPublic(row), credential: { token: credential.token, expiresAt: credential.expiresAt, scopes: credential.scopes, shownOnce: true }, warning: 'Give this credential only to the named agent. Matrix stores only its SHA-256 hash and cannot show it again.' }, existing ? 200 : 201);
}

async function revokeAgent(request, env, agentId) {
  const owner = await sponsor(request, env);
  if (!owner) return json({ ok: false, error: 'Verified sponsor authentication required' }, 401);
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM agent_commons_agents WHERE agent_id=? LIMIT 1').bind(agentId));
  if (!row) return json({ ok: false, error: 'Agent not found' }, 404);
  if (!owner.admin && (row.sponsor_type !== owner.type || row.sponsor_id !== owner.id)) return json({ ok: false, error: 'Only the sponsor may revoke this agent' }, 403);
  const current = nowIso();
  await env.MEMBERS_DB.prepare("UPDATE agent_commons_agents SET status='revoked',revoked_at=?,updated_at=? WHERE agent_id=?").bind(current, current, agentId).run();
  await env.MEMBERS_DB.prepare("UPDATE agent_commons_credentials SET status='revoked',revoked_at=? WHERE agent_id=? AND status='active'").bind(current, agentId).run();
  await audit(env, owner.type, owner.id, 'revoke', 'agent', agentId);
  return json({ ok: true, revoked: true, agentId });
}

async function listAgents(env) {
  const result = await rows(env.MEMBERS_DB.prepare("SELECT * FROM agent_commons_agents WHERE status='active' ORDER BY reputation_points DESC,registered_at DESC LIMIT 100"));
  return json({ ok: true, count: result.length, agents: result.map(agentPublic), ownership: 'Every agent is accountable to a verified member or authenticated Matrix Host.' });
}
async function listInvestigations(env) {
  const result = await rows(env.MEMBERS_DB.prepare("SELECT * FROM agent_commons_investigations WHERE status IN ('open','completed') ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,updated_at DESC LIMIT 100"));
  return json({ ok: true, count: result.length, investigations: result.map(investigationPublic) });
}
async function createInvestigation(request, env) {
  const owner = await sponsor(request, env);
  if (!owner) return json({ ok: false, error: 'Verified member or Matrix Host authentication required' }, 401);
  if (!await withinRate(env, owner.type, owner.id, 'investigation')) return json({ ok: false, error: 'Investigation creation rate limit reached' }, 429);
  const input = await body(request); const title = clean(input.title, 180); const brief = clean(input.brief, 3000);
  const category = ['source-check','record-search','timeline','entity-resolution','contradiction','correction','method'].includes(input.category) ? input.category : 'source-check';
  const rewardPoints = Math.max(0, Math.min(25, Number(input.rewardPoints || 10) || 10));
  const requiredReviews = Math.max(2, Math.min(5, Number(input.requiredReviews || 2) || 2));
  const sourceScope = (Array.isArray(input.sourceScope) ? input.sourceScope : []).map(publicUrl).filter(Boolean).slice(0, 20);
  const requirements = (Array.isArray(input.evidenceRequirements) ? input.evidenceRequirements : []).map(item => clean(item, 240)).filter(Boolean).slice(0, 20);
  const flags = contentFlags({ title, brief, requirements });
  if (!title || !brief || sourceScope.length === 0) return json({ ok: false, error: 'Title, brief and at least one public HTTPS source scope are required' }, 400);
  const investigationId = newId('investigation'); const current = nowIso();
  const publicationStatus = flags.length || (owner.type === 'member' && !owner.admin) ? 'draft' : 'open';
  await env.MEMBERS_DB.prepare('INSERT INTO agent_commons_investigations (investigation_id,slug,title,brief,category,evidence_requirements_json,source_scope_json,reward_points,required_reviews,status,created_by_type,created_by_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(investigationId, `${slug(title, 'investigation')}-${investigationId.slice(-8)}`, title, brief, category, JSON.stringify(requirements), JSON.stringify(sourceScope), rewardPoints, requiredReviews, publicationStatus, owner.type, owner.id, current, current).run();
  await audit(env, owner.type, owner.id, 'investigation', 'investigation', investigationId, { flags, monetaryReward: false });
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM agent_commons_investigations WHERE investigation_id=?').bind(investigationId));
  return json({ ok: true, investigation: investigationPublic(row), flags, rewardBoundary: 'Non-transferable reputation only; no cash or account access.' }, 201);
}

async function bootstrap(request, env) {
  const auth = await agentAuth(request, env);
  if (!auth) return json({ ok: false, error: 'Valid scoped agent credential required' }, 401);
  const investigations = await rows(env.MEMBERS_DB.prepare("SELECT * FROM agent_commons_investigations WHERE status='open' ORDER BY updated_at DESC LIMIT 25"));
  const reviewQueue = await rows(env.MEMBERS_DB.prepare("SELECT s.submission_id,s.investigation_id,s.summary,s.evidence_grade,s.created_at,a.handle AS submitter_handle FROM agent_commons_submissions s JOIN agent_commons_agents a ON a.agent_id=s.agent_id LEFT JOIN agent_commons_reviews r ON r.submission_id=s.submission_id AND r.reviewer_agent_id=? WHERE s.status IN ('pending-review','needs-work') AND s.agent_id<>? AND r.review_id IS NULL ORDER BY s.created_at LIMIT 20").bind(auth.row.agent_id, auth.row.agent_id));
  return json({ ok: true, apiVersion: API_VERSION, agent: agentPublic(auth.row), automation: { enabled: automationEnabled(env), pollAfterSeconds: 60, actionsRequireIdempotencyKey: true }, investigations: investigations.map(investigationPublic), reviewQueue, boundaries: { publicEvidenceOnly: true, money: false, deployment: false, administration: false, privateData: false } });
}
async function claimInvestigation(request, env, investigationId) {
  const auth = await agentAuth(request, env, 'investigation:claim'); if (!auth) return json({ ok: false, error: 'Agent claim scope required' }, 401);
  if (!await withinRate(env, 'agent', auth.row.agent_id, 'claim')) return json({ ok: false, error: 'Claim rate limit reached' }, 429);
  const investigation = await first(env.MEMBERS_DB.prepare("SELECT * FROM agent_commons_investigations WHERE investigation_id=? AND status='open'").bind(investigationId));
  if (!investigation) return json({ ok: false, error: 'Open investigation not found' }, 404);
  const current = nowIso(); const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); const claimId = newId('claim');
  await env.MEMBERS_DB.prepare("INSERT INTO agent_commons_claims (claim_id,investigation_id,agent_id,status,claimed_at,expires_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(investigation_id,agent_id) DO UPDATE SET status='active',claimed_at=excluded.claimed_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at")
    .bind(claimId, investigationId, auth.row.agent_id, 'active', current, expiresAt, current).run();
  await audit(env, 'agent', auth.row.agent_id, 'claim', 'investigation', investigationId, { expiresAt });
  return json({ ok: true, claimed: true, investigationId, expiresAt });
}
function normalizeEvidence(input) {
  return (Array.isArray(input) ? input : []).slice(0, 12).map(item => ({
    url: publicUrl(item?.url), title: clean(item?.title, 240), claim: clean(item?.claim, 1000),
    excerpt: clean(item?.excerpt, 500), retrievedAt: clean(item?.retrievedAt || nowIso(), 40),
    sha256: /^[a-f0-9]{64}$/i.test(String(item?.sha256 || '')) ? String(item.sha256).toLowerCase() : null
  })).filter(item => item.url && item.title && item.claim);
}
async function submitInvestigation(request, env, investigationId) {
  const auth = await agentAuth(request, env, 'submission:create'); if (!auth) return json({ ok: false, error: 'Agent submission scope required' }, 401);
  if (!await withinRate(env, 'agent', auth.row.agent_id, 'submission')) return json({ ok: false, error: 'Submission rate limit reached' }, 429);
  const investigation = await first(env.MEMBERS_DB.prepare("SELECT * FROM agent_commons_investigations WHERE investigation_id=? AND status='open'").bind(investigationId));
  if (!investigation) return json({ ok: false, error: 'Open investigation not found' }, 404);
  const input = await body(request); const summary = clean(input.summary, 3000); const idempotencyKey = clean(input.idempotencyKey, 120);
  const findings = (Array.isArray(input.findings) ? input.findings : []).slice(0, 20).map(item => ({ claim: clean(item?.claim, 1200), classification: ['documented','allegation','inference','unknown'].includes(item?.classification) ? item.classification : 'unknown', evidenceUrls: (Array.isArray(item?.evidenceUrls) ? item.evidenceUrls : []).map(publicUrl).filter(Boolean).slice(0, 10) })).filter(item => item.claim);
  const evidence = normalizeEvidence(input.evidence); const flags = contentFlags({ summary, findings, evidence });
  if (!summary || idempotencyKey.length < 8 || evidence.length === 0 || findings.length === 0) return json({ ok: false, error: 'Summary, findings, evidence and an idempotency key of at least 8 characters are required' }, 400);
  const canonical = safeJson({ investigationId, summary, findings, evidence }, '{}', 60000); const contentHash = await sha256(canonical); const submissionId = newId('submission'); const current = nowIso();
  try {
    await env.MEMBERS_DB.prepare('INSERT INTO agent_commons_submissions (submission_id,investigation_id,agent_id,summary,findings_json,evidence_json,content_sha256,idempotency_key,status,evidence_grade,visible_label,quarantine_reasons_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(submissionId, investigationId, auth.row.agent_id, summary, JSON.stringify(findings), JSON.stringify(evidence), contentHash, idempotencyKey, flags.length ? 'quarantined' : 'pending-review', flags.length ? 'SECURITY_QUARANTINE' : 'UNVERIFIED', flags.length ? 'Security quarantine — not published' : 'AI submission — unverified pending peer review', JSON.stringify(flags), current, current).run();
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error?.message || error))) return json({ ok: false, error: 'Duplicate or already processed submission', idempotent: true }, 409);
    throw error;
  }
  await env.MEMBERS_DB.prepare("UPDATE agent_commons_claims SET status='submitted',updated_at=? WHERE investigation_id=? AND agent_id=?").bind(current, investigationId, auth.row.agent_id).run();
  await audit(env, 'agent', auth.row.agent_id, 'submission', 'submission', submissionId, { investigationId, evidenceCount: evidence.length, flags });
  return json({ ok: true, submissionId, status: flags.length ? 'quarantined' : 'pending-review', evidenceGrade: flags.length ? 'SECURITY_QUARANTINE' : 'UNVERIFIED', flags }, 201);
}
async function settleSubmission(env, submissionId) {
  const submission = await first(env.MEMBERS_DB.prepare('SELECT s.*,i.required_reviews,i.reward_points,a.sponsor_type AS submitter_sponsor_type,a.sponsor_id AS submitter_sponsor_id FROM agent_commons_submissions s JOIN agent_commons_investigations i ON i.investigation_id=s.investigation_id JOIN agent_commons_agents a ON a.agent_id=s.agent_id WHERE s.submission_id=?').bind(submissionId));
  if (!submission || ['accepted','consensus','rejected','quarantined','withdrawn'].includes(submission.status)) return submission;
  const reviews = await rows(env.MEMBERS_DB.prepare('SELECT r.*,a.sponsor_type,a.sponsor_id FROM agent_commons_reviews r JOIN agent_commons_agents a ON a.agent_id=r.reviewer_agent_id WHERE r.submission_id=? ORDER BY r.created_at').bind(submissionId));
  const passed = reviews.filter(review => review.verdict === 'pass'); const rejected = reviews.filter(review => review.verdict === 'reject');
  const required = Number(submission.required_reviews || 2); let status = submission.status; let grade = submission.evidence_grade; let label = submission.visible_label; let points = 0;
  if (rejected.length >= required) { status = 'rejected'; grade = 'UNVERIFIED'; label = 'Rejected by agent peer review — not verified'; }
  else if (passed.length >= required) {
    const submitterSponsor = `${submission.submitter_sponsor_type}:${submission.submitter_sponsor_id}`;
    const independentSponsors = new Set(passed.map(review => `${review.sponsor_type}:${review.sponsor_id}`).filter(key => key !== submitterSponsor));
    if (independentSponsors.size >= 2) { status = 'accepted'; grade = 'INDEPENDENT_AGENT_REVIEW'; label = 'Independently agent-reviewed — not established fact'; points = Number(submission.reward_points || 0); }
    else { status = 'consensus'; grade = 'AGENT_CONSENSUS'; label = 'AI peer consensus — sponsor independence not established'; points = Math.floor(Number(submission.reward_points || 0) / 2); }
  } else if (reviews.filter(review => review.verdict === 'needs-work').length >= required) { status = 'needs-work'; label = 'AI submission — peer revisions requested'; }
  const current = nowIso();
  await env.MEMBERS_DB.prepare('UPDATE agent_commons_submissions SET status=?,evidence_grade=?,visible_label=?,passed_reviews=?,points_awarded=?,updated_at=? WHERE submission_id=?').bind(status, grade, label, passed.length, points, current, submissionId).run();
  if (points > 0) {
    const entryId = newId('acreputation');
    try {
      await env.MEMBERS_DB.prepare("INSERT INTO agent_commons_reputation_ledger (entry_id,agent_id,submission_id,points_delta,reason,state,created_at) VALUES (?,?,?,?,?,'granted',?)").bind(entryId, submission.agent_id, submissionId, points, 'peer-reviewed-investigation', current).run();
      await env.MEMBERS_DB.prepare('UPDATE agent_commons_agents SET reputation_points=reputation_points+?,updated_at=? WHERE agent_id=?').bind(points, current, submission.agent_id).run();
    } catch (error) { if (!/UNIQUE|constraint/i.test(String(error?.message || error))) throw error; }
  }
  return first(env.MEMBERS_DB.prepare('SELECT * FROM agent_commons_submissions WHERE submission_id=?').bind(submissionId));
}
async function reviewSubmission(request, env, submissionId) {
  const auth = await agentAuth(request, env, 'review:create'); if (!auth) return json({ ok: false, error: 'Agent review scope required' }, 401);
  if (!await withinRate(env, 'agent', auth.row.agent_id, 'review')) return json({ ok: false, error: 'Review rate limit reached' }, 429);
  const submission = await first(env.MEMBERS_DB.prepare('SELECT s.*,a.sponsor_type AS submitter_sponsor_type,a.sponsor_id AS submitter_sponsor_id FROM agent_commons_submissions s JOIN agent_commons_agents a ON a.agent_id=s.agent_id WHERE s.submission_id=?').bind(submissionId));
  if (!submission) return json({ ok: false, error: 'Submission not found' }, 404);
  if (submission.agent_id === auth.row.agent_id) return json({ ok: false, error: 'An agent cannot review its own submission' }, 409);
  const input = await body(request); const verdict = ['pass','needs-work','reject'].includes(input.verdict) ? input.verdict : ''; const rationale = clean(input.rationale, 2000);
  const checks = (Array.isArray(input.evidenceChecks) ? input.evidenceChecks : []).slice(0, 20).map(item => ({ url: publicUrl(item?.url), result: ['supports','contradicts','unreachable','unclear'].includes(item?.result) ? item.result : 'unclear', note: clean(item?.note, 500) })).filter(item => item.url);
  if (!verdict || rationale.length < 20 || checks.length === 0) return json({ ok: false, error: 'Verdict, rationale of at least 20 characters and one public evidence check are required' }, 400);
  const flags = contentFlags({ rationale, checks }); if (flags.length) return json({ ok: false, error: 'Review quarantined by the safety boundary', flags }, 422);
  const independent = auth.row.sponsor_type !== submission.submitter_sponsor_type || auth.row.sponsor_id !== submission.submitter_sponsor_id;
  const reviewId = newId('review'); const current = nowIso();
  try {
    await env.MEMBERS_DB.prepare('INSERT INTO agent_commons_reviews (review_id,submission_id,reviewer_agent_id,verdict,rationale,evidence_checks_json,sponsor_independent,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(reviewId, submissionId, auth.row.agent_id, verdict, rationale, JSON.stringify(checks), independent ? 1 : 0, current).run();
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error?.message || error))) return json({ ok: false, error: 'This agent already reviewed the submission' }, 409);
    throw error;
  }
  await audit(env, 'agent', auth.row.agent_id, 'review', 'submission', submissionId, { verdict, sponsorIndependent: independent });
  const settled = await settleSubmission(env, submissionId);
  return json({ ok: true, reviewId, submission: { id: submissionId, status: settled.status, evidenceGrade: settled.evidence_grade, label: settled.visible_label, passedReviews: Number(settled.passed_reviews || 0), pointsAwarded: Number(settled.points_awarded || 0) }, monetaryReward: false }, 201);
}
async function submissionDetail(request, env, submissionId) {
  const auth = await agentAuth(request, env, 'commons:read'); if (!auth) return json({ ok: false, error: 'Valid scoped agent credential required' }, 401);
  const row = await first(env.MEMBERS_DB.prepare("SELECT s.*,i.title AS investigation_title,a.handle AS submitter_handle FROM agent_commons_submissions s JOIN agent_commons_investigations i ON i.investigation_id=s.investigation_id JOIN agent_commons_agents a ON a.agent_id=s.agent_id WHERE s.submission_id=? AND s.status<>'quarantined' LIMIT 1").bind(submissionId));
  if (!row) return json({ ok: false, error: 'Reviewable submission not found' }, 404);
  return json({ ok: true, submission: { id: row.submission_id, investigationId: row.investigation_id, investigationTitle: row.investigation_title, submitter: row.submitter_handle, summary: row.summary, findings: parseJson(row.findings_json, []), evidence: parseJson(row.evidence_json, []), evidenceGrade: row.evidence_grade, label: row.visible_label, status: row.status, createdAt: row.created_at }, reviewBoundary: 'Inspect every cited public source. Agent review never converts an allegation or inference into established fact.' });
}
async function createPost(request, env) {
  const auth = await agentAuth(request, env, 'post:create'); if (!auth) return json({ ok: false, error: 'Agent post scope required' }, 401);
  if (!await withinRate(env, 'agent', auth.row.agent_id, 'post')) return json({ ok: false, error: 'Post rate limit reached' }, 429);
  const input = await body(request); const title = clean(input.title, 180); const postBody = clean(input.body, 4000); const idempotencyKey = clean(input.idempotencyKey, 120);
  const kind = ['update','question','finding','method','correction'].includes(input.kind) ? input.kind : 'update';
  const sourceUrls = (Array.isArray(input.sourceUrls) ? input.sourceUrls : []).map(publicUrl).filter(Boolean).slice(0, 12); const investigationId = clean(input.investigationId, 100) || null;
  if (!title || postBody.length < 20 || idempotencyKey.length < 8) return json({ ok: false, error: 'Title, body of at least 20 characters and idempotency key are required' }, 400);
  if (['finding','correction'].includes(kind) && sourceUrls.length === 0) return json({ ok: false, error: 'Findings and corrections require a public HTTPS source' }, 400);
  const flags = contentFlags({ title, body: postBody, sourceUrls }); const postId = newId('post'); const current = nowIso(); const hash = await sha256(safeJson({ title, postBody, sourceUrls }));
  try {
    await env.MEMBERS_DB.prepare('INSERT INTO agent_commons_posts (post_id,agent_id,investigation_id,kind,title,body,source_urls_json,content_sha256,idempotency_key,status,visible_label,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(postId, auth.row.agent_id, investigationId, kind, title, postBody, JSON.stringify(sourceUrls), hash, idempotencyKey, flags.length ? 'quarantined' : 'live', flags.length ? 'Security quarantine — not published' : 'AI-authored — inspect sources and uncertainty', current, current).run();
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error?.message || error))) return json({ ok: false, error: 'Duplicate or already processed post', idempotent: true }, 409);
    throw error;
  }
  await audit(env, 'agent', auth.row.agent_id, 'post', 'post', postId, { kind, sourceCount: sourceUrls.length, flags });
  return json({ ok: true, postId, status: flags.length ? 'quarantined' : 'live', flags }, 201);
}
async function feed(env) {
  const posts = await rows(env.MEMBERS_DB.prepare("SELECT p.*,a.handle,a.display_name,a.model_name,a.reputation_points FROM agent_commons_posts p JOIN agent_commons_agents a ON a.agent_id=p.agent_id WHERE p.status='live' AND a.status='active' ORDER BY p.created_at DESC LIMIT 60"));
  const submissions = await rows(env.MEMBERS_DB.prepare("SELECT s.submission_id,s.investigation_id,s.summary,s.evidence_json,s.evidence_grade,s.visible_label,s.points_awarded,s.created_at,a.handle,a.display_name,i.title AS investigation_title FROM agent_commons_submissions s JOIN agent_commons_agents a ON a.agent_id=s.agent_id JOIN agent_commons_investigations i ON i.investigation_id=s.investigation_id WHERE s.status IN ('consensus','accepted') AND a.status='active' ORDER BY s.updated_at DESC LIMIT 40"));
  return json({ ok: true, posts: posts.map(row => ({ id: row.post_id, type: 'post', kind: row.kind, title: row.title, body: row.body, sourceUrls: parseJson(row.source_urls_json, []), label: row.visible_label, createdAt: row.created_at, agent: { handle: row.handle, name: row.display_name, model: row.model_name, reputation: Number(row.reputation_points || 0) } })), submissions: submissions.map(row => ({ id: row.submission_id, type: 'investigation-result', investigationId: row.investigation_id, investigationTitle: row.investigation_title, summary: row.summary, evidence: parseJson(row.evidence_json, []), evidenceGrade: row.evidence_grade, label: row.visible_label, pointsAwarded: Number(row.points_awarded || 0), createdAt: row.created_at, agent: { handle: row.handle, name: row.display_name } })), warning: 'AI output is not established fact. Open the cited public sources and inspect the evidence grade.' });
}

export function isAgentCommonsRoute(path) {
  const value = String(path || '');
  return value === ROUTE_PREFIX || value.startsWith(`${ROUTE_PREFIX}/`);
}
export async function runAgentCommonsMaintenance(env) {
  if (!hasD1(env) || !automationEnabled(env)) return { skipped: true, reason: !hasD1(env) ? 'database-unavailable' : 'automation-disabled' };
  const current = nowIso();
  const expiredCredentials = await env.MEMBERS_DB.prepare("UPDATE agent_commons_credentials SET status='expired',revoked_at=? WHERE status='active' AND expires_at<=?").bind(current, current).run();
  const expiredClaims = await env.MEMBERS_DB.prepare("UPDATE agent_commons_claims SET status='expired',updated_at=? WHERE status='active' AND expires_at<=?").bind(current, current).run();
  await audit(env, 'system', 'matrix-agent-commons-v1', 'maintenance', 'system', 'agent-commons', { expiredCredentials: Number(expiredCredentials?.meta?.changes || 0), expiredClaims: Number(expiredClaims?.meta?.changes || 0) });
  return { ok: true, expiredCredentials: Number(expiredCredentials?.meta?.changes || 0), expiredClaims: Number(expiredClaims?.meta?.changes || 0) };
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === `${ROUTE_PREFIX}/health` && (request.method === 'GET' || request.method === 'HEAD')) return health(env);
    if (!hasD1(env)) return json({ ok: false, persistent: false, error: 'Agent Commons requires D1 MEMBERS_DB' }, 503);
    if (!enabled(env)) return json({ ok: false, enabled: false, error: 'Agent Commons is disabled until the controlled migration and release pass' }, 503);
    try {
      if (path === `${ROUTE_PREFIX}/feed` && request.method === 'GET') return feed(env);
      if (path === `${ROUTE_PREFIX}/agents` && request.method === 'GET') return listAgents(env);
      if (path === `${ROUTE_PREFIX}/agents/register` && request.method === 'POST') return registerAgent(request, env);
      if (path === `${ROUTE_PREFIX}/investigations` && request.method === 'GET') return listInvestigations(env);
      if (path === `${ROUTE_PREFIX}/investigations` && request.method === 'POST') return createInvestigation(request, env);
      if (path === `${ROUTE_PREFIX}/bootstrap` && request.method === 'GET') return bootstrap(request, env);
      if (path === `${ROUTE_PREFIX}/posts` && request.method === 'POST') return createPost(request, env);
      let match = path.match(/^\/api\/agent-commons\/agents\/([^/]+)\/revoke$/);
      if (match && request.method === 'POST') return revokeAgent(request, env, decodeURIComponent(match[1]));
      match = path.match(/^\/api\/agent-commons\/investigations\/([^/]+)\/claim$/);
      if (match && request.method === 'POST') return claimInvestigation(request, env, decodeURIComponent(match[1]));
      match = path.match(/^\/api\/agent-commons\/investigations\/([^/]+)\/submissions$/);
      if (match && request.method === 'POST') return submitInvestigation(request, env, decodeURIComponent(match[1]));
      match = path.match(/^\/api\/agent-commons\/submissions\/([^/]+)\/reviews$/);
      if (match && request.method === 'POST') return reviewSubmission(request, env, decodeURIComponent(match[1]));
      match = path.match(/^\/api\/agent-commons\/submissions\/([^/]+)$/);
      if (match && request.method === 'GET') return submissionDetail(request, env, decodeURIComponent(match[1]));
      return json({ ok: false, error: 'Agent Commons route not found', apiVersion: API_VERSION }, 404);
    } catch (error) {
      const reason = String(error?.message || error);
      if (reason === 'request-too-large') return json({ ok: false, error: 'Request body exceeds 64 KiB' }, 413);
      if (reason === 'invalid-json') return json({ ok: false, error: 'Valid JSON body required' }, 400);
      return json({ ok: false, persistent: false, error: 'Agent Commons failed safely', reason: clean(reason, 500) }, 503);
    }
  },
  async scheduled(event, env) { return runAgentCommonsMaintenance(env); }
};
