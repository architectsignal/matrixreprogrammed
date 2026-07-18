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
function isCanonicalCommercialStore(html) {
  return String(html || '').includes('CURRENT COMMERCIAL STATUS.')
    && String(html || '').includes('data-newsletter-form')
    && String(html || '').includes('membership-terms.html');
}
function supportPanel(key, label, suggested) {
  const safeKey = attr(key);
  const safeLabel = attr(label);
  const defaultAmount = Number(suggested) >= 1 && Number(suggested) <= 5000 ? Number(suggested) : 25;
  return `<div class="donation-panel" data-donation-panel><p class="donation-heading"><strong>Choose your donation amount</strong></p><p class="mini">Enter any amount from €1 to €5,000. The evidence, preview and public routes remain free.</p><div class="donation-quick-row"><button type="button" class="btn alt" data-donation-quick="5">€5</button><button type="button" class="btn alt" data-donation-quick="25">€25</button><button type="button" class="btn alt" data-donation-quick="100">€100</button><button type="button" class="btn alt" data-donation-quick="500">€500</button><button type="button" class="btn alt" data-donation-quick="1000">€1,000</button></div><label class="donation-amount-label">Donation amount (€)<input data-donation-amount type="number" min="1" max="5000" step="0.01" inputmode="decimal" value="${defaultAmount}" aria-label="Donation amount for ${safeLabel}" /></label><button class="btn donation-submit" type="button" data-donation-submit disabled>Continue securely with PayPal</button><p class="donation-status mini" data-donation-status>Support checkout is safely disabled until the configured PayPal gates pass.</p><p class="mini"><strong>Payment boundary:</strong> this is a voluntary support payment, not a charitable or tax-deductible donation. It does not buy stronger evidence, alter conclusions, or restrict public access.</p></div>`;
}
function ensureAssets(html) {
  let next = html;
  if (!next.includes('id="voluntary-support-store-styles"')) {
    const styles = `<style id="voluntary-support-store-styles">.donation-panel{margin-top:1rem;padding:1rem;border:1px solid rgba(216,181,106,.32);border-radius:16px;background:rgba(0,0,0,.35)}.donation-heading{font-size:1.05rem;color:#f3e6bd}.donation-quick-row{display:flex;flex-wrap:wrap;gap:.45rem;margin:.75rem 0}.donation-quick-row .btn{padding:.48rem .7rem}.donation-amount-label{display:grid;gap:.35rem;font-weight:800;color:#d8b56a}.donation-amount-label input{width:100%;max-width:240px;background:#050505;color:#f3e6bd;border:1px solid rgba(216,181,106,.45);border-radius:12px;padding:.75rem}.donation-submit{margin-top:.75rem}.donation-status[data-kind="error"]{color:#ff9b9b}.donation-status[data-kind="success"],.donation-status[data-kind="ready"]{color:#9ee6ad}.donation-global-status{margin:1rem 0;padding:.85rem 1rem;border-left:3px solid #d8b56a;background:rgba(216,181,106,.08)}</style>`;
    next = next.replace('</head>', `${styles}</head>`);
  }
  if (!next.includes('src="paypal-voluntary-support.js"')) next = next.replace('</body>', '<script src="paypal-voluntary-support.js"></script></body>');
  if (!next.includes('data-donation-global-status')) {
    const status = '<section class="donation-global-status" data-donation-global-status>Support checkout is currently disabled. All public evidence and previews remain free.</section>';
    next = next.replace(/(<main\b[^>]*>)/i, `$1${status}`);
  }
  return next;
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
  let next = article;
  if (/data-donation-card/i.test(next)) {
    next = next.replace(/\bdata-donation-label="[^"]*"/i, `data-donation-label="${attr(label)}"`);
    next = next.replace(/\bdata-donation-key="[^"]*"/i, `data-donation-key="${attr(key)}"`);
  } else {
    next = next.replace(/<article\b/i, `<article data-donation-card data-donation-key="${attr(key)}" data-donation-label="${attr(label)}"`);
  }
  next = next.replace(/<div\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i, '<div class="price">Choose your donation amount</div>');
  next = next.replace(/<a\b[^>]*>\s*Buy Placeholder\s*<\/a>/gi, '');
  next = next.replace(/<li>Paid full PDF deck placeholder<\/li>/gi, '<li>Voluntary support option from €1 to €5,000</li>');
  next = next.replace(/<li>Paid print-ready deck placeholder<\/li>/gi, '<li>Public preview and evidence routes remain free</li>');
  next = next.replace(/\b(?:€\s*\d+(?:[.,]\d+)?(?:\s*\/\s*month)?\s*)?placeholder\b/gi, 'voluntary support option');
  if (!next.includes('data-donation-panel')) next = next.replace('</article>', `${supportPanel(key, label, suggested)}</article>`);
  return next;
}
function patchStore(html) {
  if (isCanonicalCommercialStore(html)) return html;
  let next = ensureAssets(html);
  next = next.replace(/<article class="money-card" id="buy-[^"]+">[\s\S]*?<\/article>/gi, article => transformArticle(article));
  next = next.replace(/Reports, decks, memberships, books and public-record research services\./g, 'Free public-record reports, decks and evidence routes, with an optional user-chosen support payment.');
  return next;
}
function patchDeckStore(html) {
  let next = ensureAssets(html);
  const heading = /<h2>All 52-Card Products<\/h2><div class="money-grid">([\s\S]*?)<\/div><\/section>/i;
  const match = next.match(heading);
  if (match) {
    const transformed = match[1].replace(/<article class="money-card">[\s\S]*?<\/article>/gi, article => transformArticle(article, { suggested: 25 }));
    next = next.replace(match[0], `<h2>All 52-Card Products</h2><div class="money-grid">${transformed}</div></section>`);
  }
  next = next.replace(/Free online card walls plus paid full PDF, print-ready and future collector editions\./g, 'Free online card walls with an optional user-chosen support payment for the research and future editions.');
  return next;
}
function patchPremiumReports(html) {
  let next = ensureAssets(html);
  next = next.replace(/<article class="money-card"(?:\s+id="[^"]+")?>[\s\S]*?<\/article>/gi, article => {
    if (!/<div\b[^>]*class=["'][^"']*\bprice\b/i.test(article) && !/Buy Placeholder/i.test(article)) return article;
    return transformArticle(article, { suggested: 25 });
  });
  next = next.replace(/Evidence-bounded reports and trackers made from cards, dossiers, clocks and routed conclusions\./g, 'Free evidence-bounded reports, trackers and previews, with an optional user-chosen support payment.');
  return next;
}

const transforms = [
  ['store.html', patchStore],
  ['card-deck-store.html', patchDeckStore],
  ['premium-reports.html', patchPremiumReports]
];
for (const base of roots) {
  for (const [relative, transform] of transforms) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
  const sourceJs = path.join(root, 'paypal-voluntary-support.js');
  const targetJs = path.join(base, 'paypal-voluntary-support.js');
  if (fs.existsSync(sourceJs) && path.resolve(sourceJs) !== path.resolve(targetJs)) {
    fs.copyFileSync(sourceJs, targetJs);
    touched.push(path.relative(root, targetJs).replace(/\\/g, '/'));
  }
}

const checks = [];
for (const base of roots) {
  for (const relative of transforms.map(item => item[0])) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const canonicalStore = relative === 'store.html' && isCanonicalCommercialStore(html);
    const row = {
      file: path.relative(root, file).replace(/\\/g, '/'),
      mode: canonicalStore ? 'canonical-commercial-store' : 'voluntary-support',
      donationCards: (html.match(/data-donation-card/g) || []).length,
      fixedPricesRemoved: !/<div\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>\s*€\s*\d/i.test(html),
      buyPlaceholdersRemoved: !/Buy Placeholder/i.test(html),
      rangePresent: html.includes('€1 to €5,000'),
      scriptPresent: html.includes('paypal-voluntary-support.js'),
      legalBoundary: html.includes('not a charitable or tax-deductible donation'),
      freeBoundary: /remain free|remains free/i.test(html),
      canonicalStatus: canonicalStore && html.includes('CURRENT COMMERCIAL STATUS.'),
      verifiedNewsletter: canonicalStore && html.includes('data-newsletter-form'),
      termsRoute: canonicalStore && html.includes('membership-terms.html')
    };
    row.valid = canonicalStore
      ? row.donationCards === 0 && row.fixedPricesRemoved && row.buyPlaceholdersRemoved && row.canonicalStatus && row.verifiedNewsletter && row.termsRoute
      : row.donationCards > 0 && row.fixedPricesRemoved && row.buyPlaceholdersRemoved && row.rangePresent && row.scriptPresent && row.legalBoundary && row.freeBoundary;
    checks.push(row);
  }
}
const ok = checks.length >= 3 && checks.every(row => row.valid);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'voluntary-support-store-patch.json'), `${JSON.stringify({ ok, generatedAt: new Date().toISOString(), touched: [...new Set(touched)], checks, amount: { minimum: 1, maximum: 5000, currency: 'EUR' }, evidenceAccessRemainsFree: true, canonicalStorePreserved: checks.some(row => row.mode === 'canonical-commercial-store') }, null, 2)}\n`);
if (!ok) throw new Error(`Voluntary support store patch failed: ${JSON.stringify(checks)}`);
console.log(`Voluntary support cards patched where applicable; canonical paid-launch store preserved (${[...new Set(touched)].length} file(s) changed).`);
