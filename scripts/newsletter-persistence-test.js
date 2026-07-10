const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

class MockKV {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.has(key) ? this.data.get(key) : null; }
  async put(key, value) { this.data.set(key, String(value)); }
}

async function main() {
  const workerFile = path.join(root, 'src', 'worker.js');
  if (!fs.existsSync(workerFile)) throw new Error('src/worker.js missing');
  const source = fs.readFileSync(workerFile, 'utf8');
  const tempFile = path.join(reportDir, `.newsletter-worker-test-${Date.now()}.mjs`);
  fs.writeFileSync(tempFile, source);

  const checks = [];
  let module;
  try {
    module = await import(`${pathToFileURL(tempFile).href}?v=${Date.now()}`);
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
  const worker = module && module.default;
  if (!worker || typeof worker.fetch !== 'function') throw new Error('Worker default fetch handler unavailable');

  const kv = new MockKV();
  const env = { FORUM_POSTS: kv };
  const signup = async (email, name = 'Test Reader', targetEnv = env) => {
    const request = new Request('https://matrixreprogrammed.com/newsletter-signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name, source: 'automation-test' })
    });
    const response = await worker.fetch(request, targetEnv);
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { parseError: text.slice(0, 200) }; }
    return { status: response.status, body };
  };

  const first = await signup('healthcheck@example.com');
  const subscriberKey = first.body && first.body.subscriber && `newsletter:subscriber:${first.body.subscriber.id}`;
  const indexRaw = await kv.get('newsletter:index');
  const index = JSON.parse(indexRaw || '[]');
  checks.push({ name: 'valid signup returns saved subscriber', ok: first.status === 200 && first.body.ok === true && first.body.saved === true && first.body.persistent === true && Boolean(first.body.subscriber && first.body.subscriber.email === 'healthcheck@example.com') });
  checks.push({ name: 'subscriber record written to KV', ok: Boolean(subscriberKey && await kv.get(subscriberKey)) });
  checks.push({ name: 'newsletter index written to KV', ok: Array.isArray(index) && index.some(item => item && item.email === 'healthcheck@example.com') });

  const second = await signup('healthcheck@example.com', 'Updated Reader');
  const index2 = JSON.parse(await kv.get('newsletter:index') || '[]');
  checks.push({ name: 'repeat signup remains idempotent', ok: second.status === 200 && index2.filter(item => item && item.email === 'healthcheck@example.com').length === 1 });

  const invalid = await signup('not-an-email');
  checks.push({ name: 'invalid email rejected', ok: invalid.status === 400 && invalid.body.ok === false });

  const missingBinding = await signup('missing@example.com', 'Missing Binding', {});
  checks.push({ name: 'missing KV binding cannot claim persistence', ok: missingBinding.body && missingBinding.body.persistent === false && missingBinding.body.saved === false && missingBinding.body.ok === false });

  checks.push({ name: 'old unconditional success handler removed', ok: !source.includes('return json({ok:true,persistent:true,saved:true,subscriberId:id,subscriber') });

  const report = {
    ok: checks.every(check => check.ok),
    generatedAt: new Date().toISOString(),
    checks,
    firstResponse: first,
    missingBindingResponse: missingBinding,
    boundary: 'Newsletter persistence is considered healthy only when the Worker writes both the subscriber record and newsletter index to Cloudflare KV.'
  };
  fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.md'), '# Newsletter Persistence Test\n\nGenerated: '+report.generatedAt+'\nResult: '+(report.ok?'PASS':'FAIL')+'\n\n'+checks.map(c=>`- ${c.ok?'PASS':'FAIL'}: ${c.name}`).join('\n'));

  if (!report.ok) {
    console.error('NEWSLETTER PERSISTENCE TEST FAILED');
    checks.filter(check => !check.ok).forEach(check => console.error(`- ${check.name}`));
    process.exit(1);
  }
  console.log('NEWSLETTER PERSISTENCE TEST PASSED');
}

main().catch(error => {
  const report = { ok: false, generatedAt: new Date().toISOString(), error: error.message, stack: error.stack };
  fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.json'), JSON.stringify(report, null, 2));
  console.error(error.stack || error.message);
  process.exit(1);
});
