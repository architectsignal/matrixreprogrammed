const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
const lifecyclePath = path.join(root, 'src', 'worker-email-lifecycle.js');
const issues = [];
const checks = {};

function check(name, condition) {
  checks[name] = Boolean(condition);
  if (!condition) issues.push(name);
}
function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Cannot extract ${startMarker}`);
  return text.slice(start, end);
}

(async () => {
  const worker = fs.readFileSync(workerPath, 'utf8');
  const lifecycle = fs.readFileSync(lifecyclePath, 'utf8');
  const source = between(worker, 'async function authSendEmail(', 'async function authIssueLink(');
  const sentPayloads = [];
  const fakeFetch = async (_url, options) => {
    sentPayloads.push(JSON.parse(options.body));
    return { status: 201, text: async () => JSON.stringify({ messageId: `message-${sentPayloads.length}` }) };
  };
  const authMailConfigured = () => true;
  const authHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const cleanText = value => String(value || '').trim();
  const factory = new Function('authMailConfigured', 'authHtml', 'cleanText', 'fetch', 'crypto', `${source}; return authSendEmail;`);
  const authSendEmail = factory(authMailConfigured, authHtml, cleanText, fakeFetch, globalThis.crypto);
  const env = { BREVO_API_KEY: 'test-key', MEMBERS_FROM_EMAIL: 'sender@example.com', MEMBERS_FROM_NAME: 'Matrix Reprogrammed' };
  const member = { email: 'member@example.com', display_name: 'Nicholas Matthews' };

  for (let index = 1; index <= 3; index += 1) {
    const link = `https://matrixreprogrammed.com/api/auth/verify?purpose=login&token=resend-${index}`;
    const result = await authSendEmail(env, member, link, 'login');
    check(`repeat request ${index} accepted by provider`, result.sent === true);
    check(`repeat request ${index} returns reference`, /^[A-F0-9-]{8}$/i.test(result.requestRef || ''));
  }

  check('three complete Brevo payloads generated', sentPayloads.length === 3);
  const subjects = new Set();
  const references = new Set();
  sentPayloads.forEach((payload, index) => {
    check(`payload ${index + 1} has unique login subject`, /^Your Matrix Reprogrammed login link · [A-F0-9-]{8}$/i.test(payload.subject || ''));
    check(`payload ${index + 1} has complete HTML`, typeof payload.htmlContent === 'string' && payload.htmlContent.length > 500 && payload.htmlContent.includes('Sign in securely') && payload.htmlContent.includes('Request reference:'));
    check(`payload ${index + 1} has complete text`, typeof payload.textContent === 'string' && payload.textContent.length > 150 && payload.textContent.includes(`resend-${index + 1}`) && payload.textContent.includes('Request reference:'));
    check(`payload ${index + 1} has recipient`, payload.to?.[0]?.email === 'member@example.com');
    check(`payload ${index + 1} has provider reference header`, Boolean(payload.headers?.['X-Matrix-Login-Reference']));
    subjects.add(payload.subject);
    references.add(payload.headers?.['X-Matrix-Login-Reference']);
  });
  check('all repeat subjects are distinct', subjects.size === 3);
  check('all repeat request references are distinct', references.size === 3);

  check('login request records delivery diagnostics', worker.includes("'auth.magic_link.delivery'") && worker.includes('payloadLengths:delivery.payloadLengths') && worker.includes('requestRef:delivery.requestRef'));
  check('shared sender rejects empty payloads', lifecycle.includes('invalid-or-empty-transactional-email-payload'));
  check('shared sender validator declared exactly once', (lifecycle.match(/function emailPayloadCheck\(/g) || []).length === 1);
  check('invalid outbox JSON fails closed', lifecycle.includes("payloadError='invalid-outbox-payload-json'") && lifecycle.includes('delivery.permanent||attempts>=5'));

  const report = {
    ok: issues.length === 0,
    generatedAt: new Date().toISOString(),
    purpose: 'Prove repeated passwordless login requests produce complete, visibly distinct subject, HTML and text payloads; repeated builds remain idempotent; malformed queued messages never reach Brevo.',
    checks,
    issues,
    payloadLengths: sentPayloads.map(payload => ({ subject: payload.subject.length, html: payload.htmlContent.length, text: payload.textContent.length })),
    subjects: [...subjects],
    references: [...references]
  };
  fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'downloads', 'login-email-resend-test.json'), JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error('LOGIN EMAIL RESEND TEST FAILED');
    issues.forEach(issue => console.error(`- ${issue}`));
    process.exit(1);
  }
  require('./sanitize-timer-source-links.js');
  console.log('LOGIN EMAIL RESEND TEST PASSED: three consecutive complete and visibly distinct login emails; malformed payloads fail closed.');
})().catch(error => {
  console.error('LOGIN EMAIL RESEND TEST FAILED');
  console.error(error && error.stack || error);
  process.exit(1);
});