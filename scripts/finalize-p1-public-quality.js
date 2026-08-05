'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reviewed = '2026-08-04';
const reportPath = path.join(root, 'downloads', 'p1-public-quality-finalization.json');
const commonRoutes = [
  ['evidence-vault.html', 'Inspect the Evidence Vault'],
  ['live-intel.html', 'See what changed'],
  ['books.html', 'Open the book library'],
  ['videos.html', 'Watch the video archive'],
  ['newsletter.html', 'Receive the free briefing'],
  ['corrections.html', 'Corrections and challenges']
];

const pages = {
  'newsletter.html': {
    eyebrow: 'Weekly evidence briefing',
    heading: 'Know what changed without drowning in headlines.',
    what: 'The Weekly File is a concise evidence-led briefing for readers who want material changes, new source records, important corrections and unresolved questions in one place.',
    strongest: 'Each item should lead back to the public record, source card, dossier or evidence route that caused the update. The briefing is a route into the evidence, not a substitute for it.',
    matters: 'A useful briefing reduces noise and makes the return visit meaningful: the reader can see what changed, why it matters and which document still needs to be found.',
    limit: 'Subscription does not endorse every hypothesis on the site. Confirmed records, official allegations, analysis and speculation remain separately labelled. Email verification is required before delivery.',
    next: 'Verify the address, choose the Daily Control Brief, weekly investigation report or release notices, then inspect the linked evidence whenever an update matters.'
  },
  'market-activity.html': {
    eyebrow: 'Public-market records',
    heading: 'Read the filing before reading the pattern.',
    what: 'The Market Activity Tracker organises disclosed transactions and holdings into searchable records. It is designed to make dates, reporting periods, issuers, filers and source documents easier to compare.',
    strongest: 'The strongest record is the underlying filing or official disclosure linked to an individual row. A displayed amount has meaning only with its currency, reporting period, transaction type, filer and source date.',
    matters: 'Market records can reveal timing, concentration and repeated exposure that deserve further investigation. They are most useful when compared across time and joined to independently sourced institutional records.',
    limit: 'A transaction or holding does not establish beneficial control, coordination, illegality, motive or advance knowledge. Missing filings, amended records and entity-name collisions can materially change an interpretation.',
    next: 'Open the source record, verify the reporting period and identity, then compare the same entity through the evidence network before forming a conclusion.',
    figurePanel: true
  },
  'site-population-audit.html': {
    eyebrow: 'Public transparency report',
    heading: 'What exists, what is populated and what still needs work.',
    what: 'The Site Population Audit is a transparency page showing which public systems contain usable records, which routes remain thin and where placeholder or review debt still exists.',
    strongest: 'The audit is strongest when its counts can be traced to generated manifests and current route inventories. It should be read as an operational snapshot rather than a claim about the truth of the underlying investigations.',
    matters: 'Publishing the gaps prevents an unfinished feature from being mistaken for a complete intelligence product and helps direct effort toward the pages that provide the most reader value.',
    limit: 'A populated route is not automatically accurate, important or publication-ready. A low count does not prove that records do not exist; it may mean the source has not yet been collected or reviewed.',
    next: 'Use the Evidence Vault for source records, Live Intel for current changes and the corrections route to challenge a count or identify a missing public record.'
  },
  'claim-classifier.html': {
    eyebrow: 'Evidence discipline',
    heading: 'Classify the claim before judging the conclusion.',
    what: 'The Claim Classifier explains how Matrix Reprogrammed separates authenticated records, official allegations, sourced analysis, inference, disputed claims and speculation.',
    strongest: 'The strongest classification is supported by an attributable primary record with a resolved identity, event date, publication date and clear scope. The label must follow the evidence, not the importance of the subject.',
    matters: 'Consistent classification makes corrections possible and prevents association, repetition or visual similarity from quietly becoming an allegation of guilt or coordination.',
    limit: 'A high-confidence source can still be incomplete or later corrected. A classification describes the present evidence state; it does not guarantee that the conclusion will never change.',
    next: 'Open a source card, compare counter-evidence and use the corrections route when the evidence class, identity or stated boundary is wrong.'
  },
  'dark-speculation-lab.html': {
    eyebrow: 'Classified hypotheses',
    heading: 'A place to test dark ideas without pretending they are facts.',
    what: 'The Dark Speculation Lab keeps bounded hypotheses separate from documented findings. It exists to identify testable mechanisms, counterpoints, missing records and conditions that would weaken or falsify a theory.',
    strongest: 'A useful hypothesis names the mechanism, actors or institutions involved, the evidence that prompted it, plausible alternatives and the exact record that should be sought next.',
    matters: 'Separating speculation from evidence allows difficult questions to be explored without contaminating factual dossiers or presenting unsupported claims as settled intelligence.',
    limit: 'Pattern, symbolism, coincidence, proximity and repeated association do not prove secret coordination, criminal conduct or intent. Every unverified proposition remains clearly labelled speculation.',
    next: 'Select a hypothesis, inspect its evidence boundary and counter-analysis, then submit a primary record or correction rather than another unsupported repetition.'
  },
  'download-center.html': {
    eyebrow: 'Reader files',
    heading: 'Start with the readable report, then inspect the machine data.',
    what: 'The Download Center collects public briefings, evidence indexes, dossier packs, source trails and machine-readable exports in one place.',
    strongest: 'Readable reports should identify their scope, review date, evidence classes and source routes. JSON and other machine data are secondary tools for verification and analysis, not the recommended starting point for ordinary readers.',
    matters: 'A well-labelled download can preserve the evidence trail, support offline review and let researchers reproduce or challenge the reasoning behind a public conclusion.',
    limit: 'A downloadable file is not automatically current or complete. Check its generated date, source status and correction history before relying on it.',
    next: 'Choose the readable briefing first, follow its source links, and use machine-readable exports only when you need to reproduce the data or build a separate analysis.',
    machineLinks: true
  },
  'institution-profile.html': {
    eyebrow: 'Institution dossier router',
    heading: 'Open the named institution, then inspect the record behind the relationship.',
    what: 'The Institution Profile route connects a selected organisation to its public dossier, source records, relationships and unresolved investigation questions.',
    strongest: 'The strongest institutional evidence identifies the exact legal entity, jurisdiction, reporting period and primary record. Similar names, subsidiaries and historical organisations must remain separate until identity resolution is complete.',
    matters: 'Institution-level research shows how decisions, contracts, ownership, governance and enforcement can connect across people and events without reducing every relationship to a personal allegation.',
    limit: 'A relationship, contract or shared officer does not by itself prove control, conspiracy, corruption or wrongdoing. The route is an investigation map, not an automated verdict.',
    next: 'Select the institution, open the cited record and compare its timeline and counter-evidence through the Evidence Vault and network search.'
  },
  'public-consequence-contracts.html': {
    eyebrow: 'Accountability tracking',
    heading: 'Record the promise, the deadline and the real-world outcome.',
    what: 'The Accountability Twin converts a public statement, commitment, investigation or policy action into a dated record that can be checked against what happened later.',
    strongest: 'A strong contract contains the original source, named actor, exact wording or action, date, measurable consequence and a future review point.',
    matters: 'Tracking outcomes reduces the advantage of short news cycles. It allows readers to distinguish a promise from delivery, an announcement from implementation and an allegation from a verified consequence.',
    limit: 'The tracker does not predict guilt or automatically decide whether a promise failed. Context, changed conditions, appeals, corrections and partial outcomes must be recorded before a verdict is made.',
    next: 'Follow a contract, inspect its evidence record and return at the review date to see whether the promised consequence occurred.'
  },
  'source-document-vault.html': {
    eyebrow: 'Primary-record library',
    heading: 'Open the document before the interpretation.',
    what: 'The Source Document Vault prioritises filings, court records, official reports, archived statements and other attributable documents that support or challenge the site’s investigations.',
    strongest: 'The strongest door leads directly to a stable document with publisher, title, date, jurisdiction, retrieval status and a clear explanation of which claim it supports.',
    matters: 'Direct source access lets readers verify quotations, understand scope and spot omissions or later corrections instead of relying on a summary alone.',
    limit: 'Official does not always mean complete, neutral or current. A document can contain allegations, estimates or institutional positions that require corroboration and counter-evidence.',
    next: 'Choose a source lane, open the actual file, check its date and scope, then return to the related dossier or conclusion to assess whether it was represented accurately.'
  },
  'subject-dog-architect.html': {
    eyebrow: 'Subject reading map',
    heading: 'A guided route through the D.O.G The Architect material.',
    what: 'This subject hub organises the symbolic, philosophical and publication material connected to D.O.G The Architect so readers can distinguish authored interpretation from documentary investigation.',
    strongest: 'The clearest record is the published work itself, read in context. Interpretive notes should identify whether they describe the author’s argument, historical symbolism or a separate analytical inference.',
    matters: 'A structured map helps readers move between books, essays, images and related evidence methods without confusing creative symbolism with a factual claim about a person or institution.',
    limit: 'Symbolic interpretation is not proof of hidden coordination, historical continuity or real-world control. Alternative readings remain possible and should be stated.',
    next: 'Start with the core publication, then use the evidence-method and symbolism hubs to compare interpretation, sources and counter-readings.'
  },
  'subject-epstein-black-file.html': {
    eyebrow: 'Epstein source map',
    heading: 'Separate presence in the record from evidence of conduct.',
    what: 'This hub connects the Epstein and Black File routes to primary documents, timelines, relationship classifications and unresolved missing-record questions.',
    strongest: 'The strongest evidence is a directly attributable court record, sworn testimony, authenticated communication, financial record or official filing tied to a resolved identity and date.',
    matters: 'A disciplined source map prevents names, flights, addresses, photographs and social proximity from being treated as equivalent forms of evidence.',
    limit: 'Appearance in a contact book, flight log, photograph or network does not establish criminal conduct, knowledge or participation. Allegations and disputed claims must remain explicitly classified.',
    next: 'Open the actual file, check the evidence level and relationship type, then compare counter-evidence and missing records before drawing a conclusion.'
  },
  'subject-freemasonry-symbol-system.html': {
    eyebrow: 'Symbol and history map',
    heading: 'Trace the symbol, source and interpretation separately.',
    what: 'This hub organises Masonic history, ritual language, symbols, architecture and related publications into a navigable subject map.',
    strongest: 'The strongest historical claim is supported by a dated primary source, recognised archive, ritual text or attributable institutional record. Modern visual similarity alone is not historical proof.',
    matters: 'Keeping documentary history separate from symbolic interpretation allows readers to explore influence and continuity without turning resemblance into certainty.',
    limit: 'A shared symbol does not by itself prove membership, command, secret coordination or a continuous institutional plan. Cultural recycling and independent use are plausible alternatives.',
    next: 'Open the cited historical source, compare the symbol across periods and use the corrections route when an attribution, date or institutional link is wrong.'
  },
  'subject-index.html': {
    eyebrow: 'Subject intelligence directory',
    heading: 'Choose a subject, then start with its strongest record.',
    what: 'Subject Intelligence Hubs group the site’s books, source documents, dossiers, timelines and evidence routes around a defined topic.',
    strongest: 'Each hub should lead with the best attributable record and clearly separate documentary material from editorial interpretation and speculation.',
    matters: 'A subject directory reduces repetition and gives readers one stable place to see what is known, what changed, what remains disputed and what should be investigated next.',
    limit: 'Inclusion in the directory is not an endorsement of every claim connected to the subject. Individual records retain their own evidence classes and correction status.',
    next: 'Choose a hub, inspect its evidence boundary and use Live Intel or the newsletter to return when that subject materially changes.'
  },
  'subject-trust-evidence-method.html': {
    eyebrow: 'How the evidence system works',
    heading: 'Trust the trail only when it can be inspected and corrected.',
    what: 'The Trust and Evidence Method explains provenance, evidence classes, identity resolution, counter-analysis, review dates and correction handling across Matrix Reprogrammed.',
    strongest: 'A trustworthy claim links to the exact record, names the publisher and date, explains its scope, states what it does not prove and identifies contradictory evidence.',
    matters: 'Transparent boundaries let readers challenge the site without having to accept its conclusions or political assumptions first.',
    limit: 'No method eliminates error, source bias or incomplete records. Confidence should fall when identity resolution fails, sources conflict or stronger counter-evidence appears.',
    next: 'Use the Claim Classifier and Evidence Vault, then submit a correction with the exact record and location that should change.'
  },
  'tracker-dashboard.html': {
    eyebrow: 'Investigation dashboard',
    heading: 'People, money, institutions, files and consequences—without skipping the source.',
    what: 'The Tracker Dashboard brings together current public-record investigations, watched entities, missing records and dated accountability checks.',
    strongest: 'The most useful tracker item links to a source record, names the entity and date, explains the change and states whether it strengthens, weakens or complicates an existing conclusion.',
    matters: 'A single dashboard makes return visits useful by showing material change rather than forcing readers to scan every dossier again.',
    limit: 'A high number of connections or alerts does not prove importance, guilt or coordination. Automated matches require identity, provenance and editorial boundary checks.',
    next: 'Open the changed item, inspect its evidence trail, add the entity to a watchlist and use the correction route when the match or interpretation is wrong.'
  }
};

function visibleText(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function routeButtons() {
  return commonRoutes.map(([href, label]) => `<a class="btn alt" href="${href}">${label}</a>`).join('');
}

function qualitySection(relative, spec) {
  const figurePanel = spec.figurePanel ? `<aside class="card" id="figure-source-status"><h3>Figure source and status</h3><p>Amounts on this page are derived from the linked public filing or disclosure record. Verify the filer, issuer, transaction type, reporting period, currency, amendment status and source publication date before comparing values. A displayed amount is a record field, not proof of control, intent, coordination or wrongdoing.</p></aside>` : '';
  return `<!-- p1-public-quality:start --><section class="section wrap p1-public-quality" data-p1-public-quality="${relative}" data-reviewed="${reviewed}"><div class="eyebrow">${spec.eyebrow} · reviewed ${reviewed}</div><h2>${spec.heading}</h2><div class="grid"><article class="card"><h3>What this is</h3><p>${spec.what}</p></article><article class="card"><h3>Strongest record</h3><p>${spec.strongest}</p></article><article class="card"><h3>Why it matters</h3><p>${spec.matters}</p></article><article class="card"><h3>What it does not prove</h3><p>${spec.limit}</p></article><article class="card"><h3>What to do next</h3><p>${spec.next}</p></article>${figurePanel}</div><div class="cta-row">${routeButtons()}</div><p class="evidence-note"><strong>Correction route:</strong> challenge a name, date, figure, source classification or conclusion through <a href="corrections.html">Corrections and Challenges</a>. The public review date records this page-level editorial pass; source publication and event dates remain attached to individual records.</p></section><!-- p1-public-quality:end -->`;
}

function cleanScaffold(html) {
  let next = String(html || '');
  next = next
    .replace(/\bREADER\s+PATH\s*>?/gi, 'INVESTIGATION ROUTE')
    .replace(/\bReader\s+Path\b/gi, 'Investigation Route')
    .replace(/\bsource\s+pathway\b/gi, 'source trail')
    .replace(/\bPhase\s+\d+\b/gi, 'Research layer')
    .replace(/\bbuilder\b/gi, 'system');
  return next;
}

function softenMachineLinks(html) {
  return html.replace(/<a\b([^>]*\bhref=["'][^"']+\.json["'][^>]*)>/gi, (match, attributes) => {
    if (/\bclass=["'][^"']*\bmachine-data-link\b/i.test(attributes)) return match;
    if (/\bclass=["']/i.test(attributes)) {
      return `<a${attributes.replace(/\bclass=(["'])([^"']*)\1/i, (_m, quote, value) => `class=${quote}${value} machine-data-link${quote}`)}>`;
    }
    return `<a class="machine-data-link"${attributes}>`;
  });
}

function insertSection(html, section) {
  let next = String(html || '').replace(/<!-- p1-public-quality:start -->[\s\S]*?<!-- p1-public-quality:end -->/gi, '');
  if (/<\/main>/i.test(next)) return next.replace(/<\/main>/i, `${section}\n</main>`);
  if (/<\/body>/i.test(next)) return next.replace(/<\/body>/i, `${section}\n</body>`);
  throw new Error('No stable public-quality insertion boundary');
}

function patchFile(file, relative, spec) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  const before = fs.readFileSync(file, 'utf8');
  if (!/<!doctype\s+html|<html\b/i.test(before)) return null;
  let after = cleanScaffold(before);
  if (spec.machineLinks) after = softenMachineLinks(after);
  after = insertSection(after, qualitySection(relative, spec));
  if (after !== before) fs.writeFileSync(file, after);
  const text = visibleText(after);
  const missingRoutes = commonRoutes.map(([href]) => href).filter(href => !after.includes(`href="${href}"`) && !after.includes(`href='${href}'`));
  const scaffold = [/Reader path/i, /source pathway/i, /Phase \d+/i, /\bbuilder\b/i].filter(pattern => pattern.test(text)).map(pattern => String(pattern));
  return {
    file: path.relative(root, file).split(path.sep).join('/'),
    changed: after !== before,
    words: text.split(/\s+/).filter(Boolean).length,
    missingRoutes,
    scaffold,
    hasQualitySection: after.includes(`data-p1-public-quality="${relative}"`),
    hasReviewDate: after.includes(`data-reviewed="${reviewed}"`),
    hasCorrections: after.includes('corrections.html'),
    hasFigurePanel: !spec.figurePanel || after.includes('id="figure-source-status"'),
    machineLinksSecondary: !spec.machineLinks || !(after.match(/<a\b[^>]*href=["'][^"']+\.json["'][^>]*>/gi) || []).some(anchor => !/machine-data-link/.test(anchor))
  };
}

const results = [];
for (const [relative, spec] of Object.entries(pages)) {
  const candidates = [path.join(root, relative)];
  if (fs.existsSync(site)) {
    candidates.push(path.join(site, relative));
    const extensionless = path.join(site, relative.replace(/\.html$/i, ''));
    if (fs.existsSync(extensionless) && fs.statSync(extensionless).isFile()) candidates.push(extensionless);
  }
  const pageResults = candidates.map(file => patchFile(file, relative, spec)).filter(Boolean);
  if (!pageResults.length) {
    results.push({ file: relative, missing: true, changed: false, words: 0, missingRoutes: commonRoutes.map(([href]) => href), scaffold: ['missing-page'], hasQualitySection: false, hasReviewDate: false, hasCorrections: false, hasFigurePanel: false, machineLinksSecondary: false });
  } else {
    results.push(...pageResults);
  }
}

const issues = [];
for (const result of results) {
  if (result.missing) issues.push(`${result.file}: page missing`);
  if (!result.hasQualitySection) issues.push(`${result.file}: quality section missing`);
  if (!result.hasReviewDate) issues.push(`${result.file}: review date missing`);
  if (!result.hasCorrections) issues.push(`${result.file}: correction route missing`);
  if (!result.hasFigurePanel) issues.push(`${result.file}: figure source panel missing`);
  if (!result.machineLinksSecondary) issues.push(`${result.file}: raw JSON link remains prominent`);
  if (result.words < 220) issues.push(`${result.file}: only ${result.words} visible words`);
  if (result.missingRoutes.length) issues.push(`${result.file}: missing routes ${result.missingRoutes.join(', ')}`);
  if (result.scaffold.length) issues.push(`${result.file}: visible scaffold ${result.scaffold.join(', ')}`);
}

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  reviewed,
  targetPages: Object.keys(pages),
  targetCount: Object.keys(pages).length,
  patchedSurfaces: results.filter(item => item.changed).length,
  results,
  issues,
  boundary: 'The 15 weakest public pages receive page-specific purpose, strongest-record, significance, evidence-limit and next-action copy. Machine data remains secondary; review dates do not replace source publication or event dates.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error('P1 PUBLIC QUALITY FINALIZATION FAILED');
  issues.slice(0, 100).forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`P1 PUBLIC QUALITY PASS: ${report.targetCount} weak pages finalized across ${results.length} source/output surfaces; ${report.patchedSurfaces} changed.`);
module.exports = report;
