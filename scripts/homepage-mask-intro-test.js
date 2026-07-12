const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
function fail(message) { failures.push(message); }
function read(rel, encoding = 'utf8') {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { fail(`missing ${rel}`); return encoding === 'utf8' ? '' : Buffer.alloc(0); }
  return fs.readFileSync(file, encoding);
}
function count(text, token) { return String(text).split(token).length - 1; }

const image = read('assets/homepage-mask.webp', null);
if (image.length < 10000) fail(`mask asset is unexpectedly small: ${image.length} bytes`);
if (image.slice(0, 4).toString('ascii') !== 'RIFF' || image.slice(8, 12).toString('ascii') !== 'WEBP') fail('mask asset is not a valid WebP RIFF container');
let dimensions = null;
const vp8x = image.indexOf(Buffer.from('VP8X'));
if (vp8x >= 0 && image.length >= vp8x + 18) {
  const flags = image[vp8x + 8];
  const width = 1 + image[vp8x + 12] + (image[vp8x + 13] << 8) + (image[vp8x + 14] << 16);
  const height = 1 + image[vp8x + 15] + (image[vp8x + 16] << 8) + (image[vp8x + 17] << 16);
  dimensions = { width, height, alpha: Boolean(flags & 0x10) };
  if (!dimensions.alpha) fail('mask WebP does not advertise an alpha channel');
  if (width < 200 || height < 240) fail(`mask dimensions are too small: ${width}x${height}`);
} else {
  fail('mask WebP has no readable VP8X dimensions');
}

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
if (!html.includes('assets/homepage-mask.webp')) fail('homepage does not render the mask asset');
if (!js.includes('sessionStorage')) fail('intro is not limited to one display per session');
if (!js.includes('3600')) fail('intro hold duration is not 3.6 seconds');
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

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  maskBytes: image.length,
  dimensions,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-mask-intro-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(item => console.error(`RELEASE UI FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Homepage mask and membership release test passed (${dimensions.width}x${dimensions.height}, ${image.length} bytes).`);
