const fs = require('fs');
const path = require('path');

const workflow = String(process.env.GITHUB_WORKFLOW || '');
const githubEnv = String(process.env.GITHUB_ENV || '');
if (!/Matrix Reprogrammed Controlled Production Deploy/i.test(workflow) || !githubEnv) {
  console.log('Production refresh preload not required for this install.');
  process.exit(0);
}

const preload = path.resolve(__dirname, 'production-refresh-soft-fail.cjs');
if (!fs.existsSync(preload)) throw new Error(`Missing production refresh preload: ${preload}`);
const existing = String(process.env.NODE_OPTIONS || '').trim();
const option = `--require=${preload}`;
const value = existing.includes(option) ? existing : [existing, option].filter(Boolean).join(' ');
fs.appendFileSync(githubEnv, `NODE_OPTIONS=${value}\n`);
console.log(`Installed refresh-only Node preload for controlled production workflow: ${preload}`);
