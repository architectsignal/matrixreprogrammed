const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const report = { ok: true, generatedAt: new Date().toISOString(), verified: [], patched: [], errors: [] };

const valueBlock = `<!-- newsletter-public-value:start -->
<section class="section wrap" id="newsletter-value">
  <div class="split">
    <div>
      <div class="eyebrow">What You Receive</div>
      <h2>ONE USEFUL FILE. NO EMPTY NOISE.</h2>
      <p>Each confirmed subscriber receives the briefings selected on the form: major public-source developments, new evidence routes, important corrections, investigation updates and direct links into the relevant Matrix Reprogrammed pages.</p>
      <div class="grid">
        <article class="card"><h3>Evidence first</h3><p>Important claims link to source records, evidence classifications and the page where the full reasoning can be inspected.</p></article>
        <article class="card"><h3>Changes that matter</h3><p>Duplicate headlines and trivial appearances are excluded. The briefing focuses on filings, appointments, records, decisions, contradictions and material updates.</p></article>
        <article class="card"><h3>Clear boundaries</h3><p>Documented fact, official allegation, analytical inference, disputed claims and deep speculation remain visibly separated.</p></article>
      </div>
    </div>
    <aside class="card redline">
      <h3>Privacy and control</h3>
      <p>Your subscription is inactive until the verification link is confirmed. You can change preferences or unsubscribe through any briefing. Subscriber details are not sold to advertisers.</p>
      <p><strong>Frequency:</strong> only the briefings selected on the form and essential account messages.</p>
    </aside>
  </div>
  <div class="cta-row">
    <a class="btn alt" href="live-intel.html">Open Live Intel</a>
    <a class="btn alt" href="evidence-vault.html">Open Evidence Vault</a>
    <a class="btn alt" href="behind-the-curtain-capstone.html">Open Power-Family Capstone</a>
    <a class="btn alt" href="black-file.html">Open the Black File</a>
  </div>
</section>
<!-- newsletter-public-value:end -->`;

function patch(file) {
  if (!fs.existsSync(file)) throw new Error(`missing newsletter surface: ${path.relative(root, file)}`);
  if (fs.statSync(file).isDirectory()) throw new Error(`newsletter surface is a directory: ${path.relative(root, file)}`);
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  html = html
    .replace('<p class="lead internal-only">One weekly email', '<p class="lead">One weekly email')
    .replace(/<input name="name"\s+reader field="Name">/g, '<input name="name" type="text" placeholder="Name" autocomplete="name" aria-label="Name">')
    .replace(/<input type="email" name="email" required\s+reader field="you@example\.com">/g, '<input type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email address">')
    .replace(/<!-- newsletter-public-value:start -->[\s\S]*?<!-- newsletter-public-value:end -->/g, '');
  if (!html.includes('</main>')) throw new Error(`${path.relative(root, file)} has no </main> insertion boundary`);
  html = html.replace('</main>', `${valueBlock}</main>`);
  if (html !== before) {
    fs.writeFileSync(file, html);
    report.patched.push(path.relative(root, file).replace(/\\/g, '/'));
  }
  const requirements = [
    'class="lead">One weekly email',
    'placeholder="Name"',
    'autocomplete="name"',
    'placeholder="you@example.com"',
    'autocomplete="email"',
    'data-marketing-consent',
    'newsletter-public-value:start',
    'behind-the-curtain-capstone.html'
  ];
  for (const marker of requirements) if (!html.includes(marker)) throw new Error(`${path.relative(root, file)} missing ${marker}`);
  if (/\sreader field=/.test(html)) throw new Error(`${path.relative(root, file)} still contains malformed reader field attributes`);
  report.verified.push(path.relative(root, file).replace(/\\/g, '/'));
}

try {
  patch(path.join(root, 'newsletter.html'));
  if (!fs.existsSync(site)) throw new Error('_site is missing; newsletter cannot be proven in deploy output');
  patch(path.join(site, 'newsletter.html'));
  patch(path.join(site, 'newsletter'));
  if (report.verified.length !== 3) throw new Error(`expected three verified newsletter routes, found ${report.verified.length}`);
} catch (error) {
  report.ok = false;
  report.errors.push(error.message);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'newsletter-public-page-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(`Newsletter public-page repair failed: ${report.errors.join('; ')}`);
  process.exit(1);
}
console.log(`Newsletter public page verified across ${report.verified.length} source and deploy routes; ${report.patched.length} surface(s) patched.`);
