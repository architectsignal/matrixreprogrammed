'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const START = '<!-- exposure-predators-hit-list:start -->';
const END = '<!-- exposure-predators-hit-list:end -->';
const reportPath = path.join(root, 'downloads', 'exposure-predators-hit-list-link.json');
const targets = ['predators-in-power.html', 'predators-in-power'];
const touched = [];
const failures = [];

function removeExisting(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start >= 0 && end > start) return html.slice(0, start) + html.slice(end + END.length);
  return html;
}

function patchHtml(html) {
  let next = removeExisting(html);
  const csvCta = '<a class="btn alt" href="downloads/predators-in-power.csv">Download CSV</a>';
  const hitCta = '<a class="btn alt" href="/hit-list.html">Open Investigative Hit List</a>';
  if (!next.includes('href="/hit-list.html"')) {
    if (next.includes(csvCta)) next = next.replace(csvCta, `${csvCta}${hitCta}`);
  }
  const block = `${START}<section class="section wrap"><article class="card redline"><span class="label">Connected Exposure Integrity System</span><h2>From safeguarding record to the wider power map</h2><p>Open the cinematic Hit List to see what is documented, what is alleged, what remains unproven, which power mechanism matters, which records are missing and where the investigation goes next.</p><div class="cta-row"><a class="btn" href="/hit-list.html">Open the Hit List</a><a class="btn alt" href="/timers.html">Follow Risk Timers</a><a class="btn alt" href="/source-document-vault.html">Verify Sources</a><a class="btn alt" href="/trust-corrections.html">Corrections and Right of Reply</a></div></article></section>${END}`;
  const boundaryAnchor = '<section class="section wrap"><div class="pip-boundary-box">';
  if (next.includes(boundaryAnchor)) next = next.replace(boundaryAnchor, `${block}${boundaryAnchor}`);
  else if (next.includes('</main>')) next = next.replace('</main>', `${block}</main>`);
  return next;
}

for (const base of [root, outputRoot]) {
  if (base === outputRoot && !fs.existsSync(outputRoot)) continue;
  for (const relative of targets) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = patchHtml(before);
    const markerCount = (after.match(/exposure-predators-hit-list:start/g) || []).length;
    const valid = markerCount === 1
      && after.includes('href="/hit-list.html"')
      && after.includes('Connected Exposure Integrity System')
      && after.includes('Corrections and Right of Reply');
    if (!valid) {
      failures.push(`${path.relative(root, file)} could not be linked to the Hit List`);
      continue;
    }
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}

if (!targets.some(relative => fs.existsSync(path.join(root, relative)))) failures.push('Predators in Power source route is missing');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  touched,
  requiredRoute: '/hit-list.html',
  connectedRoutes: ['/hit-list.html', '/timers.html', '/source-document-vault.html', '/trust-corrections.html'],
  failures,
  boundary: 'The Hit List is an investigative-priority and navigation surface, not a guilt score or threat list. Predators in Power retains its separate legal and evidence lanes.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(outputRoot)) {
  const out = path.join(outputRoot, 'downloads', path.basename(reportPath));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(reportPath, out);
}
if (!report.ok) throw new Error(`Predators in Power Hit List linking failed: ${failures.join('; ')}`);
console.log(`Predators in Power Hit List route verified across ${touched.length} changed file(s).`);
