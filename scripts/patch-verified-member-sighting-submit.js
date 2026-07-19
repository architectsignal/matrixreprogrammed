const fs = require('fs');
const path = require('path');

const root = process.cwd();
const templatePath = path.join(root, 'scripts', 'templates', 'epstein-sighting-submit.template');
const sourcePath = path.join(root, 'epstein-sighting-submit.html');
const sitePath = path.join(root, '_site', 'epstein-sighting-submit.html');
const extensionlessPath = path.join(root, '_site', 'epstein-sighting-submit');
const reportPath = path.join(root, 'downloads', 'verified-member-sighting-submit.json');

if (!fs.existsSync(templatePath)) throw new Error('Verified-member sighting submission template is missing.');
const html = fs.readFileSync(templatePath, 'utf8');
const forbidden = ['paypal.me', 'Pay €1 Signal Pass', 'I’ve Paid — Unlock Posting', 'signal-locked', 'unlock-signal-pass'];
for (const marker of forbidden) {
  if (html.includes(marker)) throw new Error(`Sighting submission template contains forbidden payment gate marker: ${marker}`);
}
for (const marker of ['Verified Free Member posting', 'No payment is required.', 'member-login.html?return=%2Fepstein-sighting-submit.html', 'data-board="epstein-alive"', 'forum.js', 'terms-of-use.html']) {
  if (!html.includes(marker)) throw new Error(`Sighting submission template is missing required marker: ${marker}`);
}

const targets = [sourcePath];
if (fs.existsSync(path.join(root, '_site'))) targets.push(sitePath, extensionlessPath);
const touched = [];
for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const before = fs.existsSync(target) && fs.statSync(target).isFile() ? fs.readFileSync(target, 'utf8') : '';
  if (before !== html) {
    fs.writeFileSync(target, html);
    touched.push(path.relative(root, target).replace(/\\/g, '/'));
  }
}

const checks = targets.map(target => {
  const text = fs.readFileSync(target, 'utf8');
  return {
    file: path.relative(root, target).replace(/\\/g, '/'),
    freeMemberGate: text.includes('Verified Free Member posting'),
    noPayment: text.includes('No payment is required.'),
    loginRoute: text.includes('member-login.html?return=%2Fepstein-sighting-submit.html'),
    serverBoard: text.includes('data-board="epstein-alive"') && text.includes('forum.js'),
    terms: text.includes('terms-of-use.html'),
    falsePaymentGateRemoved: forbidden.every(marker => !text.includes(marker))
  };
});
const ok = checks.length >= 1 && checks.every(item => item.freeMemberGate && item.noPayment && item.loginRoute && item.serverBoard && item.terms && item.falsePaymentGateRemoved);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({ ok, generatedAt: new Date().toISOString(), touched, checks, boundary: 'Epstein sighting submissions use the same verified Free Member D1 posting boundary as the forum. No PayPal.me or browser-only payment unlock is allowed.' }, null, 2)}\n`);
if (!ok) throw new Error(`Verified-member sighting submission patch failed: ${JSON.stringify(checks)}`);
console.log(`Verified-member sighting submission restored across ${targets.length} route(s).`);
