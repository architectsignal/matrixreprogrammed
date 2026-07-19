const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => fs.existsSync(value) && all.indexOf(value) === index);
const pages = ['store.html', 'card-deck-store.html', 'premium-reports.html'];
const touched = [];
const checks = [];

const strip = '<section class="section money-card commercial-terms-strip" data-commercial-terms-strip><h2>Before any payment</h2><p>Public evidence and previews remain free. Paid membership or project support begins only after you review the recurring-payment, cancellation, withdrawal, refund and failed-payment terms.</p><div class="cta-row small"><a class="btn alt" href="membership-terms.html">Membership and payment terms</a><a class="btn alt" href="terms-of-use.html">Website terms</a><a class="btn alt" href="member-login.html?return=%2Fstore.html">Create or access free account</a></div><p class="mini">Payments are not charitable or tax-deductible donations. No browser action or unverified provider event can grant member access.</p></section>';

for (const base of roots) {
  for (const relative of pages) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    let after = before;
    if (!after.includes('data-commercial-terms-strip')) {
      after = after.includes('</main>') ? after.replace('</main>', `${strip}</main>`) : `${after}\n${strip}\n`;
    }
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(path.relative(root, file).replace(/\\/g, '/'));
    }
    const finalText = fs.readFileSync(file, 'utf8');
    checks.push({
      file: path.relative(root, file).replace(/\\/g, '/'),
      membershipTerms: finalText.includes('membership-terms.html'),
      websiteTerms: finalText.includes('terms-of-use.html'),
      freeAccount: finalText.includes('Create or access free account'),
      nonCharitable: finalText.includes('not charitable or tax-deductible donations'),
      verifiedAccessBoundary: finalText.includes('unverified provider event can grant member access')
    });
  }
}

const ok = checks.length >= 3 && checks.every(item => item.membershipTerms && item.websiteTerms && item.freeAccount && item.nonCharitable && item.verifiedAccessBoundary);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'store-commercial-terms.json'), `${JSON.stringify({ ok, generatedAt: new Date().toISOString(), touched: [...new Set(touched)], checks }, null, 2)}\n`);
if (!ok) throw new Error(`Store commercial terms repair failed: ${JSON.stringify(checks)}`);
console.log(`Commercial terms exposed on all store surfaces (${[...new Set(touched)].length} file(s) updated).`);
