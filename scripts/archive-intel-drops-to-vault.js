const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dropsDir = path.join(root, 'data', 'drops');
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
function ensureDir(dir){ fs.mkdirSync(dir, { recursive: true }); }
function esc(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function readDrops(){
  if (!fs.existsSync(dropsDir)) return [];
  return fs.readdirSync(dropsDir).filter(f => f.endsWith('.json')).map(file => {
    try { return { file, ...JSON.parse(fs.readFileSync(path.join(dropsDir, file), 'utf8')) }; } catch { return null; }
  }).filter(Boolean).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
}
function ageDays(date){ const t = new Date(date || 0).getTime(); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : 9999; }
function category(drop){
  const hay = `${drop.label || ''} ${drop.title || ''} ${drop.summary || ''}`.toLowerCase();
  if (/epstein|maxwell/.test(hay)) return 'Epstein / Public Record';
  if (/declass|cia|fbi|nsa|vault|intelligence/.test(hay)) return 'Declassified / Intelligence';
  if (/war|gaza|israel|iran|ukraine|russia|china|nato|red sea/.test(hay)) return 'War File';
  if (/cartel|mafia|crime|launder|corruption|sanction/.test(hay)) return 'Crime-State Overlap';
  if (/symbol|masonic|dog|architect|occult|degree/.test(hay)) return 'Symbolic Power';
  return drop.label || 'Signal';
}
const drops = readDrops();
const live = drops.filter(drop => ageDays(drop.date) <= 7);
const archived = drops.filter(drop => ageDays(drop.date) > 7);
const vaultRecords = drops.map(drop => ({
  id: drop.slug || drop.file.replace(/\.json$/, ''),
  date: drop.date || '',
  ageDays: ageDays(drop.date),
  vaultStatus: ageDays(drop.date) > 7 ? 'vaulted' : 'live-window',
  category: category(drop),
  title: drop.title || 'Signal Bulletin',
  evidenceLabel: drop.label || 'Signal',
  source: drop.source || '',
  sourceLink: drop.sourceLink || '',
  sourceDomain: drop.sourceDomain || '',
  bookTitle: drop.book && drop.book.title || '',
  bookUrl: drop.book && drop.book.localUrl || '',
  archiveFile: `data/drops/${drop.file}`,
  boundary: 'Source first, claim second, pattern last. A saved update is a route into evidence, not a final conclusion.'
}));
ensureDir(dataDir); ensureDir(downloadsDir);
fs.writeFileSync(path.join(dataDir, 'intel-drop-vault.json'), JSON.stringify({ generatedAt: new Date().toISOString(), liveWindowDays: 7, liveCount: live.length, archivedCount: archived.length, totalCount: drops.length, records: vaultRecords }, null, 2));
fs.writeFileSync(path.join(downloadsDir, 'intel-drop-vault.json'), JSON.stringify({ generatedAt: new Date().toISOString(), liveWindowDays: 7, liveCount: live.length, archivedCount: archived.length, totalCount: drops.length, records: vaultRecords }, null, 2));
fs.writeFileSync(path.join(downloadsDir, 'intel-drop-vault.md'), ['# Matrix Reprogrammed Intel Drop Vault', '', `Generated: ${new Date().toISOString()}`, `Live window: 7 days`, `Total drops: ${drops.length}`, `Live-window drops: ${live.length}`, `Vaulted old drops: ${archived.length}`, '', '## Boundary', '', 'Old updates do not vanish. They leave the live desk and become source-trail vault records.', '', ...vaultRecords.map(record => [`## ${record.title}`, '', `- Date: ${record.date}`, `- Status: ${record.vaultStatus}`, `- Category: ${record.category}`, `- Evidence label: ${record.evidenceLabel}`, `- Source: ${record.source}`, `- Source link: ${record.sourceLink}`, `- Reader path: ${record.bookTitle}`, `- Archive file: ${record.archiveFile}`, '', record.boundary, ''].join('\n'))].join('\n'));
const cards = vaultRecords.length ? vaultRecords.map(record => `<article class="news-item" data-status="${esc(record.vaultStatus)}"><span class="label">${esc(record.category)} · ${esc(record.vaultStatus)}</span><h3>${esc(record.title)}</h3><p class="dateline">${esc(record.date)} · ${esc(record.source)}</p><p>${esc(record.boundary)}</p><p class="source-list"><a href="${esc(record.sourceLink)}" target="_blank" rel="noopener">Open source</a> · <a href="${esc(record.archiveFile)}">Open saved JSON</a></p><div class="cta-row small"><a class="btn" href="${esc(String(record.bookUrl).replace('https://matrixreprogrammed.com/','')) || 'books.html'}">Reader Path</a><a class="btn alt" href="download-center.html">Downloads</a></div></article>`).join('\n') : '<article class="news-item"><h3>No drops in the vault yet</h3><p>The vault fills automatically as the daily Intel engine creates source-led drops.</p></article>';
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Intel Drop Vault | Matrix Reprogrammed</title><meta name="description" content="Matrix Reprogrammed Intel Drop Vault: all saved source-led updates, with old live updates archived into the vault." /><link rel="stylesheet" href="styles.css" /><link rel="stylesheet" href="fixes.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="news.html">Intel Desk</a><a href="intel-archive.html">Archive</a><a href="intel-drop-vault.html">Vault</a><a href="evidence-vault.html">Evidence Vault</a><a href="download-center.html">Downloads</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Old Updates To Vault</div><h1>INTEL DROP VAULT.</h1><p class="lead">Live updates stay fresh. Old updates do not disappear. Every saved daily signal becomes a vault record with source, evidence label, reader path, and archive file.</p><div class="cta-row"><a class="btn" href="news.html">Latest 7 Days</a><a class="btn alt" href="downloads/intel-drop-vault.json">Vault JSON</a><a class="btn alt" href="downloads/intel-drop-vault.md">Vault Markdown</a></div></section><section class="section wrap split"><div class="terminal">VAULT COUNTS\n&gt; Total drops: ${drops.length}\n&gt; Live-window drops: ${live.length}\n&gt; Vaulted old drops: ${archived.length}\n&gt; Rule: 8+ days moves to vault</div><aside class="card redline"><h2>Evidence Boundary</h2><p>Vault records are saved source trails. They are not stronger than their source links. Source first, claim second, pattern last.</p></aside></section><section class="section wrap"><h2>Saved Updates</h2><p class="lead">Filter mentally by status: live-window means still fresh; vaulted means older than the public live window but preserved as evidence trail.</p>${cards}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p></footer></div><script src="matrix.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'intel-drop-vault.html'), html);
console.log(`Built intel drop vault: ${drops.length} total, ${archived.length} vaulted old updates.`);
