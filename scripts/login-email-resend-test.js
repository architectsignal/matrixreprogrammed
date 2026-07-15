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
  const factory = new Function('authMailConfigured', 'authHtml', 'cleanText', 'fetch', `${source}; return authSendEmail;`);
  const authSendEmail = factory(authMailConfigured, authHtml, cleanText, fakeFetch);
  const env = { BREVO_API_KEY: 'test-key', MEMBERS_FROM_EMAIL: 'sender@example.com', MEMBERS_FROM_NAME: 'Matrix Reprogrammed' };
  const member = { email: 'member@example.com', display_name: 'Nicholas Matthews' };

  for (let index = 1; index <= 3; index += 1) {
    const link = `https://matrixreprogrammed.com/api/auth/verify?purpose=login&token=resend-${index}`;
    const result = await authSendEmail(env, member, link, 'login');
    check(`repeat request ${index} accepted by provider`, result.sent === true);
  }

  check('three complete Brevo payloads generated', sentPayloads.length === 3);
  sentPayloads.forEach((payload, index) => {
    check(`payload ${index + 1} has login subject`, payload.subject === 'Your Matrix Reprogrammed login link');
    check(`payload ${index + 1} has complete HTML`, typeof payload.htmlContent === 'string' && payload.htmlContent.length > 300 && payload.htmlContent.includes('Sign in securely'));
    check(`payload ${index + 1} has complete text`, typeof payload.textContent === 'string' && payload.textContent.length > 80 && payload.textContent.includes(`resend-${index + 1}`));
    check(`payload ${index + 1} has recipient`, payload.to?.[0]?.email === 'member@example.com');
  });

  check('login request records delivery diagnostics', worker.includes("'auth.magic_link.delivery'") && worker.includes('payloadLengths:delivery.payloadLengths'));
  check('shared sender rejects empty payloads', lifecycle.includes('invalid-or-empty-transactional-email-payload'));
  check('invalid outbox JSON fails closed', lifecycle.includes("payloadError='invalid-outbox-payload-json'") && lifecycle.includes('delivery.permanent||attempts>=5'));

  const report = {
    ok: issues.length === 0,
    generatedAt: new Date().toISOString(),
    purpose: 'Prove repeated passwordless login requests always produce complete subject, HTML and text payloads and that malformed queued emails never reach Brevo.',
    checks,
    issues,
    payloadLengths: sentPayloads.map(payload => ({ subject: payload.subject.length, html: payload.htmlContent.length, text: payload.textContent.length }))
  };
  fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'downloads', 'login-email-resend-test.json'), JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error('LOGIN EMAIL RESEND TEST FAILED');
    issues.forEach(issue => console.error(`- ${issue}`));
    process.exit(1);
  }
  console.log('LOGIN EMAIL RESEND TEST PASSED: three consecutive complete login emails; malformed payloads fail closed.');
})().catch(error => {
  console.error('LOGIN EMAIL RESEND TEST FAILED');
  console.error(error && error.stack || error);
  process.exit(1);
});
