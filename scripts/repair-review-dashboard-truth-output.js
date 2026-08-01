const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, '_site');
if (!fs.existsSync(outputRoot)) {
  console.log('Cloudflare output is not present; review dashboard output repair skipped.');
  process.exit(0);
}
process.chdir(outputRoot);
require(path.join(projectRoot, 'scripts', 'repair-review-dashboard-truth.js'));
const html = path.join(outputRoot, 'review-dashboard.html');
const alias = path.join(outputRoot, 'review-dashboard');
if (fs.existsSync(html) && fs.existsSync(alias) && fs.statSync(alias).isFile()) fs.copyFileSync(html, alias);
