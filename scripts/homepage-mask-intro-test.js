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
function validateSvg(rel, title, viewBox, minimumPaths) {
  const svg = read(rel);
  if (svg.length < 5000) fail(`${rel} is unexpectedly small: ${svg.length} characters`);
  if (!svg.startsWith('<svg') && !svg.startsWith('<?xml')) fail(`${rel} is not SVG`);
  if (!svg.includes(`viewBox="${viewBox}"`)) fail(`${rel} has the wrong scalable dimensions`);
  if (!svg.includes(title)) fail(`${rel} title is missing`);
  if (count(svg, '<path') < minimumPaths) fail(`${rel} has insufficient vector detail`);
  if (/<rect[^>]+(?:width="100%"|height="100%"|fill="#(?:000|000000)"|fill="black")/i.test(svg)) fail(`${rel} includes a background rectangle instead of true transparency`);
  if (!svg.includes('<filter')) fail(`${rel} lacks dimensional surface treatment`);
  return { characters: svg.length, paths: count(svg, '<path') };
}

const eye = validateSvg('assets/intro-eye.svg', 'Eye of Providence seal', '0 0 1200 1200', 20);
const mask = validateSvg('assets/intro-mask.svg', 'Anonymous revolutionary mask', '0 0 1000 1200', 20);
const html = read('index.html');
const css = read('homepage-mask-intro.css');
const js = read('homepage-mask-intro.js');

for (const [token, expected] of [
  ['data-homepage-mask-intro data-phase="eye"', 1],
  ['data-homepage-mask-intro-style', 1],
  ['data-homepage-mask-preload=', 2],
  ['data-homepage-mask-intro-runtime', 1],
  ['data-mask-intro-skip', 1],
  ['data-intro-asset=', 2],
  ['assets/intro-eye.svg', 2],
  ['assets/intro-mask.svg', 2]
]) {
  const actual = count(html, token);
  if (actual !== expected) fail(`expected ${expected} occurrence(s) of ${token}, found ${actual}`);
}

for (const marker of ['homepage-intro__burn', 'homepage-intro__embers', 'phase-eye', 'homepage-intro__eye', 'homepage-intro__mask']) {
  if (!html.includes(marker)) fail(`homepage is missing ${marker}`);
}
for (const marker of ['eye: 3000', 'burn: 1100', 'mask: 3000', 'dissolve: 1200', "setPhase('eye')", "setPhase('burn')", "setPhase('mask')"]) {
  if (!js.includes(marker)) fail(`runtime is missing sequence marker: ${marker}`);
}
if (!js.includes('sessionStorage')) fail('intro is not limited to one display per session');
if (!js.includes('matrix-homepage-intro-seen-v2')) fail('intro session key was not versioned for the new sequence');
if (!js.includes('asset-error')) fail('intro has no asset failure escape');
if (!js.includes('Escape')) fail('intro has no keyboard escape path');
if (!js.includes('1800')) fail('intro has no asset-load timeout fallback');

for (const marker of ['intro-eye-burn', 'intro-fire-ring', 'intro-embers', 'intro-mask-through-fire', 'intro-mask-dissolve', '@media(prefers-reduced-motion:reduce)', 'z-index:2147483000']) {
  if (!css.includes(marker)) fail(`stylesheet is missing ${marker}`);
}
if (!css.includes('width:min(99vw,1040px)')) fail('mask is not configured to fill the screen');

for (const rel of ['homepage-mask-intro.js', 'scripts/patch-homepage-mask-intro.js', 'scripts/patch-membership-tiers.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${rel} syntax check failed: ${String(result.stderr || result.stdout).trim()}`);
}

/* The intro release test also protects the current cumulative membership surface. */
const membership = read('membership.html');
for (const marker of ['Free Member', '€0', '€3', '€6', '€9', 'paypal-membership.js', 'paypal-membership-status']) {
  if (!membership.includes(marker)) fail(`membership page missing ${marker}`);
}
for (const legacy of ['€19/month', '€49/month', 'Coming soon — no payment taken']) {
  if (membership.includes(legacy)) fail(`membership page still contains obsolete marker: ${legacy}`);
}
if (!membership.includes('Everything in Supporter and Free Member')) fail('Intelligence Member is not explicitly cumulative');
if (!membership.includes('Everything in Intelligence Member, Supporter and Free Member')) fail('Research Pro is not explicitly cumulative');
if (!membership.includes('Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.')) fail('membership page does not explain the server-side activation boundary');
for (const slot of ['paypal-button-supporter', 'paypal-button-intelligence', 'paypal-button-research_pro']) {
  if (!membership.includes(slot)) fail(`membership page missing ${slot}`);
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  sequence: { eyeMs: 3000, burnMs: 1100, maskMs: 3000, dissolveMs: 1200 },
  assets: { eye, mask, transparentBackground: true },
  membership: { freeTier: true, paidPrices: [3, 6, 9], checkoutDefault: 'server-gated-disabled' },
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-mask-intro-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(item => console.error(`INTRO RELEASE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Eye → burn → mask intro test passed (${eye.paths + mask.paths} vector paths); current membership surface also verified.`);
