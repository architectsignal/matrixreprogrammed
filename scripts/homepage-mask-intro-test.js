const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
function fail(message) { failures.push(message); }
function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { fail(`missing ${rel}`); return ''; }
  return fs.readFileSync(file, 'utf8');
}
function count(text, token) { return String(text).split(token).length - 1; }

const image = read('assets/homepage-mask.svg');
if (image.length < 5000) fail(`mask SVG is unexpectedly small: ${image.length} characters`);
if (!image.startsWith('<svg') && !image.startsWith('<?xml')) fail('mask asset is not SVG');
if (!image.includes('viewBox="0 0 900 1100"')) fail('mask SVG does not expose the intended scalable dimensions');
if (/<rect[^>]+(?:fill="#(?:000|000000)"|fill="black")/i.test(image)) fail('mask SVG includes a black background rectangle instead of transparency');
if (!image.includes('filter id="surface"')) fail('mask SVG is missing engraved surface detail');
if (!image.includes('filter id="shadow"')) fail('mask SVG is missing dimensional shadow treatment');
if (count(image, '<path') < 20) fail('mask SVG does not contain enough vector detail');
if (!image.includes('Ivory anonymous mask')) fail('mask SVG title is missing');

const html = read('index.html');
const css = read('homepage-mask-intro.css');
const js = read('homepage-mask-intro.js');
for (const [token, expected] of [
  ['data-homepage-mask-intro aria-label', 1],
  ['data-homepage-mask-intro-style', 1],
  ['data-homepage-mask-preload', 1],
  ['data-homepage-mask-intro-runtime', 1],
  ['data-mask-intro-skip', 1]
]) {
  const actual = count(html, token);
  if (actual !== expected) fail(`expected ${expected} occurrence(s) of ${token}, found ${actual}`);
}
if (!html.includes('assets/homepage-mask.svg')) fail('homepage does not render the SVG mask asset');
if (!html.includes('type="image/svg+xml"')) fail('homepage does not preload the mask as SVG');
if (!js.includes('sessionStorage')) fail('intro is not limited to one display per session');
if (!js.includes('3600')) fail('intro hold duration is not 3.6 seconds');
if (!js.includes('1200')) fail('intro dissolve duration is not 1.2 seconds');
if (!js.includes('asset-error')) fail('intro has no image-load failure escape');
if (!js.includes('Escape')) fail('intro has no keyboard escape path');
if (!css.includes('@media(prefers-reduced-motion:reduce)')) fail('reduced-motion fallback is missing');
if (!css.includes('mask-intro-dissolve')) fail('dissolve animation is missing');
if (!css.includes('z-index:2147483000')) fail('intro overlay is not guaranteed above the existing welcome gate');

for (const rel of ['homepage-mask-intro.js', 'scripts/patch-homepage-mask-intro.js', 'scripts/patch-membership-tiers.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${rel} syntax check failed: ${String(result.stderr || result.stdout).trim()}`);
}

const membership = read('membership.html');
for (const price of ['€3', '€6', '€9']) if (!membership.includes(price)) fail(`membership page missing ${price}`);
for (const legacy of ['€19/month', '€49/month']) if (membership.includes(legacy)) fail(`membership page still contains ${legacy}`);
if (!membership.includes('Everything in Supporter')) fail('Intelligence Member is not explicitly cumulative');
if (!membership.includes('Everything in Intelligence Member and Supporter')) fail('Research Pro is not explicitly cumulative');
if (count(membership, 'Coming soon — no payment taken') !== 3) fail('all three membership buttons must remain disabled and truthful');
if (!membership.includes('WHAT EACH LEVEL OPENS.')) fail('membership comparison table is missing');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  maskCharacters: image.length,
  vectorPaths: count(image, '<path'),
  transparentBackground: !/<rect[^>]+(?:fill="#(?:000|000000)"|fill="black")/i.test(image),
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-mask-intro-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(item => console.error(`RELEASE UI FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Homepage mask and membership release test passed (${report.vectorPaths} vector paths, ${image.length} characters).`);
