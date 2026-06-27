const fs = require('fs');
const path = require('path');

const root = process.cwd();
const SITE = 'https://matrixreprogrammed.com';
const dataPath = path.join(root, 'data', 'epstein-sighting-watch.json');
const livePath = path.join(root, 'downloads', 'seven-day-intel.json');
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function read(file, fallback = '') { try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch { return fallback; } }
function write(file, value) { fs.writeFileSync(path.join(root, file), value); }
function readJsonAbs(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function readJson(file, fallback) { try { return JSON.parse(read(file)); } catch { return fallback; } }
function esc(v = '') { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function slug(v = '') { return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'claim'; }
function strip(html = '') { return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function removeSectionById(html, id) { return html.replace(new RegExp(`\\s*<section\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/section>`, 'gi'), ''); }

const watch = readJsonAbs(dataPath, {
  title: 'Epstein Sighting Watch',
  subtitle: 'Official status: deceased. Internet sighting claims: unverified.',
  officialBoundary: 'Official status remains deceased. Sighting claims are unverified internet claims.',
  rules: [], evidenceLevels: [], scanQueries: [], seedClaims: []
});
const liveIntel = readJsonAbs(livePath, { items: [] });
const now = new Date();

function classifyEvidence(item) {
  const hay = [item.title, item.summary, item.url, item.sourceLabel].join(' ').toLowerCase();
  if (/official|court|medical examiner|inspector general|doj|bureau of prisons/.test(hay)) return 7;
  if (/multiple|independent|witnesses|confirmed by/.test(hay)) return 6;
  if (/witness|interview|says|claims/.test(hay)) return 5;
  if (/geolocat|location|airport|island|hotel|public/.test(hay)) return 4;
  if (/photo|video|seen|sighting|camera|footage|image/.test(hay)) return 3;
  if (/screenshot|repost|viral|tweet|x post|tiktok|facebook/.test(hay)) return 2;
  if (/meme|joke|parody/.test(hay)) return 0;
  return 1;
}
function claimType(item) {
  const hay = [item.title, item.summary, item.url].join(' ').toLowerCase();
  if (/debunk|false|hoax|fake|ai|manipulat|deepfake/.test(hay)) return 'debunk/fake-media-risk';
  if (/lookalike|resembles|similar|doppelganger/.test(hay)) return 'lookalike-claim';
  if (/alive|still alive|fake death|death hoax/.test(hay)) return 'survival-claim';
  if (/seen|sighting|spotted|photo|video/.test(hay)) return 'sighting-claim';
  return 'related-claim-traffic';
}
function likelyExplanation(type, level) {
  if (type.includes('debunk') || type.includes('fake')) return 'Could be AI, edited media, old footage, or caption laundering. Preserve original source chain before sharing.';
  if (type.includes('lookalike')) return 'Likely mistaken identity unless identity chain, location, date, and independent corroboration exist.';
  if (level <= 2) return 'Low evidence signal: meme, repost, anonymous text, or screenshot without source custody.';
  if (level <= 4) return 'Media claim needs source custody, date, location, identity verification, and counter-source review.';
  return 'Higher relevance only if linked to primary documents, named witnesses, or official/public records.';
}
function matchesSighting(item) {
  const hay = [item.title, item.summary, item.url, item.sourceLabel].join(' ').toLowerCase();
  const terms = ['epstein alive','still alive','sighting','seen','spotted','lookalike','fake death','body double','death hoax','plastic surgery','epstein photo','epstein video','epstein island','epstein prison'];
  return hay.includes('epstein') && terms.some(term => hay.includes(term.replace('epstein ', '')) || hay.includes(term));
}

const liveMatches = (liveIntel.items || [])
  .filter(matchesSighting)
  .map((item, index) => {
    const level = classifyEvidence(item);
    const type = claimType(item);
    return {
      id: item.id || `live-${index}-${slug(item.title)}`,
      title: item.title || 'Untitled sighting claim',
      type,
      foundAt: item.published || item.fetchedAt || now.toISOString(),
      sourceUrl: item.url || '',
      sourceLabel: item.sourceLabel || item.laneTitle || 'Seven-day intel item',
      sourceType: 'seven-day internet/news scan',
      locationClaim: 'Unverified / source dependent',
      evidenceLevel: level,
      status: level >= 7 ? 'public-record-relevance' : 'unverified-claim',
      summary: strip(item.summary || item.title || ''),
      likelyExplanation: likelyExplanation(type, level),
      risk: level <= 3 ? 'high' : 'medium',
      boundary: 'This is a claim lead, not evidence that Epstein is alive.'
    };
  });

const claims = [...(watch.seedClaims || []), ...liveMatches];
const verifiedSurvivalEvidence = claims.filter(c => c.status === 'verified-survival-evidence');
const scan = {
  updated: now.toISOString(),
  title: watch.title,
  subtitle: watch.subtitle,
  officialStatus: 'deceased',
  officialBoundary: watch.officialBoundary,
  verifiedSurvivalEvidence: verifiedSurvivalEvidence.length,
  internetClaimActivity: liveMatches.length >= 8 ? 'high' : liveMatches.length >= 3 ? 'medium' : liveMatches.length ? 'low' : 'none found in current seven-day feed window',
  hoaxRisk: 'high',
  scanQueries: watch.scanQueries,
  evidenceLevels: watch.evidenceLevels,
  rules: watch.rules,
  claims,
  liveMatches,
  sourceNote: 'Weekly scan is built from the current Matrix Reprogrammed seven-day intel window plus standing sighting claim classes. It does not crawl private platforms and does not verify survival.'
};

write('data/epstein-sighting-scan.json', JSON.stringify(scan, null, 2));
write('downloads/epstein-sighting-watch.json', JSON.stringify(scan, null, 2));

function markdown(scan) {
  const lines = [
    '# Epstein Sighting Watch', '',
    `Generated: ${scan.updated}`, '',
    '## Official Boundary', '', scan.officialBoundary, '',
    `- Official status: ${scan.officialStatus}`,
    `- Verified survival evidence found: ${scan.verifiedSurvivalEvidence}`,
    `- Internet claim activity: ${scan.internetClaimActivity}`,
    `- Hoax / lookalike / fake-media risk: ${scan.hoaxRisk}`, '',
    '## Rules', '', ...(scan.rules || []).map(rule => `- ${rule}`), '',
    '## Claims / Claim Classes', ''
  ];
  for (const c of scan.claims || []) {
    lines.push(`### ${c.title}`);
    lines.push(`- Type: ${c.type}`);
    lines.push(`- Status: ${c.status}`);
    lines.push(`- Evidence level: ${c.evidenceLevel}`);
    lines.push(`- Location claim: ${c.locationClaim || 'Unverified / source dependent'}`);
    if (c.sourceUrl) lines.push(`- Source: ${c.sourceUrl}`);
    lines.push(`- Likely explanation: ${c.likelyExplanation || 'Needs source custody and counter-source review.'}`);
    lines.push('');
    lines.push(c.summary || 'No summary available.');
    lines.push('');
  }
  return lines.join('\n');
}
write('downloads/epstein-sighting-watch.md', markdown(scan));

function levelLabel(level) {
  const row = (watch.evidenceLevels || []).find(e => Number(e.level) === Number(level));
  return row ? row.label : `Level ${level}`;
}
function claimCard(c) {
  return `<article class="card redline"><span class="label">${esc(c.type || 'claim')}</span><h3>${esc(c.title)}</h3><p>${esc(c.summary || '')}</p><p><strong>Status:</strong> ${esc(c.status || 'unverified')}</p><p><strong>Evidence:</strong> Level ${esc(c.evidenceLevel)} — ${esc(levelLabel(c.evidenceLevel))}</p><p><strong>Likely explanation:</strong> ${esc(c.likelyExplanation || 'Requires source custody and counter-source review.')}</p>${c.sourceUrl ? `<a class="btn alt" href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Open Source</a>` : ''}</article>`;
}
function evidenceRows() {
  return (watch.evidenceLevels || []).map(e => `<tr><td>${esc(e.level)}</td><td>${esc(e.label)}</td><td>${esc(e.meaning)}</td></tr>`).join('');
}

const page = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Epstein Sighting Watch | Matrix Reprogrammed</title><meta name="description" content="Tracks internet claims that Jeffrey Epstein is still alive as unverified sightings, lookalikes, fake-media risks, and claim traffic under an official-record boundary." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="epstein-files.html">Epstein Command Center</a><a href="epstein-sighting-submit.html">Submit Sighting</a><a href="claim-classifier.html">Claim Classifier</a><a href="source-document-vault.html">Sources</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Epstein Command Center / Sighting Ledger</div><h1>IS EPSTEIN STILL ALIVE?</h1><p class="lead">Official status: deceased. Internet sightings: unverified. This page tracks the claim traffic without declaring survival.</p><div class="cta-row"><a class="btn" href="epstein-sighting-submit.html">Submit A Sighting Claim</a><a class="btn alt" href="downloads/epstein-sighting-watch.json">Weekly JSON</a><a class="btn alt" href="downloads/epstein-sighting-watch.md">Weekly Markdown</a></div></section><section class="section wrap split"><div class="terminal">EPSTEIN SIGHTING WATCH\n&gt; Official status: deceased\n&gt; Verified survival evidence: ${esc(scan.verifiedSurvivalEvidence)}\n&gt; Current claim activity: ${esc(scan.internetClaimActivity)}\n&gt; Hoax risk: ${esc(scan.hoaxRisk)}\n&gt; Rule: sighting is not identity</div><aside class="card redline"><h2>Official Boundary</h2><p>${esc(scan.officialBoundary)}</p><p><strong>Hard rule:</strong> Do not harass, dox, name, or accuse ordinary lookalikes. A viral photo is not proof.</p></aside></section><section class="section wrap"><h2>Evidence Ladder For Sightings</h2><table><thead><tr><th>Level</th><th>Label</th><th>Meaning</th></tr></thead><tbody>${evidenceRows()}</tbody></table></section><section class="section wrap"><h2>Sighting Ledger</h2><div class="grid">${claims.map(claimCard).join('')}</div></section><section class="section wrap split"><div class="card"><h2>Scan Queries</h2><p>${(watch.scanQueries || []).map(q => `<span class="pill">${esc(q)}</span>`).join(' ')}</p></div><aside class="card redline"><h2>Reader Action</h2><p>Found a sighting claim? Submit the source link, claimed location, date, media link, and any debunk/counter-source. Keep it legal.</p><a class="btn" href="epstein-sighting-submit.html">Submit Claim</a></aside></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — official record first, claim traffic second.</p></footer></div><script src="matrix.js"></script></body></html>`;
write('epstein-sighting-watch.html', page);

const submitPage = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Submit Epstein Sighting Claim | Matrix Reprogrammed</title><meta name="description" content="Submit an unverified Epstein sighting, lookalike, fake-media, or debunk link to the Matrix Reprogrammed signal board." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="epstein-sighting-watch.html">Sighting Watch</a><a href="epstein-files.html">Epstein Command Center</a><a href="forum.html">Signal Board</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Submit A Sighting Claim</div><h1>DROP THE CLAIM. KEEP THE BOUNDARY.</h1><p class="lead">Submit links only. No doxxing, no private addresses, no naming ordinary lookalikes, no illegal material, and no claim stronger than the source supports.</p></section><section id="signal-pass" class="section wrap split"><div class="card redline"><h2>Signal Pass</h2><p>The board uses the existing Signal Pass friction against spam.</p><p><a class="btn" href="https://www.paypal.me/njmgroup/1" target="_blank" rel="noopener">Pay €1 Signal Pass</a></p><button class="btn alt" type="button" id="unlock-signal-pass">I’ve Paid — Unlock Posting</button><p class="form-status" id="signal-pass-status"></p></div><aside class="card"><h2>What to include</h2><p>Source URL, claimed location/date, media link, why it matters, and any counter-source or debunk.</p></aside></section><section id="submit-signal" class="section wrap split signal-locked"><div class="card redline"><h2>Post To Sighting Watch</h2><p class="signal-lock-message">Posting is locked until Signal Pass is unlocked on this device.</p><form id="signal-board-form"><label>Category</label><select name="category" required><option value="Epstein Sighting Claim">Epstein Sighting Claim</option><option value="Epstein Lookalike Claim">Epstein Lookalike Claim</option><option value="Epstein Fake Media / AI Claim">Fake Media / AI Claim</option><option value="Epstein Sighting Debunk">Debunk / Counter-Source</option></select><label>Name or handle</label><input name="name" maxlength="80" placeholder="Anonymous / handle" /><label>Title</label><input name="title" maxlength="140" required placeholder="Short sighting claim title" /><label>Source link / photo link / archive link</label><input name="sourceUrl" type="url" maxlength="500" placeholder="https://..." /><label>Message</label><textarea name="body" maxlength="2400" required placeholder="Claimed location/date, source chain, why it matters, and counter-source if available. Do not include private addresses, private victim names, doxxing, or direct accusations against ordinary people."></textarea><input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" /><button class="btn" type="submit">Post Sighting Claim</button><p class="form-status" id="signal-form-status"></p></form></div><aside class="card"><h2>Boundary</h2><p>This is a claim-submission page, not a proof engine. Submissions appear as reader signals unless separately source-carded or verified.</p></aside></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — sighting is not identity.</p></footer></div><script src="matrix.js"></script><script src="forum.js"></script></body></html>`;
write('epstein-sighting-submit.html', submitPage);

function patchEpsteinCommandCenter() {
  const file = 'epstein-files.html';
  let html = read(file);
  if (!html) return false;
  const before = html;
  html = removeSectionById(html, 'epstein-sighting-watch-panel');
  const panel = `<section id="epstein-sighting-watch-panel" class="section wrap split"><div class="terminal">IS EPSTEIN STILL ALIVE?\n&gt; Official status: deceased\n&gt; Sighting claims: tracked, not accepted\n&gt; Verified survival evidence: ${esc(scan.verifiedSurvivalEvidence)}\n&gt; Current internet claim activity: ${esc(scan.internetClaimActivity)}\n&gt; Hoax/lookalike risk: ${esc(scan.hoaxRisk)}</div><aside class="card redline"><div class="pill">New Tracker</div><h2>Epstein Sighting Watch</h2><p>Track sightings, lookalikes, fake-media claims, body-double claims, and debunks without claiming survival.</p><div class="cta-row small"><a class="btn" href="epstein-sighting-watch.html">Open Sighting Ledger</a><a class="btn alt" href="epstein-sighting-submit.html">Submit Sighting</a><a class="btn alt" href="downloads/epstein-sighting-watch.json">Weekly Scan</a></div></aside></section>`;
  if (html.includes('</main>')) html = html.replace('</main>', `${panel}</main>`);
  else html += panel;
  if (html !== before) write(file, html);
  return html !== before;
}
const patchedCommandCenter = patchEpsteinCommandCenter();

function patchIndexes() {
  const today = new Date().toISOString().slice(0, 10);
  if (fs.existsSync(path.join(root, 'sitemap.xml'))) {
    let xml = read('sitemap.xml');
    for (const route of ['epstein-sighting-watch.html', 'epstein-sighting-submit.html']) {
      if (!xml.includes(`/${route}`)) xml = xml.replace('</urlset>', `  <url><loc>${SITE}/${route}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.72</priority></url>\n</urlset>`);
    }
    write('sitemap.xml', xml);
  }
  if (fs.existsSync(path.join(root, 'llms.txt'))) {
    let txt = read('llms.txt');
    if (!txt.includes('/epstein-sighting-watch.html')) write('llms.txt', `${txt.trim()}\n\nEpstein Sighting Watch:\n- /epstein-sighting-watch.html: unverified sighting and lookalike claim ledger with official-status boundary.\n- /epstein-sighting-submit.html: reader submission route for sighting claims, debunks, and source links.\n`);
  }
  if (fs.existsSync(path.join(root, 'search-index.json'))) {
    try {
      const index = JSON.parse(read('search-index.json'));
      const additions = [
        { key: 'epstein-sighting-watch', title: 'Epstein Sighting Watch', subtitle: 'Official status deceased / sighting claims unverified', series: 'Epstein Files', category: 'Tracker', url: 'epstein-sighting-watch.html', description: 'Tracks claims that Epstein is still alive as unverified sightings, lookalikes, fake media, and debunks with evidence levels.', keywords: ['epstein','alive','sighting','lookalike','death hoax','fake media','claim classifier'] },
        { key: 'epstein-sighting-submit', title: 'Submit Epstein Sighting Claim', subtitle: 'Reader source drop', series: 'Epstein Files', category: 'Forum', url: 'epstein-sighting-submit.html', description: 'Submit unverified Epstein sighting, lookalike, AI/fake-media, or debunk links to the signal board.', keywords: ['epstein','sighting','submit','forum','signal board'] }
      ];
      for (const item of additions) if (!index.some(row => row.url === item.url)) index.push(item);
      write('search-index.json', JSON.stringify(index, null, 2));
    } catch {}
  }
}
patchIndexes();
console.log(`Built Epstein Sighting Watch with ${claims.length} claim(s), ${liveMatches.length} live match(es). Command Center patched: ${patchedCommandCenter}.`);
