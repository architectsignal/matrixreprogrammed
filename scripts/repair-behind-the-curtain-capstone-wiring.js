const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const bases = [root, site].filter(base => fs.existsSync(base));
const runtimePath = path.join(root, 'scripts', 'behind-the-curtain-capstone.runtime.js');
if (!fs.existsSync(runtimePath)) throw new Error('Canonical Behind the Curtain Capstone runtime is missing');
const canonicalRuntime = fs.readFileSync(runtimePath, 'utf8');
if (!canonicalRuntime.includes('behind-the-curtain-capstone.json')) throw new Error('Canonical Capstone runtime does not load the symbolic evidence model');

const start = '<!-- power-family-capstone-link:start -->';
const end = '<!-- power-family-capstone-link:end -->';
const pattern = /<!-- power-family-capstone-link:start -->[\s\S]*?<!-- power-family-capstone-link:end -->/g;
const block = `${start}<section class="pyr-section"><div class="wrap"><div class="pyr-boundary"><strong>POWER-FAMILY CAPSTONE</strong><p>Continue from the Pyramid into the evidence-led living family, trustee, asset-controller, adviser, gatekeeper and successor layer.</p><div class="pyr-cta"><a class="btn" href="behind-the-curtain-capstone.html">Open the Power-Family Intelligence Layer</a><a class="btn alt" href="behind-the-curtain-symbolic-capstone.html">Open the Separate Symbolic Annex</a></div></div></div></section>${end}`;

let patched = 0;
for (const base of bases) {
  const accessHtml = path.join(base, 'behind-the-curtain-access.html');
  if (fs.existsSync(accessHtml)) {
    let html = fs.readFileSync(accessHtml, 'utf8').replace(pattern, '');
    if (html.includes('</main>')) html = html.replace('</main>', `${block}</main>`);
    else if (html.includes('</body>')) html = html.replace('</body>', `${block}</body>`);
    else throw new Error(`${path.relative(root, accessHtml)} lacks a Capstone insertion point`);
    fs.writeFileSync(accessHtml, html);
    patched += 1;
    if (base === site) {
      const extensionless = path.join(base, 'behind-the-curtain-access');
      if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.writeFileSync(extensionless, html);
    }
  }

  const runtime = path.join(base, 'behind-the-curtain-capstone.js');
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  fs.writeFileSync(runtime, canonicalRuntime);
  patched += 1;
}

for (const base of bases) {
  const access = path.join(base, 'behind-the-curtain-access.html');
  const runtime = path.join(base, 'behind-the-curtain-capstone.js');
  if (!fs.existsSync(access) || !fs.readFileSync(access, 'utf8').includes('behind-the-curtain-capstone')) throw new Error(`${path.relative(root, access)} still lacks the Power-Family Capstone route`);
  if (!fs.existsSync(runtime) || !fs.readFileSync(runtime, 'utf8').includes('behind-the-curtain-capstone.json')) throw new Error(`${path.relative(root, runtime)} still lacks the symbolic evidence feed`);
}

console.log(`Behind the Curtain Capstone wiring restored across ${patched} source/output target(s).`);
