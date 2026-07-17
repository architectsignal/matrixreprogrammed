const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];
const failures = [];

function patch(relative, transform) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing build file: ${relative}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(relative);
  }
  return after;
}

const outputSource = patch('scripts/build-cloudflare-output.js', source => {
  let next = source;
  next = next.replace(
    "'browsertrix-output','tools']",
    "'browsertrix-output','tools','templates']"
  );
  if (!next.includes("'data/evidence-integrity-manifest.sigstore.json'")) {
    next = next.replace(
      "'data/evidence-archive-policy.json','data/evidence-archive-manifest.json','data/evidence-integrity-manifest.json','data/evidence-citations.json',",
      "'data/evidence-archive-policy.json','data/evidence-archive-manifest.json','data/evidence-integrity-manifest.json','data/evidence-integrity-manifest.sigstore.json','data/evidence-citations.json',"
    );
  }
  return next;
});

const auditSource = patch('scripts/full-site-function-tool-audit.js', source => source.replace(
  "'source-snapshots', 'browsertrix-output']);",
  "'source-snapshots', 'browsertrix-output', 'templates']);"
));

const publicTemplates = path.join(root, '_site', 'templates');
if (fs.existsSync(publicTemplates)) {
  fs.rmSync(publicTemplates, { recursive: true, force: true });
  changed.push('_site/templates');
}

if (!outputSource.includes("'templates'")) failures.push('Cloudflare output does not block templates');
if (!outputSource.includes("'data/evidence-integrity-manifest.sigstore.json'")) failures.push('Cloudflare output does not require the Sigstore placeholder route');
if (!auditSource.includes("'templates'")) failures.push('full-site audit does not ignore protected templates');
if (fs.existsSync(publicTemplates)) failures.push('_site/templates remains publicly deployable');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  failures,
  boundary: 'Build templates are protected source assets, not public website routes. The pending Sigstore placeholder remains public so the Evidence Archive route is stable.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'protected-build-template-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PROTECTED BUILD TEMPLATE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Protected build templates excluded from public output: ${report.changed.length} change(s).`);
