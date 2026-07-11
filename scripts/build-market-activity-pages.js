const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'market-activity.json');
const output = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const money = value => Number.isFinite(Number(value))
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))
  : '—';
const number = value => Number.isFinite(Number(value))
  ? new Intl.NumberFormat('en-US').format(Number(value))
  : '—';
const first = (value, fallback = '') => Array.isArray(value) ? (value[0] || fallback) : (value || fallback);

function insiderRecord(record) {
  const owner = first(record.reportingOwnerNames, first(record.reportingOwners, {}).name || 'Reported insider');
  const issuerName = record.issuer?.name || record.issuerName || record.trackedSubjectName || 'Issuer';
  const ticker = record.issuer?.ticker || record.ticker || '';
  return {
    ...record,
    recordType: 'insider-transaction',
    subject: owner,
    issuerName,
    ticker,
    action: record.transactionCategory || record.direction || 'other',
    sourceDate: record.transactionDate || record.filingDate || '',
    sourceUrl: record.sourceUrl || '',
    reportedValue: record.reportedTransactionValue,
    established: record.establishes,
    notEstablished: record.doesNotEstablish,
    accessionNumber: record.filingAccession || '',
    formType: record.filingType || '4'
  };
}

function institutionRecord(record) {
  return {
    ...record,
    recordType: 'institutional-position-change',
    subject: record.managerName || 'Reporting institution',
    issuerName: record.issuerName || 'Reported security',
    ticker: record.ticker || '',
    action: record.changeType || 'position-change',
    sourceDate: record.currentReportDate || record.currentFilingDate || '',
    sourceUrl: record.currentSourceUrl || record.sourceUrl || '',
    filingDate: record.currentFilingDate || record.filingDate || '',
    periodEnd: record.currentReportDate || record.periodEnd || '',
    reportedValue: record.currentValueUsd ?? record.previousValueUsd ?? null,
    established: record.establishes,
    notEstablished: record.doesNotEstablish,
    accessionNumber: record.currentAccessionNumber || '',
    formType: '13F-HR'
  };
}

const insiderTransactions = (output.insiderTransactions || []).map(insiderRecord);
const positionChanges = (output.positionChanges || output.institutionalChanges || []).map(institutionRecord);
const records = [...insiderTransactions, ...positionChanges].sort((a, b) =>
  String(b.sourceDate || '').localeCompare(String(a.sourceDate || ''))
);

const cards = records.slice(0, 500).map(record => {
  const insider = record.recordType === 'insider-transaction';
  const title = insider
    ? `${esc(record.subject)} · ${esc(record.transactionLabel || record.transactionCode || 'reported transaction')}`
    : `${esc(record.subject)} · ${esc(String(record.changeType || 'reported position change').replace(/-/g, ' '))}`;
  const detail = insider
    ? `${esc(record.issuerName)} ${record.ticker ? `(${esc(record.ticker)})` : ''} · ${number(record.shares)} shares · ${money(record.reportedValue)}`
    : `${esc(record.issuerName)} · ${number(record.currentShares)} current shares · ${number(record.shareChange)} reported change`;
  const sourceLabel = insider ? 'FORM 4' : 'FORM 13F COMPARISON';
  const sourceUrl = record.sourceUrl || '#';
  const anchor = `market-${esc(record.id || record.accessionNumber || `${record.subject}-${record.issuerName}`)}`;
  return `<article id="${anchor}" class="card redline activity-card" data-kind="${insider ? 'person' : 'institution'}" data-action="${esc(String(record.action || 'other').toLowerCase())}" data-grade="${esc(record.evidenceGrade || 'A')}">
    <span class="label">GRADE ${esc(record.evidenceGrade || 'A')} · ${sourceLabel} · ${esc(record.factualStatus || 'official filing')}</span>
    <h3>${title}</h3>
    <p><strong>${detail}</strong></p>
    <p><strong>${insider ? 'Transaction' : 'Quarter end'}:</strong> ${esc(record.transactionDate || record.periodEnd || '—')} · <strong>Filed:</strong> ${esc(record.filingDate || '—')}</p>
    ${insider ? `<p><strong>Transaction code:</strong> ${esc(record.transactionCode || 'not stated')} · <strong>Ownership:</strong> ${esc(record.ownershipForm || 'not stated')} · <strong>After transaction:</strong> ${number(record.sharesOwnedFollowing)} shares</p>` : `<p><strong>Previous shares:</strong> ${number(record.previousShares)} · <strong>Current shares:</strong> ${number(record.currentShares)} · <strong>Change:</strong> ${number(record.shareChange)}</p>`}
    <p><strong>Established:</strong> ${esc(record.established || 'The cited filing reports the stated transaction or quarter-end position.')}</p>
    <p><strong>Not established:</strong> ${esc(record.notEstablished || 'The record does not establish motive, present ownership, exact execution timing or wrongdoing.')}</p>
    <div class="cta-row small"><a class="btn" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open SEC filing</a><a class="btn alt" href="search.html?q=${encodeURIComponent(record.subject || record.issuerName || 'market activity')}">Search connections</a></div>
  </article>`;
}).join('');

const summary = output.summary || {};
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Market Activity Tracker | Matrix Reprogrammed</title><meta name="description" content="Official SEC Form 4 insider transactions and Form 13F institutional position changes with evidence boundaries."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/><link rel="stylesheet" href="reader-experience.css"/><style>.tracker-controls{display:grid;grid-template-columns:2fr repeat(3,1fr);gap:.7rem}.tracker-controls input,.tracker-controls select{width:100%;box-sizing:border-box;padding:.75rem;background:#090806;color:#f3e6bd;border:1px solid rgba(216,181,106,.35);border-radius:8px}.metric-row{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem}.metric strong{font-size:1.7rem;display:block}.activity-card[hidden]{display:none}.boundary{border-left:3px solid #d8b56a;padding:1rem;background:rgba(216,181,106,.07)}@media(max-width:800px){.tracker-controls,.metric-row{grid-template-columns:1fr}}</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="market-activity.html" aria-current="page">Market Activity</a><a href="entity-registry.html">Entities</a><a href="evidence-network-map.html">Network Map</a><a href="search.html">Search</a><a href="member-dashboard.html">Member Dashboard</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Phase 6 · Official Financial Disclosures</div><h1>MARKET ACTIVITY TRACKER.</h1><p class="lead">Track reported share purchases, sales and other insider transactions, plus quarter-to-quarter institutional position changes, directly from official SEC filings.</p><p class="boundary"><strong>Evidence boundary:</strong> Form 4 records report disclosed transactions, but transaction codes distinguish open-market trades from grants, exercises, gifts and tax withholding. Form 13F comparisons show reported quarter-end position changes; they do not reveal exact trade dates, execution prices, motive, beneficial owner or whether the position remains held today. This is public-record research, not investment advice.</p><div class="cta-row"><a class="btn" href="data/market-activity.json">Public JSON</a><a class="btn alt" href="downloads/market-activity.csv">CSV export</a><a class="btn alt" href="market-watchlist.html">Member Watchlist</a></div></section><section class="section wrap"><div class="metric-row"><article class="card metric"><span class="label">Insider records</span><strong>${number(insiderTransactions.length)}</strong></article><article class="card metric"><span class="label">Institution changes</span><strong>${number(positionChanges.length)}</strong></article><article class="card metric"><span class="label">Tracked subjects</span><strong>${number(summary.trackedSubjects ?? (output.subjects || []).length)}</strong></article><article class="card metric"><span class="label">Last refresh</span><strong style="font-size:1rem">${esc(output.generatedAt || output.updated || 'Not yet collected')}</strong></article></div></section><section class="section wrap"><div class="tracker-controls"><input id="activity-q" type="search" placeholder="Search person, institution, issuer or ticker"/><select id="activity-kind"><option value="">People + institutions</option><option value="person">People / insiders</option><option value="institution">Institutions / 13F</option></select><select id="activity-action"><option value="">All activity</option><option value="purchase">Purchases / increases</option><option value="sale">Sales / reductions</option><option value="new-position">New positions</option><option value="exited-position">Exits</option><option value="other">Other codes</option></select><select id="activity-grade"><option value="">All grades</option><option value="A">Grade A</option><option value="B">Grade B</option></select></div><p id="activity-count" class="figure-caption"></p><div id="activity-list" class="grid">${cards || '<article class="card"><h3>No collected records yet</h3><p>The scheduled SEC collector will populate this page after its first successful official-source run. The page does not invent placeholder trades.</p></article>'}</div></section><section class="section wrap"><div class="grid"><article class="card"><h3>Form 4 transaction codes</h3><p><strong>P/S:</strong> open-market or private purchase/sale. <strong>A/D:</strong> grant, award or disposition. <strong>M:</strong> option exercise. <strong>G:</strong> gift. <strong>F:</strong> tax withholding. Other codes remain labelled rather than forced into buy/sell.</p></article><article class="card"><h3>Form 13F limitations</h3><p>Managers generally report qualifying long U.S. equity positions quarterly. Short positions, many derivatives, cash, private assets and temporarily confidential holdings may be absent.</p></article><article class="card"><h3>Correction route</h3><p>The SEC filing controls. Report parser or identity errors through the correction route with the accession number and source line.</p><a class="btn alt" href="contact.html">Submit correction</a></article></div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — official filing first, interpretation second.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script><script src="market-activity.js"></script></body></html>`;

fs.writeFileSync(path.join(root, 'market-activity.html'), html);
fs.writeFileSync(path.join(root, 'market-activity'), html);

const csvHeaders = ['recordType', 'subject', 'issuer', 'ticker', 'action', 'transactionCode', 'transactionDate', 'periodEnd', 'filingDate', 'shares', 'previousShares', 'currentShares', 'shareChange', 'reportedValue', 'evidenceGrade', 'factualStatus', 'accessionNumber', 'sourceUrl'];
const rows = records.map(record => [
  record.recordType,
  record.subject,
  record.issuerName,
  record.ticker,
  record.action,
  record.transactionCode,
  record.transactionDate,
  record.periodEnd,
  record.filingDate,
  record.shares,
  record.previousShares,
  record.currentShares,
  record.shareChange,
  record.reportedValue,
  record.evidenceGrade || 'A',
  record.factualStatus || 'official filing',
  record.accessionNumber,
  record.sourceUrl
].map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'market-activity.csv'), [csvHeaders.join(','), ...rows].join('\n'));
console.log(`Market activity pages built: ${records.length} records.`);
