const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pagePath = path.join(root, 'membership.html');
const registryPath = path.join(root, 'data', 'membership-tiers.json');
const reportPath = path.join(root, 'downloads', 'membership-tiers-report.json');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function tierCard(tier) {
  const includes = (tier.includes || []).map(item => `<p class="tier-includes"><strong>${escapeHtml(item)}</strong></p>`).join('');
  const benefits = (tier.benefits || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const access = (tier.access || []).map(item => `<span>${escapeHtml(item)}</span>`).join('');
  const boundary = tier.requestBoundary ? `<p class="tier-boundary"><strong>Request boundary:</strong> ${escapeHtml(tier.requestBoundary)}</p>` : '';
  return `<article class="money-card membership-tier" id="join-${escapeHtml(tier.id)}" data-tier-price="${Number(tier.price)}">
    <div class="tier-top"><span class="label">Coming soon</span><span class="tier-code">€${Number(tier.price)} / month</span></div>
    <h3>${escapeHtml(tier.name)}</h3>
    <div class="price"><span>€${Number(tier.price)}</span><small>/month</small></div>
    <p>${escapeHtml(tier.summary)}</p>
    ${includes}
    <h4>Benefits</h4>
    <ul class="tier-benefits">${benefits}</ul>
    <h4>Access included</h4>
    <div class="tier-access">${access}</div>
    ${boundary}
    <button class="btn tier-coming-soon" type="button" disabled aria-disabled="true">Coming soon — no payment taken</button>
  </article>`;
}

function comparisonRow(label, values) {
  return `<tr><th scope="row">${escapeHtml(label)}</th>${values.map(value => `<td>${value ? '✓' : '—'}</td>`).join('')}</tr>`;
}

if (!fs.existsSync(pagePath)) throw new Error('membership.html is missing');
if (!fs.existsSync(registryPath)) throw new Error('data/membership-tiers.json is missing');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const tiers = Array.isArray(registry.tiers) ? registry.tiers : [];
if (tiers.length !== 3) throw new Error(`Expected 3 membership tiers, found ${tiers.length}`);
const expectedPrices = [3, 6, 9];
if (tiers.some((tier, index) => Number(tier.price) !== expectedPrices[index])) throw new Error('Membership tier prices must be €3, €6 and €9 in ascending order');

const section = `<!-- membership-tiers:start -->
<section class="section membership-tier-section" aria-labelledby="membership-tier-heading">
  <div class="eyebrow">Three clear levels · cancel when billing launches</div>
  <h2 id="membership-tier-heading">MEMBERSHIP TIERS.</h2>
  <p class="lead">Choose the depth of access you need. Each higher level includes the complete level beneath it. All benefits below are planned access and remain marked <strong>Coming soon</strong> until payment, delivery, cancellation and account systems are live and verified.</p>
  <div class="membership-status"><strong>No payment is being taken yet.</strong> The public site remains available while the membership delivery system is completed and tested.</div>
  <div class="money-grid membership-grid">${tiers.map(tierCard).join('')}</div>
</section>
<section class="section membership-comparison" aria-labelledby="membership-comparison-heading">
  <div class="eyebrow">Access comparison</div>
  <h2 id="membership-comparison-heading">WHAT EACH LEVEL OPENS.</h2>
  <div class="membership-table-wrap"><table><thead><tr><th scope="col">Access</th><th scope="col">Supporter<br><small>€3</small></th><th scope="col">Intelligence<br><small>€6</small></th><th scope="col">Research Pro<br><small>€9</small></th></tr></thead><tbody>
    ${comparisonRow('Weekly member brief', [true, true, true])}
    ${comparisonRow('Member newsletter and source drops', [true, true, true])}
    ${comparisonRow('Sample premium reports', [true, true, true])}
    ${comparisonRow('Premium daily brief', [false, true, true])}
    ${comparisonRow('Full card intelligence and source ledger', [false, true, true])}
    ${comparisonRow('Deep dossiers, maps and downloadable decks', [false, true, true])}
    ${comparisonRow('Missing-record and source-change queue', [false, true, true])}
    ${comparisonRow('Advanced search and Data Laboratory access', [false, false, true])}
    ${comparisonRow('Full dossier and research exports', [false, false, true])}
    ${comparisonRow('Policy and jurisdiction trackers', [false, false, true])}
    ${comparisonRow('Monthly PDF intelligence report', [false, false, true])}
    ${comparisonRow('Priority source requests and research betas', [false, false, true])}
  </tbody></table></div>
  <p class="tier-boundary"><strong>Evidence boundary:</strong> Membership provides access to research material and tools. It does not turn allegations into facts, guarantee that requested records exist, or promise a particular conclusion.</p>
</section>
<!-- membership-tiers:end -->`;

const styles = `<style id="membership-tier-v2-styles">
.money-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1rem}.money-card{border:1px solid rgba(216,181,106,.3);border-radius:22px;padding:1.2rem;background:linear-gradient(150deg,rgba(14,8,2,.97),rgba(0,0,0,.96));box-shadow:0 18px 55px rgba(0,0,0,.28)}.membership-tier{display:flex;flex-direction:column;min-height:100%}.membership-tier h3{font-size:1.55rem;margin:.7rem 0 .2rem}.membership-tier h4{margin:1rem 0 .45rem;color:#d8b56a}.price{display:flex;align-items:baseline;gap:.35rem;color:#d8b56a;font-weight:900}.price span{font-size:2.7rem}.price small{font-size:.9rem;color:#c8b98c}.tier-top{display:flex;justify-content:space-between;gap:.6rem;align-items:center;flex-wrap:wrap}.tier-code{font-size:.78rem;color:#c8b98c}.tier-includes{border-left:3px solid #d8b56a;padding:.55rem .75rem;background:rgba(216,181,106,.07)}.tier-benefits{padding-left:1.25rem;display:grid;gap:.45rem}.tier-access{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1rem}.tier-access span{border:1px solid rgba(216,181,106,.28);border-radius:999px;padding:.3rem .58rem;font-size:.75rem;color:#eadcae}.tier-boundary{font-size:.84rem;color:#c8b98c;border-left:3px solid rgba(216,181,106,.55);padding-left:.75rem}.tier-coming-soon{margin-top:auto;opacity:.78;cursor:not-allowed}.membership-status{border:1px solid rgba(216,181,106,.38);background:rgba(216,181,106,.08);border-radius:14px;padding:1rem;margin:1rem 0}.membership-table-wrap{overflow:auto;border:1px solid rgba(216,181,106,.25);border-radius:16px}.membership-comparison table{border-collapse:collapse;width:100%;min-width:720px;background:rgba(5,5,5,.78)}.membership-comparison th,.membership-comparison td{padding:.8rem;border-bottom:1px solid rgba(216,181,106,.16);text-align:center}.membership-comparison th:first-child{text-align:left}.membership-comparison thead th{color:#d8b56a;background:#0d0a05;position:sticky;top:0}.email-capture{display:flex;gap:.5rem;flex-wrap:wrap}.email-capture input{min-width:240px;flex:1;background:#050505;color:#f3e6bd;border:1px solid rgba(216,181,106,.35);border-radius:12px;padding:.75rem}@media(max-width:700px){.money-grid{grid-template-columns:1fr}.price span{font-size:2.3rem}}
</style>`;

let html = fs.readFileSync(pagePath, 'utf8');
if (html.includes('id="membership-tier-v2-styles"')) html = html.replace(/<style id="membership-tier-v2-styles">[\s\S]*?<\/style>/, styles);
else html = html.replace('</head>', `${styles}</head>`);

if (html.includes('<!-- membership-tiers:start -->')) {
  html = html.replace(/<!-- membership-tiers:start -->[\s\S]*?<!-- membership-tiers:end -->/, section);
} else {
  const legacyStart = html.indexOf('<section class="section"><h2>Membership Tiers</h2>');
  if (legacyStart < 0) throw new Error('Could not find legacy Membership Tiers section');
  const mainClose = html.indexOf('</main>', legacyStart);
  if (mainClose < 0) throw new Error('Could not find membership page main closing tag');
  html = html.slice(0, legacyStart) + section + html.slice(mainClose);
}

if (!html.includes('newsletter.js')) html = html.replace('</body>', '<script src="newsletter.js"></script></body>');
html = html.replace(/€19\/month|€49\/month|€9\/month/g, match => match);
fs.writeFileSync(pagePath, html);

const failures = [];
for (const price of expectedPrices) if (!html.includes(`€${price}`)) failures.push(`missing €${price} price`);
for (const oldPrice of ['€19/month', '€49/month']) if (html.includes(oldPrice)) failures.push(`legacy price remains: ${oldPrice}`);
for (const tier of tiers) {
  if (!html.includes(tier.name)) failures.push(`missing tier ${tier.name}`);
  for (const benefit of tier.benefits) if (!html.includes(escapeHtml(benefit))) failures.push(`missing benefit: ${benefit}`);
}
if (!html.includes('Coming soon — no payment taken')) failures.push('missing truthful coming-soon control');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  prices: expectedPrices,
  tiers: tiers.map(tier => ({ id: tier.id, name: tier.name, price: tier.price, benefits: tier.benefits.length, access: tier.access.length })),
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(item => console.error(`MEMBERSHIP TIER FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Membership tiers patched: €${expectedPrices.join(', €')} with ${tiers.reduce((sum, tier) => sum + tier.benefits.length, 0)} listed benefits.`);
