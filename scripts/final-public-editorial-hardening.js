const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const prettyToday = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${today}T12:00:00Z`));

const INTERNAL_PAGES = [
  'card-artwork-batches.html',
  'funnel-book-path.html',
  'monetisation-dashboard.html',
  'site-population-audit.html',
  'speculative-conclusion-review-queue.html',
  'thank-you-book-path.html'
];

const SOURCES = {
  doj: 'https://www.justice.gov/epstein/doj-disclosures',
  apEpstein: 'https://apnews.com/article/ed743598c320b94bd9d91631618678d9',
  sec: 'https://www.sec.gov/edgar/search/',
  spending: 'https://www.usaspending.gov/',
  fec: 'https://www.fec.gov/data/',
  ecb: 'https://www.ecb.europa.eu/euro/digital_euro/html/index.en.html',
  aiAct: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
  euAi: 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai',
  bisCbdc: 'https://www.bis.org/topic/cbdc.htm'
};

function read(file) {
  const full = path.join(root, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}
function write(file, content) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const before = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  if (before === content) return false;
  fs.writeFileSync(full, content);
  return true;
}
function ensureNoIndex(html) {
  if (/name=["']robots["']/i.test(html)) {
    return html.replace(/<meta\b[^>]*name=["']robots["'][^>]*>/i, '<meta name="robots" content="noindex,nofollow,noarchive"/>');
  }
  const tag = '<meta name="robots" content="noindex,nofollow,noarchive"/>';
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : tag + html;
}
function addInternalClass(tag) {
  if (/\bclass\s*=/.test(tag)) return tag.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (m, q, classes) => `class=${q}${classes} internal-only${q}`);
  return tag.replace(/>$/, ' class="internal-only" data-internal-only="true">');
}
function hideLinksToInternalPages(html) {
  return html.replace(/<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>/gi, (tag, quote, href) => {
    const clean = String(href).split('#')[0].split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
    if (!INTERNAL_PAGES.some(file => clean.endsWith(file) || clean === file.replace(/\.html$/, ''))) return tag;
    return /\binternal-only\b/.test(tag) ? tag : addInternalClass(tag);
  });
}
function hideSectionById(html, id) {
  const re = new RegExp(`<section\\b([^>]*\\bid=["']${id}["'][^>]*)>`, 'i');
  return html.replace(re, opening => /\binternal-only\b/.test(opening) ? opening : addInternalClass(opening));
}
function removeExistingBlock(html, id) {
  const re = new RegExp(`\\s*<section\\b[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/section>`, 'i');
  return html.replace(re, '');
}
function insertBeforeMainEnd(html, block) {
  return html.includes('</main>') ? html.replace('</main>', `${block}</main>`) : html.replace('</body>', `${block}</body>`);
}
function patchPage(file, transform) {
  const html = read(file);
  if (!html) return false;
  return write(file, transform(html));
}
function sourceLinks(items) {
  return `<div class="cta-row small">${items.map(([label, url]) => `<a class="btn alt" href="${url}" rel="noopener">${label}</a>`).join('')}</div>`;
}

const sharedPowerSection = `<section id="deep-current-power-assessment" class="section wrap">
  <div class="eyebrow">Current Assessment · ${prettyToday}</div>
  <h2>What the records support now</h2>
  <p class="lead">The strongest defensible conclusion is not that one hidden centre commands every institution. It is that modern power is exercised through interoperable systems: law, identity, payment infrastructure, procurement, standards, data, contracts, ownership and access rules.</p>
  <div class="grid">
    <article class="card redline">
      <h3>1. Access architecture is becoming a central power layer</h3>
      <p><strong>Documented position:</strong> the EU AI Act is being applied in stages, while the digital-euro project has moved into technical preparation for a possible first issuance in 2029 if the necessary legislation is adopted. These are separate programmes, but both place rules, identity, risk controls and technical standards closer to ordinary access.</p>
      <p><strong>Mechanism:</strong> influence becomes operational when a rule is translated into software, vendor contracts, eligibility checks, payment interfaces, audit logs and appeal procedures.</p>
      <p><strong>Why it matters:</strong> the decisive question is no longer only who announces policy; it is who designs the infrastructure, who can deny access, what data moves between systems and whether a person can challenge an automated decision.</p>
      <p><strong>Limitation:</strong> interoperability does not by itself prove authoritarian intent, a single command structure or unlawful coordination. It can also serve resilience, fraud reduction and public convenience.</p>
      <p><strong>Watch next:</strong> mandatory-use language, vendor awards, data-sharing terms, offline alternatives, human appeal rights and cross-border compatibility.</p>
      ${sourceLinks([['EU AI Act', SOURCES.aiAct], ['European Commission AI policy', SOURCES.euAi], ['ECB digital euro', SOURCES.ecb], ['BIS CBDC research', SOURCES.bisCbdc]])}
    </article>
    <article class="card redline">
      <h3>2. Financial and institutional influence must be measured, not assumed</h3>
      <p><strong>Documented position:</strong> ownership, public contracts, political money and regulatory filings are visible through official databases. Those records can establish holdings, awards, donations, lobbying routes, board roles and public dependencies.</p>
      <p><strong>Mechanism:</strong> leverage grows when capital ownership overlaps with infrastructure dependency, procurement, standards, advisory mandates or voting power. A name in a network is weak evidence; a dated contract, filing, mandate or vote is much stronger.</p>
      <p><strong>Implication:</strong> the useful map is a chain from entity → asset → legal authority → money route → implementation decision → affected public.</p>
      <p><strong>Limitation:</strong> large scale or association is not proof of corruption, shared intent or secret control. Competing institutions, regulation and market constraints can limit influence.</p>
      <p><strong>Watch next:</strong> new public awards, proxy-voting disclosures, beneficial ownership changes, revolving-door appointments, grant clusters and enforcement actions.</p>
      ${sourceLinks([['SEC EDGAR', SOURCES.sec], ['USAspending', SOURCES.spending], ['FEC data', SOURCES.fec]])}
    </article>
    <article class="card redline">
      <h3>3. Missing records are conclusions about evidence quality, not guilt</h3>
      <p><strong>Documented position:</strong> a missing contract, docket, redaction log, meeting calendar or source file prevents a claim from being upgraded. The absence is important because it shows exactly where public verification stops.</p>
      <p><strong>Mechanism:</strong> the site should compare inventories, versions, dates, legal exemptions and duplicate handling. That turns a vague suspicion into a testable records question.</p>
      <p><strong>Implication:</strong> the most valuable next action is often not another theory; it is obtaining the primary record that can confirm, narrow or falsify the theory.</p>
      <p><strong>Counterpoint:</strong> records may be absent for ordinary reasons such as privacy, privilege, retention rules, duplication or an unfinished investigation. Missing does not automatically mean concealed.</p>
      <p><strong>Watch next:</strong> changed indexes, restored files, appeal decisions, privilege logs, court orders and discrepancies between announced and downloadable inventories.</p>
      <a class="btn" href="daily-missing-records.html">Open Missing Records</a>
    </article>
  </div>
</section>`;

const epsteinDeepSection = `<section id="deep-epstein-assessment" class="section">
  <div class="eyebrow">Current File Assessment · ${prettyToday}</div>
  <h2>What the release record supports</h2>
  <div class="ep-grid">
    <article class="ep-card sensitive">
      <h3>Release scale is established; completeness remains auditable</h3>
      <p><strong>Documented fact:</strong> on 30 January 2026 the U.S. Justice Department said it had published about 3.5 million responsive pages, including roughly 180,000 images and 2,000 videos. Reporting on the release said the review universe contained more than six million potentially responsive pages.</p>
      <p><strong>Mechanism:</strong> completeness cannot be judged from the headline page count alone. It requires an inventory of duplicates, privileges, victim-protection redactions, child-sexual-abuse material, withdrawn files, restored files and material judged non-responsive.</p>
      <p><strong>Why it matters:</strong> the central public-record question is whether every withholding category can be reconciled against a transparent index and legal basis.</p>
      <p><strong>Limitation:</strong> the gap between reviewed and published material does not by itself prove political protection. Some exclusions are legally required and some pages may be duplicates.</p>
      <p><strong>Watch next:</strong> a complete withholding log, version history, restored-file list, court challenges and congressional reconciliation of the six-million-page review universe.</p>
      ${sourceLinks([['DOJ disclosures', SOURCES.doj], ['Associated Press release report', SOURCES.apEpstein]])}
    </article>
    <article class="ep-card">
      <h3>A name in a file is a lead, not a verdict</h3>
      <p><strong>Documented fact:</strong> the released material contains address books, emails, calendars, photographs, flight records, interview reports and unverified submissions. These record types prove different things.</p>
      <p><strong>Mechanism:</strong> evidential weight rises from mere mention to authenticated communication, corroborated travel, financial transaction, sworn testimony, judicial finding or conviction. Context, date and document provenance must travel with every name.</p>
      <p><strong>Implication:</strong> the site should classify each appearance by record type and never collapse contact, social proximity, allegation and proven conduct into one category.</p>
      <p><strong>Limitation:</strong> even repeated contact does not automatically establish knowledge of, participation in or responsibility for Epstein's crimes.</p>
      <p><strong>Watch next:</strong> corroborating dockets, financial records, sworn evidence, contemporaneous messages and official findings.</p>
      <a class="btn alt" href="epstein-evidence-boundary.html">Open Evidence Boundary</a>
    </article>
    <article class="ep-card">
      <h3>The strongest conclusion concerns institutional handling</h3>
      <p><strong>Documented position:</strong> the case spans the 2007 federal investigation, the non-prosecution agreement, later federal prosecution, Maxwell's conviction and successive disclosure programmes.</p>
      <p><strong>Mechanism:</strong> institutional accountability can be tested through charging memoranda, plea and immunity terms, victim-notification records, supervisory approvals, prison records and disclosure logs.</p>
      <p><strong>Why it matters:</strong> these records can show who made each decision, under what authority and with what stated justification without relying on speculation about every person mentioned.</p>
      <p><strong>Counterpoint:</strong> an unpopular or failed decision is not necessarily criminal; legal discretion, evidential limits and victim protection must be examined alongside criticism.</p>
      <p><strong>Next record:</strong> complete 2007 charging material, decision-chain records, victim-notification documentation and a stable public release index.</p>
      <a class="btn alt" href="epstein-timeline.html">Open Timeline</a>
    </article>
  </div>
</section>`;

const speculativeDeepSection = `<section id="testable-speculative-assessment" class="section">
  <div class="eyebrow">Testable Hypotheses · ${prettyToday}</div>
  <h2>What can be inferred, and what would falsify it</h2>
  <div class="grid">
    <article class="card warn">
      <h3>Convergence hypothesis: supported at infrastructure level, unproven at command level</h3>
      <p><strong>Supporting record:</strong> digital-money preparation, AI regulation, identity standards and cross-border policy coordination are documented programmes. They create common rules and interoperable infrastructure.</p>
      <p><strong>Mechanism proposed:</strong> control could increase when identity, payment, compliance and data systems become mutually dependent and when opting out becomes impractical.</p>
      <p><strong>Alternative explanation:</strong> coordination can arise from efficiency, fraud prevention, trade and technical compatibility rather than a hidden plan.</p>
      <p><strong>Falsification test:</strong> the strongest version weakens if systems remain voluntary, data-minimised, decentralised, interoperable with cash/offline alternatives and subject to effective appeal.</p>
      <p><strong>Watch next:</strong> mandatory-use provisions, exclusion rules, vendor concentration and legal limits on data combination.</p>
      ${sourceLinks([['EU AI Act', SOURCES.aiAct], ['ECB digital euro', SOURCES.ecb], ['BIS CBDC research', SOURCES.bisCbdc]])}
    </article>
    <article class="card warn">
      <h3>Emergency-power hypothesis: requires before-and-after legal comparison</h3>
      <p><strong>Supporting pattern:</strong> crises often produce temporary powers, accelerated procurement and new surveillance or access controls.</p>
      <p><strong>Mechanism proposed:</strong> temporary measures can become durable through renewed statutes, permanent budgets, vendor infrastructure and institutional habit.</p>
      <p><strong>Alternative explanation:</strong> some powers expire, courts intervene and emergency capacity can be necessary to manage genuine threats.</p>
      <p><strong>Falsification test:</strong> compare sunset dates, judicial review, budget continuation, data-retention rules and whether the authority is actually withdrawn after the crisis.</p>
      <p><strong>Next record:</strong> original emergency order, extension instrument, procurement award, privacy assessment and termination notice.</p>
      <a class="btn alt" href="emergency-power-theory.html">Open Theory</a>
    </article>
    <article class="card warn">
      <h3>Elite-network hypothesis: association alone is insufficient</h3>
      <p><strong>Supporting pattern:</strong> boards, conferences, foundations, donations and advisory groups create repeat contact between public and private decision-makers.</p>
      <p><strong>Mechanism proposed:</strong> repeated access may shape agendas before formal democratic decisions are visible.</p>
      <p><strong>Alternative explanation:</strong> elite professional networks are expected in specialised fields and do not prove coordinated wrongdoing.</p>
      <p><strong>Falsification test:</strong> require a decision link: meeting → proposal → funding or mandate → implementation. Without that chain, the claim remains association.</p>
      <p><strong>Next record:</strong> agenda, attendee list, minutes, funding disclosure, lobbying filing and subsequent policy text.</p>
      ${sourceLinks([['SEC EDGAR', SOURCES.sec], ['USAspending', SOURCES.spending], ['FEC data', SOURCES.fec]])}
    </article>
  </div>
</section>`;

const dailyAssessment = `<section id="daily-deep-assessment" class="section wrap">
  <div class="eyebrow">Analyst Assessment · ${prettyToday}</div>
  <h2>What these signals mean together</h2>
  <p class="lead">Today's useful conclusion is structural: regulatory rules, payment architecture, public contracts and disclosure systems should be read together only where a documented implementation route connects them.</p>
  <div class="intel-grid">
    <article class="intel-card"><h3>Mechanism</h3><p>Policy becomes power through standards, procurement, software, contracts, ownership, voting rights and access decisions. The strongest evidence is a dated primary record connecting one stage to the next.</p></article>
    <article class="intel-card"><h3>Implication</h3><p>A high clock or network score is a triage device, not a finding. It should direct readers toward the exact filing, award, legal text or docket that can confirm the route.</p></article>
    <article class="intel-card"><h3>Limit</h3><p>High centrality does not prove intent, guilt or command. Competing mandates, legal safeguards, market constraints and ordinary institutional coordination remain plausible explanations.</p></article>
    <article class="intel-card"><h3>Watch next</h3><p>Prioritise changed legal language, new vendor awards, cross-system data sharing, denied-access rules, restored or removed files and records that change a score rather than merely repeat a name.</p></article>
  </div>
  ${sourceLinks([['EU AI Act', SOURCES.aiAct], ['ECB digital euro', SOURCES.ecb], ['SEC EDGAR', SOURCES.sec], ['USAspending', SOURCES.spending]])}
</section>`;

let changes = [];

for (const file of INTERNAL_PAGES) {
  if (!read(file)) continue;
  if (patchPage(file, ensureNoIndex)) changes.push(`${file}:noindex`);
}

for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  if (patchPage(file, hideLinksToInternalPages)) changes.push(`${file}:internal-links`);
}

if (patchPage('answer-engine.html', html => {
  html = html.replace(/<section class="hero wrap commercial-internal">/i, '<section class="hero wrap">');
  html = hideSectionById(html, 'phase-twelve-authority-engine');
  html = hideSectionById(html, 'phase-thirteen-schema-engine');
  return html;
})) changes.push('answer-engine.html:public-hero');

if (patchPage('conclusions-engine.html', html => {
  html = removeExistingBlock(html, 'deep-current-power-assessment');
  return insertBeforeMainEnd(html, sharedPowerSection);
})) changes.push('conclusions-engine.html:deep-assessment');

if (patchPage('power-conclusions.html', html => {
  html = removeExistingBlock(html, 'deep-current-power-assessment');
  return insertBeforeMainEnd(html, sharedPowerSection);
})) changes.push('power-conclusions.html:deep-assessment');

if (patchPage('epstein-conclusions.html', html => {
  html = removeExistingBlock(html, 'deep-epstein-assessment');
  return insertBeforeMainEnd(html, epsteinDeepSection);
})) changes.push('epstein-conclusions.html:deep-assessment');

if (patchPage('speculative-conclusions.html', html => {
  html = removeExistingBlock(html, 'testable-speculative-assessment');
  const anchor = '<div class="cta-row">';
  return html.includes(anchor) ? html.replace(anchor, `${speculativeDeepSection}${anchor}`) : insertBeforeMainEnd(html, speculativeDeepSection);
})) changes.push('speculative-conclusions.html:testable-assessment');

if (patchPage('daily-power-conclusions.html', html => {
  html = html.replace(/record\.\.<\/p>/g, 'record.</p>').replace(/record\.\./g, 'record.');
  html = removeExistingBlock(html, 'daily-deep-assessment');
  return insertBeforeMainEnd(html, dailyAssessment);
})) changes.push('daily-power-conclusions.html:deep-assessment');

if (patchPage('daily-command-brief.html', html => {
  html = html.replace(/Checked:\s*1 July 2026/gi, `Checked: ${prettyToday}`);
  html = html.replace(/<p>0 new record movement\(s\)\.<\/p>/g, '<p>No verified new record movement was detected in the current build. This is a neutral result, not evidence that nothing changed outside the tracked feeds.</p>');
  html = html.replace(/<p>0 review prompts\.<\/p>/g, '<p>No new contradiction prompt met the publication threshold. Existing claims still require source comparison and missing-record review.</p>');
  html = removeExistingBlock(html, 'daily-deep-assessment');
  return insertBeforeMainEnd(html, dailyAssessment);
})) changes.push('daily-command-brief.html:interpretation');

const deepFindings = {
  updated: new Date().toISOString(),
  batchId: 'CONCLUSIONS-002',
  title: 'Conclusions Engine — Current Public-Record Findings',
  mission: 'Convert current records into defensible conclusions with mechanism, implications, limits and next records.',
  boundary: 'A finding describes what public records support. It does not convert association, scale, missing records or institutional overlap into proof of guilt, secret intent or unlawful coordination.',
  conclusionRules: [
    'Use a primary record or named reputable source for every material factual claim.',
    'Explain the mechanism connecting a person, institution, money route, rule or contract to an outcome.',
    'State the strongest alternative explanation and what the evidence cannot establish.',
    'Give the next record or observable event that would upgrade, downgrade or falsify the finding.',
    'Treat missing records as an evidence-quality conclusion, not as proof of concealment.'
  ],
  findings: [
    {
      id: 'CON-101', grade: 'A', title: 'Access infrastructure is now a measurable power layer.',
      conclusion: 'Digital identity, AI governance and digital-payment projects place more public rules inside technical systems. The measurable route is law to standard to vendor to software to access decision.',
      basis: [SOURCES.aiAct, SOURCES.euAi, SOURCES.ecb, SOURCES.bisCbdc],
      doesNotMean: 'Interoperability does not prove a single hidden controller or authoritarian intent; it can also improve resilience, fraud prevention and convenience.',
      nextAction: 'Track mandatory-use language, vendor awards, data-sharing terms, offline alternatives and appeal rights.'
    },
    {
      id: 'CON-102', grade: 'A', title: 'Institutional influence is strongest where money and implementation meet.',
      conclusion: 'Filings, public awards, political-finance records and proxy votes can establish a documented chain from capital or access to a public implementation decision.',
      basis: [SOURCES.sec, SOURCES.spending, SOURCES.fec],
      doesNotMean: 'A large holding, contract or donation is not proof of corruption or control over every decision.',
      nextAction: 'Build entity-to-contract-to-policy timelines and record competing interests, enforcement and legal constraints.'
    },
    {
      id: 'CON-103', grade: 'A', title: 'The Epstein disclosure dispute is an inventory and legal-basis problem.',
      conclusion: 'The January 2026 release established a very large public corpus, but completeness can only be tested by reconciling the reviewed universe with duplicates, privileges, victim protection, removed files and a stable release index.',
      basis: [SOURCES.doj, SOURCES.apEpstein],
      doesNotMean: 'A difference between reviewed and published material does not by itself prove protection of a person or institution.',
      nextAction: 'Track withholding logs, restored-file lists, court challenges, release versions and the legal basis for each exclusion category.'
    },
    {
      id: 'CON-104', grade: 'B', title: 'Network centrality is a research priority, not a verdict.',
      conclusion: 'A highly connected entity deserves deeper record review because it may sit across multiple systems, but centrality must be converted into dated contracts, votes, filings, meetings or mandates before a substantive claim is made.',
      basis: ['evidence-graph.html', 'power-structure-map.html', 'daily-missing-records.html'],
      doesNotMean: 'Repeated appearance or proximity establishes knowledge, guilt or coordinated intent.',
      nextAction: 'For every high-ranked node, identify one primary record, one counter-record and one missing record capable of changing the score.'
    },
    {
      id: 'CON-105', grade: 'B', title: 'The strongest speculative claims are those with explicit falsification tests.',
      conclusion: 'A theory becomes useful when it names the mechanism, supporting record, alternative explanation, missing evidence and the observation that would make the theory weaker.',
      basis: ['speculative-conclusions.html', 'speculation-needs-review.html', 'evidence-policy.html'],
      doesNotMean: 'A well-structured hypothesis is proven merely because it is internally coherent.',
      nextAction: 'Downgrade any theory that cannot identify a record or event capable of disproving it.'
    }
  ],
  publicSummary: 'Current evidence supports a systems view of power: rules become operational through money, contracts, standards, data and access infrastructure. The same evidence does not support treating every overlap as a single command structure. The next useful work is record reconciliation and decision-chain mapping.'
};
if (write('data/conclusions-engine-batch-001.json', JSON.stringify(deepFindings, null, 2))) changes.push('data/conclusions-engine-batch-001.json');

const dailyConclusions = {
  ok: true,
  updated: new Date().toISOString(),
  conclusions: [
    { title: 'Access architecture', text: 'AI regulation and digital-payment preparation show that access rules are increasingly implemented through technical systems. Watch mandatory use, vendor concentration, data sharing, offline alternatives and appeal rights. This does not prove a single command structure.', route: 'power-conclusions.html' },
    { title: 'Power measurement', text: 'The strongest influence claims are those that connect a named entity to a dated filing, public contract, proxy vote, lobbying record or legal mandate. Network score alone is only a lead.', route: 'evidence-graph.html' },
    { title: 'Disclosure audit', text: 'The Epstein release should be audited as an inventory: published files, duplicates, legal privileges, victim protection, removed/restored files and the stated reviewed universe. Missing material is a verification question, not automatic proof of concealment.', route: 'epstein-conclusions.html' },
    { title: 'Speculation discipline', text: 'A useful theory must state its mechanism, alternative explanation, missing record and falsification test. Claims without a downgrade condition remain narrative rather than analysis.', route: 'speculative-conclusions.html' },
    { title: 'Next record priority', text: 'Prioritise records capable of changing a conclusion: legal text, vendor award, meeting minutes, filing, court docket, privilege log or version history.', route: 'daily-missing-records.html' }
  ],
  evidenceRoutes: [SOURCES.aiAct, SOURCES.ecb, SOURCES.sec, SOURCES.spending, SOURCES.doj, SOURCES.apEpstein],
  boundary: 'These conclusions rank record routes and mechanisms. They do not declare guilt, hidden intent or unified command without direct evidence.'
};
if (write('data/daily-power-conclusions.json', JSON.stringify(dailyConclusions, null, 2))) changes.push('data/daily-power-conclusions.json');

const sitemapPath = 'sitemap.xml';
let sitemap = read(sitemapPath);
if (sitemap) {
  const before = sitemap;
  for (const file of INTERNAL_PAGES) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sitemap = sitemap.replace(new RegExp(`\\s*<url>\\s*<loc>[^<]*${escaped}<\\/loc>[\\s\\S]*?<\\/url>`, 'gi'), '');
  }
  sitemap = sitemap.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${today}</lastmod>`);
  if (sitemap !== before && write(sitemapPath, sitemap)) changes.push('sitemap.xml');
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  internalPagesNoIndexed: INTERNAL_PAGES,
  changes,
  deepenedPages: ['conclusions-engine.html','power-conclusions.html','epstein-conclusions.html','speculative-conclusions.html','daily-power-conclusions.html','daily-command-brief.html'],
  sourceRoutes: SOURCES,
  boundary: 'The final hardening pass runs after page generators. It keeps internal pages available but out of public navigation and replaces generic conclusions with sourced, testable assessments.'
};
fs.writeFileSync(path.join(reportDir, 'final-public-editorial-hardening.json'), JSON.stringify(report, null, 2));
console.log(`Final public editorial hardening applied: ${changes.length} change(s), ${INTERNAL_PAGES.length} internal page(s) excluded, six public conclusion/brief pages deepened.`);
