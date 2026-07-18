const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'scripts', 'build-entity-daily-briefs.js');
const reportPath = path.join(root, 'downloads', 'entity-html-entity-repair.json');
if (!fs.existsSync(target)) throw new Error('scripts/build-entity-daily-briefs.js is missing');

let source = fs.readFileSync(target, 'utf8');
const before = source;
const oldClean = "function clean(value = ''){ return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); }";
const marker = "function decodeHtmlEntities(value = '')";
const replacement = `function decodeHtmlEntities(value = ''){
  const named = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", '#39':"'" };
  let text = String(value ?? '');
  for (let pass = 0; pass < 2; pass++) {
    text = text
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => { const code = Number.parseInt(hex, 16); return Number.isFinite(code) ? String.fromCodePoint(code) : _; })
      .replace(/&#(\\d+);/g, (_, digits) => { const code = Number.parseInt(digits, 10); return Number.isFinite(code) ? String.fromCodePoint(code) : _; })
      .replace(/&(amp|lt|gt|quot|apos|#39);/gi, (match, name) => named[String(name).toLowerCase()] ?? match);
  }
  return text;
}
function clean(value = ''){ return decodeHtmlEntities(value).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); }`;

if (!source.includes(marker)) {
  if (!source.includes(oldClean)) throw new Error('Entity brief clean-function anchor is missing');
  source = source.replace(oldClean, replacement);
}
if (!source.includes(marker) || !source.includes('return decodeHtmlEntities(value)')) throw new Error('Entity HTML entity repair marker is missing');
if (source !== before) fs.writeFileSync(target, source);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  target: 'scripts/build-entity-daily-briefs.js',
  boundary: 'Encoded source text is decoded before safe HTML escaping, preventing literal character references while retaining output escaping.'
}, null, 2)}\n`);
console.log(`Entity HTML entity repair ${source !== before ? 'installed' : 'already current'}.`);
