const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputOnly = process.argv.includes('--output');
const base = outputOnly && fs.existsSync(path.join(root, '_site')) ? path.join(root, '_site') : root;
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'evidence-archive', 'source-snapshots', 'browsertrix-output']);
if (base === root) ignored.add('_site');
const changed = [];
const unresolved = [];

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
function plain(value) { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function isHidden(tag) { return /\bhidden\b/i.test(tag) || /\binternal-only\b/i.test(tag) || /data-internal-only=["']true["']/i.test(tag); }
function isDossierExportContext(html, file) {
  const pageName = path.basename(file).toLowerCase();
  return /phase-fourteen-dossier-pack-engine|dossier pack \/ download center|signal board resource|forum posts|persistent cloudflare (?:kv|d1)|subject-filtered forum exports/i.test(html)
    || /^(?:black-file|download-center|dossier-pack-)/i.test(pageName);
}

for (const file of walk(base)) {
  let html = '';
  try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const before = html;
  html = html.replace(/<a\b([^>]*?)\bhref\s*=\s*(["'])\s*\2([^>]*)>([\s\S]*?)<\/a>/gi, (full, left, quote, right, body) => {
    if (isHidden(full)) return full;
    const visibleLabel = plain(body);
    const label = visibleLabel.toLowerCase();
    const tag = `${left} ${right}`;
    const machineOrForumLabel = /^(machine-readable data|forum posts json|forum posts export)$/i.test(visibleLabel);
    const genericSourceLabel = /^(source file|source export)$/i.test(visibleLabel);
    const dossierContext = isDossierExportContext(html, file);

    if ((machineOrForumLabel && (dossierContext || /machine-data-link/i.test(tag))) || (genericSourceLabel && dossierContext)) {
      const repairedLabel = genericSourceLabel ? 'Forum Posts Export' : body;
      return `<a${left}href=${quote}downloads/forum-posts.json${quote}${right}>${repairedLabel}</a>`;
    }

    unresolved.push(`${path.relative(root, file).replace(/\\/g, '/')}: ${visibleLabel || '(no label)'}`);
    return full;
  });
  if (html !== before) {
    fs.writeFileSync(file, html);
    changed.push(path.relative(root, file).replace(/\\/g, '/'));
  }
}

require('./restore-premier-resource-routes.js');

const report = {
  ok: unresolved.length === 0,
  generatedAt: new Date().toISOString(),
  mode: outputOnly ? 'cloudflare-output' : 'source-tree',
  changed,
  unresolved,
  repairedRoute: 'downloads/forum-posts.json',
  boundary: 'Only empty controls in an explicit dossier/forum-export context are repaired automatically. Unknown empty links still fail the build.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', outputOnly ? 'empty-public-controls-output.json' : 'empty-public-controls.json'), `${JSON.stringify(report, null, 2)}\n`);
if (unresolved.length) {
  console.error(`EMPTY PUBLIC CONTROL REPAIR FAILED: ${unresolved.length} unresolved visible empty link(s).`);
  unresolved.slice(0, 100).forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Empty public controls repaired (${report.mode}): ${changed.length} file(s) changed.`);
