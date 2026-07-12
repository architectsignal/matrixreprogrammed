const fs = require('fs');
const path = require('path');
const root = process.cwd();
const site = path.join(root, '_site');
const failures = [];
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(path.join(root, rel), 'utf8') : ''; }
function siteRead(rel) { const file = path.join(site, rel); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; }
function check(name, ok) { if (!ok) failures.push(name); }
check('deploy workflow refreshes intelligence', read('.github/workflows/deploy.yml').includes('run-investigation-machine.js daily') && read('.github/workflows/deploy.yml').includes('update-live-intel.js'));
check('deploy workflow cancels stale deployment', /cancel-in-progress:\s*true/.test(read('.github/workflows/deploy.yml')));
check('deploy workflow verifies live SHA', read('.github/workflows/deploy.yml').includes('verify-live-production.js'));
check('freshness policy exists', exists('data/production-freshness-policy.json'));
check('source deployment manifest exists', exists('deploy-manifest.json'));
check('built deployment manifest exists', fs.existsSync(path.join(site, 'deploy-manifest.json')));
check('main navigation safety links', read('index.html').includes('security-privacy.html') && read('index.html').includes('dark-web-safety.html'));
check('Start Here safety links', read('start-here.html').includes('Open Security Tools') && read('start-here.html').includes('Open Dark Web Safety'));
for (const rel of ['daily-power-conclusions.html', 'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html']) {
  check(`${rel} integrity cards`, read(rel).includes('<!-- conclusion-integrity:start -->'));
  check(`built ${rel} integrity cards`, siteRead(rel).includes('<!-- conclusion-integrity:start -->'));
}
check('critical HTML no-cache policy', read('_headers').includes('/deploy-manifest.json') && read('_headers').includes('Cache-Control: no-store'));
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-sync-test.json'), JSON.stringify(report, null, 2));
if (failures.length) { failures.forEach(item => console.error(`FAILED: ${item}`)); process.exit(1); }
console.log('Production synchronization assurance passed.');
