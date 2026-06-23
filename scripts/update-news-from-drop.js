const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dropPath = path.join(root, 'data', 'latest-drop.json');
const outPath = path.join(root, 'news.html');

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const drop = fs.existsSync(dropPath) ? JSON.parse(fs.readFileSync(dropPath, 'utf8')) : null;

const latestCard = drop ? `
<p class="dateline">Latest automated signal · ${esc(drop.date)}</p>
<article class="news-item redline">
  <span class="label">${esc(drop.label)}</span>
  <h3>${esc(drop.title)}</h3>
  <p>${esc(drop.angle)}</p>
  <p><strong>Source:</strong> ${esc(drop.source)}${drop.sourceDate ? ` · ${esc(drop.sourceDate.slice(0, 10))}` : ''}</p>
  <p class="source-list"><a href="${esc(drop.sourceLink)}" target="_blank" rel="noopener">Open source record</a></p>
  <div class="cta-row small"><a class="btn" href="${esc(drop.book.localUrl.replace('https://matrixreprogrammed.com/', ''))}">Reader Path: ${esc(drop.book.title)}</a><a class="btn alt" href="black-file.html">Black File</a></div>
</article>` : `
<p class="dateline">Latest automated signal</p>
<article class="news-item redline"><span class="label">Archive Signal</span><h3>The Black File gateway is open</h3><p>The automated desk is ready to receive the next source-led drop.</p><p class="source-list"><a href="black-file.html">Open The Black File</a></p></article>`;

const candidates = drop && Array.isArray(drop.candidates) ? drop.candidates.slice(0, 5).map(x => `<li><strong>${esc(x.label)}</strong> — <a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a> <span class="warning">${esc(x.source)}</span></li>`).join('') : '';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signal Intel Desk | Matrix Reprogrammed</title>
  <meta name="description" content="Matrix Reprogrammed Signal Intel Desk: sourced updates on wars, elite networks, intelligence drops, declassified files, court records, WikiLeaks archives, sanctions, organized crime, and public-record power." />
  <meta property="og:title" content="Signal Intel Desk | Matrix Reprogrammed" />
  <meta property="og:description" content="Sourced updates on wars, elite networks, intelligence drops, declassified files, court records, leak archives, and public-record power." />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
<canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">
<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="books.html">Books</a><a href="news.html">Intel Desk</a><a href="black-file.html">Black File</a><a href="dog-the-architect.html">D.O.G</a><a href="transmissions.html">Rumble</a><a href="contact.html">Contact</a></nav></header>
<main>
<section class="hero wrap"><div class="eyebrow">Signal Intel Desk</div><h1>WAR. FILES. POWER.<br>THE PUBLIC RECORD.</h1><p class="lead">A Matrix Reprogrammed source desk for wars, intelligence agencies, declassified files, elite networks, sanctions, court records, Epstein-related public records, WikiLeaks/archive drops, organized-crime/state overlap, surveillance, censorship, and institutional corruption.</p><div class="cta-row"><a class="btn" href="#latest">Latest Desk</a><a class="btn alt" href="#sources">Source Hubs</a><a class="btn alt" href="#human-cost">Human Cost</a></div></section>
<section id="latest" class="section wrap split"><div>${latestCard}<article class="news-item"><span class="label">Intelligence Watch</span><h3>Declassified files / agency archives monitor</h3><p>This desk tracks intelligence-related releases from official archives, agency reading rooms, congressional files, court records, and reputable document libraries. Priority: CIA, NSA, GCHQ/UK records, MI6-adjacent public files, FBI Vault, ODNI, NARA, and national-security court filings.</p><p class="source-list"><a href="https://www.cia.gov/readingroom/" target="_blank" rel="noopener">CIA Reading Room</a> · <a href="https://vault.fbi.gov/" target="_blank" rel="noopener">FBI Vault</a> · <a href="https://www.archives.gov/research/intelligence" target="_blank" rel="noopener">National Archives Intelligence Records</a> · <a href="https://www.dni.gov/" target="_blank" rel="noopener">ODNI</a></p></article><article class="news-item"><span class="label">Archive Candidates</span><h3>Other signals checked by the desk</h3><ul>${candidates || '<li>Candidate list updates after the next automated source scan.</li>'}</ul></article></div><aside class="card redline"><h2>Evidence Rule</h2><p>No unsupported accusations. No private victim names. No screenshots as proof. No rumor framed as fact. Every item must either link to a source or be marked clearly as not verified.</p><div class="terminal">CONFIRMED = sourced release or official data
DEVELOPING = credible reporting, still moving
DECLASSIFIED = official archive / release
COURT RECORD = filing, docket, judgment, exhibit
ARCHIVE DROP = document cache or leak archive
INTELLIGENCE WATCH = agency/security relevance
WAR FILE = conflict, proxy, sanctions, contractors
ELITE NETWORK = public-record power mapping
CRIME-STATE OVERLAP = crime touches state/finance/logistics
NOT VERIFIED = claim seen, not supported</div></aside></section>
<section id="sources" class="section wrap"><h2>Source Hubs</h2><p class="lead">The desk is built from source hubs that match the Matrix Reprogrammed catalogue: Intelligence Dossiers, Crime Dossiers, D.O.G symbolic analysis, elite-toolkit material, and public-record exposés.</p><div class="grid"><article class="card"><h3>Intelligence & Declassification</h3><p>CIA Reading Room, FBI Vault, NARA, ODNI, congressional releases, court dockets, and agency document libraries.</p></article><article class="card"><h3>Wars & Power</h3><p>War updates are filtered for intelligence, sanctions, contractors, propaganda, weapons flows, energy, surveillance, and proxy structures.</p></article><article class="card"><h3>Elite Networks</h3><p>Only public-record mapping: court filings, corporate registers, lobbying data, sanctions, donor structures, leaked documents with provenance, and official investigations.</p></article><article class="card"><h3>Crime-State Overlap</h3><p>Cartels, mafia, laundering, ports, cybercrime, sanctions, underground banking, and corruption cases that mirror the Crime Dossiers.</p></article></div></section>
<section id="human-cost" class="section wrap"><h2>Human Cost Evidence Panel</h2><p class="lead">Exploitation, trafficking, war, and criminal networks have human cost. This panel uses sourced, dated figures only. It does not display fake live counters or unverifiable global totals.</p><div class="metric-grid"><div class="metric redline"><strong>32,167</strong><span>missing children cases supported by NCMEC in 2025. U.S.-focused NCMEC support data, including some young adults ages 18-20.</span></div><div class="metric"><strong>29,013</strong><span>NCMEC-supported missing-child cases resolved in 2025, according to NCMEC impact data.</span></div><div class="metric amber"><strong>21.3M</strong><span>CyberTipline reports received by NCMEC in 2025 for suspected child sexual exploitation. This is not a missing-children count.</span></div><div class="metric"><strong>1.4M</strong><span>online enticement reports received by NCMEC in 2025.</span></div></div><div class="card"><h3>Counter status</h3><p><strong>Live worldwide counter:</strong> not displayed because no verified, central, real-time worldwide dataset has been confirmed.</p><p><strong>Ethical counter:</strong> sourced, dated, country/institution-specific figures only.</p><p class="source-list"><a href="https://www.missingkids.org/ourwork/impact" target="_blank" rel="noopener">NCMEC 2025 Impact Data</a> · <a href="https://www.missingkids.org/gethelpnow/cybertipline/cybertiplinedata" target="_blank" rel="noopener">NCMEC CyberTipline Data</a></p></div></section>
<section class="section wrap grid"><article class="card"><h2>What Counts As A Drop?</h2><p>Official releases, declassified files, court filings, agency archives, congressional releases, sanctions, major leak archives, verified transparency records, and reputable investigative-source material.</p></article><article class="card"><h2>Why It Matters</h2><p>A story matters when it reveals structure: money, agency power, logistics, narrative control, public-private authority, symbolic language, or institutional failure.</p></article><article class="card"><h2>Reader Funnel</h2><p>Every update points readers into the correct Matrix Reprogrammed book door: Intelligence Dossiers, Crime Dossiers, D.O.G, Masonic/esoteric, Survival & War, Dark Psychology, or The Black File.</p></article></section>
</main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Public-record investigation, symbolic analysis, esoteric commentary, fiction, speculation, and author interpretation are separated where needed.</p></footer></div><script src="matrix.js"></script></body></html>`;

fs.writeFileSync(outPath, html);
console.log(`Updated ${outPath} from latest drop.`);
