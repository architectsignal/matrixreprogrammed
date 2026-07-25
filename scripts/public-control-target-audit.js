const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();

// The Power-Family Capstone is a final-release-owned public control surface.
// Rebuild and synchronize it after all broad generators, immediately before
// the final control audit, so production cannot package the retired Capstone.
const powerFamilyBuild = spawnSync(process.execPath, [path.join(root, 'scripts/build-power-family-intelligence-layer.js')], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 1024 * 1024 * 20
});
if (powerFamilyBuild.stdout) process.stdout.write(powerFamilyBuild.stdout);
if (powerFamilyBuild.stderr) process.stderr.write(powerFamilyBuild.stderr);
if (powerFamilyBuild.status !== 0) throw new Error('Power-Family Intelligence Layer final release synchronization failed.');

const base = fs.existsSync(path.join(root, '_site')) ? path.join(root, '_site') : root;
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'evidence-archive', 'source-snapshots']);
const problems = [];
const warnings = [];
let pages = 0;
let controls = 0;

function rel(file) { return path.relative(base, file).replace(/\\/g, '/'); }
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html') || !path.extname(entry.name)) out.push(full);
  }
  return out;
}
function isHiddenTag(tag) {
  return /\bhidden\b/i.test(tag) || /\binternal-only\b/i.test(tag) || /data-internal-only=["']true["']/i.test(tag);
}
function isIndividualPowerDossier(html) {
  return /Loading dossier/i.test(html)
    && /data\/power-dossiers\.json/i.test(html)
    && /\bid=["']name["']/i.test(html)
    && /\bid=["']content["']/i.test(html);
}

for (const file of walk(base)) {
  let html = '';
  try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (!/<html\b/i.test(html)) continue;
  pages++;
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    if (isHiddenTag(tag)) continue;
    controls++;
    const href = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    const visibleControl = /\bclass\s*=\s*(["'])[^"']*\bbtn\b[^"']*\1/i.test(tag) || /\brole\s*=\s*(["'])button\1/i.test(tag);
    if (visibleControl && (href == null || !href.trim() || href.trim() === '#')) problems.push(`${rel(file)}: visible link/button has no destination: ${tag.slice(0, 180)}`);
    else if (href != null && /^javascript:\s*void\s*\(0\)/i.test(href)) warnings.push(`${rel(file)}: JavaScript-only link should be a button: ${tag.slice(0, 180)}`);
  }
  for (const match of html.matchAll(/<button\b[^>]*>/gi)) {
    const tag = match[0];
    if (isHiddenTag(tag)) continue;
    controls++;
    if (/\bdisabled\b/i.test(tag)) continue;
    const type = tag.match(/\btype\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase() || 'submit';
    if (type === 'button') {
      const id = tag.match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2];
      const hook = tag.match(/\bdata-[a-z0-9_-]+(?:\s*=\s*(["']).*?\1)?/i)?.[0];
      if (!id && !hook && !/onclick\s*=/i.test(tag)) warnings.push(`${rel(file)}: type=button has no visible script hook: ${tag.slice(0, 180)}`);
    }
  }
  if (isIndividualPowerDossier(html) && !/power-dossier-runtime\.js/i.test(html)) problems.push(`${rel(file)}: dossier can remain stuck in loading state without resilient runtime`);
}

const requiredPowerFamilyAssets = [
  'behind-the-curtain-capstone.html',
  'power-family-intelligence-layer.css',
  'power-family-intelligence-layer.js',
  'data/power-family-intelligence-layer.json'
];
for (const relative of requiredPowerFamilyAssets) {
  const file = path.join(base, relative);
  if (!fs.existsSync(file)) problems.push(`${relative}: Power-Family release asset is missing`);
}
if (fs.existsSync(path.join(base, 'behind-the-curtain-capstone.html'))) {
  const capstone = fs.readFileSync(path.join(base, 'behind-the-curtain-capstone.html'), 'utf8');
  for (const marker of ['POWER-FAMILY INTELLIGENCE LAYER', 'id="current-map"', 'id="directory"', 'id="claims"', 'id="questions"']) {
    if (!capstone.includes(marker)) problems.push(`behind-the-curtain-capstone.html: missing canonical marker ${marker}`);
  }
  if (/BLOODLINES · SYMBOLS · THE UNRESOLVED APEX/i.test(capstone)) problems.push('behind-the-curtain-capstone.html: retired symbolic-only Capstone was restored');
}

const report = {
  ok: problems.length === 0,
  generatedAt: new Date().toISOString(),
  base: path.relative(root, base) || '.',
  pages,
  controls,
  powerFamilyReleaseSynchronized: true,
  problems,
  warnings
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'public-control-target-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
if (problems.length) {
  console.error(`PUBLIC CONTROL TARGET AUDIT FAILED: ${problems.length} broken control(s).`);
  problems.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`PUBLIC CONTROL TARGET AUDIT PASSED: ${pages} pages and ${controls} visible controls checked. Power-Family Capstone synchronized. Warnings: ${warnings.length}.`);
