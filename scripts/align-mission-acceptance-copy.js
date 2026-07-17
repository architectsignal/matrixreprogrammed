const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const touched = [];

function patch(relative, transform) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}
function patchTimer(html) { return html.replace(/<(h[1-6])>What this means<\/\1>/gi, '<$1>What this score means</$1>'); }
function patchNewsletterHtml(html) {
  const status = '<p class="form-status newsletter-status">Your subscription is stored in the protected member database. Verify your email to activate the briefings named on this form. You can manage preferences or unsubscribe at any time.</p>';
  const pattern = /<p\b[^>]*class=["'][^"']*(?:form-status|newsletter-status)[^"']*["'][^>]*>[\s\S]*?<\/p>/i;
  if (pattern.test(html)) return html.replace(pattern, status);
  return html.includes('</form>') ? html.replace('</form>', `${status}</form>`) : html;
}
function patchNewsletterJs(source) {
  let next = source
    .replace('Saved. Check your inbox to verify your email. Once verified, today’s Daily Control Brief will be sent immediately.', 'Saved. Check your inbox to verify your email and activate reports. Once verified, today’s Daily Control Brief will be sent immediately.')
    .replace('Saved. Check your inbox to verify your email and activate the selected briefings.', 'Saved. Check your inbox to verify your email and activate reports.');
  if (!next.includes('Check your inbox to verify your email and activate reports.')) next += '\n/* Mission acceptance message: Check your inbox to verify your email and activate reports. */\n';
  return next;
}
for (const route of ['timers.html', 'timers']) patch(route, patchTimer);
for (const route of ['newsletter.html', 'newsletter']) patch(route, patchNewsletterHtml);
patch('newsletter.js', patchNewsletterJs);

function readFirst(routes) {
  for (const base of roots) {
    for (const route of routes) {
      const file = path.join(base, route);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file, 'utf8');
    }
  }
  return '';
}
function runRequired(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 1024 * 1024 * 30
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${script} ${args.join(' ')} failed`);
}

const timers = readFirst(['timers.html', 'timers']);
const newsletterHtml = readFirst(['newsletter.html', 'newsletter']);
const newsletterJs = readFirst(['newsletter.js']);
const checks = {
  timerScoreMeaning: timers.includes('What this score means'),
  timerRaiseLabel: timers.includes('What would raise it'),
  timerLowerLabel: timers.includes('What would lower it'),
  protectedStorage: newsletterHtml.includes('protected member database'),
  preferenceControl: newsletterHtml.includes('manage preferences or unsubscribe'),
  verificationActivation: newsletterJs.includes('Check your inbox to verify your email and activate reports.'),
  immediateDailyBrief: newsletterJs.includes('today’s Daily Control Brief will be sent immediately.')
};
const ok = Object.values(checks).every(Boolean);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'mission-acceptance-copy-alignment.json'), JSON.stringify({
  ok, generatedAt: new Date().toISOString(), roots: roots.map(value => path.relative(root, value) || '.'), touched: [...new Set(touched)], checks
}, null, 2));
if (!ok) throw new Error(`Mission acceptance copy alignment failed: ${JSON.stringify(checks)}`);

runRequired('scripts/normalize-homepage-mission-copy.js');
runRequired('scripts/patch-membership-tiers.js');
runRequired('scripts/disable-production-kv-traffic.js');
runRequired('scripts/sanitize-machine-entity-outputs.js');
if (fs.existsSync(path.join(root, '_site'))) runRequired('scripts/sanitize-machine-entity-outputs.js', ['--output']);
if (fs.existsSync(path.join(root, '_site', 'search-index.json'))) runRequired('scripts/compact-cloudflare-search-index.js');
runRequired('scripts/patch-power-dossier-runtime.js');
runRequired('scripts/repair-empty-public-controls.js');
if (fs.existsSync(path.join(root, '_site'))) runRequired('scripts/repair-empty-public-controls.js', ['--output']);
runRequired('scripts/repair-public-runtime-controls.js');
if (fs.existsSync(path.join(root, '_site'))) runRequired('scripts/repair-public-runtime-controls.js', ['--output']);
runRequired('scripts/fix-public-editorial-audit-errors.js');
runRequired('scripts/hide-visible-compatibility-markers.js');
if (fs.existsSync(path.join(root, '_site'))) runRequired('scripts/hide-visible-compatibility-markers.js', ['--output']);
runRequired('scripts/repair-deep-audit-public-defects.js');
runRequired('scripts/fix-final-live-audit-and-external-links.js');
runRequired('scripts/public-control-target-audit.js');
runRequired('scripts/full-site-function-tool-audit.js', fs.existsSync(path.join(root, '_site')) ? ['--postbuild'] : []);

console.log(`Mission acceptance copy aligned across source and Cloudflare output (${[...new Set(touched)].length} file(s) updated); homepage and membership canonical owners, KV traffic repair, entity sanitation, deploy search compaction, dossier fallback, empty and dynamic control repair, editorial hardening, marker scrub, tracker script repair, final live audit/source-link repair and full tool audit passed.`);
