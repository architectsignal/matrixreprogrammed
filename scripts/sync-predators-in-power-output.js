const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'predators-in-power-output-sync.json');
const copied = [];
const failures = [];

const required = [
  'predators-in-power.html',
  'data/predators-in-power.json',
  'data/predators-in-power-policy.json',
  'data/criminal-conduct-registry.json',
  'downloads/predators-in-power.json',
  'downloads/predators-in-power.csv',
  'downloads/predators-in-power-build-report.json',
  'downloads/criminal-conduct-engine-report.json',
  'downloads/criminal-conduct-review-queue.json',
  'downloads/criminal-conduct-engine-pressure-test.json'
];
const linkedPages = ['index.html', 'wrongdoing-tracker.html', 'evidence-vault.html', 'subject-index.html'];

function copy(relative, extensionless = false) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    failures.push(`source missing: ${relative}`);
    return;
  }
  if (!fs.existsSync(site)) return;
  const destination = path.join(site, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  copied.push(relative);
  if (extensionless && relative.endsWith('.html')) {
    const alias = destination.replace(/\.html$/i, '');
    if (fs.existsSync(alias) && fs.statSync(alias).isDirectory()) failures.push(`cannot write extensionless alias over directory: ${path.relative(root, alias)}`);
    else {
      fs.copyFileSync(source, alias);
      copied.push(relative.replace(/\.html$/i, ''));
    }
  }
}

for (const relative of required) copy(relative, relative === 'predators-in-power.html');
for (const relative of linkedPages) {
  if (!fs.existsSync(path.join(root, relative))) continue;
  copy(relative, true);
}

if (fs.existsSync(site)) {
  for (const route of ['predators-in-power.html', 'predators-in-power']) {
    const file = path.join(site, route);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) failures.push(`built route missing: ${route}`);
    else {
      const html = fs.readFileSync(file, 'utf8');
      for (const marker of ['PREDATORS IN POWER.', 'id="pip-index"', 'id="pip-signal-drop"', 'Read the legal lane before the name']) {
        if (!html.includes(marker)) failures.push(`${route} missing ${marker}`);
      }
    }
  }
  for (const relative of linkedPages) {
    const htmlFile = path.join(site, relative);
    if (!fs.existsSync(htmlFile)) continue;
    const html = fs.readFileSync(htmlFile, 'utf8');
    if (!html.includes('<!-- predators-in-power-route:start -->') || !html.includes('href="predators-in-power.html"')) failures.push(`${relative} missing Predators in Power route`);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  outputPresent: fs.existsSync(site),
  copied: [...new Set(copied)],
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PREDATORS IN POWER OUTPUT SYNC FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Predators in Power output synchronized: ${report.copied.length} file/alias copy operation(s).`);
