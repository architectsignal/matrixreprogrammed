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
const internalSectionPhrases = [
  'Matrix Reprogrammed · Money Engine',
  'TURN THE INTELLIGENCE MACHINE INTO PRODUCTS.',
  'One Machine · Three Doors',
  'MATRIX REPROGRAMMED STATUS',
  'The Public-Record Power Machine'
];
const internalCompactPhrases = [
  'Every route now points somewhere useful.',
  'Machine Room',
  'Research Tools',
  'Monetisation Dashboard'
];
const internalInlinePhrases = [
  'READER MONEY PATH',
  'Hook: latest file, hidden route, or public-source shock',
  'Proof: evidence vault, claim classifier, source card',
  'Capture: free brief / PDF mini-book',
  'Conversion: related book or Amazon store',
  'Return: daily drop, forum, live intel',
  'New Control Room',
  'THE TRACKER DASHBOARD IS LIVE.',
  'People, money, institutions, Epstein files, source records, speculation lanes and historical transport evidence now route through one central command page.',
  'Mission + Money Engine',
  'STORE / MEMBERSHIP / REPORTS.',
  'The intelligence machine now routes readers into free briefs, memberships, card decks, premium reports, books and public-record research services.',
  'CAPTURE SYSTEM',
  'Persistent Cloudflare D1 member record',
  'Email verification and passwordless login',
  'Weekly newsletter sender',
  'Vault route',
  'Download route',
  'Book path'
];
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

function removeInternalOnly(openingTag) {
  let next = openingTag.replace(/\sdata-internal-only\s*=\s*(["'])true\1/gi, '');
  next = next.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (match, quote, classes) => {
    const remaining = String(classes).split(/\s+/).filter(Boolean).filter(name => name !== 'internal-only');
    return remaining.length ? `class=${quote}${remaining.join(' ')}${quote}` : '';
  });
  return next;
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
  if (/(?:audit|health|automation|queue|manifest|intake|deploy-status|deploy-health|money-dashboard|monetisation-dashboard)/i.test(clean)) return true;
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

function parseContainerRanges(html) {
  const allowed = new Set([
    'section', 'article', 'aside', 'details', 'div', 'form',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'ul', 'ol', 'blockquote', 'pre', 'span', 'button'
  ]);
  const stack = [];
  const ranges = [];
  const re = /<\/?([a-z0-9]+)\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const tag = String(match[1] || '').toLowerCase();
    if (!allowed.has(tag)) continue;
    const closing = /^<\//.test(match[0]);
    if (!closing) {
      stack.push({ tag, start: match.index, openEnd: re.lastIndex, opening: match[0] });
      continue;
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].tag !== tag) continue;
      const open = stack.splice(i, 1)[0];
      ranges.push({ ...open, end: re.lastIndex });
      break;
    }
  }
  return ranges;
}

function applyOpeningEdits(html, ranges, starts) {
  const edits = [...starts]
    .map(start => ranges.find(range => range.start === start))
    .filter(Boolean)
    .sort((a, b) => b.start - a.start);
  for (const range of edits) {
    const opening = html.slice(range.start, range.openEnd);
    if (/\binternal-only\b|data-internal-only=["']true["']/i.test(opening)) continue;
    html = html.slice(0, range.start) + addClass(opening) + html.slice(range.openEnd);
  }
  return html;
}

function markPhraseContainers(html, phrases, mode) {
  const lower = html.toLowerCase();
  const ranges = parseContainerRanges(html);
  const openingStarts = new Set();
  for (const phrase of phrases) {
    const needle = phrase.toLowerCase();
    let from = 0;
    while (true) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      const ancestors = ranges.filter(range => range.start <= index && range.end >= index + needle.length);
      let chosen = null;
      if (mode === 'section') {
        chosen = ancestors.filter(range => range.tag === 'section').sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] || null;
      } else if (mode === 'inline') {
        const preferred = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p', 'blockquote', 'pre', 'ul', 'ol', 'span'];
        chosen = ancestors
          .filter(range => preferred.includes(range.tag))
          .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
          || ancestors.filter(range => range.tag === 'div').sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
          || null;
      } else {
        chosen = ancestors
          .filter(range => ['article', 'aside', 'details'].includes(range.tag) || (range.tag === 'div' && /(?:card|panel|box|path|status|capture|machine|route|reader|cta|money|engine)/i.test(range.opening)))
          .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
          || null;
      }
      if (chosen) openingStarts.add(chosen.start);
      from = index + needle.length;
    }
  }
  return applyOpeningEdits(html, ranges, openingStarts);
}

function ensurePhraseVisible(html, phrase) {
  const lower = html.toLowerCase();
  const needle = String(phrase || '').toLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) return html;
  const ranges = parseContainerRanges(html);
  const ancestors = ranges
    .filter(range => range.start <= index && range.end >= index + needle.length)
    .filter(range => ['section', 'article', 'aside', 'div', 'form'].includes(range.tag))
    .sort((a, b) => b.start - a.start);
  for (const range of ancestors) {
    const opening = html.slice(range.start, range.openEnd);
    const next = removeInternalOnly(opening);
    if (next !== opening) html = html.slice(0, range.start) + next + html.slice(range.openEnd);
  }
  return html;
}

function hideCommercialStrategy(html) {
  html = markPhraseContainers(html, internalSectionPhrases, 'section');
  html = markPhraseContainers(html, internalCompactPhrases, 'compact');
  html = markPhraseContainers(html, internalInlinePhrases, 'inline');
  return html;
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
    ['The member session could not be checked.', 'We could not sign you in. Please try again.'],
    ['Main Doors', 'Explore'],
    ['These are the useful routes. Everything else supports them.', 'Choose a route into the archive.'],
    ['The machine stays deep. The reader gets clear doors.', 'Choose a clear route into the archive.'],
    ['Fresh public-source updates routed into evidence trails, video hooks, free briefs, offers, and books.', 'Fresh public-source updates with evidence trails, video links, free briefs, and books.'],
    ['Turn updates into shorts, longform explainers, captions, and pinned comments that route readers back to the source trail.', 'Watch short and long-form explainers linked to the source trail.'],
    ['Capture attention with source-led PDFs and briefing packs, then route readers into offers and books.', 'Download source-led PDFs and briefing packs, then explore the related books.'],
    ['Daily updates stay fresh. Old updates move to the vault. The weekly email sends the strongest signal, source route, branded download, and book path.', 'Get a weekly email with the strongest signals, sources, downloads and related books.']
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
    .replace(/free briefs, offers, and books/gi, 'free briefs and books')
    .replace(/free briefs, offers, and book paths/gi, 'free briefs and related books')
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
    purpose: 'Internal routes, commercial strategy and operational labels retained for audits but hidden from normal public navigation.',
    hiddenRoutes: internalRoutes,
    labels: [
      'Sell / Capture',
      'Site Brain Router',
      'Money Engine',
      'Reader Money Path',
      'Matrix Reprogrammed Status',
      'Mission + Money Engine',
      'Capture System',
      'Monetisation Dashboard'
    ]
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
  html = hideCommercialStrategy(html);
  html = publicCopy(html);
  html = ensurePhraseVisible(html, 'Join Weekly Signal');
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
  commercialStrategyHidden: [...internalSectionPhrases, ...internalCompactPhrases, ...internalInlinePhrases],
  publicSignupPreserved: 'Join Weekly Signal',
  rawDataLinksHidden: true,
  internalPagesNoIndexed: true,
  cloudflareControlFilesExcluded: true,
  note: 'Files and routes remain intact. The public interface hides operational, audit, automation, commercial-strategy and author-facing controls while preserving the public weekly signup.'
};
fs.writeFileSync(path.join(reportDir, 'public-visibility-report.json'), JSON.stringify(report, null, 2));
console.log(`Public visibility layer applied: ${changed} file(s) changed; internal routes and commercial strategy retained but hidden from normal visitors.`);
