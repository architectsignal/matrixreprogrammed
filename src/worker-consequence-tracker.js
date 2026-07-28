import { memberSessionContext } from './worker-member-experience.js';

const ORIGIN = 'cloudflare-worker-consequence-tracker';
const DAILY_CRON = '5 6 * * *';
const MAX_MANIFEST_CONTRACTS = 12;
const MAX_DUE_PER_RUN = 4;
const MAX_MEMBER_EVENTS = 50;
const routes = new Set([
  '/api/public/consequence-tracker/health',
  '/api/member/consequence-events',
  '/api/admin/consequence-tracker/run',
  '/api/admin/consequence-tracker/review'
]);

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': ORIGIN
};
const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers });
const clean = (value, max = 1200) => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const hasD1 = env => Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');
const nowIso = () => new Date().toISOString();
const safeId = value => clean(value, 220).replace(/[^A-Za-z0-9._:-]/g, '-').replace(/-+/g, '-');
const first = async statement => { try { return await statement.first(); } catch { return null; } };
const all = async statement => { try { const result = await statement.all(); return Array.isArray(result?.results) ? result.results : []; } catch { return []; } };

export function isConsequenceTrackerRoute(pathname = '') {
  return routes.has(String(pathname || '').replace(/\/+$/, '') || '/');
}

function adminAllowed(request, env) {
  const supplied = request.headers.get('x-admin-token') || '';
  const expected = String(env?.ADMIN_API_TOKEN || '');
  if (!supplied || !expected || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < supplied.length; index += 1) difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function ensureSchema(env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS consequence_contracts (
      contract_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      route TEXT NOT NULL,
      action_date TEXT NOT NULL,
      source_url TEXT NOT NULL,
      evidence_route TEXT NOT NULL,
      accountability_question TEXT NOT NULL,
      evidence_boundary TEXT NOT NULL,
      terms_lock TEXT NOT NULL,
      outcome_verdict TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      current_version INTEGER NOT NULL DEFAULT 1,
      next_checkpoint_days INTEGER,
      next_due_at TEXT,
      review_state TEXT NOT NULL DEFAULT 'scheduled',
      snapshot_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_consequence_contracts_due ON consequence_contracts(active,review_state,next_due_at)`,
    `CREATE TABLE IF NOT EXISTS consequence_contract_versions (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(contract_id,content_hash)
    )`,
    `CREATE TABLE IF NOT EXISTS consequence_review_queue (
      id TEXT PRIMARY KEY,
      checkpoint_key TEXT NOT NULL UNIQUE,
      contract_id TEXT NOT NULL,
      days_after_action INTEGER NOT NULL,
      due_at TEXT NOT NULL,
      review_question TEXT NOT NULL,
      status TEXT NOT NULL,
      review_summary TEXT,
      evidence_route TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS consequence_events (
      id TEXT PRIMARY KEY,
      event_key TEXT NOT NULL UNIQUE,
      contract_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      checkpoint_days INTEGER,
      route TEXT NOT NULL,
      summary TEXT NOT NULL,
      evidence_route TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_consequence_events_contract_created ON consequence_events(contract_id,created_at DESC)`
  ].map(sql => env.MEMBERS_DB.prepare(sql));
  await env.MEMBERS_DB.batch(statements);
}

async function loadManifest(env) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') throw new Error('ASSETS binding unavailable');
  const response = await env.ASSETS.fetch(new Request('https://matrixreprogrammed.com/data/public-consequence-due-index.json', {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
  }));
  if (!response.ok) throw new Error(`Due index returned ${response.status}`);
  const payload = await response.json();
  const contracts = Array.isArray(payload?.contracts) ? payload.contracts.slice(0, MAX_MANIFEST_CONTRACTS) : [];
  if (!contracts.length) throw new Error('Due index is empty');
  return { ...payload, contracts };
}

function syncStatements(env, contracts, stamp) {
  const statements = [];
  for (const contract of contracts) {
    const id = safeId(contract.id);
    const checkpoints = Array.isArray(contract.checkpoints) ? contract.checkpoints : [];
    const firstCheckpoint = checkpoints.find(item => Number(item.daysAfterAction) === 30) || checkpoints[0];
    if (!id || !firstCheckpoint || !Number.isFinite(Date.parse(firstCheckpoint.dueAt))) continue;
    const snapshot = JSON.stringify(contract);
    statements.push(env.MEMBERS_DB.prepare(`
      INSERT INTO consequence_contracts (
        contract_id,title,route,action_date,source_url,evidence_route,accountability_question,evidence_boundary,
        terms_lock,outcome_verdict,content_hash,current_version,next_checkpoint_days,next_due_at,review_state,
        snapshot_json,active,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,'scheduled',?,1,?,?)
      ON CONFLICT(contract_id) DO UPDATE SET
        title=excluded.title,route=excluded.route,action_date=excluded.action_date,source_url=excluded.source_url,
        evidence_route=excluded.evidence_route,accountability_question=excluded.accountability_question,
        evidence_boundary=excluded.evidence_boundary,terms_lock=excluded.terms_lock,outcome_verdict=excluded.outcome_verdict,
        current_version=CASE WHEN consequence_contracts.content_hash<>excluded.content_hash THEN consequence_contracts.current_version+1 ELSE consequence_contracts.current_version END,
        content_hash=excluded.content_hash,snapshot_json=excluded.snapshot_json,active=1,updated_at=excluded.updated_at
    `).bind(
      id, clean(contract.title, 500), clean(contract.route, 700), clean(contract.actionDate, 80),
      clean(contract.sourceUrl, 1200), clean(contract.evidenceRoute, 700), clean(contract.accountabilityQuestion, 900),
      clean(contract.evidenceBoundary, 1200), clean(contract.termsLock, 120), clean(contract.outcomeVerdict, 120),
      clean(contract.contentHash, 80), Number(firstCheckpoint.daysAfterAction), clean(firstCheckpoint.dueAt, 80), snapshot, stamp, stamp
    ));
    statements.push(env.MEMBERS_DB.prepare(`
      INSERT OR IGNORE INTO consequence_contract_versions (id,contract_id,content_hash,snapshot_json,created_at)
      VALUES (?,?,?,?,?)
    `).bind(`${id}:${clean(contract.contentHash, 80)}`, id, clean(contract.contentHash, 80), snapshot, stamp));
  }
  return statements;
}

async function queueDueReviews(env, stamp) {
  const due = await all(env.MEMBERS_DB.prepare(`
    SELECT contract_id,title,route,next_checkpoint_days,next_due_at,snapshot_json
    FROM consequence_contracts
    WHERE active=1 AND review_state='scheduled' AND next_due_at<=?
    ORDER BY next_due_at ASC
    LIMIT ?
  `).bind(stamp, MAX_DUE_PER_RUN));
  if (!due.length) return { due: 0, queued: 0 };
  const statements = [];
  for (const row of due) {
    let snapshot = {};
    try { snapshot = JSON.parse(row.snapshot_json || '{}'); } catch {}
    const checkpoint = (Array.isArray(snapshot.checkpoints) ? snapshot.checkpoints : [])
      .find(item => Number(item.daysAfterAction) === Number(row.next_checkpoint_days));
    const checkpointKey = `${row.contract_id}:${row.next_checkpoint_days}`;
    const question = clean(checkpoint?.reviewQuestion || `Review the ${row.next_checkpoint_days}-day public consequence checkpoint.`, 700);
    statements.push(env.MEMBERS_DB.prepare(`
      INSERT OR IGNORE INTO consequence_review_queue (
        id,checkpoint_key,contract_id,days_after_action,due_at,review_question,status,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,'due',?,?)
    `).bind(`review:${checkpointKey}`, checkpointKey, row.contract_id, Number(row.next_checkpoint_days), row.next_due_at, question, stamp, stamp));
    statements.push(env.MEMBERS_DB.prepare(`
      INSERT OR IGNORE INTO consequence_events (
        id,event_key,contract_id,event_type,checkpoint_days,route,summary,evidence_route,created_at
      ) VALUES (?,?,?,'checkpoint_due',?,?,?,?,?)
    `).bind(`event:due:${checkpointKey}`, `due:${checkpointKey}`, row.contract_id, Number(row.next_checkpoint_days), clean(row.route, 700), question, clean(snapshot.evidenceRoute, 700) || null, stamp));
    statements.push(env.MEMBERS_DB.prepare(`UPDATE consequence_contracts SET review_state='due',updated_at=? WHERE contract_id=? AND review_state='scheduled'`).bind(stamp, row.contract_id));
  }
  await env.MEMBERS_DB.batch(statements);
  return { due: due.length, queued: due.length };
}

export async function runConsequenceTracker(env, options = {}) {
  if (!hasD1(env)) return { ok: false, skipped: true, reason: 'MEMBERS_DB unavailable' };
  const stamp = clean(options.now || nowIso(), 80);
  await ensureSchema(env);
  const manifest = await loadManifest(env);
  const sync = syncStatements(env, manifest.contracts, stamp);
  if (sync.length) await env.MEMBERS_DB.batch(sync);
  const due = await queueDueReviews(env, stamp);
  return {
    ok: true,
    generatedAt: stamp,
    manifestGeneratedAt: manifest.generatedAt || null,
    contractsSynchronized: Math.floor(sync.length / 2),
    dueQueued: due.queued,
    freeTierBudget: {
      manifestMaximum: MAX_MANIFEST_CONTRACTS,
      duePerRunMaximum: MAX_DUE_PER_RUN,
      perFollowerWrites: 0,
      aiInferenceInsideWorker: false
    }
  };
}

async function health(env) {
  await ensureSchema(env);
  const [contracts, due, events, versions] = await env.MEMBERS_DB.batch([
    env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM consequence_contracts WHERE active=1'),
    env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM consequence_review_queue WHERE status='due'"),
    env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM consequence_events'),
    env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM consequence_contract_versions')
  ]);
  const count = result => Number(result?.results?.[0]?.count || 0);
  return json({
    ok: true,
    persistent: true,
    backend: 'Cloudflare D1 bounded consequence tracker',
    activeContracts: count(contracts),
    dueReviews: count(due),
    events: count(events),
    preservedSnapshots: count(versions),
    dailyCron: DAILY_CRON,
    limits: { manifest: MAX_MANIFEST_CONTRACTS, duePerRun: MAX_DUE_PER_RUN, memberEvents: MAX_MEMBER_EVENTS, perFollowerWrites: 0 }
  });
}

async function memberEvents(request, env) {
  const auth = await memberSessionContext(request, env);
  if (!auth) return json({ ok: false, authenticated: false, error: 'Authentication required' }, 401);
  await ensureSchema(env);
  const rows = await all(env.MEMBERS_DB.prepare(`
    SELECT e.id,e.contract_id,e.event_type,e.checkpoint_days,e.route,e.summary,e.evidence_route,e.created_at
    FROM consequence_events e
    JOIN member_entity_follows f ON f.entity_id=e.contract_id
    WHERE f.member_id=? AND f.notifications_enabled=1
    ORDER BY e.created_at DESC
    LIMIT ?
  `).bind(auth.member.id, MAX_MEMBER_EVENTS));
  return json({ ok: true, authenticated: true, count: rows.length, events: rows });
}

async function reviewCheckpoint(request, env) {
  if (!adminAllowed(request, env)) return json({ ok: false, error: 'Administrator authorization required' }, 403);
  const body = await readBody(request);
  const contractId = safeId(body.contractId);
  const checkpointDays = Number(body.checkpointDays || 0);
  const summary = clean(body.summary, 1800);
  const evidenceRoute = clean(body.evidenceRoute, 700);
  const reviewedBy = clean(body.reviewedBy || 'editorial-review', 160);
  const requestedVerdict = clean(body.outcomeVerdict || 'not-scored', 120);
  const termsLock = clean(body.termsLock || '', 120);
  if (!contractId || ![30, 90, 365].includes(checkpointDays) || summary.length < 20 || !evidenceRoute) {
    return json({ ok: false, error: 'contractId, a 30/90/365 checkpoint, evidenceRoute and substantive summary are required' }, 400);
  }
  await ensureSchema(env);
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM consequence_contracts WHERE contract_id=? LIMIT 1').bind(contractId));
  if (!row) return json({ ok: false, error: 'Consequence contract not found' }, 404);
  if (requestedVerdict !== 'not-scored' && termsLock !== 'locked-primary-decision-record') {
    return json({ ok: false, error: 'A scored outcome requires locked-primary-decision-record terms' }, 409);
  }
  let snapshot = {};
  try { snapshot = JSON.parse(row.snapshot_json || '{}'); } catch {}
  const checkpoints = Array.isArray(snapshot.checkpoints) ? snapshot.checkpoints : [];
  const next = checkpoints.find(item => Number(item.daysAfterAction) > checkpointDays);
  const stamp = nowIso();
  const nextState = next ? 'scheduled' : 'complete';
  const eventKey = `reviewed:${contractId}:${checkpointDays}`;
  await env.MEMBERS_DB.batch([
    env.MEMBERS_DB.prepare(`
      UPDATE consequence_review_queue SET status='reviewed',review_summary=?,evidence_route=?,reviewed_by=?,reviewed_at=?,updated_at=?
      WHERE checkpoint_key=?
    `).bind(summary, evidenceRoute, reviewedBy, stamp, stamp, `${contractId}:${checkpointDays}`),
    env.MEMBERS_DB.prepare(`
      UPDATE consequence_contracts SET terms_lock=?,outcome_verdict=?,next_checkpoint_days=?,next_due_at=?,review_state=?,updated_at=?
      WHERE contract_id=?
    `).bind(termsLock || row.terms_lock, requestedVerdict, next ? Number(next.daysAfterAction) : null, next ? clean(next.dueAt, 80) : null, nextState, stamp, contractId),
    env.MEMBERS_DB.prepare(`
      INSERT OR IGNORE INTO consequence_events (id,event_key,contract_id,event_type,checkpoint_days,route,summary,evidence_route,created_at)
      VALUES (?,?,?,'checkpoint_reviewed',?,?,?,?,?)
    `).bind(`event:${eventKey}`, eventKey, contractId, checkpointDays, row.route, summary, evidenceRoute, stamp)
  ]);
  return json({ ok: true, reviewed: true, contractId, checkpointDays, nextCheckpoint: next ? Number(next.daysAfterAction) : null, reviewState: nextState, outcomeVerdict: requestedVerdict });
}

export default {
  async fetch(request, env) {
    if (!hasD1(env)) return json({ ok: false, persistent: false, error: 'MEMBERS_DB unavailable' }, 503);
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/api/public/consequence-tracker/health' && request.method === 'GET') return health(env);
    if (path === '/api/member/consequence-events' && request.method === 'GET') return memberEvents(request, env);
    if (path === '/api/admin/consequence-tracker/run' && request.method === 'POST') {
      if (!adminAllowed(request, env)) return json({ ok: false, error: 'Administrator authorization required' }, 403);
      try { return json(await runConsequenceTracker(env)); }
      catch (error) { return json({ ok: false, error: clean(error?.message || error, 500) }, 500); }
    }
    if (path === '/api/admin/consequence-tracker/review' && request.method === 'POST') return reviewCheckpoint(request, env);
    return json({ ok: false, error: 'Not found' }, 404);
  },

  async scheduled(event, env) {
    if (event?.cron && event.cron !== DAILY_CRON) return { ok: true, skipped: true, reason: 'not-daily-consequence-cron' };
    try { return await runConsequenceTracker(env); }
    catch (error) { return { ok: false, error: clean(error?.message || error, 500) }; }
  }
};
