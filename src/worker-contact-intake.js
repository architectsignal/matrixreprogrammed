const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
const jsonHeaders = {
  ...securityHeaders,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Matrix-Origin': 'cloudflare-worker-contact-intake'
};
const contactRoutes = new Set([
  '/api/contact/config',
  '/api/contact/pgp-key',
  '/api/contact/submit'
]);
const ROUTES = new Set(['general','evidence','lead','correction','press','security','support','secure-pgp']);
const CLASSIFICATIONS = new Set(['','documented-evidence','official-allegation','credible-lead','analytical-inference','speculation','correction']);
const PUBLIC_ADDRESSES = Object.freeze({
  general: 'contact@matrixreprogrammed.com',
  evidence: 'evidence@matrixreprogrammed.com',
  corrections: 'corrections@matrixreprogrammed.com',
  security: 'security@matrixreprogrammed.com',
  press: 'press@matrixreprogrammed.com',
  support: 'support@matrixreprogrammed.com'
});
const PGP_ADDRESS = 'matrixreprogrammed@proton.me';
const MAX_BODY_BYTES = 1_350_000;
const MAX_PGP_BYTES = 1_100_000;
let schemaPromise;

function clean(value, max = 1000) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
function json(data, status = 200, extra = {}) { return new Response(JSON.stringify(data, null, 2), { status, headers: { ...jsonHeaders, ...extra } }); }
function text(data, status = 200, extra = {}) { return new Response(data, { status, headers: { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'X-Matrix-Origin': 'cloudflare-worker-contact-intake', ...extra } }); }
function hasD1(env) { return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function'); }
function iso() { return new Date().toISOString(); }
function randomRef() {
  const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const bytes = new Uint8Array(5); crypto.getRandomValues(bytes);
  const code = [...bytes].map(value => value.toString(16).padStart(2,'0')).join('').toUpperCase();
  return `MR-SIGNAL-${stamp}-${code}`;
}
async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
function requestIp(request) { return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown'; }
function bool(value) { return value === true || value === 1 || ['1','true','yes','on'].includes(String(value || '').toLowerCase()); }
function safeRoute(value) { const route = clean(value, 40).toLowerCase(); return ROUTES.has(route) ? route : ''; }
function safeClassification(value) { const item = clean(value, 60).toLowerCase(); return CLASSIFICATIONS.has(item) ? item : ''; }

async function ensureSchema(env) {
  if (!hasD1(env)) throw new Error('MEMBERS_DB D1 binding is unavailable');
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS contact_submissions (
        id TEXT PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        route TEXT NOT NULL,
        encrypted INTEGER NOT NULL DEFAULT 0 CHECK(encrypted IN (0,1)),
        sender_name TEXT,
        sender_email TEXT,
        subject TEXT,
        classification TEXT,
        signal_board TEXT,
        summary TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        encrypted_payload TEXT,
        consent_reply INTEGER NOT NULL DEFAULT 0 CHECK(consent_reply IN (0,1)),
        consent_publish INTEGER NOT NULL DEFAULT 0 CHECK(consent_publish IN (0,1)),
        urgent INTEGER NOT NULL DEFAULT 0 CHECK(urgent IN (0,1)),
        status TEXT NOT NULL DEFAULT 'received',
        source_hash TEXT NOT NULL,
        user_agent_hash TEXT NOT NULL,
        notification_status TEXT NOT NULL DEFAULT 'pending',
        notification_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_contact_submissions_status_created ON contact_submissions(status, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_contact_submissions_route_created ON contact_submissions(route, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS contact_rate_limits (
        bucket_key TEXT PRIMARY KEY,
        request_count INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ];
    for (const sql of statements) await env.MEMBERS_DB.prepare(sql).run();
    return true;
  })().catch(error => { schemaPromise = null; throw error; });
  return schemaPromise;
}

async function verifyTurnstile(request, env, token) {
  const secret = clean(env?.TURNSTILE_SECRET_KEY || '', 300);
  if (!secret) return { configured: false, ok: true };
  if (!token) return { configured: true, ok: false, error: 'Human verification is required.' };
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  form.set('remoteip', requestIp(request));
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    return { configured: true, ok: result.success === true, error: result.success ? null : 'Human verification failed.' };
  } catch {
    return { configured: true, ok: false, error: 'Human verification is temporarily unavailable.' };
  }
}

async function rateLimit(request, env) {
  const windowMs = 15 * 60 * 1000;
  const limit = 6;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const source = `${requestIp(request)}|${env?.CONTACT_RATE_LIMIT_SALT || 'matrix-contact-v1'}|${windowStart}`;
  const bucket = await hash(source);
  const started = new Date(windowStart).toISOString();
  const stamp = iso();
  await env.MEMBERS_DB.prepare(`INSERT INTO contact_rate_limits (bucket_key,request_count,window_started_at,updated_at)
    VALUES (?,1,?,?) ON CONFLICT(bucket_key) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at`).bind(bucket,started,stamp).run();
  const row = await env.MEMBERS_DB.prepare('SELECT request_count FROM contact_rate_limits WHERE bucket_key=? LIMIT 1').bind(bucket).first();
  return { ok: Number(row?.request_count || 0) <= limit, remaining: Math.max(0, limit - Number(row?.request_count || 0)), bucket };
}

async function sendNotification(env, submission) {
  const apiKey = String(env?.BREVO_API_KEY || '').trim();
  const sender = String(env?.MEMBERS_FROM_EMAIL || '').trim();
  const destination = String(env?.CONTACT_NOTIFICATION_EMAIL || PGP_ADDRESS).trim();
  const enabled = String(env?.EMAIL_TRANSACTIONAL_ENABLED || '').toLowerCase() === 'true';
  const authenticated = String(env?.BREVO_DOMAIN_AUTHENTICATED || '').toLowerCase() === 'true';
  if (!apiKey || !sender || !destination || !enabled || !authenticated) {
    return { sent: false, skipped: true, error: 'Transactional notification provider is not fully enabled.' };
  }
  const routeLabel = submission.route.replace(/-/g, ' ').toUpperCase();
  const safeSubject = submission.encrypted ? 'Encrypted PGP signal' : (submission.subject || 'New contact signal');
  const body = [
    `Reference: ${submission.reference}`,
    `Route: ${routeLabel}`,
    `Encrypted: ${submission.encrypted ? 'YES — decrypt in Proton' : 'No'}`,
    `Subject: ${safeSubject}`,
    `Urgent flag: ${submission.urgent ? 'Yes' : 'No'}`,
    '',
    'The submission is stored in the Cloudflare D1 contact_submissions queue.',
    'This notification intentionally excludes message contents and uploaded material.'
  ].join('\n');
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { email: sender, name: String(env?.MEMBERS_FROM_NAME || 'Matrix Reprogrammed') },
        to: [{ email: destination, name: 'Matrix Reprogrammed Contact Intake' }],
        subject: `[${submission.reference}] ${routeLabel}: ${safeSubject}`.slice(0,180),
        textContent: body,
        htmlContent: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${body.replace(/[&<>]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]))}</pre>`
      })
    });
    const data = await response.json().catch(() => ({}));
    return { sent: response.status === 201, skipped: false, status: response.status, messageId: data.messageId || null, error: response.status === 201 ? null : clean(data.message || 'Brevo notification failed', 500) };
  } catch (error) {
    return { sent: false, skipped: false, error: clean(error?.message || error, 500) };
  }
}

async function pgpKey(request) {
  const endpoint = `https://mail-api.proton.me/pks/lookup?op=get&search=${encodeURIComponent(PGP_ADDRESS)}`;
  const response = await fetch(endpoint, { headers: { accept: 'application/pgp-keys,text/plain;q=0.9,*/*;q=0.1' }, cf: { cacheTtl: 3600, cacheEverything: true } });
  const key = await response.text();
  if (!response.ok || !key.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')) return json({ ok: false, error: 'The Proton public key could not be retrieved.' }, 502);
  const download = new URL(request.url).searchParams.get('download') === '1';
  return text(key, 200, {
    'Cache-Control': 'public, max-age=3600',
    ...(download ? { 'Content-Disposition': 'attachment; filename="matrixreprogrammed-proton-public-key.asc"' } : {})
  });
}

async function submit(request, env) {
  if (!hasD1(env)) return json({ ok: false, saved: false, error: 'Contact storage is unavailable.' }, 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) return json({ ok: false, error: 'Submission exceeds the secure intake size limit.' }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false, error: 'Submission exceeds the secure intake size limit.' }, 413);
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { return json({ ok: false, error: 'Invalid submission format.' }, 400); }
  if (clean(input.website, 200)) return json({ ok: false, error: 'Spam trap triggered.' }, 400);
  const route = safeRoute(input.route);
  if (!route) return json({ ok: false, error: 'Choose a valid contact route.' }, 400);
  await ensureSchema(env);
  const limited = await rateLimit(request, env);
  if (!limited.ok) return json({ ok: false, error: 'Too many submissions. Try again after the current security window.' }, 429, { 'Retry-After': '900' });
  const turnstile = await verifyTurnstile(request, env, clean(input.turnstileToken, 2048));
  if (!turnstile.ok) return json({ ok: false, error: turnstile.error }, 403);

  const encrypted = route === 'secure-pgp' || bool(input.encrypted);
  const reference = randomRef();
  const id = `contact-${crypto.randomUUID()}`;
  const stamp = iso();
  const sourceHash = await hash(`${requestIp(request)}|${env?.CONTACT_HASH_SALT || 'matrix-contact-source-v1'}`);
  const userAgentHash = await hash(request.headers.get('user-agent') || 'unknown');
  let senderName = '';
  let senderEmail = '';
  let subject = '';
  let summary = '';
  let classification = '';
  let signalBoard = '';
  let payloadJson = '{}';
  let encryptedPayload = null;
  let consentReply = 0;
  let consentPublish = 0;
  let urgent = bool(input.urgent) ? 1 : 0;

  if (encrypted) {
    encryptedPayload = String(input.encryptedPayload || '');
    if (!encryptedPayload.startsWith('-----BEGIN PGP MESSAGE-----') || !encryptedPayload.includes('-----END PGP MESSAGE-----')) return json({ ok: false, error: 'A valid armoured PGP message is required.' }, 400);
    if (new TextEncoder().encode(encryptedPayload).byteLength > MAX_PGP_BYTES) return json({ ok: false, error: 'Encrypted envelope exceeds the secure intake size limit.' }, 413);
    subject = 'Encrypted PGP signal';
    summary = 'Client-side encrypted envelope. Plaintext was not submitted to the server.';
    payloadJson = JSON.stringify({ pgpRecipient: PGP_ADDRESS, format: 'openpgp-armored', clientEncrypted: true, keyFingerprint: clean(input.keyFingerprint, 120) });
  } else {
    senderName = clean(input.name, 120);
    senderEmail = clean(input.email, 254).toLowerCase();
    subject = clean(input.subject, 180);
    summary = clean(input.message || input.summary, 12000);
    classification = safeClassification(input.classification);
    signalBoard = clean(input.signalBoard, 120);
    consentReply = bool(input.consentReply) ? 1 : 0;
    consentPublish = bool(input.consentPublish) ? 1 : 0;
    if (!subject || summary.length < 20) return json({ ok: false, error: 'A subject and a meaningful message are required.' }, 400);
    if (senderEmail && !validEmail(senderEmail)) return json({ ok: false, error: 'Enter a valid reply email or leave it blank.' }, 400);
    const details = input.details && typeof input.details === 'object' ? input.details : {};
    payloadJson = JSON.stringify({
      people: clean(details.people, 1500), organizations: clean(details.organizations, 1500), location: clean(details.location, 500),
      dateRange: clean(details.dateRange, 500), sourceLinks: clean(details.sourceLinks, 5000), challengedUrl: clean(details.challengedUrl, 1000),
      deadline: clean(details.deadline, 200), severity: clean(details.severity, 50), supportType: clean(details.supportType, 120),
      permissionToContact: consentReply === 1, permissionToPublish: consentPublish === 1
    });
  }

  await env.MEMBERS_DB.prepare(`INSERT INTO contact_submissions
    (id,reference,route,encrypted,sender_name,sender_email,subject,classification,signal_board,summary,payload_json,encrypted_payload,consent_reply,consent_publish,urgent,status,source_hash,user_agent_hash,notification_status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending',?,?)`).bind(
      id,reference,route,encrypted ? 1 : 0,senderName,senderEmail,subject,classification,signalBoard,summary,payloadJson,encryptedPayload,consentReply,consentPublish,urgent,'received',sourceHash,userAgentHash,stamp,stamp
    ).run();
  const stored = await env.MEMBERS_DB.prepare('SELECT reference,route,encrypted,status,created_at FROM contact_submissions WHERE id=? LIMIT 1').bind(id).first();
  if (!stored || stored.reference !== reference) return json({ ok: false, saved: false, error: 'Submission could not be confirmed after storage.' }, 503);
  const notification = await sendNotification(env, { reference, route, encrypted, subject, urgent: urgent === 1 });
  await env.MEMBERS_DB.prepare('UPDATE contact_submissions SET notification_status=?,notification_error=?,updated_at=? WHERE id=?').bind(notification.sent ? 'sent' : (notification.skipped ? 'not-configured' : 'failed'), notification.error || null, iso(), id).run().catch(() => null);
  return json({
    ok: true,
    saved: true,
    encrypted,
    reference,
    status: 'received',
    notification: { sent: notification.sent, queuedForReview: true },
    message: encrypted ? 'Encrypted signal received. Only the holder of the Proton private key can decrypt the envelope.' : 'Signal received and entered into the Matrix Reprogrammed review queue.'
  }, 201);
}

const worker = {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (!contactRoutes.has(path)) return json({ ok: false, error: 'Contact route not found.' }, 404);
    if (path === '/api/contact/config' && request.method === 'GET') return json({
      ok: true,
      addresses: PUBLIC_ADDRESSES,
      pgpAddress: PGP_ADDRESS,
      pgpKeyUrl: '/api/contact/pgp-key?download=1',
      turnstileSiteKey: clean(env?.TURNSTILE_SITE_KEY || '', 300),
      encryptedAttachmentLimitBytes: 650000,
      encryptedEnvelopeLimitBytes: MAX_PGP_BYTES,
      evidenceBoundary: 'PGP protects message content in transit and at rest inside the intake queue. It does not make a sender anonymous or remove device, browser, network or timing metadata.'
    });
    if (path === '/api/contact/pgp-key' && request.method === 'GET') return pgpKey(request);
    if (path === '/api/contact/submit' && request.method === 'POST') return submit(request, env);
    return json({ ok: false, error: 'Method not allowed.' }, 405, { Allow: path === '/api/contact/submit' ? 'POST' : 'GET' });
  }
};

export { contactRoutes };
export default worker;
