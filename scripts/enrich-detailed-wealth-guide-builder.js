const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'scripts', 'build-detailed-wealth-guides.js');
if (!fs.existsSync(file)) throw new Error('scripts/build-detailed-wealth-guides.js is missing');

let source = fs.readFileSync(file, 'utf8');
const before = source;
const marker = "  S('Subject focus map', [";
const anchor = "  S('Evidence and legal boundary', [";

if (!source.includes(marker)) {
  if (!source.includes(anchor)) throw new Error('Common-section enrichment anchor was not found');
  const enrichment = `  S('Subject focus map', [
    'Use the following subject anchors as named checkpoints. For each checkpoint, record the fact, source, date, assumption, decision and next review date.',
    ...guide.markers.map(subjectMarker => \`\${subjectMarker}: define what this checkpoint means for this guide, what evidence supports it, and what result would cause you to change course.\`),
    'Do not mark a checkpoint complete because an action was taken. Mark it complete only when the result and supporting evidence have been recorded.',
    'Where a checkpoint depends on another person, institution, platform or contract, record that dependency and a fallback route.',
    'Rank checkpoints by potential harm if ignored, not by how interesting or easy they appear.',
    'At the end of each review, choose one checkpoint to advance and one risk to reduce before adding a new objective.'
  ]),
  S('Worked decision case', [
    'Write a real decision from your own situation at the top of a blank page. Examples include changing work, launching an offer, choosing an account, buying an asset, restructuring a business or rejecting a proposal.',
    'Baseline: state the current cash, income, liabilities, commitments, ownership, legal position and time available. Use documents rather than memory where possible.',
    'Desired result: describe the measurable outcome, deadline and reason. Remove vague language such as more, better, passive, safe or guaranteed.',
    'Options: include the proposed action, a smaller reversible test, a diversified alternative, delaying the action and doing nothing.',
    'Evidence: attach at least three independent sources. Identify which evidence is official, contractual, audited, estimated, promotional or missing.',
    'Economics: show setup cost, recurring cost, cash timing, fees, tax reserve, downside loss, opportunity cost and the point at which the decision becomes worthwhile.',
    'Risk: identify concentration, liquidity, legal, operational, fraud, health, relationship and behavioural risks. Name the risk that could create irreversible harm.',
    'Professional review: write the exact question that requires an accountant, lawyer, regulated adviser, lender, insurer or technical specialist.',
    'Decision: state proceed, test, delay or reject. Record the maximum commitment and the evidence required before any further commitment.',
    'Review: set a dated checkpoint. Write the result that would confirm the decision, the result that would require adjustment and the result that would trigger an immediate stop.'
  ]),
  S('90-day implementation workbook', [
    'Week 1 - Establish the baseline. Reconcile the relevant accounts, contracts, statements, fees, tax records, responsibilities and deadlines.',
    'Week 2 - Define the result. Choose one measurable outcome and remove actions that do not directly support it or protect an essential risk.',
    'Week 3 - Gather primary evidence. Use official registers, filings, signed terms, current quotations and dated institutional data.',
    'Week 4 - Compare alternatives. Include a lower-cost option, a lower-risk option, a reversible test and the option to wait.',
    'Week 5 - Model the economics. Build downside, base and upside cases while treating every uncertain input as an assumption.',
    'Week 6 - Verify identity and authority. Confirm who owns, controls, advises, holds money, signs contracts and bears liability.',
    'Week 7 - Run the smallest useful test. Limit money, time and legal commitment while collecting evidence about real demand or performance.',
    'Week 8 - Reconcile actual results. Compare promised, expected and actual cost, time, cash flow, quality, risk and customer or counterparty behaviour.',
    'Week 9 - Repair the constraint. Improve the single factor currently limiting income, retention, safety, liquidity, delivery or evidence quality.',
    'Week 10 - Install controls. Add calendar reminders, approval limits, account separation, written procedures, backups and review ownership.',
    'Week 11 - Decide whether to scale. Increase commitment only when the test produced measurable value and the downside remains affordable.',
    'Week 12 - Complete the evidence file. Store the decision record, sources, calculations, contracts, results, lessons and next review date.',
    'Day 90 - Write a one-page conclusion: what was established, what remains uncertain, what changed, what will continue and what will stop.'
  ]),
  S('Review, escalation and stop rules', [
    'Review monthly when the decision affects recurring cash, debt, customer commitments, investment contributions or essential protection.',
    'Review immediately after a material legal change, tax notice, contract change, security incident, missed payment, large loss, health event or relationship change.',
    'Escalate to a qualified professional when the facts cross jurisdictions, involve regulated products, create personal guarantees, affect beneficiaries or cannot be reversed cheaply.',
    'Pause when required documents are missing, identities cannot be independently verified, costs are unclear or the counterparty resists reasonable due diligence.',
    'Stop when the action requires deception, undeclared income, false invoices, hidden beneficial ownership, unaffordable leverage or essential-living money.',
    'Stop when actual cash use, delivery time or loss exceeds the written limit.',
    'Stop when the central evidence is corrected, withdrawn, contradicted by a stronger source or no longer current.',
    'Do not move a stop limit merely because money, pride or time has already been committed. Sunk cost is not evidence that continuing is rational.',
    'Record every exception to the plan, who approved it and why. Repeated exceptions indicate the plan or control is not working.',
    'A stopped action can still be a successful decision when it prevents a larger loss and preserves the ability to act later.'
  ]),
`;
  source = source.replace(anchor, `${enrichment}${anchor}`);
}

source = source.replace('  const capacity = 31;', '  const capacity = 24;');

fs.writeFileSync(file, source);
const report = {
  ok: source.includes(marker) && source.includes('const capacity = 24;'),
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  addedSections: ['Subject focus map', 'Worked decision case', '90-day implementation workbook', 'Review, escalation and stop rules'],
  pageCapacity: 24,
  boundary: 'The quality threshold remains unchanged. This patch adds substantive decision workbooks and more readable pagination rather than weakening tests.'
};
fs.mkdirSync(path.join(process.cwd(), 'downloads'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'downloads', 'detailed-wealth-guide-enrichment.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Detailed guide enrichment did not apply');
console.log(`Detailed wealth guide enrichment ${report.changed ? 'applied' : 'already current'}: four substantive sections and 24-line page capacity.`);
