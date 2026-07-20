const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'scripts', 'build-detailed-wealth-guides.js');
if (!fs.existsSync(file)) throw new Error('scripts/build-detailed-wealth-guides.js is missing');

const before = fs.readFileSync(file, 'utf8');
let repaired = 0;
const after = before.split('\n').map(line => {
  const trimmed = line.trim();
  // A plain array line may contain one or more quoted text items. It must not
  // end with a function-closing parenthesis. Do not touch S(...), C(...), N(...)
  // or ordinary JavaScript calls because those lines do not begin with a quote.
  if (trimmed.startsWith("'") && /'\)(,)?$/.test(trimmed)) {
    repaired += 1;
    return line.replace(/\)(,)?\s*$/, '$1');
  }
  return line;
}).join('\n');

if (after !== before) fs.writeFileSync(file, after);
const remaining = after.split('\n').filter(line => {
  const trimmed = line.trim();
  return trimmed.startsWith("'") && /'\)(,)?$/.test(trimmed);
});

const report = {
  ok: remaining.length === 0,
  generatedAt: new Date().toISOString(),
  repaired,
  remaining
};
fs.mkdirSync(path.join(process.cwd(), 'downloads'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'downloads', 'detailed-wealth-guide-builder-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Malformed plain-text array lines remain: ${remaining.length}`);
console.log(`Detailed wealth guide builder syntax repair complete: ${repaired} malformed line(s) repaired.`);
