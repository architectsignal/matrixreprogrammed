const fs = require('fs');
const path = require('path');

const workflow = String(process.env.GITHUB_WORKFLOW || '');
const githubPath = String(process.env.GITHUB_PATH || '');
if (!/Matrix Reprogrammed Controlled Production Deploy/i.test(workflow) || !githubPath) {
  console.log('Production refresh launcher not required for this install.');
  process.exit(0);
}

const root = process.cwd();
const preload = path.resolve(__dirname, 'production-refresh-soft-fail.cjs');
if (!fs.existsSync(preload)) throw new Error(`Missing production refresh preload: ${preload}`);
const binDir = path.join(root, '.matrix-production-bin');
const launcher = path.join(binDir, 'node');
const npxLauncher = path.join(binDir, 'npx');
fs.mkdirSync(binDir, { recursive: true });

const realNode = process.execPath;
const realNpx = path.join(path.dirname(realNode), process.platform === 'win32' ? 'npx.cmd' : 'npx');
if (!fs.existsSync(realNpx)) throw new Error(`Missing real npx launcher: ${realNpx}`);
const wranglerVersion = '4.114.0';
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
const script = `#!/usr/bin/env bash\nset -u\nREAL_NODE=${JSON.stringify(realNode)}\nPRELOAD=${JSON.stringify(preload)}\nfirst=\${1:-}\n# Node flags such as --check are not script paths. Passing them to basename emitted\n# noisy errors during every production syntax-check while still returning success.\ncase \"\$first\" in\n  \"\"|-*) exec \"\$REAL_NODE\" \"\$@\" ;;\nesac\nbase=\$(basename -- \"\$first\")\nif [[ \"\${GITHUB_WORKFLOW:-}\" == \"Matrix Reprogrammed Controlled Production Deploy\" && \"\${INVESTIGATION_MODE:-}\" == \"daily\" ]]; then\n  case \"\$base\" in\n    ${casePattern}) exec \"\$REAL_NODE\" --require \"\$PRELOAD\" \"\$@\" ;;\n  esac\nfi\nexec \"\$REAL_NODE\" \"\$@\"\n`;
const npxScript = `#!/usr/bin/env bash\nset -euo pipefail\nREAL_NPX=${JSON.stringify(realNpx)}\nWRANGLER_VERSION=${JSON.stringify(wranglerVersion)}\nargs=(\"\$@\")\nfor i in \"\${!args[@]}\"; do\n  if [[ \"\${args[$i]}\" == \"wrangler@latest\" ]]; then\n    args[$i]=\"wrangler@\${WRANGLER_VERSION}\"\n  fi\ndone\nexec \"\$REAL_NPX\" \"\${args[@]}\"\n`;
fs.writeFileSync(launcher, script, { mode: 0o755 });
fs.chmodSync(launcher, 0o755);
fs.writeFileSync(npxLauncher, npxScript, { mode: 0o755 });
fs.chmodSync(npxLauncher, 0o755);
fs.appendFileSync(githubPath, `${binDir}\n`);
console.log(`Installed controlled production launchers: refresh-only Node wrapper and Wrangler ${wranglerVersion} npx pin in ${binDir}`);
