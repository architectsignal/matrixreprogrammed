const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'evidence-archive', 'source-snapshots', 'browsertrix-output']);
const changes = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html') || !path.extname(entry.name)) out.push(full);
  }
  return out;
}

function display(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function labelFromSlug(slug) {
  return String(slug || '').replace(/-mapmdref$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function targetExists(namespace, id) {
  const candidates = [
    path.join(root, namespace, `${id}.html`),
    path.join(root, '_site', namespace, `${id}.html`),
    path.join(root, '_site', namespace, id)
  ];
  return candidates.some(file => fs.existsSync(file));
}

function repair(file) {
  let before;
  try { before = fs.readFileSync(file, 'utf8'); } catch { return; }
  if (!/<(?:html|a)\b/i.test(before)) return;
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

const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
for (const base of roots) {
  for (const file of walk(base)) {
    if (base === root && display(file).startsWith('_site/')) continue;
    repair(file);
  }
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  roots: roots.map(value => path.relative(root, value) || '.'),
  filesChanged: changes.length,
  fixes: changes.reduce((sum, item) => sum + item.fixes, 0),
  changes,
  boundary: 'Only links to generated entity briefs, exposure pages and elite reports are changed, and only when the current generated target does not exist. Missing entity routes fall back to the public search; missing report routes fall back to the reports hub. Both source pages and the exact Cloudflare output are repaired.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'stale-generated-brief-link-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Stale generated brief link repair complete: ${report.fixes} link(s) in ${report.filesChanged} source/output file(s).`);
