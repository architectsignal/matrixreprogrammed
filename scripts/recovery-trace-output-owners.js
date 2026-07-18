const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  'daily-missing-records.html',
  'entity-timelines/object-object.html',
  'information-gathering-system.html',
  'institution-briefs/world-bank.html',
  'machine-digest.html',
  'reports/subject-banking-and-payment-rails.html',
  'site-freshness-report.html',
  'subject-briefs/banking-payment-rails.html',
  'subject-briefs/public-health-data.html'
];
const searchRoots = ['scripts', 'src', '.github/workflows'];
const extensions = new Set(['.js', '.mjs', '.cjs', '.yml', '.yaml', '.json']);
function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}
function relative(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function lineMatches(file, needles) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const output = [];
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    if (needles.some(needle => lower.includes(needle.toLowerCase()))) {
      output.push({ line: index + 1, text: line.trim().slice(0, 500) });
    }
  });
  return output;
}

const files = searchRoots.flatMap(directory => walk(path.join(root, directory)));
const owners = {};
for (const target of targets) {
  const base = path.basename(target);
  const stem = base.replace(/\.html$/i, '');
  const needles = [target, base, stem];
  owners[target] = files.map(file => {
    const matches = lineMatches(file, needles);
    return matches.length ? { file: relative(file), matches } : null;
  }).filter(Boolean);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  targets,
  owners,
  unresolved: targets.filter(target => !owners[target].length)
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'recovery-output-owner-trace.json'), `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  '# Recovery Output Owner Trace',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  ...targets.flatMap(target => [
    `## ${target}`,
    '',
    ...(owners[target].length
      ? owners[target].flatMap(owner => [`- **${owner.file}**`, ...owner.matches.map(match => `  - L${match.line}: \`${match.text.replace(/`/g, '\\`')}\``)])
      : ['- No direct owner reference found.']),
    ''
  ])
].join('\n');
fs.writeFileSync(path.join(root, 'downloads', 'recovery-output-owner-trace.md'), `${markdown}\n`);
console.log(`Recovery output ownership traced for ${targets.length} targets; ${report.unresolved.length} unresolved.`);
