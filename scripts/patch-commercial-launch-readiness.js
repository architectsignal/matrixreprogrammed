const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'commercial-launch-page-patch.json');
const report = { ok: true, generatedAt: new Date().toISOString(), written: [], patched: [], checks: [] };

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, content) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  report.written.push(rel);
  if (fs.existsSync(site) && fs.statSync(site).isDirectory()) {
    const output = path.join(site, rel);
    if (!(fs.existsSync(output) && fs.statSync(output).isDirectory())) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, content);
      report.written.push(`_site/${rel}`);
      if (rel.endsWith('.html')) {
        const extensionless = path.join(site, rel.replace(/\.html$/i, ''));
        if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) {
          fs.writeFileSync(extensionless, content);
          report.written.push(`_site/${rel.replace(/\.html$/i, '')}`);
        }
      }
    }
  }
}
function requireMarker(rel, content, marker) {
  const ok = content.includes(marker);
  report.checks.push({ rel, marker, ok });
  if (!ok) throw new Error(`${rel} missing marker: ${marker}`);
}
function rejectMarker(rel, content, marker) {
  const ok = !content.includes(marker);
  report.checks.push({ rel, rejectedMarker: marker, ok });
  if (!ok) throw new Error(`${rel} contains obsolete marker: ${marker}`);
}

const pages = [
  ['templates/commercial-store.template', 'store.html', ['CURRENT COMMERCIAL STATUS.', 'data-newsletter-form', 'membership-terms.html']],
  ['templates/membership-terms.template', 'membership-terms.html', ['Version 2026-07-18-v1', 'recurs monthly through PayPal', 'mandatory consumer rights']],
  ['templates/cancellation-withdrawal.template', 'cancellation-withdrawal.html', ['CANCELLATION &amp; WITHDRAWAL.', 'billing-dashboard.html', 'statutory withdrawal rights']],
  ['templates/legal-notice.template', 'legal-notice.html', ['data-commercial-legal-ready="false"', 'LIVE CHECKOUT REMAINS BLOCKED.', 'Required operator information before live charging']]
];

for (const [templateRel, outputRel, markers] of pages) {
  const templatePath = path.join(root, templateRel);
  if (!fs.existsSync(templatePath)) throw new Error(`Missing commercial template: ${templateRel}`);
  const content = read(templateRel);
  markers.forEach(marker => requireMarker(templateRel, content, marker));
  for (const obsolete of ['Buy Placeholder', 'Join Placeholder', 'Email capture placeholder', 'when the email provider is connected', '€19/month', '€49/month']) {
    rejectMarker(templateRel, content, obsolete);
  }
  write(outputRel, content);
}

const adminHtmlRel = 'admin-payment-dashboard.html';
let adminHtml = read(adminHtmlRel);
if (!adminHtml.includes('id="payment-commercial-legal"')) {
  const anchor = '<article class="panel"><h2>Payment records</h2><div id="payment-payments" class="count">0</div></article>';
  if (!adminHtml.includes(anchor)) throw new Error('Payment administration status-grid anchor was not found');
  adminHtml = adminHtml.replace(anchor, `${anchor}<article class="panel"><h2>Commercial legal gate</h2><div id="payment-commercial-legal" class="count">—</div></article>`);
}
adminHtml = adminHtml.replace(
  'Live requires the production environment switch, confirmation secret and the exact activation phrase.',
  'Live additionally requires verified commercial operator information, the protected commercial legal switch and confirmation secret, the production environment switch, the D1 switch and the exact activation phrase.'
);
requireMarker(adminHtmlRel, adminHtml, 'payment-commercial-legal');
requireMarker(adminHtmlRel, adminHtml, 'protected commercial legal switch');
write(adminHtmlRel, adminHtml);
report.patched.push(adminHtmlRel);

const adminJsRel = 'admin-payment-dashboard.js';
let adminJs = read(adminJsRel);
if (!adminJs.includes("$('payment-commercial-legal')")) {
  const original = "function renderHealth(data){$('payment-environment').textContent=data.environment;$('payment-checkout').textContent=data.checkoutEnabled?'Enabled':'Disabled';$('payment-plans').textContent=data.plansReady?'3/3 ready':`${(data.plans||[]).length}/3 ready`;for(const [key,value] of Object.entries(data.counts||{})){const node=$(`payment-${key}`);if(node)node.textContent=String(value)}}";
  const replacement = "function renderHealth(data){$('payment-environment').textContent=data.environment;$('payment-checkout').textContent=data.checkoutEnabled?'Enabled':'Disabled';$('payment-plans').textContent=data.plansReady?'3/3 ready':`${(data.plans||[]).length}/3 ready`;const legal=$('payment-commercial-legal');if(legal)legal.textContent=data.commercialLegalReady?'Ready':'Blocked';for(const [key,value] of Object.entries(data.counts||{})){const node=$(`payment-${key}`);if(node)node.textContent=String(value)}}";
  if (!adminJs.includes(original)) throw new Error('Payment administration renderHealth anchor was not found');
  adminJs = adminJs.replace(original, replacement);
}
requireMarker(adminJsRel, adminJs, 'commercialLegalReady');
write(adminJsRel, adminJs);
report.patched.push(adminJsRel);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Commercial launch pages patched: ${report.written.length} output writes and ${report.patched.length} admin surfaces.`);
