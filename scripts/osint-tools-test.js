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
  'research-tools-ui-v3.js',
  'migrations/0002_osint_tools.sql',
  'tools/osint_runner.py',
  'tools/osint_runner_v3.py',
  'tools/osint-requirements.txt',
  'tools/OSINT_RUNNER_SETUP.md',
  'scripts/patch-osint-tools-system.js',
  'scripts/patch-osint-self-report.js',
  'scripts/patch-research-tools-ui.js',
  'scripts/patch-osint-tool-tiers.js',
  'src/worker.js'
]) check(`required file ${file}`, fs.existsSync(path.join(root, file)), 'missing');

const page = read('research-tools.html');
check('three open-source tools shown', containsAll(page, ['data-tool-form="holehe"', 'data-tool-form="spiderfoot"', 'data-tool-form="h8mail"']));
check('h8mail is Intelligence verified-self', page.includes('Intelligence Tool · h8mail') && page.includes('data-h8mail-tool') && page.includes('own verified email'));
check('member tools identified', page.includes('Member Tool · Holehe') && page.includes('Member Tool · SpiderFoot'));
check('lawful-use confirmations required', (page.match(/name="confirmLawfulUse"/g) || []).length === 3 && (page.match(/name="confirmNoMinor"/g) || []).length === 3);
check('evidence boundary visible', /do not prove identity|not prove identity/i.test(page) && /wrongdoing or criminal conduct/i.test(page));
check('external Email OSINT linked safely', page.includes('https://emailosint.org/') && page.includes('noopener noreferrer nofollow'));
check('cache-busted compatibility interface loaded', page.includes('research-tools-ui-v3.js?v=3.1.0'));

const client = read('research-tools.js');
check('client uses member-authenticated APIs', containsAll(client, ['/api/tools/config', '/api/tools/jobs', "credentials: 'same-origin'"]));
check('client does not persist targets locally', !/localStorage|sessionStorage|indexedDB/.test(client));
check('client uses server-returned tier gates', containsAll(client, ['toolConfig?.allowed', 'config.member?.tier', 'Intelligence membership required']));
check('client clears submitted form', client.includes('form.reset()'));
check('single human-readable report renderer present', containsAll(client, [
  'renderHolehe',
  'renderSpiderFoot',
  'renderH8mail',
  'Email account-signal decision brief',
  'Passive footprint decision brief',
  'Defensive exposure decision brief'
]));
check('report explains priority and actions', containsAll(client, ['decision-badge', 'What to do next', 'riskAssessment', 'priorityMeaning']));
check('sanitised technical appendix retained but collapsed', containsAll(client, ['Sanitised technical appendix', 'decision-details', 'technical(result)']));
check('sensitive category knowledge displayed safely', containsAll(client, ['Exposure categories to address', 'underlying value withheld', 'stealer_logs']));
check('provider catalogues are collapsed', containsAll(client, ['no-account responses — lower priority', 'services gave no reliable answer', 'details(']));
check('completed jobs can be reopened', containsAll(client, ['Open clear report', 'openJob(job)', 'restoreLatest']));
check('raw secret values are not requested by client', !/passwordValue|rawBreach|recoveryValue|phoneFragment|ipAddressValue/.test(client));

const clientV3 = read('research-tools-ui-v3.js');
check('v3 compatibility asset defers to authoritative renderer', containsAll(clientV3, ['__MATRIX_RESEARCH_UI_AUTHORITATIVE__', 'authoritative result', 'exactly once']));
check('v3 no longer duplicates report rendering', !/MutationObserver|renderAccount|renderExposure|parseRaw/.test(clientV3));
check('v3 avoids persistent target storage', !/localStorage|sessionStorage|indexedDB/.test(clientV3));
check('v3 never asks for raw values', !/passwordValue|rawBreach|recoveryValue|phoneFragment|ipAddressValue/.test(clientV3));

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
check('Holehe registered tier enforced', worker.includes("holehe:{label:'Email account signals',access:'member',minimumTier:'registered'"));
check('SpiderFoot Intelligence tier enforced', worker.includes("spiderfoot:{label:'Passive digital footprint scan',access:'member',minimumTier:'intelligence_6'"));
check('h8mail Intelligence tier enforced', worker.includes("h8mail:{label:'Breach exposure review',access:'member',minimumTier:'intelligence_6',selfOnlyForMembers:true"));
check('h8mail verified-self member boundary enforced', worker.includes('This Intelligence tool may review only your own verified account email'));
check('administrator investigation scope remains available', worker.includes("if(policy.selfOnlyForMembers&&!osintIsAdmin(required.auth.member)&&!selfVerified)"));
check('sensitive result keys removed', worker.includes('osintSanitizeResult') && /password\|passwd\|credential/.test(worker));
check('completed targets cleared', worker.includes("target_ciphertext='',target_iv=''"));
check('runner bearer token required', worker.includes('OSINT_RUNNER_TOKEN') && worker.includes("startsWith('bearer ')"));
check('CORS accepts private runner headers', worker.includes('authorization,x-runner-id'));
check('verified-self ownership uses verified member mailbox hash', containsAll(worker, ['email_verified_at', 'memberHash=await authHash', "disclosureMode:revealSelf?'verified-self':'standard'"]));
check('recognition clues hidden outside verified-self mode', worker.includes('delete result.recognitionHints'));
check('verified-self views are audited', worker.includes('osint.self_report.viewed'));

const runner = read('tools/osint_runner.py');
check('runner supports all three tools', containsAll(runner, ['def run_holehe', 'def run_spiderfoot', 'def run_h8mail']));
check('runner v2 marker present', runner.includes('VERSION = "2.0.0"') && runner.includes('report_version'));
check('runner never logs target', !/print\([^\n]*target/.test(runner));
check('runner strips sensitive outputs', runner.includes('BLOCKED_KEYS') && runner.includes('[redacted-email]') && runner.includes('[redacted-phone]'));
check('h8mail uses hidden JSON output', runner.includes('"--hide"') && runner.includes('"-j"'));
check('SpiderFoot uses passive scan', runner.includes('"usecase": "passive"'));
check('raw breach rows not returned', /raw breach rows are never returned/i.test(runner));
check('private polling API used', containsAll(runner, ['/api/admin/tools/jobs/next', '/api/admin/tools/heartbeat', '/result', '/fail']));
check('API parity response lanes present', containsAll(runner, ['"accounts"', '"validator"', '"data_breaches"', '"stealer_logs"', '"ai_summary"', '"meta"']));
check('timing metadata present', containsAll(runner, ['duration_ms', 'module_timeout_ms', 'completed', 'timed_out', 'lookup_id']));
check('sensitive category classifier present', containsAll(runner, ['authenticationMaterial', 'digestMaterial', 'recoveryData', 'telephoneData', 'networkAddressData']));
check('infostealer knowledge retained without rows', containsAll(runner, ['stealer_count', '"present": stealer_count > 0', '"results": []']));
check('deterministic risk summary present', containsAll(runner, ['deterministic-risk-engine', 'risk_reason', 'recommendedActions']));
check('target email omitted from result schema', !/"email"\s*:\s*target/.test(runner));

const runnerV3 = read('tools/osint_runner_v3.py');
check('v3 runner imports existing private runner contract', containsAll(runnerV3, ['import osint_runner as base', 'base.run_h8mail = run_h8mail_enriched', 'base.main()']));
check('v3 masks recognisable identifiers', containsAll(runnerV3, ['mask_mail', 'mask_tel', 'mask_network', 'recognitionHints']));
check('v3 reports source date and counts', containsAll(runnerV3, ['reportedDate', 'occurrences', 'sameValueCount', 'nearest_metadata']));
check('v3 classifies authentication material without returning it', containsAll(runnerV3, ['Authentication value present', 'value withheld', 'digest_description']));
check('v3 uses hidden h8mail output', runnerV3.includes('"--hide"') && runnerV3.includes('TemporaryDirectory'));
check('v3 never prints target', !/print\([^\n]*target/.test(runnerV3));

const homepage = read('index.html');
check('homepage links research tools', homepage.includes('osint-tools-home:start') && homepage.includes('href="research-tools.html"'));
check('homepage keeps evidence boundary', homepage.includes('account, footprint and breach signals are leads'));
check('homepage explains Intelligence h8mail access', homepage.includes('Intelligence members') && homepage.includes('h8mail'));

const build = read('scripts/build-cloudflare-output.js');
check('Cloudflare build requires tools page and client', build.includes('research-tools.html') && build.includes('research-tools.js'));
check('Cloudflare build runs OSINT tests', build.includes('osint-tools-test.js'));
check('private runner code is not a public required asset', !build.includes("'tools/osint_runner.py'") && !build.includes("'tools/osint_runner_v3.py'"));

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'osint-tools-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`OSINT TOOLS TEST FAILED: ${failures.length} failure(s)`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`OSINT tools test passed: ${checks.length} checks.`);
