const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const bases = [root, site].filter((value, index, all) => fs.existsSync(value) && all.indexOf(value) === index);
const START = '<!-- predators-in-power-conduct-link:start -->';
const END = '<!-- predators-in-power-conduct-link:end -->';
const reportPath = path.join(root, 'downloads', 'predators-in-power-conduct-links.json');
const changed = [];
const checked = [];
const failures = [];
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', 'browsertrix-output', 'downloads', 'scripts', 'tools']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if ((/\.html?$/i.test(entry.name) || (!path.extname(entry.name) && fs.statSync(full).size < 8 * 1024 * 1024)) && fs.statSync(full).isFile()) out.push(full);
  }
  return out;
}
function removeExisting(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start >= 0 && end > start) return html.slice(0, start) + html.slice(end + END.length);
  return html;
}
function relativeHref(base, file) {
  const target = path.join(base, 'predators-in-power.html');
  const href = path.relative(path.dirname(file), target).replace(/\\/g, '/');
  return href || 'predators-in-power.html';
}

for (const base of bases) {
  for (const file of walk(base)) {
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes('<!-- criminal-conduct-engine:start -->')) continue;
    const relative = path.relative(base, file).replace(/\\/g, '/');
    const href = relativeHref(base, file);
    const block = `${START}<div class="criminal-conduct-predators-route"><h3>Predators in Power</h3><p>Open the separate evidence-classified index for sexual-offence and child-harm records involving people with documented public, corporate, institutional or cultural power.</p><div class="cta-row small"><a class="btn" href="${href}">Open Predators in Power</a><a class="btn alt" href="${href}#pip-signal-drop">Submit Evidence</a></div></div>${END}`;
    const clean = removeExisting(html);
    if (!clean.includes('<details class="criminal-conduct-rules">')) {
      failures.push(`${path.relative(root, file)} missing criminal-conduct rules insertion point`);
      continue;
    }
    const output = clean.replace('<details class="criminal-conduct-rules">', `${block}<details class="criminal-conduct-rules">`);
    if (output !== html) {
      fs.writeFileSync(file, output);
      changed.push(path.relative(root, file).replace(/\\/g, '/'));
    }
    const verified = fs.readFileSync(file, 'utf8');
    checked.push(path.relative(root, file).replace(/\\/g, '/'));
    if ((verified.split(START).length - 1) !== 1 || !verified.includes(`href="${href}"`) || !verified.includes('Open Predators in Power')) failures.push(`${path.relative(root, file)} failed Predators in Power conduct-link verification`);
  }
}
if (!checked.length) failures.push('No Criminal Conduct & Allegations surfaces were found for Predators in Power linking');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checkedCount: checked.length,
  changedCount: changed.length,
  checked,
  changed,
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PREDATORS IN POWER CONDUCT LINK FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Predators in Power linked from ${checked.length} Criminal Conduct & Allegations surface(s); ${changed.length} file(s) updated.`);
