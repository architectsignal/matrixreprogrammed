const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
const checks = [];
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push(`${name}: ${detail || 'failed'}`);
}
function containsAll(text, values) { return values.every(value => text.includes(value)); }

for (const file of [
  'research-tools.html',
  'research-tools.js',
  'migrations/0002_osint_tools.sql',
  'tools/osint_runner.py',
  'tools/osint-requirements.txt',
  'tools/OSINT_RUNNER_SETUP.md',
  'scripts/patch-osint-tools-system.js',
  'scripts/patch-research-tools-ui.js',
  'src/worker.js'
]) check(`required file ${file}`, fs.existsSync(path.join(root, file)), 'missing');

const page = read('research-tools.html');
check('three open-source tools shown', containsAll(page, ['data-tool-form="holehe"', 'data-tool-form="spiderfoot"', 'data-tool-form="h8mail"']));
check('h8mail is administrator-only', page.includes('Administrator Only · h8mail') && page.includes('data-admin-tool hidden'));
check('member tools identified', page.includes('Member Tool · Holehe') && page.includes('Member Tool · SpiderFoot'));
check('lawful-use confirmations required', (page.match(/name="confirmLawfulUse"/g) || []).length === 3 && (page.match(/name="confirmNoMinor"/g) || []).length === 3);
check('evidence boundary visible', /do not prove identity|not prove identity/i.test(page) && /wrongdoing or criminal conduct/i.test(page));
check('external Email OSINT linked safely', page.includes('https://emailosint.org/') && page.includes('noopener noreferrer nofollow'));

const client = read('research-tools.js');
check('client uses member-authenticated APIs', containsAll(client, ['/api/tools/config', '/api/tools/jobs', "credentials: 'same-origin'"]));
check('client does not persist targets locally', !/localStorage|sessionStorage|indexedDB/.test(client));
check('client reveals admin card only for admin role', client.includes("role === 'admin'") && client.includes('adminCard.hidden = false'));
check('client clears submitted form', client.includes('form.reset()'));

const migration = read('migrations/0002_osint_tools.sql');
check('encrypted D1 job fields present', containsAll(migration, ['target_hash', 'target_ciphertext', 'target_iv', 'lawful_purpose', 'consent_version']));
check('runner heartbeat table present', migration.includes('CREATE TABLE IF NOT EXISTS osint_runner_heartbeats'));
check('tool and status constraints present', migration.includes("tool IN ('holehe', 'spiderfoot', 'h8mail')") && migration.includes("status IN ('queued', 'running', 'completed', 'failed', 'cancelled')"));

const worker = read('src/worker.js');
check('worker patch applied', worker.includes('osint-tools-v1: encrypted D1 jobs'));
check('member role loaded from D1', worker.includes('display_name,role,status') && worker.includes("role:auth.member.role||'member'"));
check('member and admin routes present', containsAll(worker, ["originalPath==='/api/tools/config'", "originalPath==='/api/tools/jobs'", '/api/admin/tools/jobs/next', '/api/admin/tools/heartbeat']));
check('targets encrypted with AES-GCM', worker.includes("name:'AES-GCM'") && worker.includes('target_ciphertext') && worker.includes('target_iv'));
check('member rate limits enforced', worker.includes('dailyLimit:5') && worker.includes('dailyLimit:2') && worker.includes('dailyLimit:10'));
check('h8mail admin gate enforced', worker.includes("policy.access==='admin'&&!osintIsAdmin"));
check('sensitive result keys removed', worker.includes('osintSanitizeResult') && /password\|passwd\|credential/.test(worker));
check('completed targets cleared', worker.includes("target_ciphertext='',target_iv=''"));
check('runner bearer token required', worker.includes('OSINT_RUNNER_TOKEN') && worker.includes("startsWith('bearer ')"));
check('CORS accepts private runner headers', worker.includes('authorization,x-runner-id'));

const runner = read('tools/osint_runner.py');
check('runner supports all three tools', containsAll(runner, ['def run_holehe', 'def run_spiderfoot', 'def run_h8mail']));
check('runner never logs target', !/print\([^\n]*target/.test(runner));
check('runner strips sensitive outputs', runner.includes('BLOCKED_KEYS') && runner.includes('[redacted-email]') && runner.includes('[redacted-phone]'));
check('h8mail uses hidden JSON output', runner.includes('"--hide"') && runner.includes('"-j"'));
check('SpiderFoot uses passive scan', runner.includes('"usecase": "passive"'));
check('raw breach rows not returned', runner.includes('raw breach rows are discarded'));
check('private polling API used', containsAll(runner, ['/api/admin/tools/jobs/next', '/api/admin/tools/heartbeat', '/result', '/fail']));

const homepage = read('index.html');
check('homepage links research tools', homepage.includes('osint-tools-home:start') && homepage.includes('href="research-tools.html"'));
check('homepage keeps evidence boundary', homepage.includes('account, footprint and breach signals are leads'));

const build = read('scripts/build-cloudflare-output.js');
check('Cloudflare build requires tools page and client', build.includes('research-tools.html') && build.includes('research-tools.js'));
check('Cloudflare build runs OSINT tests', build.includes('osint-tools-test.js'));
check('private runner code is not a public required asset', !build.includes("'tools/osint_runner.py'"));

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'osint-tools-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`OSINT TOOLS TEST FAILED: ${failures.length} failure(s)`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`OSINT tools test passed: ${checks.length} checks.`);
