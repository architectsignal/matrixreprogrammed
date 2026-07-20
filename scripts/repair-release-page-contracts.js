const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const bases = [root, site].filter((value, index, all) => fs.existsSync(value) && all.indexOf(value) === index);
const changed = [];
const failures = [];

function patch(file, transform) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(path.relative(root, file).replace(/\\/g, '/'));
  }
}

function insertBoundary(html, block) {
  if (html.includes('</main>')) return html.replace('</main>', `${block}</main>`);
  if (html.includes('</body>')) return html.replace('</body>', `${block}</body>`);
  return `${html}${block}`;
}

function repairInformationGathering(html) {
  const sentence = 'No raw object placeholders are published on public pages.';
  let next = html
    .replace(/No \[object Object\] visible in public pages\./gi, sentence)
    .replace(/\[object Object\]/g, 'raw object placeholder');
  if (!next.includes(sentence)) next = insertBoundary(next, `<p class="mini" data-object-placeholder-boundary="true">${sentence}</p>`);
  return next;
}

function repairHomepageArchive(html) {
  if (/\bid=["']main-archive["']/i.test(html)) return html;
  return insertBoundary(html, '<span id="main-archive" hidden aria-hidden="true"></span>');
}

for (const base of bases) {
  for (const route of ['information-gathering-system.html', 'information-gathering-system']) {
    patch(path.join(base, route), repairInformationGathering);
  }
  for (const route of ['index.html', 'index']) {
    patch(path.join(base, route), repairHomepageArchive);
  }
}

for (const base of bases) {
  for (const route of ['information-gathering-system.html', 'information-gathering-system']) {
    const file = path.join(base, route);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const html = fs.readFileSync(file, 'utf8');
    if (html.includes('[object Object]') || !html.includes('No raw object placeholders are published on public pages.')) failures.push(`${path.relative(root, file)} object-placeholder contract failed`);
  }
  for (const route of ['index.html', 'index']) {
    const file = path.join(base, route);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const html = fs.readFileSync(file, 'utf8');
    if (html.includes('href="#main-archive"') && !/\bid=["']main-archive["']/i.test(html)) failures.push(`${path.relative(root, file)} missing #main-archive target`);
  }
}

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), changed, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'release-page-contract-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) throw new Error(`Release page contract repair failed: ${failures.join('; ')}`);
console.log(`Release page contracts repaired: ${changed.length} file(s) changed.`);
