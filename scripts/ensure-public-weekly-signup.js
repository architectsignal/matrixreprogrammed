const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

const section = `<section id="public-weekly-signal" class="section wrap">
  <div class="card redline">
    <div class="eyebrow">Weekly Signal</div>
    <h2>GET THE WEEKLY MATRIX REPROGRAMMED BRIEF.</h2>
    <p>Receive the strongest source trails, new investigations, selected downloads and related books.</p>
    <form id="public-weekly-signal-form" name="weekly-signal" data-newsletter-form novalidate>
      <label>Name <input name="name" type="text" maxlength="120" autocomplete="name" placeholder="Your name (optional)"/></label>
      <label>Email address <input name="email" type="email" maxlength="240" autocomplete="email" required placeholder="you@example.com"/></label>
      <label class="consent-row"><input name="marketingConsent" type="checkbox" value="yes" required/> I agree to receive Matrix Reprogrammed email updates and understand I can unsubscribe at any time.</label>
      <button class="btn" type="submit">Join Weekly Signal</button>
      <p class="newsletter-status" data-newsletter-status role="status" aria-live="polite"></p>
    </form>
  </div>
</section>`;

function patch(file) {
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  html = html.replace(/\s*<section\b[^>]*id=["']public-weekly-signal["'][^>]*>[\s\S]*?<\/section>/gi, '');
  if (html.includes('</main>')) html = html.replace('</main>', `${section}</main>`);
  else if (html.includes('</footer>')) html = html.replace('</footer>', `${section}</footer>`);
  else if (html.includes('</body>')) html = html.replace('</body>', `${section}</body>`);
  else html += section;
  if (html !== before) fs.writeFileSync(file, html);
  return html !== before;
}

const targets = [
  path.join(root, 'index.html'),
  path.join(root, '_site', 'index.html'),
  path.join(root, '_site', 'index')
];
const changed = targets.filter(patch).map(file => path.relative(root, file).replace(/\\/g, '/'));
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  publicFormId: 'public-weekly-signal-form',
  submitLabel: 'Join Weekly Signal',
  endpointOwner: 'newsletter.js → /api/membership/signup',
  note: 'A clean reader-facing signup remains public even when adjacent capture strategy and implementation notes are hidden.'
};
fs.writeFileSync(path.join(reportDir, 'public-weekly-signup-report.json'), JSON.stringify(report, null, 2));
console.log(`Public weekly signup ensured on ${changed.length} page variant(s).`);
