const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, '_site');
if (!fs.existsSync(outputRoot)) {
  console.log('Cloudflare output is not present; review dashboard output repair skipped.');
  process.exit(0);
}
for (const relative of ['review-dashboard.html', 'data/review-dashboard.json']) {
  const source = path.join(projectRoot, relative);
  const destination = path.join(outputRoot, relative);
  if (!fs.existsSync(destination) && fs.existsSync(source)) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}
process.chdir(outputRoot);
require(path.join(projectRoot, 'scripts', 'repair-review-dashboard-truth.js'));
const html = path.join(outputRoot, 'review-dashboard.html');
const alias = path.join(outputRoot, 'review-dashboard');
if (fs.existsSync(html) && fs.existsSync(alias) && fs.statSync(alias).isFile()) fs.copyFileSync(html, alias);
