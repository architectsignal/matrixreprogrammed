const ORIGIN = 'cloudflare-worker-bespoke-investigations';

const SERVICES = Object.freeze({
  signal_trace: Object.freeze({
    key: 'signal_trace',
    name: 'Signal Trace',
    strapline: 'A focused answer to one tightly framed public-record question.',
    startingAmountMinor: 19500,
    currency: 'EUR',
    turnaround: 'Usually 3–5 working days after scope approval',
    sourceDepth: 'Up to 8 priority public sources',
    deliverables: [
      'Focused evidence brief',
      'Source list with retrieval dates',
      'Fact, allegation, inference and unknown labels',
      'Unresolved-question note'
    ]
  }),
  evidence_brief: Object.freeze({
    key: 'evidence_brief',
    name: 'Evidence Brief',
    strapline: 'A structured investigation of a defined person, organisation, event or claim.',
    startingAmountMinor: 49500,
    currency: 'EUR',
    turnaround: 'Usually 7–10 working days after scope approval',
    sourceDepth: 'Up to 25 priority public sources',
    deliverables: [
      'Executive briefing',
      'Evidence table and source grading',
      'Chronology of material events',
      'Contradictions and evidence gaps',
      'Correction and right-of-reply route'
    ]
  }),
  deep_dossier: Object.freeze({
    key: 'deep_dossier',
    name: 'Deep Dossier',
    strapline: 'A multi-layer public-record dossier with relationships, chronology and contradiction analysis.',
    startingAmountMinor: 125000,
    currency: 'EUR',
    turnaround: 'Usually 15–25 working days after scope approval',
    sourceDepth: 'Up to 60 priority public sources',
    deliverables: [
      'Long-form evidence-led dossier',
      'Entity and relationship map',
      'Detailed timeline',
      'Claim-to-source matrix',
      'Alternative explanations and confidence assessment',
      'Downloadable research bundle'
    ]
  }),
  command_investigation: Object.freeze({
    key: 'command_investigation',
    name: 'Command Investigation',
    strapline: 'A custom, multi-entity investigation with staged delivery and optional continuing monitoring.',
    startingAmountMinor: 300000,
    currency: 'EUR',
    turnaround: 'Custom schedule agreed after screening',
    sourceDepth: 'Custom source and jurisdiction plan',
    deliverables: [
      'Written investigation plan and milestones',
      'Multi-entity evidence graph',
      'Staged briefings and final dossier',
      'Source-change and contradiction monitoring option',
      'Private case workspace and audit trail'
    ]
  })
});

const EXACT_ROUTES = new Set([
  '/api/bespoke/config',
  '/api/bespoke/intake',
  '/api/bespoke/cases',
  '/api/bespoke/admin/cases'
]);
const DYNAMIC_ROUTES = [
  /^\/api\/bespoke\/case\/[^/]+$/,
  /^\/api\/bespoke\/case\/[^/]+\/order$/,
  /^\/api\/bespoke\/case\/[^/]+\/capture$/,
  /^\/api\/bespoke\/admin\/case\/[^/]+\/decision$/,
  /^\/api\/bespoke\/admin\/case\/[^/]+\/status$/
];

export const bespokeInvestigationRoutes = EXACT_ROUTES;
export function isBespokeInvestigationRoute(pathname = '') {
  return EXACT_ROUTES.has(pathname) || DYNAMIC_ROUTES.some(pattern => pattern.test(pathname));
}

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': ORIGIN
};

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: { ...HEADERS, ...extra } });
}
function clean(value, maximum = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}
function safeId(value, maximum = 180) {
  return clean(value, maximum).replace(/[^A-Za-z0-9._:-]/g, '-').replace(/-+/g, '-');
}
function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function hasD1(env) { return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function'); }
function bool(value) { return value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true'; }
function safeJson(value, maximum = 12000) {
  try {
    const text = JSON.stringify(value && typeof value === 'object' ? value : {});
    return text.length <= maximum ? text : '{}';
  } catch { return '{}'; }
}
async function first(statement) { try { return await statement.first(); } catch { return null; } }
async function all(statement) { try { const result = await statement.all(); return Array.isArray(result?.results) ? result.results : []; } catch { return []; } }
async function readBody(request, maximumBytes = 96 * 1024) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new Error('Request body is too large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error('Request body is too large');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error('A valid JSON request body is required'); }
}
function cookieValue(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function credential(value) {
  let text = String(value ?? '').trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) text = text.slice(1, -1).trim();
  return text;
}
function paypalEnvironment(env) { return String(env?.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox'; }
function paypalApiBase(env) { return paypalEnvironment(env) === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }
function amountMinor(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 5000 || parsed > 10000000) return null;
  return parsed;
}
function amountText(minor) { return (Number(minor || 0) / 100).toFixed(2); }
function publicService(service) {
  return {
    key: service.key,
    name: service.name,
    strapline: service.strapline,
    startingAmount: amountText(service.startingAmountMinor),
    currency: service.currency,
    turnaround: service.turnaround,
    sourceDepth: service.sourceDepth,
    deliverables: [...service.deliverables]
  };
}

async function tableExists(env, name) {
  if (!hasD1(env)) return false;
  const row = await first(env.MEMBERS_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name));
  return row?.name === name;
}
async function schemaReady(env) {
  const required = ['bespoke_investigation_cases', 'bespoke_investigation_status_history', 'bespoke_investigation_payments'];
  const checks = await Promise.all(required.map(name => tableExists(env, name)));
  return checks.every(Boolean);
}

async function authContext(request, env) {
  if (!hasD1(env)) return null;
  const rawToken = cookieValue(request, 'matrix_session_v2') || cookieValue(request, 'matrix_session');
  if (!rawToken) return null;
  const sessionHash = await sha256(rawToken);
  const session = await first(env.MEMBERS_DB.prepare('SELECT id,member_id,expires_at,revoked_at FROM member_sessions WHERE session_hash=? LIMIT 1').bind(sessionHash));
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;
  const member = await first(env.MEMBERS_DB.prepare("SELECT id,email,display_name,role,status,email_verified_at FROM members WHERE id=? AND status='active' LIMIT 1").bind(session.member_id));
  if (!member || !member.email_verified_at) return null;
  return { session, member, isAdmin: member.role === 'admin' };
}
function denied(auth, message = 'Authentication required', status = 401) {
  return json({ ok: false, authenticated: Boolean(auth), error: message, loginUrl: '/member-login.html?return=%2Fbespoke-investigations.html' }, status);
}
async function requireAuth(request, env) {
  const auth = await authContext(request, env);
  return auth ? { auth } : { response: denied(null) };
}
async function requireAdmin(request, env) {
  const required = await requireAuth(request, env);
  if (required.response) return required;
  return required.auth.isAdmin ? required : { response: denied(required.auth, 'Administrator access required', 403) };
}

async function audit(env, actorId, action, targetType, targetId, metadata = {}) {
  if (!hasD1(env) || !await tableExists(env, 'audit_log')) return;
  await env.MEMBERS_DB.prepare('INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(newId('audit'), actorId || null, action, targetType || null, targetId || null, safeJson(metadata, 10000), nowIso()).run().catch(() => null);
}
async function statusHistory(env, caseId, fromStatus, toStatus, actorId, note = '', metadata = {}) {
  await env.MEMBERS_DB.prepare('INSERT INTO bespoke_investigation_status_history (id,case_id,from_status,to_status,actor_id,note,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(newId('case-status'), caseId, fromStatus || null, toStatus, actorId || null, clean(note, 1000) || null, safeJson(metadata, 8000), nowIso()).run();
}

function paymentState(env) {
  const environment = paypalEnvironment(env);
  const configured = Boolean(credential(env?.PAYPAL_CLIENT_ID) && credential(env?.PAYPAL_CLIENT_SECRET));
  const environmentEnabled = environment === 'live' ? bool(env?.PAYPAL_PRODUCTION_ENABLED) : bool(env?.PAYPAL_SANDBOX_ENABLED);
  const liveConfirmed = environment !== 'live' || String(env?.PAYPAL_LIVE_ACTIVATION_CONFIRMATION || '') === 'MATRIX_PAYPAL_LIVE_CONFIRMED';
  const bespokeConfirmed = String(env?.PAYPAL_BESPOKE_ACTIVATION_CONFIRMATION || '') === 'MATRIX_BESPOKE_PAYMENTS_CONFIRMED';
  const bespokeEnabled = bool(env?.PAYPAL_BESPOKE_ENABLED);
  return {
    environment,
    configured,
    environmentEnabled,
    liveConfirmed,
    bespokeConfirmed,
    bespokeEnabled,
    paymentEnabled: configured && environmentEnabled && liveConfirmed && bespokeConfirmed && bespokeEnabled,
    liveChargingEnabled: environment === 'live' && configured && environmentEnabled && liveConfirmed && bespokeConfirmed && bespokeEnabled
  };
}
async function paypalAccessToken(env) {
  const clientId = credential(env?.PAYPAL_CLIENT_ID);
  const clientSecret = credential(env?.PAYPAL_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error('PayPal credentials are not configured');
  const response = await fetch(`${paypalApiBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials'
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text || '{}'); } catch {}
  if (!response.ok || !payload.access_token) throw new Error(clean(payload.error_description || payload.message || text || 'PayPal OAuth failed', 700));
  return payload.access_token;
}
async function paypal(env, pathname, options = {}) {
  const token = await paypalAccessToken(env);
  const response = await fetch(`${paypalApiBase(env)}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'PayPal-Request-Id': options.requestId || newId('bespoke-paypal'),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = {};
  if (text) { try { payload = JSON.parse(text); } catch { payload = { raw: text }; } }
  if (!response.ok) {
    const details = Array.isArray(payload.details) ? payload.details.map(item => clean(`${item.issue || ''}${item.description ? `: ${item.description}` : ''}`, 500)).filter(Boolean).join('; ') : '';
    throw new Error(clean(details || payload.message || payload.error_description || payload.name || text || `PayPal HTTP ${response.status}`, 900));
  }
  return payload;
}

const PROHIBITED_PATTERNS = [
  ['unauthorised_access', /\b(?:hack|hacking|password|credential|phish|malware|spyware|keylog|break\s+into|bypass\s+(?:a\s+)?login|unauthori[sz]ed\s+access)\b/i],
  ['stalking_or_doxxing', /\b(?:stalk|doxx?|home\s+address|where\s+(?:he|she|they)\s+lives?|live\s+location|track\s+(?:his|her|their)\s+phone)\b/i],
  ['coercion_or_blackmail', /\b(?:blackmail|extort|coerce|threaten\s+them|leverage\s+against)\b/i],
  ['intimate_or_private_material', /\b(?:intimate\s+(?:image|photo|video)|revenge\s+porn|private\s+messages?|medical\s+records?|bank\s+login)\b/i],
  ['impersonation_or_pretexting', /\b(?:impersonat|pretend\s+to\s+be|social\s+engineer(?:ing)?\s+(?:them|him|her))\b/i]
];
const REVIEW_PATTERNS = [
  ['employment_or_tenant_decision', /\b(?:employment|employee|candidate|tenant|landlord|hire|fire)\b/i],
  ['family_or_domestic_dispute', /\b(?:custody|divorce|ex-partner|ex\s+partner|domestic\s+dispute)\b/i],
  ['minor_or_vulnerable_person', /\b(?:minor|child|underage|vulnerable\s+adult)\b/i],
  ['active_litigation', /\b(?:lawsuit|litigation|court\s+case|criminal\s+case|prosecution)\b/i]
];
function riskAssessment(input) {
  const combined = [input.subjectLabel, input.objective, input.lawfulPurpose, input.jurisdiction].map(value => clean(value, 5000)).join(' ');
  const prohibited = PROHIBITED_PATTERNS.filter(([, pattern]) => pattern.test(combined)).map(([flag]) => flag);
  const review = REVIEW_PATTERNS.filter(([, pattern]) => pattern.test(combined)).map(([flag]) => flag);
  return { prohibited, review, requiresManualReview: review.length > 0 };
}
function declarationAccepted(body, key) { return body?.declarations?.[key] === true; }
function validateDeclarations(body) {
  const required = ['lawfulPurpose', 'publicRecordsOnly', 'noHarassment', 'noUnlawfulAccess', 'noGuaranteedConclusion', 'accurateInformation', 'termsAccepted'];
  return required.filter(key => !declarationAccepted(body, key));
}
function caseFromRow(row, includeSensitive = false) {
  const output = {
    id: row.id,
    serviceKey: row.service_key,
    serviceName: SERVICES[row.service_key]?.name || row.service_key,
    subjectType: row.subject_type,
    subjectLabel: row.subject_label,
    jurisdiction: row.jurisdiction || '',
    deadlineAt: row.deadline_at || null,
    screeningStatus: row.screening_status,
    status: row.status,
    scopeSummary: row.scope_summary || '',
    quotedAmount: row.quoted_amount_minor == null ? null : amountText(row.quoted_amount_minor),
    currency: row.currency || 'EUR',
    approvedAt: row.approved_at || null,
    paymentDueAt: row.payment_due_at || null,
    paidAt: row.paid_at || null,
    deliveryDueAt: row.delivery_due_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (includeSensitive) {
    output.objective = row.objective;
    output.lawfulPurpose = row.lawful_purpose;
    try { output.riskFlags = JSON.parse(row.risk_flags_json || '{}'); } catch { output.riskFlags = {}; }
    try { output.deliverables = JSON.parse(row.deliverables_json || '[]'); } catch { output.deliverables = []; }
  }
  return output;
}

async function config(env) {
  const payments = paymentState(env);
  return json({
    ok: true,
    services: Object.values(SERVICES).map(publicService),
    process: ['Submit a lawful scope request', 'Conflict and risk screening', 'Written scope and fixed quote', 'Verified PayPal payment', 'Evidence-led investigation', 'Audited delivery and correction route'],
    boundaries: {
      publicRecordsOnly: true,
      paymentBeforeScreening: false,
      guaranteedConclusion: false,
      prohibited: ['harassment', 'stalking', 'doxxing', 'unlawful access', 'credential theft', 'impersonation', 'blackmail', 'private-data acquisition'],
      evidenceClasses: ['fact', 'allegation', 'inference', 'speculation', 'unresolved']
    },
    payments: {
      environment: payments.environment,
      paymentEnabled: payments.paymentEnabled,
      liveChargingEnabled: payments.liveChargingEnabled,
      screeningRequiredBeforePayment: true
    },
    schemaReady: await schemaReady(env)
  });
}

async function createIntake(request, env) {
  const required = await requireAuth(request, env);
  if (required.response) return required.response;
  if (!await schemaReady(env)) return json({ ok: false, error: 'Bespoke investigation storage migration is not applied' }, 503);
  const body = await readBody(request);
  const serviceKey = clean(body.serviceKey, 80);
  const service = SERVICES[serviceKey];
  if (!service) return json({ ok: false, error: 'Choose a valid investigation level' }, 400);
  const missingDeclarations = validateDeclarations(body);
  if (missingDeclarations.length) return json({ ok: false, error: 'All legal and evidence declarations must be accepted', missingDeclarations }, 400);
  const subjectType = clean(body.subjectType, 80);
  const subjectLabel = clean(body.subjectLabel, 240);
  const objective = clean(body.objective, 5000);
  const lawfulPurpose = clean(body.lawfulPurpose, 2000);
  const jurisdiction = clean(body.jurisdiction, 240);
  const deadlineAt = clean(body.deadlineAt, 40) || null;
  if (!subjectType || !subjectLabel || objective.length < 40 || lawfulPurpose.length < 20) {
    return json({ ok: false, error: 'Subject, objective and lawful purpose require enough detail for screening' }, 400);
  }
  const risk = riskAssessment({ subjectLabel, objective, lawfulPurpose, jurisdiction });
  if (risk.prohibited.length) {
    await audit(env, required.auth.member.id, 'bespoke.intake.rejected', 'bespoke_case', null, { serviceKey, prohibitedFlags: risk.prohibited });
    return json({
      ok: false,
      accepted: false,
      error: 'This request falls outside the lawful public-record investigation service boundary and cannot proceed.',
      prohibitedFlags: risk.prohibited,
      paymentCreated: false
    }, 422);
  }
  const id = newId('case');
  const current = nowIso();
  const riskFlags = { review: risk.review, prohibited: [], requiresManualReview: risk.requiresManualReview };
  await env.MEMBERS_DB.prepare(`INSERT INTO bespoke_investigation_cases(
    id,member_id,service_key,subject_type,subject_label,objective,jurisdiction,deadline_at,lawful_purpose,screening_status,status,risk_flags_json,
    scope_summary,deliverables_json,quoted_amount_minor,currency,approved_by,approved_at,payment_due_at,paid_at,delivery_due_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,'pending','screening_pending',?,'','[]',NULL,'EUR',NULL,NULL,NULL,NULL,NULL,?,?)`)
    .bind(id, required.auth.member.id, serviceKey, subjectType, subjectLabel, objective, jurisdiction || null, deadlineAt, lawfulPurpose, safeJson(riskFlags), current, current).run();
  await statusHistory(env, id, null, 'screening_pending', required.auth.member.id, 'Client submitted scope request', { serviceKey, reviewFlags: risk.review });
  await audit(env, required.auth.member.id, 'bespoke.intake.created', 'bespoke_case', id, { serviceKey, subjectType, reviewFlags: risk.review });
  return json({
    ok: true,
    accepted: true,
    caseId: id,
    status: 'screening_pending',
    requiresManualReview: true,
    paymentCreated: false,
    message: 'Your request is recorded for conflict, safety and scope screening. No payment can be created until the scope is approved.'
  }, 201);
}

async function listCases(request, env) {
  const required = await requireAuth(request, env);
  if (required.response) return required.response;
  if (!await schemaReady(env)) return json({ ok: false, error: 'Bespoke investigation storage migration is not applied' }, 503);
  const rows = await all(env.MEMBERS_DB.prepare('SELECT * FROM bespoke_investigation_cases WHERE member_id=? ORDER BY created_at DESC LIMIT 100').bind(required.auth.member.id));
  return json({ ok: true, cases: rows.map(row => caseFromRow(row, false)) });
}
async function readCase(request, env, caseId) {
  const required = await requireAuth(request, env);
  if (required.response) return required.response;
  if (!await schemaReady(env)) return json({ ok: false, error: 'Bespoke investigation storage migration is not applied' }, 503);
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM bespoke_investigation_cases WHERE id=? LIMIT 1').bind(caseId));
  if (!row || (row.member_id !== required.auth.member.id && !required.auth.isAdmin)) return json({ ok: false, error: 'Case not found' }, 404);
  const history = await all(env.MEMBERS_DB.prepare('SELECT from_status,to_status,note,created_at FROM bespoke_investigation_status_history WHERE case_id=? ORDER BY created_at ASC LIMIT 250').bind(caseId));
  const payments = await all(env.MEMBERS_DB.prepare('SELECT provider_order_id,provider_capture_id,status,amount_minor,currency,created_at,captured_at FROM bespoke_investigation_payments WHERE case_id=? ORDER BY created_at DESC LIMIT 20').bind(caseId));
  return json({ ok: true, case: caseFromRow(row, true), history, payments: payments.map(payment => ({ ...payment, amount: amountText(payment.amount_minor) })) });
}

async function listAdminCases(request, env) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  if (!await schemaReady(env)) return json({ ok: false, error: 'Bespoke investigation storage migration is not applied' }, 503);
  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 80);
  const rows = status
    ? await all(env.MEMBERS_DB.prepare('SELECT c.*,m.email,m.display_name FROM bespoke_investigation_cases c JOIN members m ON m.id=c.member_id WHERE c.status=? ORDER BY c.created_at ASC LIMIT 250').bind(status))
    : await all(env.MEMBERS_DB.prepare('SELECT c.*,m.email,m.display_name FROM bespoke_investigation_cases c JOIN members m ON m.id=c.member_id ORDER BY c.created_at DESC LIMIT 250'));
  return json({ ok: true, cases: rows.map(row => ({ ...caseFromRow(row, true), member: { email: row.email, displayName: row.display_name || '' } })) });
}

async function decideCase(request, env, caseId) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  if (!await schemaReady(env)) return json({ ok: false, error: 'Bespoke investigation storage migration is not applied' }, 503);
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM bespoke_investigation_cases WHERE id=? LIMIT 1').bind(caseId));
  if (!row) return json({ ok: false, error: 'Case not found' }, 404);
  const body = await readBody(request);
  const decision = clean(body.decision, 40);
  if (!['approve', 'needs_information', 'decline'].includes(decision)) return json({ ok: false, error: 'Decision must be approve, needs_information or decline' }, 400);
  const current = nowIso();
  let nextStatus = row.status;
  if (decision === 'approve') {
    const quote = amountMinor(body.quotedAmountMinor);
    const scopeSummary = clean(body.scopeSummary, 4000);
    const deliveryDueAt = clean(body.deliveryDueAt, 40) || null;
    const paymentDueAt = clean(body.paymentDueAt, 40) || null;
    const deliverables = Array.isArray(body.deliverables) ? body.deliverables.map(item => clean(item, 500)).filter(Boolean).slice(0, 30) : SERVICES[row.service_key]?.deliverables || [];
    if (!quote || scopeSummary.length < 40 || !deliverables.length) return json({ ok: false, error: 'Approval requires a fixed quote, clear scope and deliverables' }, 400);
    nextStatus = 'approved_for_payment';
    await env.MEMBERS_DB.prepare(`UPDATE bespoke_investigation_cases SET screening_status='approved',status=?,scope_summary=?,deliverables_json=?,quoted_amount_minor=?,currency='EUR',approved_by=?,approved_at=?,payment_due_at=?,delivery_due_at=?,updated_at=? WHERE id=?`)
      .bind(nextStatus, scopeSummary, safeJson(deliverables), quote, required.auth.member.id, current, paymentDueAt, deliveryDueAt, current, caseId).run();
  } else if (decision === 'needs_information') {
    nextStatus = 'needs_information';
    await env.MEMBERS_DB.prepare("UPDATE bespoke_investigation_cases SET screening_status='needs_information',status=?,updated_at=? WHERE id=?").bind(nextStatus, current, caseId).run();
  } else {
    nextStatus = 'declined';
    await env.MEMBERS_DB.prepare("UPDATE bespoke_investigation_cases SET screening_status='declined',status=?,quoted_amount_minor=NULL,approved_by=?,approved_at=?,updated_at=? WHERE id=?").bind(nextStatus, required.auth.member.id, current, current, caseId).run();
  }
  const note = clean(body.note, 1000);
  await statusHistory(env, caseId, row.status, nextStatus, required.auth.member.id, note, { decision });
  await audit(env, required.auth.member.id, `bespoke.case.${decision}`, 'bespoke_case', caseId, { fromStatus: row.status, toStatus: nextStatus });
  return json({ ok: true, caseId, status: nextStatus });
}

async function updateCaseStatus(request, env, caseId) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  if (!await schemaReady(env)) return json({ ok: false, error: 'Bespoke investigation storage migration is not applied' }, 503);
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM bespoke_investigation_cases WHERE id=? LIMIT 1').bind(caseId));
  if (!row) return json({ ok: false, error: 'Case not found' }, 404);
  const body = await readBody(request);
  const nextStatus = clean(body.status, 60);
  const allowed = new Set(['in_progress', 'awaiting_client', 'quality_review', 'delivered', 'closed', 'cancelled', 'refunded']);
  if (!allowed.has(nextStatus)) return json({ ok: false, error: 'Unsupported case status' }, 400);
  if (['in_progress', 'quality_review', 'delivered', 'closed'].includes(nextStatus) && !row.paid_at) return json({ ok: false, error: 'A case cannot enter delivery workflow before verified payment' }, 409);
  const current = nowIso();
  await env.MEMBERS_DB.prepare('UPDATE bespoke_investigation_cases SET status=?,updated_at=? WHERE id=?').bind(nextStatus, current, caseId).run();
  await statusHistory(env, caseId, row.status, nextStatus, required.auth.member.id, clean(body.note, 1000), { publicMessage: clean(body.publicMessage, 1000) });
  await audit(env, required.auth.member.id, 'bespoke.case.status_changed', 'bespoke_case', caseId, { fromStatus: row.status, toStatus: nextStatus });
  return json({ ok: true, caseId, status: nextStatus });
}

async function createOrder(request, env, caseId) {
  const required = await requireAuth(request, env);
  if (required.response) return required.response;
  if (!await schemaReady(env)) return json({ ok: false, error: 'Bespoke investigation storage migration is not applied' }, 503);
  const payments = paymentState(env);
  if (!payments.paymentEnabled) return json({ ok: false, error: 'Bespoke PayPal checkout is disabled until the deliberate activation gates pass', payments }, 503);
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM bespoke_investigation_cases WHERE id=? AND member_id=? LIMIT 1').bind(caseId, required.auth.member.id));
  if (!row) return json({ ok: false, error: 'Case not found' }, 404);
  if (!['approved_for_payment', 'payment_pending'].includes(row.status) || !row.quoted_amount_minor) return json({ ok: false, error: 'This case is not approved for payment' }, 409);
  const completed = await first(env.MEMBERS_DB.prepare("SELECT provider_order_id FROM bespoke_investigation_payments WHERE case_id=? AND status='COMPLETED' LIMIT 1").bind(caseId));
  if (completed) return json({ ok: false, error: 'This case is already paid', orderId: completed.provider_order_id }, 409);
  const origin = new URL(request.url).origin;
  const value = amountText(row.quoted_amount_minor);
  const order = await paypal(env, '/v2/checkout/orders', {
    method: 'POST',
    requestId: `matrix-bespoke-order-${caseId}`,
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: caseId,
        custom_id: `${required.auth.member.id}:${caseId}`.slice(0, 127),
        description: `Matrix Reprogrammed ${SERVICES[row.service_key]?.name || 'Bespoke Investigation'}`.slice(0, 127),
        amount: { currency_code: 'EUR', value }
      }],
      application_context: {
        brand_name: 'Matrix Reprogrammed',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: `${origin}/bespoke-investigations.html?payment=approved&case=${encodeURIComponent(caseId)}`,
        cancel_url: `${origin}/bespoke-investigations.html?payment=cancelled&case=${encodeURIComponent(caseId)}`
      }
    })
  });
  const approveUrl = (order.links || []).find(link => link.rel === 'approve')?.href || '';
  if (!order.id || !approveUrl) throw new Error('PayPal did not return an approval link');
  const current = nowIso();
  await env.MEMBERS_DB.prepare(`INSERT INTO bespoke_investigation_payments(id,case_id,member_id,provider,provider_order_id,provider_capture_id,status,amount_minor,currency,environment,raw_json,created_at,updated_at,captured_at)
    VALUES(?,?,?,'paypal',?,NULL,'CREATED',?,'EUR',?,?,?, ?,NULL)
    ON CONFLICT(provider_order_id) DO UPDATE SET status='CREATED',raw_json=excluded.raw_json,updated_at=excluded.updated_at`)
    .bind(newId('bespoke-payment'), caseId, required.auth.member.id, order.id, row.quoted_amount_minor, payments.environment, safeJson(order, 30000), current, current).run();
  if (row.status !== 'payment_pending') {
    await env.MEMBERS_DB.prepare("UPDATE bespoke_investigation_cases SET status='payment_pending',updated_at=? WHERE id=?").bind(current, caseId).run();
    await statusHistory(env, caseId, row.status, 'payment_pending', required.auth.member.id, 'PayPal approval order created', { orderId: order.id });
  }
  await audit(env, required.auth.member.id, 'bespoke.payment.order_created', 'bespoke_case', caseId, { orderId: order.id, amountMinor: row.quoted_amount_minor, environment: payments.environment });
  return json({ ok: true, caseId, orderId: order.id, approveUrl, amount: value, currency: 'EUR', environment: payments.environment, liveChargingEnabled: payments.liveChargingEnabled });
}

async function captureOrder(request, env, caseId) {
  const required = await requireAuth(request, env);
  if (required.response) return required.response;
  if (!await schemaReady(env)) return json({ ok: false, error: 'Bespoke investigation storage migration is not applied' }, 503);
  const payments = paymentState(env);
  if (!payments.paymentEnabled) return json({ ok: false, error: 'Bespoke PayPal checkout is disabled until the deliberate activation gates pass' }, 503);
  const body = await readBody(request);
  const orderId = clean(body.orderId, 160);
  if (!/^[A-Z0-9-]{8,160}$/i.test(orderId)) return json({ ok: false, error: 'A valid PayPal order ID is required' }, 400);
  const row = await first(env.MEMBERS_DB.prepare('SELECT * FROM bespoke_investigation_cases WHERE id=? AND member_id=? LIMIT 1').bind(caseId, required.auth.member.id));
  if (!row) return json({ ok: false, error: 'Case not found' }, 404);
  const prior = await first(env.MEMBERS_DB.prepare('SELECT * FROM bespoke_investigation_payments WHERE provider_order_id=? AND case_id=? LIMIT 1').bind(orderId, caseId));
  if (prior?.status === 'COMPLETED' && row.paid_at) return json({ ok: true, completed: true, idempotent: true, caseId, orderId, captureId: prior.provider_capture_id, status: row.status });
  const payload = await paypal(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', requestId: `matrix-bespoke-capture-${orderId}` });
  const unit = payload.purchase_units?.[0] || {};
  const capture = unit.payments?.captures?.[0] || {};
  const expectedCustom = `${required.auth.member.id}:${caseId}`.slice(0, 127);
  const paidMinor = Math.round(Number(capture.amount?.value || unit.amount?.value || 0) * 100);
  const currency = clean(capture.amount?.currency_code || unit.amount?.currency_code, 10).toUpperCase();
  if (clean(unit.reference_id, 180) !== caseId || clean(unit.custom_id, 127) !== expectedCustom) return json({ ok: false, error: 'PayPal order ownership or case reference did not match' }, 409);
  if (payload.status !== 'COMPLETED' || capture.status !== 'COMPLETED' || paidMinor !== Number(row.quoted_amount_minor) || currency !== 'EUR') {
    return json({ ok: false, error: 'PayPal payment is incomplete or does not match the approved quote' }, 409);
  }
  const current = nowIso();
  const captureId = clean(capture.id || orderId, 180);
  await env.MEMBERS_DB.prepare(`INSERT INTO bespoke_investigation_payments(id,case_id,member_id,provider,provider_order_id,provider_capture_id,status,amount_minor,currency,environment,raw_json,created_at,updated_at,captured_at)
    VALUES(?,?,?,'paypal',?,?,'COMPLETED',?,'EUR',?,?,?, ?,?)
    ON CONFLICT(provider_order_id) DO UPDATE SET provider_capture_id=excluded.provider_capture_id,status='COMPLETED',raw_json=excluded.raw_json,updated_at=excluded.updated_at,captured_at=excluded.captured_at`)
    .bind(newId('bespoke-payment'), caseId, required.auth.member.id, orderId, captureId, row.quoted_amount_minor, payments.environment, safeJson(payload, 50000), current, current, current).run();
  const nextStatus = 'paid';
  await env.MEMBERS_DB.prepare('UPDATE bespoke_investigation_cases SET status=?,paid_at=?,updated_at=? WHERE id=?').bind(nextStatus, current, current, caseId).run();
  await statusHistory(env, caseId, row.status, nextStatus, required.auth.member.id, 'Verified PayPal capture completed', { orderId, captureId, amountMinor: row.quoted_amount_minor });
  await audit(env, required.auth.member.id, 'bespoke.payment.captured', 'bespoke_case', caseId, { orderId, captureId, amountMinor: row.quoted_amount_minor, environment: payments.environment });
  return json({ ok: true, completed: true, caseId, orderId, captureId, amount: amountText(row.quoted_amount_minor), currency: 'EUR', status: nextStatus, liveChargingEnabled: payments.liveChargingEnabled });
}

function caseIdFrom(pathname, suffix = '') {
  const pattern = suffix
    ? new RegExp(`^/api/bespoke/(?:admin/)?case/([^/]+)/${suffix}$`)
    : /^\/api\/bespoke\/case\/([^/]+)$/;
  const match = pathname.match(pattern);
  return match ? safeId(decodeURIComponent(match[1])) : '';
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (!isBespokeInvestigationRoute(pathname)) return json({ ok: false, error: 'Not found' }, 404);
    try {
      if (pathname === '/api/bespoke/config' && request.method === 'GET') return config(env);
      if (!hasD1(env)) return json({ ok: false, error: 'MEMBERS_DB binding is unavailable' }, 503);
      if (pathname === '/api/bespoke/intake' && request.method === 'POST') return createIntake(request, env);
      if (pathname === '/api/bespoke/cases' && request.method === 'GET') return listCases(request, env);
      if (pathname === '/api/bespoke/admin/cases' && request.method === 'GET') return listAdminCases(request, env);
      if (/^\/api\/bespoke\/case\/[^/]+$/.test(pathname) && request.method === 'GET') return readCase(request, env, caseIdFrom(pathname));
      if (/^\/api\/bespoke\/case\/[^/]+\/order$/.test(pathname) && request.method === 'POST') return createOrder(request, env, caseIdFrom(pathname, 'order'));
      if (/^\/api\/bespoke\/case\/[^/]+\/capture$/.test(pathname) && request.method === 'POST') return captureOrder(request, env, caseIdFrom(pathname, 'capture'));
      if (/^\/api\/bespoke\/admin\/case\/[^/]+\/decision$/.test(pathname) && request.method === 'POST') return decideCase(request, env, caseIdFrom(pathname, 'decision'));
      if (/^\/api\/bespoke\/admin\/case\/[^/]+\/status$/.test(pathname) && request.method === 'POST') return updateCaseStatus(request, env, caseIdFrom(pathname, 'status'));
      return json({ ok: false, error: 'Method not allowed' }, 405, { Allow: 'GET, POST' });
    } catch (error) {
      return json({ ok: false, error: clean(error?.message || error, 900), failClosed: true }, 500);
    }
  }
};
