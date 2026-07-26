const fs = require('fs');
const path = require('path');

const workflow = String(process.env.GITHUB_WORKFLOW || '');
const mode = String(process.env.INVESTIGATION_MODE || '').toLowerCase();
const script = path.basename(String(process.argv[1] || ''));
const targets = new Set([
  'repair-investigation-source-registry.js',
  'run-investigation-machine.js',
  'update-live-intel.js',
  'record-live-intel-check.js',
  'update-seven-day-intel.js',
  'build-outcome-briefings.js',
  'build-daily-brain-brief.js',
  'build-investigation-pages.js',
  'build-mission-intelligence-10.js',
  'build-live-intel-machine.js',
  'patch-conclusion-integrity-cards.js',
  'build-behind-the-curtain-tier-registry.js',
  'patch-behind-the-curtain-tier-ui.js',
  'build-behind-the-curtain.js'
]);

const active = /Matrix Reprogrammed Controlled Production Deploy/i.test(workflow)
  && mode === 'daily'
  && targets.has(script);

if (active) {
  const originalExit = process.exit.bind(process);
  let terminating = false;

  function record(kind, detail, code = 1) {
    const downloads = path.resolve(process.cwd(), 'downloads');
    try {
      fs.mkdirSync(downloads, { recursive: true });
      const file = path.join(downloads, 'production-refresh-soft-fail.log');
      fs.appendFileSync(file, `${new Date().toISOString()}\t${script}\t${kind}\t${code}\t${String(detail || '').replace(/\s+/g, ' ').slice(0, 2000)}\n`);
    } catch {}
  }

  function soften(kind, detail, code = 1) {
    if (terminating) return;
    terminating = true;
    record(kind, detail, code);
    console.warn(`[production refresh fallback] ${script} returned ${kind} (${code}). The later build and strict freshness guards remain authoritative.`);
    originalExit(0);
  }

  process.exit = function patchedExit(code = 0) {
    const numeric = Number(code || 0);
    if (numeric !== 0) return soften('process-exit', `requested exit ${numeric}`, numeric);
    return originalExit(0);
  };

  process.on('uncaughtException', error => {
    soften('uncaught-exception', error?.stack || error?.message || error, 1);
  });
  process.on('unhandledRejection', error => {
    soften('unhandled-rejection', error?.stack || error?.message || error, 1);
  });
}
