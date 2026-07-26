const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'predators-in-power-conduct-links.json');
const ENGINE_START = '<!-- criminal-conduct-engine:start -->';
const ENGINE_END = '<!-- criminal-conduct-engine:end -->';
const LINK_START = '<!-- predators-in-power-conduct-link:start -->';
const LINK_END = '<!-- predators-in-power-conduct-link:end -->';
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', 'browsertrix-output', 'downloads', 'scripts', 'tools']);
const checked = [];
const changed = [];
const failures = [];

function walkPublicText(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPublicText(full, out);
    else if (entry.isFile() && (/\.html?$/i.test(entry.name) || (!path.extname(entry.name) && entry.size < 5 * 1024 * 1024))) out.push(full);
  }
  return out;
}
function display(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function removeExisting(html) {
  const pattern = /<!-- predators-in-power-conduct-link:start -->[\s\S]*?<!-- predators-in-power-conduct-link:end -->/g;
  return html.replace(pattern, '');
}
function hrefFor(file, base) {
  const target = path.join(base, 'predators-in-power.html');
  const relative = path.relative(path.dirname(file), target).replace(/\\/g, '/');
  return relative || 'predators-in-power.html';
}
function linkBlock(href) {
  return `${LINK_START}<aside class="criminal-conduct-predators-link" style="margin:1rem 0;padding:1rem;border:1px solid rgba(255,80,80,.38);background:rgba(105,0,0,.12)"><h3>Sexual and Child-Harm Accountability</h3><p>Open the separate Predators in Power project for qualifying sexual-offence and child-harm records involving sourced public power or influence roles. The page preserves convictions, pending accusations, investigations, civil findings, responses, dismissals and evidence boundaries in separate legal lanes.</p><p><strong>Boundary:</strong> Inclusion is not a blanket finding of guilt. Charges and investigations are not proof of guilt. Association, office, employment, fame or proximity is not wrongdoing.</p><a class="btn alt" href="${href}">Open Predators in Power</a></aside>${LINK_END}`;
}
function patchFile(file, base) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes(ENGINE_START) || !html.includes(ENGINE_END)) return;
  const route = display(file);
  const start = html.indexOf(ENGINE_START);
  const end = html.indexOf(ENGINE_END, start);
  if (end < 0) {
    failures.push(`${route}: conduct engine end marker missing`);
    return;
  }
  const before = html;
  html = removeExisting(html);
  const refreshedStart = html.indexOf(ENGINE_START);
  const refreshedEnd = html.indexOf(ENGINE_END, refreshedStart);
  const segment = html.slice(refreshedStart, refreshedEnd);
  const closeNeedle = '</div></details></section>';
  const localClose = segment.lastIndexOf(closeNeedle);
  const block = linkBlock(hrefFor(file, base));
  if (localClose >= 0) {
    const insertAt = refreshedStart + localClose;
    html = `${html.slice(0, insertAt)}${block}${html.slice(insertAt)}`;
  } else {
    html = `${html.slice(0, refreshedEnd)}${block}${html.slice(refreshedEnd)}`;
  }
  if (!html.includes(LINK_START) || !html.includes('Open Predators in Power') || !html.includes(hrefFor(file, base))) {
    failures.push(`${route}: Predators in Power link insertion failed`);
    return;
  }
  if (html !== before) {
    fs.writeFileSync(file, html);
    changed.push(route);
  }
  checked.push(route);
}

const bases = [{ label: 'source', dir: root }];
if (fs.existsSync(site)) bases.push({ label: 'built', dir: site });
for (const base of bases) {
  for (const file of walkPublicText(base.dir)) {
    if (base.label === 'source' && file.startsWith(site + path.sep)) continue;
    patchFile(file, base.dir);
  }
}

if (!checked.length) failures.push('No Criminal Conduct & Allegations dropdowns were found for Predators in Power cross-linking');
for (const relative of checked) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    failures.push(`${relative}: checked file is missing`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  if ((html.split(LINK_START).length - 1) !== 1 || (html.split(LINK_END).length - 1) !== 1 || !html.includes('Open Predators in Power')) {
    failures.push(`${relative}: expected exactly one verified Predators in Power conduct link`);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checkedCount: checked.length,
  changedCount: changed.length,
  checked,
  changed,
  failures,
  boundary: 'Every Criminal Conduct & Allegations dropdown links to the separate evidence-gated Predators in Power project. The link does not assert that the dossier subject qualifies for that page or committed wrongdoing.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error('PREDATORS IN POWER CONDUCT LINK PATCH FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Predators in Power linked from ${checked.length} Criminal Conduct & Allegations surface(s); ${changed.length} file(s) updated.`);
