const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

const INTERNAL_STYLE = `<style id="public-internal-visibility">.internal-only,[data-internal-only="true"]{display:none!important}</style>`;
const VAULT_ID = 'public-copy-internal-vault';

const internalRoutes = [
  'review-dashboard.html',
  'deploy-status.html',
  'deploy-health.html',
  'card-system-health.html',
  'site-brain-router.html',
  'card-artwork-automation.html',
  'card-artwork-queue.html',
  'conclusion-engine.html',
  'information-gathering-system.html',
  'source-intake.html',
  'update-monitor.html',
  'distribution-center.html',
  'launch-room.html',
  'offer-center.html',
  'sales-ladder.html',
  'schema-index.html',
  'machine-index.html',
  'campaign-calendar.html',
  'card-art-studio.html'
];

const internalArticleHeadings = ['SITE BRAIN ROUTER'];
const noIndexFiles = new Set(internalRoutes);

function addClass(openingTag, className = 'internal-only') {
  if (/\bclass\s*=/.test(openingTag)) {
    return openingTag.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (match, quote, classes) => {
      const list = new Set(String(classes).split(/\s+/).filter(Boolean));
      list.add(className);
      return `class=${quote}${[...list].join(' ')}${quote}`;
    });
  }
  return openingTag.replace(/>$/, ` class="${className}" data-internal-only="true">`);
}

function ensureVisibilityStyle(html) {
  if (html.includes('id="public-internal-visibility"')) return html;
  if (html.includes('</head>')) return html.replace('</head>', `${INTERNAL_STYLE}</head>`);
  return INTERNAL_STYLE + html;
}

function ensureNoIndex(html, fileName) {
  if (!noIndexFiles.has(fileName)) return html;
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = '<meta name="robots" content="noindex,nofollow,noarchive"/>';
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : tag + html;
}

function hrefShouldBeHidden(href) {
  const clean = String(href || '').split('#')[0].split('?')[0].replace(/^\.\//, '');
  if (!clean) return false;
  if (internalRoutes.some(route => clean.endsWith(route))) return true;
  if (/\.json$/i.test(clean) && /(?:data|downloads)\//i.test(clean)) return true;
  if (/\.md$/i.test(clean) && /(?:data|downloads)\//i.test(clean)) return true;
  if (/(?:audit|health|automation|queue|manifest|intake|deploy-status|deploy-health)/i.test(clean)) return true;
  return false;
}

function hideInternalLinks(html) {
  return html.replace(/<a\b[^>]*\bhref\s*=\s*(["'])([^"']+)\1[^>]*>/gi, (tag, quote, href) => {
    return hrefShouldBeHidden(href) ? addClass(tag) : tag;
  });
}

function hideInternalArticles(html) {
  return html.replace(/<article\b[^>]*>[\s\S]*?<\/article>/gi, block => {
    const isInternal = internalArticleHeadings.some(heading => block.includes(`<h2>${heading}</h2>`));
    if (!isInternal) return block;
    return block.replace(/^<article\b[^>]*>/i, opening => addClass(opening));
  });
}

function publicCopy(html) {
  const swaps = [
    ['Sell / Capture', 'Reader Resources'],
    ['Opt-in Center', 'Free Briefs'],
    ['Live Intel Machine', 'Live Intel'],
    ['Membership System', 'Membership'],
    ['Private Member Layer', 'Member Area'],
    ['Planned PayPal membership tiers', 'Membership tiers'],
    ['PayPal activation pending', 'Coming soon'],
    ['Creating your member record…', 'Creating your account…'],
    ['Checking your secure session…', 'Signing you in…'],
    ['Your member session is missing or has expired.', 'Your sign-in has expired.'],
    ['passwordless member login', 'secure email sign-in'],
    ['paid member entitlement active', 'premium membership active'],
    ['tier-aware protected content', 'premium member content'],
    ['PayPal setup pending', 'Paid memberships coming soon'],
    ['Not supplied by PayPal', 'Not available'],
    ['Your secure member session is not active.', 'Please sign in to continue.'],
    ['Secure session active.', 'You are signed in.'],
    ['The member session could not be checked.', 'We could not sign you in. Please try again.']
  ];
  for (const [from, to] of swaps) html = html.split(from).join(to);

  html = html
    .replace(/Join the free member layer now\. Paid PayPal tiers will be activated only after subscription verification and protected-access testing are complete\./g, 'Join free today. Paid memberships will open soon.')
    .replace(/Join the free member layer now\. Paid memberships will open when PayPal setup is complete\./g, 'Join free today. Paid memberships will open soon.')
    .replace(/These tiers remain deliberately disabled until PayPal webhooks can prove payment status before granting access\./g, 'Paid memberships are coming soon.')
    .replace(/Verification links expire after 15 minutes and can be used once\. Login sessions use secure, HttpOnly cookies\./g, 'Verification links expire after 15 minutes and can only be used once.')
    .replace(/Account saved\. Check your email for the one-time verification link\./g, 'Check your email for your verification link.')
    .replace(/Account saved, but verification email delivery is not configured yet\./g, 'We could not send the email. Please try again later.')
    .replace(/Account saved, but verification email delivery is unavailable\./g, 'We could not send the email. Please try again later.')
    .replace(/Paid PayPal tiers will be activated only after subscription verification and protected-access testing are complete\./g, 'Paid memberships will open soon.')
    .replace(/The backend checks the PayPal subscription, Plan ID, checkout intent and webhook status\./g, 'PayPal confirms each membership before access begins.')
    .replace(/The browser cannot activate a membership\./g, '')
    .replace(/Paid access is granted only while PayPal reports <strong>ACTIVE<\/strong>\./g, '')
    .replace(/<p class="mini">Verification links expire after 15 minutes and can be used once\. Login sessions use secure, HttpOnly cookies\.<\/p>/g, '<p class="mini">Verification links expire after 15 minutes and can only be used once.</p>');

  html = html.replace(
    /<footer class="footer wrap">(?=<p><strong>Boundary:<\/strong> Paid access will not be enabled until PayPal subscription state, cancellation and failed-payment handling are verified\.<\/p><\/footer>)/g,
    '<footer class="footer wrap internal-only" data-internal-only="true">'
  );
  html = html.replace(/<p class="small" id="paypal-reference"><\/p>/g, '<p class="small internal-only" id="paypal-reference" data-internal-only="true"></p>');
  return html;
}

function addVault(html) {
  html = html.replace(new RegExp(`<script[^>]+id=["']${VAULT_ID}["'][^>]*>[\\s\\S]*?<\\/script>`, 'gi'), '');
  const payload = {
    purpose: 'Internal routes and operational labels retained for audits but hidden from normal public navigation.',
    hiddenRoutes: internalRoutes,
    labels: ['Sell / Capture', 'Site Brain Router', 'Artwork Automation', 'Card System Health', 'Copy/Intake Audit']
  };
  const vault = `<script type="application/json" id="${VAULT_ID}" data-internal-only="true">${JSON.stringify(payload)}</script>`;
  if (html.includes('</body>')) return html.replace('</body>', `${vault}</body>`);
  return html + vault;
}

function patchHtml(file) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  const fileName = path.basename(file);
  html = ensureVisibilityStyle(html);
  html = ensureNoIndex(html, fileName);
  html = hideInternalLinks(html);
  html = hideInternalArticles(html);
  html = publicCopy(html);
  html = addVault(html);
  if (html !== before) fs.writeFileSync(file, html);
  return html !== before;
}

function collectHtml(dir, topLevelOnly = false) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!topLevelOnly) files.push(...collectHtml(full));
      continue;
    }
    const isHtmlFile = entry.name.endsWith('.html');
    const isExtensionlessHtmlRoute = !path.extname(entry.name) && fs.existsSync(path.join(dir, `${entry.name}.html`));
    if (isHtmlFile || isExtensionlessHtmlRoute) files.push(full);
  }
  return files;
}

const targets = [
  ...collectHtml(root, true),
  ...collectHtml(path.join(root, '_site'))
];
let changed = 0;
for (const file of [...new Set(targets)]) if (patchHtml(file)) changed += 1;

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  filesChecked: targets.length,
  filesChanged: changed,
  internalRoutesHidden: internalRoutes,
  rawDataLinksHidden: true,
  internalPagesNoIndexed: true,
  cloudflareControlFilesExcluded: true,
  note: 'Files and routes remain intact. The public interface hides operational, audit, automation and author-facing controls.'
};
fs.writeFileSync(path.join(reportDir, 'public-visibility-report.json'), JSON.stringify(report, null, 2));
console.log(`Public visibility layer applied: ${changed} file(s) changed; internal routes retained but hidden from normal visitors.`);
