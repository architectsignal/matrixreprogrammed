const fs = require('fs');
const path = require('path');

const root = process.cwd();
const accessFile = path.join(root, 'behind-the-curtain-access.html');
const capstoneFile = path.join(root, 'behind-the-curtain-capstone.html');

if (!fs.existsSync(accessFile)) throw new Error('behind-the-curtain-access.html is missing');
if (!fs.existsSync(capstoneFile)) throw new Error('behind-the-curtain-capstone.html is missing');

let html = fs.readFileSync(accessFile, 'utf8');
html = html.replace(/behind-the-curtain-access(?:-v2)?\.js/g, 'behind-the-curtain-access-v2.js');
html = html.replace(
  '<div class="eyebrow">Current Human Access</div><h2>THE NAMES ARE NAMED.</h2><p>These are the living access-holders currently scoring highest for verified office, command, appointments, capital, infrastructure, privileged information and cross-border reach.</p>',
  '<div class="eyebrow">Selected Tier Intelligence</div><h2>SELECT A LEVEL. NAME ITS OPERATORS.</h2><p>Each level owns an independent roster and tier-specific score. The cross-system Top 10 appears only at Level 11.</p>',
);
html = html.replace(
  '<div class="eyebrow">The Coordination Question</div><h2>THE INNER COUNCILS.</h2><p>Actual committees, boards and intelligence relationships are named. Their documented mandates are not inflated into a single supreme council.</p>',
  '<div class="eyebrow">The Coordination and Hidden-Hand Question</div><h2>THE INNER COUNCILS.</h2><p>Actual committees, boards, access brokers and competing hidden-control models are named. Documented power, structural inference and speculative theories remain visibly separate.</p>',
);
html = html.replace(
  'The names, institutions, dynasties, control pathways and competing ideas positioned above the visible system.',
  'The public rulers, permanent operators, capital gatekeepers, infrastructure controllers, intelligence chiefs, policy architects, access brokers, dynasties and competing ideas positioned above the visible system.',
);

const capstone = `<!-- power-family-capstone-gateway:start --><section class="pyr-section" id="capstone-gateway"><div class="container"><div class="symbolic-hall"><div class="pyr-section-head"><div class="eyebrow">The Final Intelligence Chamber</div><h2>THE POWER-FAMILY CAPSTONE.</h2><p>Open the evidence-led layer mapping powerful families, living access-holders, trustees, asset controllers, advisers, board figures, gatekeepers and successors. Formal authority, voting power, capital access, continuity and unresolved claims remain separate.</p></div><div class="pyr-boundary"><strong>FAMILY, WEALTH AND ACCESS ARE NOT PROOF OF WRONGDOING.</strong><p>The chamber records documented mechanisms, constraints, counter-evidence and missing proof. Speculative claims remain labelled and cannot become conclusions merely through repetition.</p></div><div class="pyr-cta"><a class="btn btn-primary" href="behind-the-curtain-capstone.html">OPEN THE POWER-FAMILY LAYER</a></div></div></div></section><!-- power-family-capstone-gateway:end -->`;

const gatewayPattern = /<!-- power-family-capstone-gateway:start -->[\s\S]*?<!-- power-family-capstone-gateway:end -->/g;
const legacyGatewayPattern = /<section class="pyr-section" id="capstone-gateway">[\s\S]*?<\/section>/g;

if (gatewayPattern.test(html)) {
  html = html.replace(gatewayPattern, capstone);
} else if (legacyGatewayPattern.test(html)) {
  html = html.replace(legacyGatewayPattern, capstone);
} else if (html.includes('</main>')) {
  html = html.replace('</main>', `${capstone}</main>`);
} else {
  throw new Error('Behind the Curtain access page lacks a capstone gateway insertion point');
}

html = html.replace(/href="behind-the-curtain-capstone"/g, 'href="behind-the-curtain-capstone.html"');
if (!html.includes('href="#capstone-gateway"')) {
  if (html.includes('<a href="#sources">Sources</a>')) {
    html = html.replace('<a href="#sources">Sources</a>', '<a href="#sources">Sources</a><a href="#capstone-gateway">Power-Family Layer</a>');
  } else {
    throw new Error('Behind the Curtain access navigation lacks the sources anchor');
  }
}
fs.writeFileSync(accessFile, html);

let capstoneHtml = fs.readFileSync(capstoneFile, 'utf8');
capstoneHtml = capstoneHtml
  .replace(/href="behind-the-curtain-access"/g, 'href="behind-the-curtain-access.html"')
  .replace(/href="source-vault(?:\.html)?"/g, 'href="evidence-vault.html"');

// The redesigned Power-Family page originally retained one direct Pyramid return
// and one broader Behind-the-Curtain footer route. Keep both useful routes, but make
// both canonical returns to the evidence-led Pyramid so validators and readers agree.
capstoneHtml = capstoneHtml.replace(
  /<a href="behind-the-curtain\.html">Behind the Curtain<\/a>/g,
  '<a href="behind-the-curtain-access.html">Return to the Pyramid</a>',
);

let pyramidRoutes = (capstoneHtml.match(/href="behind-the-curtain-access\.html"/g) || []).length;
if (pyramidRoutes < 2) {
  const footerClose = '</footer>';
  if (!capstoneHtml.includes(footerClose)) throw new Error('Power-Family Capstone footer is missing');
  capstoneHtml = capstoneHtml.replace(
    footerClose,
    '<p><a href="behind-the-curtain-access.html">Open the full Behind the Curtain Pyramid</a></p></footer>',
  );
  pyramidRoutes = (capstoneHtml.match(/href="behind-the-curtain-access\.html"/g) || []).length;
}
fs.writeFileSync(capstoneFile, capstoneHtml);

const capstoneRoutes = (html.match(/href="behind-the-curtain-capstone\.html"/g) || []).length;
const staleSourceRoutes = (capstoneHtml.match(/href="source-vault(?:\.html)?"/g) || []).length;
const requiredRuntime = html.includes('behind-the-curtain-access-v2.js');
const gatewayCount = (html.match(/id="capstone-gateway"/g) || []).length;

if (capstoneRoutes < 1) throw new Error('Behind the Curtain access page lacks the Power-Family Capstone route');
if (pyramidRoutes < 2) throw new Error('Power-Family Capstone lacks two canonical Pyramid return routes');
if (staleSourceRoutes > 0) throw new Error('Power-Family Capstone retains a stale source-vault route');
if (!requiredRuntime) throw new Error('Behind the Curtain access page lacks the canonical v2 runtime');
if (gatewayCount !== 1) throw new Error(`Behind the Curtain access page contains ${gatewayCount} capstone gateways`);

console.log(
  `Behind the Curtain tier interface and Power-Family gateway patched: ${capstoneRoutes} capstone route(s), ${pyramidRoutes} Pyramid return route(s), one canonical gateway.`,
);
