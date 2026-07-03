const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const updated = new Date().toISOString();
const ua = process.env.SEC_USER_AGENT || 'MatrixReprogrammed filing metadata feed contact:njmgroupfrance@gmail.com';

const companies = [
  ['SEC-001', 'Tesla, Inc.', '0001318605', 'TSLA', 'dossier-elon-musk.html'],
  ['SEC-002', 'Oracle Corporation', '0001341439', 'ORCL', 'dossier-larry-ellison.html'],
  ['SEC-003', 'Microsoft Corporation', '0000789019', 'MSFT', 'dossier-satya-nadella.html'],
  ['SEC-004', 'Alphabet Inc.', '0001652044', 'GOOGL', 'dossier-sundar-pichai.html'],
  ['SEC-005', 'Meta Platforms, Inc.', '0001326801', 'META', 'dossier-mark-zuckerberg.html'],
  ['SEC-006', 'Amazon.com, Inc.', '0001018724', 'AMZN', 'dossier-jeff-bezos.html'],
  ['SEC-007', 'NVIDIA Corporation', '0001045810', 'NVDA', 'dossier-jensen-huang.html'],
  ['SEC-008', 'Palantir Technologies Inc.', '0001321655', 'PLTR', 'dossier-alex-karp.html'],
  ['SEC-009', 'BlackRock, Inc.', '0001364742', 'BLK', 'dossier-larry-fink.html']
];

function clean(v, n = 500) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, n); }
function archiveUrl(cik, accession) {
  if (!accession) return '';
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accession).replace(/-/g, '')}/`;
}
function latest10k(recent = {}) {
  const forms = recent.form || [];
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === '10-K' || forms[i] === '10-K/A') {
      return {
        form: forms[i],
        filingDate: recent.filingDate && recent.filingDate[i] || '',
        reportDate: recent.reportDate && recent.reportDate[i] || '',
        accessionNumber: recent.accessionNumber && recent.accessionNumber[i] || '',
        primaryDocument: recent.primaryDocument && recent.primaryDocument[i] || '',
        primaryDocDescription: recent.primaryDocDescription && recent.primaryDocDescription[i] || ''
      };
    }
  }
  return null;
}
async function getCompany(row) {
  const [id, fallbackName, cik, symbol, dossier] = row;
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    const annual = latest10k(json.filings && json.filings.recent || {});
    return {
      id,
      status: annual ? 'annual filing metadata captured' : 'route verified, annual filing not captured',
      name: clean(json.name || fallbackName, 200),
      cik,
      symbol: (json.tickers && json.tickers[0]) || symbol,
      dossier,
      submissionsUrl: url,
      latestAnnual: annual,
      archiveUrl: annual ? archiveUrl(cik, annual.accessionNumber) : '',
      nextAction: annual ? `Review ${annual.primaryDocument || 'primary filing document'}` : 'Retry or use EDGAR company search.'
    };
  } catch (err) {
    return { id, status: 'fetch failed', name: fallbackName, cik, symbol, dossier, submissionsUrl: url, latestAnnual: null, archiveUrl: '', error: clean(err.message, 200), nextAction: 'Retry SEC metadata feed.' };
  }
}
function html(model) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>SEC Filing Feed | Matrix Reprogrammed</title><meta name="description" content="Build-generated SEC annual filing metadata feed."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="system-feed-index.html">System Feed</a><a href="record-intake-queue.html">Intake</a><a href="verified-record-cards-batch-001.html">VRC Batch</a></nav></header><main><section class="hero wrap"><div class="eyebrow">SEC Metadata</div><h1>SEC FILING FEED.</h1><p class="lead">Latest annual filing metadata captured from official SEC submission routes. Full content review still requires opening and classifying each filing.</p><div class="cta-row"><a class="btn" href="data/sec-filing-feed.json">Open JSON</a><a class="btn alt" href="downloads/sec-filing-feed.md">Download Markdown</a></div></section><section class="section wrap split"><div class="terminal">SEC FEED\n&gt; Generated: ${model.updated}\n&gt; Cards: ${model.summary.total}\n&gt; Captured: ${model.summary.captured}\n&gt; Failed: ${model.summary.failed}</div><aside class="card redline"><h2>Boundary</h2><p>${model.boundary}</p></aside></section><section class="section wrap"><h2>Cards</h2><div class="grid">${model.cards.map(c => `<article class="card redline"><span class="label">${c.id} · ${c.status}</span><h3>${c.name}</h3><p><strong>CIK:</strong> ${c.cik}</p><p><strong>Ticker:</strong> ${c.symbol || ''}</p><p><strong>Latest annual:</strong> ${c.latestAnnual ? `${c.latestAnnual.form} filed ${c.latestAnnual.filingDate} report ${c.latestAnnual.reportDate}` : 'Pending'}</p><p><strong>Primary doc:</strong> ${c.latestAnnual && c.latestAnnual.primaryDocument || 'Pending'}</p><p><strong>Next action:</strong> ${c.nextAction}</p><a class="btn alt" href="${c.submissionsUrl}" target="_blank" rel="noopener">SEC submissions</a>${c.archiveUrl ? `<a class="btn alt" href="${c.archiveUrl}" target="_blank" rel="noopener">Archive folder</a>` : ''}<a class="btn alt" href="${c.dossier}">Dossier</a></article>`).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — metadata first, content review next.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function md(model) {
  const lines = ['# SEC Filing Feed', '', `Updated: ${model.updated}`, '', model.boundary, '', '## Summary', '', `- Total: ${model.summary.total}`, `- Captured: ${model.summary.captured}`, `- Failed: ${model.summary.failed}`, '', '## Cards', ''];
  for (const c of model.cards) {
    lines.push(`### ${c.id} — ${c.name}`, '', `- Status: ${c.status}`, `- CIK: ${c.cik}`, `- Ticker: ${c.symbol || ''}`, `- SEC submissions: ${c.submissionsUrl}`);
    if (c.latestAnnual) lines.push(`- Latest annual: ${c.latestAnnual.form}`, `- Filing date: ${c.latestAnnual.filingDate}`, `- Report date: ${c.latestAnnual.reportDate}`, `- Accession: ${c.latestAnnual.accessionNumber}`, `- Primary document: ${c.latestAnnual.primaryDocument}`);
    if (c.archiveUrl) lines.push(`- Archive: ${c.archiveUrl}`);
    lines.push(`- Next action: ${c.nextAction}`, '');
  }
  return lines.join('\n');
}
async function main() {
  const cards = [];
  for (const row of companies) cards.push(await getCompany(row));
  const model = {
    updated,
    title: 'SEC Filing Feed',
    boundary: 'This feed captures official SEC filing metadata only. It does not verify narrative content until the selected annual filing is reviewed and classified.',
    cards,
    summary: { total: cards.length, captured: cards.filter(c => c.latestAnnual).length, failed: cards.filter(c => c.status === 'fetch failed').length }
  };
  fs.writeFileSync(path.join(dataDir, 'sec-filing-feed.json'), JSON.stringify(model, null, 2));
  fs.writeFileSync(path.join(downloadsDir, 'sec-filing-feed.md'), md(model));
  fs.writeFileSync(path.join(root, 'sec-filing-feed.html'), html(model));
  console.log(`SEC filing feed generated: ${model.summary.captured}/${model.summary.total}`);
}
main().catch(err => {
  const model = { updated, title: 'SEC Filing Feed', boundary: 'Fallback feed. Retry SEC metadata capture.', error: clean(err.message, 500), cards: [], summary: { total: 0, captured: 0, failed: companies.length } };
  fs.writeFileSync(path.join(dataDir, 'sec-filing-feed.json'), JSON.stringify(model, null, 2));
  fs.writeFileSync(path.join(downloadsDir, 'sec-filing-feed.md'), md(model));
  fs.writeFileSync(path.join(root, 'sec-filing-feed.html'), html(model));
  console.log('SEC filing feed fallback generated.');
});
