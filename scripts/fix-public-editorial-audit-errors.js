const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const changed = [];
const failures = [];

const replacements = new Map([
  ['Free public intelligence builds trust', 'Public intelligence should remain verifiable'],
  ['Email capture builds the list', 'Brief signup keeps readers informed'],
  ['TURN THE INTELLIGENCE MACHINE INTO PRODUCTS', 'TURN THE RESEARCH INTO USEFUL PUBLICATIONS'],
  ['READER MONEY PATH', 'READER PATH'],
  ['CAPTURE SYSTEM', 'SUBSCRIPTION SYSTEM'],
  ['Persistent Cloudflare D1 member record', 'Protected member record'],
  ['Weekly newsletter sender', 'Weekly briefing delivery'],
  ['Monetisation Dashboard', 'Publishing Dashboard'],
  ['Mission + Money Engine', 'Membership and Publishing System'],
  ['Site Brain Router', 'Research Navigation'],
  ['Card System Health', 'Source Card Status'],
  ['Artwork Automation', 'Visual Publishing'],
  ['Copy/Intake Audit', 'Editorial Intake Review']
]);
const forbidden = [...replacements.keys()];

function walkHtml(base, dir = base, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'source-snapshots', 'browsertrix-output'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(base, full, out);
    else if (entry.name.endsWith('.html') || !path.extname(entry.name)) out.push(full);
  }
  return out;
}
function removeSection(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`\\s*<section\\b[^>]*id=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/section>`, 'gi'), '');
}
function insertBeforeMain(html, block) {
  if (html.includes('</main>')) return html.replace('</main>', `${block}</main>`);
  if (html.includes('</body>')) return html.replace('</body>', `${block}</body>`);
  return `${html}${block}`;
}
function links(items) {
  return `<div class="cta-row small">${items.map(([label, href]) => `<a class="btn alt" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('')}</div>`;
}

const sections = {
  'ai-speculative-conclusions.html': {
    id: 'audit-depth-ai-speculative',
    html: `<section id="audit-depth-ai-speculative" class="section wrap"><div class="eyebrow">Auditable AI hypothesis review · July 2026</div><h2>HOW THE MACHINE SHOULD REACH A SPECULATIVE CONCLUSION.</h2><p class="lead">An AI-generated hypothesis is useful only when a reader can inspect the record chain, understand the proposed mechanism, see the strongest alternative explanation and identify the observation that would make the theory weaker. A confidence score from 0 to 100 is a triage device, not a probability that a dramatic event will occur.</p><div class="grid"><article class="card redline"><h3>Mechanism and evidence</h3><p><strong>Mechanism:</strong> the machine may connect dated laws, standards, contracts, ownership records, technical infrastructure and access rules when a source explicitly joins those stages. It must not convert repeated names, geographic proximity, imagery or institutional membership into proof of coordination. At least one primary or official record should support each material step, and any news report should remain a discovery lead until checked against the underlying document.</p><p><strong>Why it matters:</strong> this prevents the system from producing persuasive language without a reproducible route. Readers should be able to move from hypothesis to source, date, actor, jurisdiction and implementation stage.</p></article><article class="card"><h3>Limitation and falsification</h3><p><strong>Evidence boundary:</strong> pattern similarity is not proof of shared intent, secret command or wrongdoing. Parallel development may arise from ordinary regulation, market incentives, technical compatibility or public safety requirements.</p><p><strong>Falsification test:</strong> downgrade the hypothesis when primary records show independent decision chains, voluntary participation, meaningful exit rights, separated data, competing vendors, judicial oversight or reversal of the alleged implementation path. Upgrade it only when a dated record joins proposal, authority, funding, deployment and enforceable effect.</p><p><strong>Watch next:</strong> legislative text, procurement awards, data-sharing agreements, audit reports, court challenges, version histories and records that contradict the current synthesis.</p></article></div>${links([['EU AI Act official text','https://eur-lex.europa.eu/eli/reg/2024/1689/oj'],['ECB digital euro project','https://www.ecb.europa.eu/euro/digital_euro/html/index.en.html'],['U.S. SEC filings search','https://www.sec.gov/edgar/search/']])}</section>`
  },
  'epstein-conclusions.html': {
    id: 'audit-depth-epstein-conclusions',
    html: `<section id="audit-depth-epstein-conclusions" class="section wrap"><div class="eyebrow">Evidence-led file assessment · July 2026</div><h2>WHAT THE RELEASE RECORD CAN AND CANNOT ESTABLISH.</h2><p class="lead">The strongest defensible conclusion concerns the handling, inventory and evidential classification of records. A person appearing in an address book, calendar, photograph, flight record, email, witness statement, court filing or unverified submission is not the same finding. Each appearance must be classified by document type, provenance, date, context and corroboration.</p><div class="grid"><article class="card redline"><h3>Mechanism and implication</h3><p><strong>Mechanism:</strong> an accountable release can be tested through a stable index, page counts, duplicate rules, redaction categories, privilege claims, victim-protection decisions, removed-file logs, restored-file logs and version history. The decision chain should identify who reviewed a record, the legal authority used and whether a court or oversight body could challenge the decision.</p><p><strong>Why it matters:</strong> this turns a broad suspicion into specific public-record questions. The useful inquiry is not whether every missing page proves protection, but whether the published corpus can be reconciled against the reviewed universe and whether each withholding category has a stated legal basis.</p></article><article class="card"><h3>Boundary, counterpoint and next record</h3><p><strong>Evidence boundary:</strong> a name, contact, photograph or travel entry is a lead, not a verdict. Repeated contact does not automatically establish knowledge of, participation in or responsibility for another person’s crimes.</p><p><strong>Alternative explanation:</strong> absent material may reflect privacy law, victim safety, privilege, illegality of the content, duplication, retention policy, an unfinished investigation or a record judged non-responsive. Those possibilities must be tested rather than assumed.</p><p><strong>Watch next:</strong> complete inventories, withholding logs, charging memoranda, immunity terms, victim-notification records, supervisory approvals, sworn evidence, financial records, court orders and corrected release indexes. A conclusion should be upgraded only when independent records corroborate the specific conduct alleged.</p></article></div>${links([['DOJ Epstein disclosures','https://www.justice.gov/epstein/doj-disclosures'],['FBI Vault','https://vault.fbi.gov/jeffrey-epstein'],['CourtListener search','https://www.courtlistener.com/']])}</section>`
  },
  'reader-conclusions.html': {
    id: 'audit-depth-reader-conclusions',
    html: `<section id="audit-depth-reader-conclusions" class="section wrap"><div class="eyebrow">Reader conclusion method · July 2026</div><h2>FROM RECORD TO USEFUL CONCLUSION.</h2><p class="lead">A reader-facing conclusion should explain more than what was found. It should show the mechanism connecting an actor, asset, rule, contract or source change to a public effect, state the strongest limitation and identify the next record capable of confirming or disproving the interpretation.</p><div class="grid"><article class="card redline"><h3>Decision-chain method</h3><p><strong>Mechanism:</strong> start with a dated primary record, identify the legal or institutional authority, follow the money or ownership route, locate the implementation decision and name the population or system affected. A useful chain may read entity → asset → authority → contract → implementation → public consequence. Each arrow needs its own source; one document should not be stretched to prove the entire chain.</p><p><strong>Implication:</strong> this method separates measurable leverage from reputation or symbolism. Filings can establish holdings, public-award databases can establish contracts, political-finance records can establish reported donations and court records can establish legal findings. None of those records alone proves secret control.</p></article><article class="card"><h3>Counter-record and next action</h3><p><strong>Evidence boundary:</strong> association, scale, centrality, a contract or a missing document does not prove guilt, unified command or private intent. Competing mandates, market forces, administrative error and lawful confidentiality remain possible explanations.</p><p><strong>Limitation:</strong> a conclusion is weak when it lacks a counter-record, omits dates, merges allegation with judgment or cannot name what would change the assessment.</p><p><strong>Watch next:</strong> amendments, proxy votes, beneficial-ownership changes, procurement modifications, enforcement actions, court appeals, disclosure logs and records showing that a proposed system was cancelled or constrained. Readers should lower confidence when later evidence breaks any link in the decision chain.</p></article></div>${links([['SEC EDGAR','https://www.sec.gov/edgar/search/'],['USAspending','https://www.usaspending.gov/'],['Federal Election Commission data','https://www.fec.gov/data/']])}</section>`
  },
  'speculative-conclusions.html': {
    id: 'audit-depth-speculative-conclusions',
    html: `<section id="audit-depth-speculative-conclusions" class="section wrap"><div class="eyebrow">Testable hypotheses · July 2026</div><h2>WHAT WOULD CONFIRM, WEAKEN OR FALSIFY THE THEORY.</h2><p class="lead">Speculation becomes research only when it names a proposed mechanism, the records supporting it, a plausible alternative explanation and a falsification test. Internal coherence, symbolism, repeated names and algorithmic confidence are not substitutes for evidence.</p><div class="grid"><article class="card redline"><h3>Proposed mechanism</h3><p><strong>Mechanism:</strong> a convergence theory may be tested by tracing whether separate identity, payment, health, security, mobility, AI or information systems become technically and legally dependent on one another. The relevant evidence is mandatory-use language, common identifiers, shared data standards, procurement awards, enforcement powers, denied-access rules and the removal of practical alternatives.</p><p><strong>Why it matters:</strong> a de facto governance layer could arise through interoperable infrastructure without a single declaration or one central institution. That is a testable systems claim, not proof of a secret world government.</p></article><article class="card"><h3>Alternative explanation and falsification</h3><p><strong>Counterpoint:</strong> interoperability may reflect convenience, fraud prevention, public safety, cross-border trade or ordinary technical standardisation. Professional networks and similar policy language are expected in specialised fields and do not establish unlawful coordination.</p><p><strong>Evidence boundary:</strong> no theory should accuse a person or institution merely because it appears near another node, uses similar imagery or participates in a conference.</p><p><strong>Falsification test:</strong> the theory weakens if participation remains voluntary, cash or offline routes remain viable, data is minimised and separated, vendors compete, courts enforce appeal rights and primary records show independent rather than common enforcement. <strong>Watch next:</strong> legal mandates, sunset clauses, vendor concentration, audit findings, data-combination rules, opt-out rates and documented reversals.</p></article></div>${links([['EU AI Act official text','https://eur-lex.europa.eu/eli/reg/2024/1689/oj'],['ECB digital euro project','https://www.ecb.europa.eu/euro/digital_euro/html/index.en.html'],['BIS CBDC research','https://www.bis.org/about/bisih/topics/cbdc.htm']])}</section>`
  }
};

for (const base of roots) {
  for (const file of walkHtml(base)) {
    let html;
    try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!/<html\b/i.test(html)) continue;
    const before = html;
    for (const [from, to] of replacements) html = html.split(from).join(to);
    const relative = path.relative(base, file).replace(/\\/g, '/');
    const spec = sections[relative];
    if (spec) {
      html = removeSection(html, spec.id);
      html = insertBeforeMain(html, spec.html);
    }
    if (html !== before) {
      fs.writeFileSync(file, html);
      changed.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}

for (const base of roots) {
  for (const file of walkHtml(base)) {
    let html = '';
    try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!/<html\b/i.test(html)) continue;
    for (const phrase of forbidden) if (html.includes(phrase)) failures.push(`${path.relative(root, file)} still contains ${phrase}`);
  }
  for (const [relative, spec] of Object.entries(sections)) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) { failures.push(`${path.relative(root, file)} missing`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    for (const marker of [spec.id, 'Mechanism', 'Evidence boundary', 'Watch next', 'https://']) if (!html.includes(marker)) failures.push(`${path.relative(root, file)} missing ${marker}`);
  }
}

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), roots: roots.map(value => path.relative(root, value) || '.'), changed: [...new Set(changed)], replacements: Object.fromEntries(replacements), deepenedPages: Object.keys(sections), failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'public-editorial-audit-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.slice(0, 100).forEach(item => console.error(`PUBLIC EDITORIAL REPAIR FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Public editorial audit errors repaired: ${report.changed.length} file(s), ${report.deepenedPages.length} conclusion pages deepened.`);
