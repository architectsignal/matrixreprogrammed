const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const report = { ok: true, generatedAt: new Date().toISOString(), verified: [], patched: [], synchronized: [], errors: [] };

const consentLabel = `<label class="newsletter-consent">
            <input type="checkbox" name="marketingConsent" data-marketing-consent required>
            <span>I agree to receive the Matrix Reprogrammed briefings selected on this form. I can unsubscribe or change preferences at any time.</span>
          </label>`;

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

function canonicalizeConsent(html, relative) {
  const formMatch = html.match(/<form\b[^>]*(?:data-newsletter-form|id=["']newsletter-form["'])[^>]*>[\s\S]*?<\/form>/i);
  if (!formMatch) throw new Error(`${relative} missing canonical newsletter form`);
  let form = formMatch[0];
  form = form.replace(/<label\b[^>]*class=["'][^"']*newsletter-consent[^"']*["'][^>]*>[\s\S]*?<\/label>/gi, '');
  form = form.replace(/<input\b[^>]*(?:name=["']marketingConsent["']|data-marketing-consent)[^>]*>/gi, '');
  const submit = form.match(/<(?:button|input)\b[^>]*type=["']submit["'][^>]*>(?:[\s\S]*?<\/button>)?/i);
  if (!submit) throw new Error(`${relative} missing newsletter submit control`);
  form = form.replace(submit[0], `${consentLabel}\n          ${submit[0]}`);
  return html.replace(formMatch[0], form);
}

function patch(file) {
  if (!fs.existsSync(file)) throw new Error(`missing newsletter surface: ${path.relative(root, file)}`);
  if (fs.statSync(file).isDirectory()) throw new Error(`newsletter surface is a directory: ${path.relative(root, file)}`);
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  const relative = path.relative(root, file).replace(/\\/g, '/');
  html = html
    .replace('<p class="lead internal-only">One weekly email', '<p class="lead">One weekly email')
    .replace(/<input\b(?=[^>]*\bname=["']name["'])[^>]*>/gi, '<input name="name" type="text" placeholder="Name" autocomplete="name" aria-label="Name">')
    .replace(/<input\b(?=[^>]*\bname=["']email["'])[^>]*>/gi, '<input type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email address">')
    .replace(/<!-- newsletter-public-value:start -->[\s\S]*?<!-- newsletter-public-value:end -->/g, '');
  html = canonicalizeConsent(html, relative);
  if (!html.includes('</main>')) throw new Error(`${relative} has no </main> insertion boundary`);
  html = html.replace('</main>', `${valueBlock}</main>`);
  if (html !== before) {
    fs.writeFileSync(file, html);
    report.patched.push(relative);
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
  for (const marker of requirements) if (!html.includes(marker)) throw new Error(`${relative} missing ${marker}`);
  if ((html.match(/data-marketing-consent/g) || []).length !== 1) throw new Error(`${relative} must contain exactly one marketing consent control`);
  if (/\sreader field=/.test(html)) throw new Error(`${relative} still contains malformed reader field attributes`);
  report.verified.push(relative);
}

function copyPublicFile(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
  const destination = path.join(site, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  report.synchronized.push(relative);
  if (relative.endsWith('.html')) {
    const extensionless = path.join(site, relative.replace(/\.html$/i, ''));
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
  }
}

function synchronizePublicHtmlTree(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(relativeDirectory, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) synchronizePublicHtmlTree(child);
    else if (entry.name.endsWith('.html')) copyPublicFile(child);
  }
}

function repairMakingMoneyRedirect() {
  const relative = 'follow-the-money/making-money.html';
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
  const before = fs.readFileSync(source, 'utf8');
  if (/<meta\s+name=["']viewport["']/i.test(before) && /<h1\b/i.test(before)) {
    copyPublicFile(relative);
    return;
  }
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="refresh" content="0;url=../making-money.html"><link rel="canonical" href="../making-money.html"><title>Making Money | Matrix Reprogrammed</title><meta name="description" content="Continue to the Matrix Reprogrammed Making Money research and education hub."><link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="../fixes.css"></head><body><main><section class="hero wrap"><div class="eyebrow">Follow the Money</div><h1>MAKING MONEY.</h1><p class="lead">This route has moved to the complete Making Money research and education hub.</p><div class="cta-row"><a class="btn" href="../making-money.html">Open Making Money</a></div></section></main><script>location.replace('../making-money.html'+location.search+location.hash);</script></body></html>`;
  fs.writeFileSync(source, html);
  report.patched.push(relative);
  copyPublicFile(relative);
}

try {
  patch(path.join(root, 'newsletter.html'));
  if (!fs.existsSync(site)) throw new Error('_site is missing; newsletter cannot be proven in deploy output');
  patch(path.join(site, 'newsletter.html'));
  patch(path.join(site, 'newsletter'));
  if (report.verified.length !== 3) throw new Error(`expected three verified newsletter routes, found ${report.verified.length}`);

  repairMakingMoneyRedirect();
  for (const directory of ['entity-briefs', 'entity-exposure', 'reports']) synchronizePublicHtmlTree(directory);
} catch (error) {
  report.ok = false;
  report.errors.push(error.message);
}

report.synchronized = [...new Set(report.synchronized)].sort();
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'newsletter-public-page-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(`Newsletter public-page repair failed: ${report.errors.join('; ')}`);
  process.exit(1);
}
console.log(`Newsletter public page verified across ${report.verified.length} source and deploy routes; ${report.patched.length} surface(s) patched and ${report.synchronized.length} late public page(s) synchronized.`);
