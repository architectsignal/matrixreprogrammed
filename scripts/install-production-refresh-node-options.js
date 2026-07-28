const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const staleClaimPatch = path.resolve(__dirname, 'patch-current-office-holder-stale-claim-detector.js');
if (fs.existsSync(staleClaimPatch)) {
  const result = spawnSync(process.execPath, [staleClaimPatch], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 10
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error('Current office-holder stale-claim detector repair failed during install');
}

const workflow = String(process.env.GITHUB_WORKFLOW || '');
const githubPath = String(process.env.GITHUB_PATH || '');
if (!/Matrix Reprogrammed Controlled Production Deploy/i.test(workflow) || !githubPath) {
  console.log('Production refresh launcher not required for this install.');
  process.exit(0);
}

const preload = path.resolve(__dirname, 'production-refresh-soft-fail.cjs');
if (!fs.existsSync(preload)) throw new Error(`Missing production refresh preload: ${preload}`);
const binDir = path.join(root, '.matrix-production-bin');
const launcher = path.join(binDir, 'node');
fs.mkdirSync(binDir, { recursive: true });

const realNode = process.execPath;
const targets = [
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
];
const casePattern = targets.join('|');
const script = `#!/usr/bin/env bash\nset -u\nREAL_NODE=${JSON.stringify(realNode)}\nPRELOAD=${JSON.stringify(preload)}\nfirst=\${1:-}\nbase=\$(basename "\$first")\nif [[ "\${GITHUB_WORKFLOW:-}" == "Matrix Reprogrammed Controlled Production Deploy" && "\${INVESTIGATION_MODE:-}" == "daily" ]]; then\n  case "\$base" in\n    ${casePattern}) exec "\$REAL_NODE" --require "\$PRELOAD" "\$@" ;;\n  esac\nfi\nexec "\$REAL_NODE" "\$@"\n`;
fs.writeFileSync(launcher, script, { mode: 0o755 });
fs.chmodSync(launcher, 0o755);
fs.appendFileSync(githubPath, `${binDir}\n`);
console.log(`Installed refresh-only Node launcher for controlled production workflow: ${launcher}`);
