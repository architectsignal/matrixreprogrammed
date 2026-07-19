const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => fs.existsSync(value) && all.indexOf(value) === index);
const pages = ['billing-dashboard.html'];
const marker = 'data-billing-commercial-terms';
const panel = '<section class="panel" data-billing-commercial-terms><h2>Membership and payment terms</h2><p>Review recurring billing, cancellation, withdrawal, refund, reversal and failed-payment treatment before changing a paid subscription.</p><div class="actions"><a class="btn alt" href="membership-terms.html">Membership and cancellation terms</a><a class="btn alt" href="terms-of-use.html">Website terms</a><a class="btn alt" href="trust-privacy-policy.html">Privacy</a></div><p class="warning"><strong>Payment boundary:</strong> membership payments are service payments, not charitable or tax-deductible donations. Browser approval alone never grants access.</p></section>';
const touched = [];
const checks = [];

for (const base of roots) {
  for (const relative of pages) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    let after = before;
    if (!after.includes(marker)) {
      after = after.includes('</main>') ? after.replace('</main>', `${panel}</main>`) : `${after}\n${panel}\n`;
    }
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(path.relative(root, file).replace(/\\/g, '/'));
    }
    const text = fs.readFileSync(file, 'utf8');
    checks.push({
      file: path.relative(root, file).replace(/\\/g, '/'),
      marker: text.includes(marker),
      membershipTerms: text.includes('membership-terms.html'),
      websiteTerms: text.includes('terms-of-use.html'),
      privacy: text.includes('trust-privacy-policy.html'),
      cancellation: /cancellation/i.test(text),
      nonCharitable: text.includes('not charitable or tax-deductible donations'),
      verifiedAccess: text.includes('Browser approval alone never grants access')
    });
  }
}

const ok = checks.length >= 1 && checks.every(item => item.marker && item.membershipTerms && item.websiteTerms && item.privacy && item.cancellation && item.nonCharitable && item.verifiedAccess);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'billing-commercial-terms.json'), `${JSON.stringify({ ok, generatedAt: new Date().toISOString(), touched, checks }, null, 2)}\n`);
if (!ok) throw new Error(`Billing commercial terms repair failed: ${JSON.stringify(checks)}`);
console.log(`Billing commercial terms exposed (${touched.length} file(s) updated).`);
