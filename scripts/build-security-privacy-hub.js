const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'security-privacy-tools.json');
const pagePath = path.join(root, 'security-privacy.html');
const reportPath = path.join(root, 'downloads', 'security-privacy-hub-build.json');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function attr(value) { return esc(value).replace(/\n/g, ' '); }
function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function replaceBlock(text, start, end, block, anchor) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return `${text.slice(0, startIndex)}${block}${text.slice(endIndex + end.length)}`;
  }
  if (anchor && text.includes(anchor)) return text.replace(anchor, `${block}${anchor}`);
  return `${text}\n${block}\n`;
}

const registry = JSON.parse(read(dataPath));
const categories = registry.categories || [];
const systems = registry.systems || [];
const tools = categories.flatMap(category => (category.tools || []).map(tool => ({ ...tool, categoryId: category.id, categoryTitle: category.title })));
const toolIds = new Set(tools.map(tool => tool.id));
const duplicateIds = tools.map(tool => tool.id).filter((id, index, list) => list.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate security tool IDs: ${duplicateIds.join(', ')}`);
for (const system of systems) {
  for (const id of system.toolIds || []) if (!toolIds.has(id)) throw new Error(`System ${system.id} references missing tool ${id}`);
}

const categoryOptions = categories.map(category => `<option value="${attr(category.id)}">${esc(category.title.replace(/^\d+\.\s*/, ''))}</option>`).join('');
const levelValues = [...new Set(tools.map(tool => tool.level).filter(Boolean))].sort();
const levelOptions = levelValues.map(value => `<option value="${attr(value)}">${esc(value)}</option>`).join('');

const systemCards = systems.map(system => `
<article class="card security-system-card">
  <span class="label">Complete protection route</span>
  <h3>${esc(system.title)}</h3>
  <p><strong>Threat model:</strong> ${esc(system.threatModel)}</p>
  <ol>${(system.steps || []).map(step => `<li>${esc(step)}</li>`).join('')}</ol>
  <button class="btn alt" type="button" data-security-system="${attr(system.id)}" data-system-title="${attr(system.title)}" data-tool-ids='${attr(JSON.stringify(system.toolIds || []))}' aria-pressed="false">Highlight this system</button>
</article>`).join('');

const categorySections = categories.map(category => {
  const cards = (category.tools || []).map(tool => {
    const searchText = [tool.name, tool.purpose, tool.why, tool.limits, tool.access, tool.openSource, tool.level, ...(tool.platforms || []), category.title].join(' ');
    return `
<article class="card security-tool-card" id="tool-${attr(tool.id)}" data-security-tool data-tool-id="${attr(tool.id)}" data-category="${attr(category.id)}" data-level="${attr(tool.level)}" data-search="${attr(searchText)}">
  <div class="security-tool-top"><span class="label">${esc(tool.access)}</span><span class="security-level">${esc(tool.level)}</span></div>
  <h3>${esc(tool.name)}</h3>
  <p class="security-purpose">${esc(tool.purpose)}</p>
  <p><strong>Why it belongs:</strong> ${esc(tool.why)}</p>
  <p class="security-limit"><strong>Limits:</strong> ${esc(tool.limits)}</p>
  <div class="security-badges"><span>${esc(tool.openSource)}</span>${(tool.platforms || []).map(platform => `<span>${esc(platform)}</span>`).join('')}</div>
  <a class="btn alt" href="${attr(tool.url)}" target="_blank" rel="noopener noreferrer">Open official source ↗</a>
</article>`;
  }).join('');
  return `
<section class="section wrap security-category" id="category-${attr(category.id)}" data-security-category="${attr(category.id)}">
  <div class="eyebrow">Protection layer</div>
  <h2>${esc(category.title)}</h2>
  <p class="lead">${esc(category.summary)}</p>
  <div class="grid security-tool-grid">${cards}</div>
</section>`;
}).join('');

const quickFacts = [
  ['Privacy', 'Reduces unnecessary collection and exposure. It does not automatically hide identity.'],
  ['Anonymity', 'Requires separation between activity and identity, not merely a different browser or IP address.'],
  ['Encryption', 'Protects content and stored data. It does not hide every sender, recipient, time, device or access pattern.'],
  ['Tor', 'Separates a user IP from destinations when used correctly. Personal logins and endpoint compromise can still identify the user.'],
  ['VPN', 'Moves network trust to another provider. No free VPN is recommended as an anonymity solution.'],
  ['OSINT', 'Uses lawful public records and verification. It does not authorise account access, harassment, impersonation or intrusive testing.']
].map(([title, text]) => `<article class="card"><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join('');

const ruleList = (registry.rules || []).map(rule => `<li>${esc(rule)}</li>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Security, Privacy & OSINT Safety Hub | Matrix Reprogrammed</title>
  <meta name="description" content="A complete free security, privacy, anonymity and lawful OSINT system: Tails, Tor, secure messaging, local PGP, password safety, encryption, metadata removal, breach checks and defensive tools." />
  <meta property="og:title" content="Security, Privacy & OSINT Safety Hub" />
  <meta property="og:description" content="Threat models, complete protection systems and vetted free tools for anonymity, secure communication, defensive monitoring and lawful OSINT." />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="fixes.css" />
  <style>
    .security-warning{border-left:4px solid #d8b56a;background:rgba(216,181,106,.08);padding:1rem 1.15rem;border-radius:10px}.security-danger{border-left-color:#b71919;background:rgba(183,25,25,.1)}
    .security-controls{position:sticky;top:.5rem;z-index:8;display:grid;grid-template-columns:minmax(220px,1.6fr) repeat(2,minmax(150px,.7fr)) auto auto;gap:.65rem;align-items:center;padding:1rem;border:1px solid rgba(216,181,106,.28);border-radius:14px;background:rgba(5,5,5,.96);backdrop-filter:blur(8px)}
    .security-controls input,.security-controls select{width:100%;box-sizing:border-box;padding:.78rem;border:1px solid rgba(216,181,106,.34);border-radius:9px;background:#090806;color:#f3e6bd}.security-result{font-size:.82rem;color:#d8b56a}
    .security-systems{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.security-system-card ol{padding-left:1.2rem}.security-system-card li{margin:.45rem 0}.security-system-card button[aria-pressed="true"]{box-shadow:0 0 0 2px #d8b56a}
    .security-tool-grid{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.security-tool-card{display:flex;flex-direction:column;gap:.35rem;transition:border-color .2s,transform .2s,box-shadow .2s}.security-tool-card .btn{margin-top:auto;align-self:flex-start}.security-tool-card.system-recommended{border-color:#d8b56a;box-shadow:0 0 0 2px rgba(216,181,106,.22),0 0 28px rgba(216,181,106,.13);transform:translateY(-2px)}
    .security-tool-top{display:flex;justify-content:space-between;gap:.7rem;align-items:center}.security-level{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#c8b98c}.security-purpose{font-size:1.04rem}.security-limit{padding:.75rem;border-left:3px solid rgba(183,25,25,.7);background:rgba(183,25,25,.08)}
    .security-badges{display:flex;flex-wrap:wrap;gap:.35rem;margin:.3rem 0 .8rem}.security-badges span{font-size:.7rem;border:1px solid rgba(216,181,106,.25);border-radius:999px;padding:.22rem .5rem;color:#c8b98c}.security-category[hidden],.security-tool-card[hidden]{display:none!important}
    .security-protocol{counter-reset:protocol}.security-protocol article{position:relative;padding-left:4rem}.security-protocol article:before{counter-increment:protocol;content:counter(protocol);position:absolute;left:1rem;top:1rem;width:2rem;height:2rem;border:1px solid #d8b56a;border-radius:50%;display:grid;place-items:center;color:#d8b56a;font-weight:800}
    .security-source-note{font-size:.82rem;color:#c8b98c}.security-jump{display:flex;flex-wrap:wrap;gap:.45rem}.security-jump a{border:1px solid rgba(216,181,106,.25);border-radius:999px;padding:.35rem .65rem;text-decoration:none}
    @media(max-width:900px){.security-controls{position:static;grid-template-columns:1fr}.security-tool-grid,.security-systems{grid-template-columns:1fr}}
    @media print{canvas,.signal-face,.veil,.topbar,.security-controls,.btn{display:none!important}.page{background:#fff;color:#000}.card{break-inside:avoid;border-color:#999;background:#fff;color:#000}.security-limit,.security-warning{background:#fff;color:#000}}
  </style>
</head>
<body>
  <canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div>
  <div class="page">
    <header class="wrap topbar">
      <a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a>
      <nav class="nav"><a href="security-privacy.html" aria-current="page">Security Hub</a><a href="research-tools.html">Research Tools</a><a href="evidence-archive.html">Evidence Archive</a><a href="search.html">Search</a></nav>
    </header>
    <main>
      <section class="hero wrap">
        <div class="eyebrow">Free defensive system · privacy · anonymity · lawful OSINT</div>
        <h1>SECURITY, PRIVACY & OSINT SAFETY.</h1>
        <p class="lead">A complete protection map for choosing the right operating system, browser, messenger, email workflow, password system, encryption, metadata cleaner, breach check, defensive monitor and public-record research tool.</p>
        <p class="security-warning"><strong>Core boundary:</strong> ${esc(registry.coreBoundary)}</p>
        <div class="cta-row"><a class="btn" href="#complete-systems">Choose a Complete System</a><a class="btn alt" href="#tool-registry">Browse All Tools</a><button class="btn alt" id="security-print" type="button">Print / Save Guide</button></div>
      </section>

      <section class="section wrap">
        <div class="eyebrow">Understand the layers</div><h2>PRIVACY IS NOT ONE SWITCH.</h2>
        <div class="grid">${quickFacts}</div>
      </section>

      <section class="section wrap security-warning security-danger">
        <h2>DO NOT USE ONLINE PGP KEY GENERATORS.</h2>
        <p>A website that creates a private key can copy it before giving it to you. Generate PGP keys locally with GnuPG or Kleopatra, create a revocation certificate, protect the private key with a strong passphrase, keep an offline backup and verify fingerprints through a second trusted channel. For most conversations, use a modern end-to-end encrypted messenger instead.</p>
      </section>

      <section class="section wrap" id="complete-systems">
        <div class="eyebrow">Build by threat model</div><h2>COMPLETE PROTECTION SYSTEMS.</h2>
        <p class="lead">Choose the closest threat model. The page will highlight the components that belong together. Do not install every tool or combine anonymity systems without understanding the result.</p>
        <p id="security-system-status" class="security-source-note">No system is selected.</p>
        <div class="grid security-systems">${systemCards}</div>
      </section>

      <section class="section wrap">
        <div class="eyebrow">Non-negotiable operating rules</div><h2>THE HUMAN LAYER.</h2>
        <ol>${ruleList}</ol>
      </section>

      <section class="section wrap" id="tool-registry">
        <div class="eyebrow">Curated registry · official links only</div><h2>VETTED FREE TOOL DIRECTORY.</h2>
        <p class="lead">The directory prioritises maintained open-source projects, nonprofit safety resources and a small number of widely used free public checks. Every entry states what it does and what it cannot establish.</p>
        <div class="security-controls" role="search">
          <input id="security-tool-search" type="search" placeholder="Search Tor, PGP, email, firewall, OSINT…" aria-label="Search security tools" />
          <select id="security-category-filter" aria-label="Filter by category"><option value="all">All categories</option>${categoryOptions}</select>
          <select id="security-level-filter" aria-label="Filter by skill level"><option value="all">All skill levels</option>${levelOptions}</select>
          <button class="btn alt" id="security-clear-filters" type="button">Clear</button>
          <span id="security-result-count" class="security-result">${tools.length} vetted tools shown</span>
        </div>
        <div class="security-jump" style="margin-top:1rem">${categories.map(category => `<a href="#category-${attr(category.id)}">${esc(category.title.replace(/^\d+\.\s*/, ''))}</a>`).join('')}</div>
      </section>

      ${categorySections}

      <section class="section wrap">
        <div class="eyebrow">Research discipline</div><h2>OSINT COMPARTMENTATION PROTOCOL.</h2>
        <div class="grid security-protocol">
          <article class="card"><h3>Define lawful purpose</h3><p>Write the public-interest question, permitted scope, retention period and publication boundary before collecting personal data.</p></article>
          <article class="card"><h3>Separate identities</h3><p>Use a dedicated operating-system account, browser profile or virtual machine. Never mix personal logins with a research identity that must remain separate.</p></article>
          <article class="card"><h3>Reduce active contact</h3><p>Prefer primary records and passive public sources. Do not probe accounts, send reset requests, test credentials or interact with a subject without authority.</p></article>
          <article class="card"><h3>Quarantine files</h3><p>Hash originals, preserve provenance, open copies through Dangerzone or an isolated environment and inspect metadata before publication.</p></article>
          <article class="card"><h3>Separate fact from inference</h3><p>A matching username, address, company officer or sanctions-name result is a lead. Verify identity, date, jurisdiction and source context.</p></article>
          <article class="card"><h3>Correct and minimise</h3><p>Publish only what is necessary, redact vulnerable third parties, state limitations and provide a route for sourced corrections.</p></article>
        </div>
      </section>

      <section class="section wrap security-warning">
        <h2>WHEN A PERSON IS UNDER ACTIVE THREAT.</h2>
        <p>Do not improvise a complicated anonymity stack during an emergency. Preserve essential evidence, move to a known-safe device if possible, stop unnecessary account activity and contact a qualified digital-security responder such as the Access Now Digital Security Helpline. Immediate physical danger requires local emergency and trusted-person support as well as digital measures.</p>
        <div class="cta-row"><a class="btn" href="https://www.accessnow.org/help/" target="_blank" rel="noopener noreferrer">Access Now Helpline ↗</a><a class="btn alt" href="https://digitalfirstaid.org/" target="_blank" rel="noopener noreferrer">Digital First Aid ↗</a><a class="btn alt" href="https://ssd.eff.org/" target="_blank" rel="noopener noreferrer">EFF SSD ↗</a></div>
      </section>

      <section class="section wrap">
        <p class="security-source-note"><strong>Selection policy:</strong> entries must provide meaningful free access, have a defensible public reputation, solve a distinct protection problem and link to an official project or authoritative service. Inclusion is not a guarantee, endorsement of every feature or substitute for current security advisories. Registry version ${esc(registry.version)}, reviewed ${esc(registry.updated)}.</p>
      </section>
    </main>
    <footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — secure the device, separate the identity, verify the source.</p><p class="warning">Defensive tools and public-record research only. No unauthorised access, credential attacks, exploitation, stalking or harassment.</p></footer>
  </div>
  <script src="matrix.js"></script>
  <script src="security-privacy.js"></script>
</body>
</html>`;

write(pagePath, html);

const homeBlock = `<!-- security-privacy-home:start --><section id="security-privacy-home" class="section wrap"><div class="eyebrow">Free Public Safety Resource</div><h2>SECURITY, PRIVACY & OSINT SAFETY.</h2><p class="lead">Build a complete protection system with threat-model guidance and official links for Tails, Tor, secure messaging, local PGP, email aliases, password managers, encryption, metadata removal, breach checks, defensive monitoring and lawful OSINT.</p><p><strong>Boundary:</strong> privacy tools reduce specific risks. They do not create invisibility, authorise access to other people's systems or replace disciplined identity separation.</p><div class="cta-row"><a class="btn" href="security-privacy.html">Open Security & Anonymity Hub</a><a class="btn alt" href="research-tools.html">Research Tools</a><a class="btn alt" href="evidence-archive.html">Evidence Archive</a></div></section><!-- security-privacy-home:end -->`;

const indexPath = path.join(root, 'index.html');
let index = read(indexPath);
index = replaceBlock(index, '<!-- security-privacy-home:start -->', '<!-- security-privacy-home:end -->', homeBlock, '<!-- osint-tools-home:start -->');
if (!index.includes('href="security-privacy.html">Security & Privacy</a>')) {
  index = index.replace('<div class="nav-group"><strong>Freedom Ecosystem</strong>', '<div class="nav-group"><strong>Freedom Ecosystem</strong><a href="security-privacy.html">Security & Privacy</a>');
}
write(indexPath, index);

const researchPath = path.join(root, 'research-tools.html');
if (fs.existsSync(researchPath)) {
  let research = read(researchPath);
  const researchBlock = `<!-- security-privacy-research:start --><section class="section wrap" id="security-privacy-research"><div class="eyebrow">Researcher Protection</div><h2>SECURITY, PRIVACY & OSINT SAFETY HUB.</h2><p class="lead">Before running public-record research, separate identities, harden the device, quarantine documents and understand what anonymity tools can and cannot protect.</p><div class="cta-row"><a class="btn" href="security-privacy.html">Open Protection System</a><a class="btn alt" href="evidence-archive.html">Evidence Archive</a></div></section><!-- security-privacy-research:end -->`;
  research = replaceBlock(research, '<!-- security-privacy-research:start -->', '<!-- security-privacy-research:end -->', researchBlock, '</main>');
  write(researchPath, research);
}

const sitemapPath = path.join(root, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = read(sitemapPath);
  if (!sitemap.includes('/security-privacy.html')) {
    const entry = '<url><loc>https://matrixreprogrammed.com/security-privacy.html</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>';
    sitemap = sitemap.includes('</urlset>') ? sitemap.replace('</urlset>', `${entry}</urlset>`) : `${sitemap}\n${entry}`;
    write(sitemapPath, sitemap);
  }
}

const llmsPath = path.join(root, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = read(llmsPath);
  if (!llms.includes('security-privacy.html')) {
    llms += `\n- [Security, Privacy & OSINT Safety Hub](https://matrixreprogrammed.com/security-privacy.html): Threat models and vetted free tools for anonymity, secure communication, defensive monitoring, evidence handling and lawful OSINT.\n`;
    write(llmsPath, llms);
  }
}

write(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  categories: categories.length,
  systems: systems.length,
  tools: tools.length,
  openSourceOrPublicResources: tools.filter(tool => /open|public|nonprofit|community/i.test(`${tool.openSource} ${tool.access}`)).length,
  homepageLinked: read(indexPath).includes('security-privacy.html'),
  researchToolsLinked: !fs.existsSync(researchPath) || read(researchPath).includes('security-privacy.html'),
  boundary: registry.coreBoundary
}, null, 2));

console.log(`Security, privacy and OSINT safety hub built: ${categories.length} categories, ${systems.length} complete systems and ${tools.length} vetted tools.`);
