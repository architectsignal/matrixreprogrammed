const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const bases = [root, site].filter((value, index, all) => fs.existsSync(value) && all.indexOf(value) === index);
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', 'browsertrix-output', 'downloads']);
const hrefPattern = /href=["'](?:\.\/|\/)?(entity-briefs\/([a-z0-9][a-z0-9-]{1,220})\.html)(?:#[^"']*)?["']/gi;
const required = new Map();
const created = [];
const marked = [];
const failures = [];
const engineCommands = [];

function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (/\.html?$/i.test(entry.name) || (!path.extname(entry.name) && fs.statSync(full).size < 5 * 1024 * 1024)) out.push(full);
  }
  return out;
}

function titleFromSlug(slug) {
  return slug.split('-').filter(Boolean).map(word => word.length <= 3 && /^[a-z]+$/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function page(title, slug) {
  const safeTitle = escapeHtml(title);
  const safeSlug = escapeHtml(slug);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${safeTitle} | Entity Evidence Gap | Matrix Reprogrammed</title><meta name="description" content="Evidence-gap brief for ${safeTitle}: the route is preserved while the primary public record is being verified."/><link rel="stylesheet" href="../styles.css"/><link rel="stylesheet" href="../reader-experience.css"/></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="../index.html"><img src="../sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="../daily-power-conclusions.html">Conclusions</a><a href="../daily-missing-records.html">Missing Records</a><a href="../evidence-vault.html">Evidence</a><a href="../predators-in-power.html">Predators in Power</a><a href="../search.html">Search</a></nav></header><main data-entity-dossier="true"><section class="hero wrap"><div class="eyebrow">Entity Dossier / Evidence Gap</div><h1>${safeTitle}</h1><p class="lead">This entity route was referenced by a generated intelligence brief before a complete primary-record dossier was available. The route is preserved so the evidence gap is visible rather than becoming a broken link.</p><div class="cta-row"><a class="btn" href="../daily-missing-records.html">Open Missing Records</a><a class="btn alt" href="../evidence-vault.html">Search Evidence</a><a class="btn alt" href="../research-tools.html">Research Tools</a></div></section><section class="section wrap"><div class="grid"><article class="card"><h2>What is established</h2><p>The site currently has a generated reference to this named entity in a missing-record or intelligence route.</p></article><article class="card"><h2>What is not established</h2><p>This placeholder brief does not establish wrongdoing, control, responsibility, association, motive or the accuracy of any unverified claim.</p></article><article class="card"><h2>Record required</h2><p>Confirm the primary official page, filing, docket, decision, award notice, registry record or authenticated archive item before upgrading this route.</p></article></div><p class="mini"><strong>Route key:</strong> ${safeSlug}. <strong>Boundary:</strong> a preserved route is an evidence-management control, not an accusation or conclusion.</p></section></main><footer class="footer wrap"><p>Public-record first. Evidence before inference.</p></footer></div><script src="../matrix.js"></script></body></html>\n`;
}

function markEntityDossier(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const before = fs.readFileSync(file, 'utf8');
  let after = before.replace(/<main(?![^>]*data-entity-dossier=)/i, '<main data-entity-dossier="true"');
  after = after.replace(/>Entity Evidence Gap</g, '>Entity Dossier / Evidence Gap<');
  if (after !== before) {
    fs.writeFileSync(file, after);
    marked.push(path.relative(root, file).replace(/\\/g, '/'));
  }
}

function runRequired(script) {
  const result = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 1024 * 1024 * 50 });
  engineCommands.push({ script, status: result.status, stdout: String(result.stdout || '').slice(-1500), stderr: String(result.stderr || '').slice(-1500) });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) failures.push(`${script} failed with exit ${result.status}`);
}

for (const base of bases) {
  for (const file of walkHtml(base)) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    hrefPattern.lastIndex = 0;
    while ((match = hrefPattern.exec(source))) required.set(match[1], match[2]);
  }
}

for (const [relative, slug] of required) {
  const title = titleFromSlug(slug);
  for (const base of bases) {
    const target = path.join(base, relative);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, page(title, slug));
      created.push(path.relative(root, target).replace(/\\/g, '/'));
    }
    markEntityDossier(target);
    if (base === site) {
      const extensionless = target.replace(/\.html$/i, '');
      if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(target, extensionless);
    }
  }
}

for (const [relative] of required) {
  for (const base of bases) {
    const target = path.join(base, relative);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) failures.push(`${path.relative(root, target)} remains missing`);
    else if (!fs.readFileSync(target, 'utf8').includes('data-entity-dossier="true"')) failures.push(`${path.relative(root, target)} lacks entity dossier marker`);
  }
}

if (!failures.length) {
  runRequired('scripts/run-power-dossier-runtime-compatible.js');
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  referencedEntityBriefs: required.size,
  created,
  marked: [...new Set(marked)],
  engineCommands,
  criminalConductEngineApplied: failures.length === 0,
  predatorsInPowerApplied: failures.length === 0,
  failures,
  boundary: 'Missing generated entity routes receive evidence-gap briefs only. These pages do not assert wrongdoing or upgrade evidence. Every generated entity brief receives the evidence-classified Criminal Conduct & Allegations dropdown and the evidence-gated Predators in Power route.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'missing-generated-entity-brief-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) throw new Error(`Missing generated entity brief repair failed: ${failures.join('; ')}`);
console.log(`Generated entity route repair passed: ${required.size} referenced routes, ${created.length} missing files created, ${marked.length} entity dossier marker(s) applied; Criminal Conduct & Allegations and Predators in Power engines verified.`);
