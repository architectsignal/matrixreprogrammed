const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => fs.existsSync(value) && all.indexOf(value) === index);
const touched = [];

function slugify(value) {
  return String(value || 'matrix-support').toLowerCase().replace(/&amp;/g, ' and ').replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'matrix-support';
}
function attr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function supportPanel(key, label, suggested) {
  const safeLabel = attr(label);
  const defaultAmount = Number(suggested) >= 1 && Number(suggested) <= 5000 ? Number(suggested) : 25;
  return `<div class="donation-panel" data-donation-panel><p class="donation-heading"><strong>Choose your support amount</strong></p><p class="mini">Choose any amount from €1 to €5,000. Public evidence and previews remain free. Paid support opens only after the payment rehearsal and commercial checks pass.</p><div class="donation-quick-row"><button type="button" class="btn alt" data-donation-quick="5">€5</button><button type="button" class="btn alt" data-donation-quick="25">€25</button><button type="button" class="btn alt" data-donation-quick="100">€100</button><button type="button" class="btn alt" data-donation-quick="500">€500</button><button type="button" class="btn alt" data-donation-quick="1000">€1,000</button></div><label class="donation-amount-label">Support amount (€)<input data-donation-amount type="number" min="1" max="5000" step="0.01" inputmode="decimal" value="${defaultAmount}" aria-label="Support amount for ${safeLabel}"></label><button class="btn donation-submit" type="button" data-donation-submit disabled>Continue securely with PayPal</button><p class="donation-status mini" data-donation-status>Paid support is opening soon. Create a free account to save reports and receive launch news.</p><div class="cta-row small"><a class="btn alt" href="member-login.html?return=%2Fstore.html">Create or access free account</a><a class="btn alt" href="membership-terms.html">Payment terms</a></div><p class="mini"><strong>Payment boundary:</strong> this is voluntary project support, not a charitable or tax-deductible donation. It does not buy stronger evidence, alter conclusions or restrict public access.</p></div>`;
}
function newsletterPanel() {
  return `<section class="section money-card" id="free-weekly-power-map"><h2>Get the free weekly power map</h2><p>Choose the free updates you want. Verify your email to activate delivery and manage or unsubscribe at any time.</p><form id="store-newsletter-form" data-newsletter-form data-source="store-weekly-power-map" data-default-release="true" class="email-capture"><input name="name" autocomplete="name" placeholder="Name (optional)" aria-label="Name"><input type="email" name="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address" required><input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"><div class="newsletter-preferences"><strong>Choose your free emails</strong><label><input type="checkbox" name="public_weekly_digest" value="true" checked data-default-checked="true"> Weekly Signal Drop</label><label><input type="checkbox" name="release_notices" value="true" checked data-default-checked="true"> Release notices</label><label><input type="checkbox" name="public_daily_brief" value="true"> Daily Control Brief</label></div><button class="btn" type="submit">Join Free Brief</button><p class="form-status newsletter-status" aria-live="polite">Weekly and release notices are selected. Verification is required before delivery begins.</p></form></section>`;
}
function cleanPublicCopy(html) {
  return html
    .replace(/Buy Placeholder/gi, 'Create or access free account')
    .replace(/Join Placeholder/gi, 'Create or access free account')
    .replace(/Email capture placeholder:[^<]*/gi, '')
    .replace(/when the email provider is connected/gi, '')
    .replace(/connect (?:the )?provider and payment stack[^<]*/gi, '')
    .replace(/Support checkout is safely disabled until the configured PayPal gates pass\./gi, 'Paid support is opening soon. Create a free account to receive launch news.')
    .replace(/Support checkout is currently disabled\. All public evidence and previews remain free\./gi, 'Paid support is opening soon. Public evidence and previews remain free.');
}
function ensureAssets(html) {
  let next = html;
  if (!next.includes('id="voluntary-support-store-styles"')) {
    const styles = `<style id="voluntary-support-store-styles">.donation-panel{margin-top:1rem;padding:1rem;border:1px solid rgba(216,181,106,.32);border-radius:16px;background:rgba(0,0,0,.35)}.donation-heading{font-size:1.05rem;color:#f3e6bd}.donation-quick-row{display:flex;flex-wrap:wrap;gap:.45rem;margin:.75rem 0}.donation-quick-row .btn{padding:.48rem .7rem}.donation-amount-label{display:grid;gap:.35rem;font-weight:800;color:#d8b56a}.donation-amount-label input{width:100%;max-width:240px;background:#050505;color:#f3e6bd;border:1px solid rgba(216,181,106,.45);border-radius:12px;padding:.75rem}.donation-submit{margin-top:.75rem}.donation-status[data-kind="error"]{color:#ff9b9b}.donation-status[data-kind="success"],.donation-status[data-kind="ready"]{color:#9ee6ad}.donation-global-status{margin:1rem 0;padding:.85rem 1rem;border-left:3px solid #d8b56a;background:rgba(216,181,106,.08)}.newsletter-preferences{display:flex;flex-wrap:wrap;gap:.65rem;width:100%;padding:.7rem;border:1px solid rgba(216,181,106,.22);border-radius:12px}.newsletter-preferences strong{width:100%;color:#d8b56a}.newsletter-preferences label{display:flex;gap:.4rem;align-items:center}.form-status{width:100%;font-size:.82rem;color:#c8b98c}</style>`;
    next = next.replace('</head>', `${styles}</head>`);
  }
  if (!next.includes('src="paypal-voluntary-support.js"')) next = next.replace('</body>', '<script src="paypal-voluntary-support.js"></script></body>');
  if (!next.includes('src="newsletter.js"')) next = next.replace('</body>', '<script src="newsletter.js"></script></body>');
  if (!next.includes('data-donation-global-status')) {
    const status = '<section class="donation-global-status" data-donation-global-status>Paid support is opening soon. Public evidence and previews remain free.</section>';
    next = next.replace(/(<main\b[^>]*>)/i, `$1${status}`);
  }
  return cleanPublicCopy(next);
}
function suggestedAmount(article, fallback = 25) {
  const match = article.match(/<div\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>\s*€\s*([\d,.]+)/i);
  if (!match) return fallback;
  const value = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(value) && value >= 1 && value <= 5000 ? value : fallback;
}
function transformArticle(article, options = {}) {
  const titleMatch = article.match(/<h2>([\s\S]*?)<\/h2>/i) || article.match(/<h3>([\s\S]*?)<\/h3>/i);
  const label = stripTags(titleMatch ? titleMatch[1] : options.label || 'Matrix Reprogrammed research');
  const idMatch = article.match(/\bid="([^"]+)"/i);
  const key = slugify(options.key || (idMatch ? idMatch[1].replace(/^buy-/, '') : label));
  const suggested = suggestedAmount(article, Number(options.suggested) || 25);
  let next = cleanPublicCopy(article);
  if (/data-donation-card/i.test(next)) {
    next = next.replace(/\bdata-donation-label="[^"]*"/i, `data-donation-label="${attr(label)}"`);
    next = next.replace(/\bdata-donation-key="[^"]*"/i, `data-donation-key="${attr(key)}"`);
  } else {
    next = next.replace(/<article\b/i, `<article data-donation-card data-donation-key="${attr(key)}" data-donation-label="${attr(label)}"`);
  }
  next = next.replace(/<div\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i, '<div class="price">Choose your support amount</div>');
  next = next.replace(/<li>Paid full PDF deck placeholder<\/li>/gi, '<li>Optional project support from €1 to €5,000</li>');
  next = next.replace(/<li>Paid print-ready deck placeholder<\/li>/gi, '<li>Public preview and evidence routes remain free</li>');
  next = next.replace(/\b(?:€\s*\d+(?:[.,]\d+)?(?:\s*\/\s*month)?\s*)?placeholder\b/gi, 'optional project support');
  if (!next.includes('data-donation-panel')) next = next.replace('</article>', `${supportPanel(key, label, suggested)}</article>`);
  return cleanPublicCopy(next);
}
function patchStore(html) {
  let next = ensureAssets(html);
  next = next.replace(/<section class="section money-card"><h2>Get the free weekly power map<\/h2>[\s\S]*?<\/section>/i, newsletterPanel());
  next = next.replace(/<article(?:\s+data-donation-card[^>]*)?\s+class="money-card" id="buy-[^"]+">[\s\S]*?<\/article>/gi, article => transformArticle(article));
  next = next.replace(/Reports, decks, memberships, books and public-record research services\./g, 'Free public-record reports, decks and evidence routes, with optional project support.');
  return cleanPublicCopy(next);
}
function patchDeckStore(html) {
  let next = ensureAssets(html);
  const heading = /<h2>All 52-Card Products<\/h2><div class="money-grid">([\s\S]*?)<\/div><\/section>/i;
  const match = next.match(heading);
  if (match) {
    const transformed = match[1].replace(/<article(?:\s+data-donation-card[^>]*)?\s+class="money-card">[\s\S]*?<\/article>/gi, article => transformArticle(article, { suggested: 25 }));
    next = next.replace(match[0], `<h2>All 52-Card Products</h2><div class="money-grid">${transformed}</div></section>`);
  }
  next = next.replace(/Free online card walls plus paid full PDF, print-ready and future collector editions\./g, 'Free online card walls with optional project support for research and future editions.');
  return cleanPublicCopy(next);
}
function patchPremiumReports(html) {
  let next = ensureAssets(html);
  next = next.replace(/<article(?:\s+data-donation-card[^>]*)?\s+class="money-card"(?:\s+id="[^"]+")?>[\s\S]*?<\/article>/gi, article => {
    if (!/<div\b[^>]*class=["'][^"']*\bprice\b/i.test(article) && !/Buy Placeholder/i.test(article) && !/data-donation-card/i.test(article)) return article;
    return transformArticle(article, { suggested: 25 });
  });
  next = next.replace(/Evidence-bounded reports and trackers made from cards, dossiers, clocks and routed conclusions\./g, 'Free evidence-bounded reports, trackers and previews, with optional project support.');
  return cleanPublicCopy(next);
}

const transforms = [['store.html', patchStore], ['card-deck-store.html', patchDeckStore], ['premium-reports.html', patchPremiumReports]];
for (const base of roots) {
  for (const [relative, transform] of transforms) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) { fs.writeFileSync(file, after); touched.push(path.relative(root, file).replace(/\\/g, '/')); }
  }
  for (const asset of ['paypal-voluntary-support.js', 'newsletter.js']) {
    const source = path.join(root, asset);
    const target = path.join(base, asset);
    if (fs.existsSync(source) && path.resolve(source) !== path.resolve(target)) { fs.copyFileSync(source, target); touched.push(path.relative(root, target).replace(/\\/g, '/')); }
  }
}

const checks = [];
for (const base of roots) {
  for (const relative of transforms.map(item => item[0])) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    checks.push({
      file: path.relative(root, file).replace(/\\/g, '/'),
      supportCards: (html.match(/data-donation-card/g) || []).length,
      fixedPricesRemoved: !/<div\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>\s*€\s*\d/i.test(html),
      implementationCopyRemoved: !/Buy Placeholder|Join Placeholder|Email capture placeholder|when the email provider is connected|connect (?:the )?provider and payment stack/i.test(html),
      amountControlsPresent: html.includes('data-donation-amount') && html.includes('min="1"') && html.includes('max="5000"'),
      supportScriptPresent: html.includes('paypal-voluntary-support.js'),
      newsletterConnected: relative !== 'store.html' || (html.includes('data-newsletter-form') && html.includes('newsletter.js')),
      legalBoundary: html.includes('not a charitable or tax-deductible donation'),
      termsLinked: html.includes('membership-terms.html'),
      freeBoundary: /remain free|remains free/i.test(html)
    });
  }
}
const ok = checks.length >= 3 && checks.every(row => row.supportCards > 0 && row.fixedPricesRemoved && row.implementationCopyRemoved && row.amountControlsPresent && row.supportScriptPresent && row.newsletterConnected && row.legalBoundary && row.termsLinked && row.freeBoundary);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'voluntary-support-store-patch.json'), `${JSON.stringify({ ok, generatedAt: new Date().toISOString(), touched: [...new Set(touched)], checks, amount: { minimum: 1, maximum: 5000, currency: 'EUR' }, publicEvidenceRemainsFree: true }, null, 2)}\n`);
if (!ok) throw new Error(`Voluntary support store patch failed: ${JSON.stringify(checks)}`);
console.log(`Store, deck store and premium reports now use connected free signup, reader-facing pre-launch copy and commercial terms (${[...new Set(touched)].length} file(s)).`);
