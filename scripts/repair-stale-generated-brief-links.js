const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', '_site', 'scripts', 'tools', 'evidence-archive', 'source-snapshots', 'browsertrix-output']);
const changes = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function display(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function labelFromSlug(slug) {
  return String(slug || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function targetExists(namespace, id) {
  return fs.existsSync(path.join(root, namespace, `${id}.html`));
}

function repair(file) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  let fixes = 0;

  after = after.replace(/href=(['"])((?:\.\.\/)*)entity-briefs\/([^'"?#]+)\.html(?:\?[^'"]*)?\1/gi, (match, quote, prefix, id) => {
    if (targetExists('entity-briefs', id)) return match;
    fixes += 1;
    return `href=${quote}${prefix}search.html?q=${encodeURIComponent(labelFromSlug(id))}${quote}`;
  });

  after = after.replace(/href=(['"])((?:\.\.\/)*)entity-exposure\/([^'"?#]+)\.html(?:\?[^'"]*)?\1/gi, (match, quote, prefix, id) => {
    if (targetExists('entity-exposure', id)) return match;
    fixes += 1;
    return `href=${quote}${prefix}search.html?q=${encodeURIComponent(labelFromSlug(id))}${quote}`;
  });

  after = after.replace(/href=(['"])((?:\.\.\/)*)reports\/([^'"?#]+)\.html(?:\?[^'"]*)?\1/gi, (match, quote, prefix, id) => {
    if (targetExists('reports', id)) return match;
    fixes += 1;
    return `href=${quote}${prefix}elite-reports.html${quote}`;
  });

  if (after !== before) {
    fs.writeFileSync(file, after);
    changes.push({ file: display(file), fixes });
  }
}

for (const file of walk(root)) repair(file);

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  filesChanged: changes.length,
  fixes: changes.reduce((sum, item) => sum + item.fixes, 0),
  changes,
  boundary: 'Only links to generated entity briefs, exposure pages and elite reports are changed, and only when the current generated target does not exist. Missing entity routes fall back to the public search; missing report routes fall back to the reports hub.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'stale-generated-brief-link-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Stale generated brief link repair complete: ${report.fixes} link(s) in ${report.filesChanged} file(s).`);
