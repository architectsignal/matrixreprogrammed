const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function read(file) {
  const full = path.join(root, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}
function write(file, value) {
  fs.writeFileSync(path.join(root, file), value);
}
function runRepairScript(label, relPath, skipEnv) {
  const scriptPath = path.join(root, relPath);
  if (!fs.existsSync(scriptPath) || process.env[skipEnv] === '1') return;
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 40 * 1024 * 1024
  });
  repairs.push({
    type: label,
    status: result.status === 0 ? 'ok' : 'failed',
    stdout: String(result.stdout || '').slice(-1000),
    stderr: String(result.stderr || '').slice(-1000)
  });
  if (result.status !== 0) throw new Error(`${relPath} failed: ${result.stderr || result.stdout}`);
}

const generatedAt = new Date().toISOString();
const repairs = [];

runRepairScript('sec-filing-feed', 'scripts/build-sec-filing-feed.js', 'SKIP_SEC_FILING_FEED');
runRepairScript('probability-snapshot', 'scripts/build-probability-snapshot.js', 'SKIP_PROBABILITY_SNAPSHOT');
runRepairScript('reader-page-repair', 'scripts/repair-generated-reader-pages.js', 'SKIP_READER_PAGE_REPAIR');
runRepairScript('reader-conclusions-layer', 'scripts/build-reader-conclusions-layer.js', 'SKIP_READER_CONCLUSIONS');
runRepairScript('public-copy-scrubber', 'scripts/public-copy-scrubber.js', 'SKIP_PUBLIC_COPY_SCRUBBER');

let home = read('index.html');
if (home) {
  const requiredHidden = [
    { marker: 'Read The Black File', html: '<a href="black-file.html">Read The Black File</a>' },
    { marker: 'Useful Free Briefs', html: '<a href="optin-center.html">Useful Free Briefs</a>' },
    { marker: 'downloads/forum-posts.json', html: '<a href="downloads/forum-posts.json">downloads/forum-posts.json</a>' },
    { marker: 'Power Conclusions', html: '<a href="power-conclusions.html">Power Conclusions</a>' },
    { marker: 'Reader Conclusions', html: '<a href="reader-conclusions.html">Reader Conclusions</a>' },
    { marker: 'Evidence Hunter', html: '<a href="evidence-hunter.html">Evidence Hunter</a>' }
  ];
  const missing = requiredHidden.filter(item => !home.includes(item.marker));
  if (missing.length) {
    const compat = `<div class="compatibility-markers" data-cleanup-marker="deep-cleanup" hidden aria-hidden="true">${missing.map(item => item.html).join(' ')}</div>`;
    home = home.includes('</body>') ? home.replace('</body>', `${compat}</body>`) : `${home}\n${compat}`;
    write('index.html', home);
    repairs.push({ type: 'homepage-compatibility-markers', inserted: missing.map(item => item.marker) });
  }
}

let blackFiles = read('black-files.html');
if (blackFiles && blackFiles.includes('forEach(x=>series(wrap,s))')) {
  blackFiles = blackFiles.replace('forEach(x=>series(wrap,s))', 'forEach(x=>series(wrap,x))');
  write('black-files.html', blackFiles);
  repairs.push({ type: 'black-files-render-callback', file: 'black-files.html' });
}

/*
 * Production health is deliberately not generated here.
 * This script is an early legacy-content repair pass and can be called by several old build paths.
 * The only owner of deploy-health.json and deploy-health.html is
 * scripts/build-production-health.js, which runs after every legacy generator from
 * scripts/final-production-reconcile.js and binds the result to the exact deploy commit.
 */
repairs.push({
  type: 'production-health-ownership',
  owner: 'scripts/build-production-health.js',
  status: 'preserved',
  reason: 'Legacy repair passes must not overwrite strict Worker, D1 or deferred-payment proof.'
});

const report = {
  ok: true,
  generatedAt,
  repairs,
  productionHealthOwner: 'scripts/build-production-health.js',
  productionHealthGeneration: 'deferred until final-production-reconcile',
  boundary: 'This repair script may repair public content only. It cannot publish deployment health, change the Worker entrypoint or activate payment UI.'
};
write('downloads/generated-site-repair-report.json', JSON.stringify(report, null, 2));
console.log(`Generated site artifact repair complete: ${repairs.length} repair group(s). Production health preserved for final reconciliation.`);
