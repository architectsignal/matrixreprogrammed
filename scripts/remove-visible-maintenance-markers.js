const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignored = new Set(['.git', '.github', '.wrangler', 'node_modules', '_site', 'scripts', 'tools', 'downloads', 'data', 'browsertrix-output', 'source-snapshots', 'templates']);
const exact = new Map([
  ['new-intelligence-toolspreservedaftervisiblede-duplication', 'Investigation tools'],
  ['AuthorityHubroutepreservedaftervisiblede-duplication', 'Authority Hub'],
  ['SchemaIndexroutepreservedaftervisiblede-duplication', 'Schema Index'],
  ['FeedCenterroutepreservedaftervisiblede-duplication', 'Feed Center'],
  ['ShareCenterroutepreservedaftervisiblede-duplication', 'Share Center'],
  ['LaunchRoomroutepreservedaftervisiblede-duplication', 'Launch Room'],
  ['OfferCenterroutepreservedaftervisiblede-duplication', 'Offer Center'],
  ['DailyDroproutepreservedaftervisiblede-duplication', 'Daily Drop'],
  ['Evidencebadgeroutepreservedaftervisiblede-duplication', 'Evidence badge'],
  ['SourceDocumentVaultroutepreservedaftervisiblede-duplication', 'Source Document Vault'],
  ['reader-usefulness-routepreservedaftervisiblede-duplication', 'reader usefulness route'],
  ['figure-source-statuspreservedaftervisiblede-duplication', 'figure source status']
]);

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.isFile() && entry.name.endsWith('.html')) output.push(full);
  }
  return output;
}

let changed = 0;
const files = [];
for (const file of walk(root)) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [marker, replacement] of exact) after = after.split(marker).join(replacement);
  after = after
    .replace(/\b(?:route\s+)?preserved\s+after\s+visible\s+de-?duplication\b/gi, 'available in the investigation system')
    .replace(/\bpreservedaftervisiblede-?duplication\b/gi, 'available');
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
    files.push(path.relative(root, file).split(path.sep).join('/'));
  }
}
const report = { ok: true, generatedAt: new Date().toISOString(), changed, files };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'maintenance-marker-removal.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Visible maintenance marker removal complete: ${changed} HTML file(s) changed.`);
