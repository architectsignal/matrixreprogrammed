const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'scripts', 'build-all-branded-download-pdfs.js');
if (!fs.existsSync(file)) throw new Error('scripts/build-all-branded-download-pdfs.js is missing');
let source = fs.readFileSync(file, 'utf8');
const before = source;
const line = "run('wealth-pdf-layout-test.js');";
if (!source.includes(line)) {
  const anchor = "run('build-detailed-wealth-guides.js');";
  if (!source.includes(anchor)) throw new Error('Detailed wealth guide build anchor was not found');
  source = source.replace(anchor, `${anchor}\n${line}`);
}
fs.writeFileSync(file, source);
const report = {
  ok: source.includes("run('build-detailed-wealth-guides.js');\nrun('wealth-pdf-layout-test.js');"),
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  pipeline: 'build detailed guides -> structural layout regression -> restore flagship contract'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'wealth-pdf-layout-wiring.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Wealth PDF layout test was not wired into the complete PDF pipeline');
console.log(`Wealth PDF layout test wiring ${report.changed ? 'applied' : 'already current'}.`);
