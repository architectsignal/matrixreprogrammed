const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'entity-html-entity-repair.json');
const decoder = `function decodeHtmlEntities(value = ''){
  const named = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", '#39':"'" };
  let text = String(value ?? '');
  for (let pass = 0; pass < 2; pass++) {
    text = text
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => { const code = Number.parseInt(hex, 16); return Number.isFinite(code) ? String.fromCodePoint(code) : _; })
      .replace(/&#(\\d+);/g, (_, digits) => { const code = Number.parseInt(digits, 10); return Number.isFinite(code) ? String.fromCodePoint(code) : _; })
      .replace(/&(amp|lt|gt|quot|apos|#39);/gi, (match, name) => named[String(name).toLowerCase()] ?? match);
  }
  return text;
}`;

function patchEntityBriefGenerator() {
  const target = path.join(root, 'scripts', 'build-entity-daily-briefs.js');
  if (!fs.existsSync(target)) throw new Error('scripts/build-entity-daily-briefs.js is missing');
  let source = fs.readFileSync(target, 'utf8');
  const before = source;
  const oldClean = "function clean(value = ''){ return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); }";
  const replacement = `${decoder}\nfunction clean(value = ''){ return decodeHtmlEntities(value).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); }`;
  if (!source.includes("function decodeHtmlEntities(value = '')")) {
    if (!source.includes(oldClean)) throw new Error('Entity brief clean-function anchor is missing');
    source = source.replace(oldClean, replacement);
  }
  if (!source.includes('return decodeHtmlEntities(value)')) throw new Error('Entity brief decoder marker is missing');
  if (source !== before) fs.writeFileSync(target, source);
  return source !== before;
}

function patchMissionLensGenerator() {
  const target = path.join(root, 'scripts', 'build-mission-brief-conclusions.js');
  if (!fs.existsSync(target)) throw new Error('scripts/build-mission-brief-conclusions.js is missing');
  let source = fs.readFileSync(target, 'utf8');
  const before = source;
  const oldClean = "const clean = (value, max = 4000) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, max);";
  const replacement = `${decoder}\nconst clean = (value, max = 4000) => decodeHtmlEntities(value).replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, max);`;
  if (!source.includes("function decodeHtmlEntities(value = '')")) {
    if (!source.includes(oldClean)) throw new Error('Mission Lens clean-function anchor is missing');
    source = source.replace(oldClean, replacement);
  }
  if (!source.includes('const clean = (value, max = 4000) => decodeHtmlEntities(value)')) throw new Error('Mission Lens decoder marker is missing');
  if (source !== before) fs.writeFileSync(target, source);
  return source !== before;
}

const changes = {
  entityBriefGenerator: patchEntityBriefGenerator(),
  missionLensGenerator: patchMissionLensGenerator()
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changes,
  targets: ['scripts/build-entity-daily-briefs.js', 'scripts/build-mission-brief-conclusions.js'],
  boundary: 'Encoded source text and extracted HTML headings are decoded before safe HTML escaping, preventing literal character references while retaining output escaping.'
}, null, 2)}\n`);
console.log(`Entity and Mission Lens HTML entity repair complete: ${Object.values(changes).filter(Boolean).length} generator(s) changed.`);
