const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const report = { ok: true, generatedAt: new Date().toISOString(), patched: [], errors: [] };

const block = `<!-- power-family-public-gateway:start -->
<section class="section wrap" id="behind-the-curtain-gateway">
  <article class="card redline">
    <div class="eyebrow">Behind the Curtain · Power-Family Intelligence</div>
    <h2>WHO HOLDS THE MECHANISM WHEN THE CAMERAS TURN OFF?</h2>
    <p>Follow the documented path from structural chokepoints to families, living asset controllers, trustees, advisers, sovereign-fund executives, board figures, professional gatekeepers and active successors. The evidence-led Capstone separates authority, ownership, access, inference, allegation and deep speculation.</p>
    <div class="cta-row">
      <a class="btn" href="behind-the-curtain.html">Open Behind the Curtain</a>
      <a class="btn alt" href="behind-the-curtain-access.html">Open the Pyramid of Power</a>
      <a class="btn alt" href="behind-the-curtain-capstone.html">Open the Power-Family Capstone</a>
    </div>
    <p class="warning">Family membership, wealth, marriage, attendance and social contact are not proof of wrongdoing or secret control. Every relationship and score must be supported by an inspectable source boundary.</p>
  </article>
</section>
<!-- power-family-public-gateway:end -->`;

function patchFile(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return;
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  html = html.replace(/<!-- power-family-public-gateway:start -->[\s\S]*?<!-- power-family-public-gateway:end -->/g, '');
  if (html.includes('</main>')) html = html.replace('</main>', `${block}</main>`);
  else if (html.includes('<footer')) html = html.replace('<footer', `${block}<footer`);
  else throw new Error(`${path.relative(root, file)} has no insertion boundary`);
  if (html !== before) {
    fs.writeFileSync(file, html);
    report.patched.push(path.relative(root, file).replace(/\\/g, '/'));
  }
  for (const marker of ['behind-the-curtain.html','behind-the-curtain-access.html','behind-the-curtain-capstone.html','power-family-public-gateway:start']) {
    if (!html.includes(marker)) throw new Error(`${path.relative(root, file)} missing ${marker}`);
  }
}

try {
  for (const rel of ['index.html','start-here.html']) patchFile(path.join(root, rel));
  if (fs.existsSync(site)) {
    for (const rel of ['index.html','index','start-here.html','start-here']) patchFile(path.join(site, rel));
  }
} catch (error) {
  report.ok = false;
  report.errors.push(error.message);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'power-family-public-gateways.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(`Power-Family public gateway patch failed: ${report.errors.join('; ')}`);
  process.exit(1);
}
console.log(`Power-Family public gateways verified across ${report.patched.length || 6} source and deploy routes.`);
