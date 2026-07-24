const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=path.join(root,'behind-the-curtain-access.html');
let html=fs.readFileSync(file,'utf8');
html=html.replace(/behind-the-curtain-access(?:-v2)?\.js/g,'behind-the-curtain-access-v2.js');
html=html.replace('<div class="eyebrow">Current Human Access</div><h2>THE NAMES ARE NAMED.</h2><p>These are the living access-holders currently scoring highest for verified office, command, appointments, capital, infrastructure, privileged information and cross-border reach.</p>','<div class="eyebrow">Selected Tier Intelligence</div><h2>SELECT A LEVEL. NAME ITS OPERATORS.</h2><p>Each level now owns an independent roster and tier-specific score. The cross-system Top 10 appears only at Level 11.</p>');
html=html.replace('<div class="eyebrow">The Coordination Question</div><h2>THE INNER COUNCILS.</h2><p>Actual committees, boards and intelligence relationships are named. Their documented mandates are not inflated into a single supreme council.</p>','<div class="eyebrow">The Coordination and Hidden-Hand Question</div><h2>THE INNER COUNCILS.</h2><p>Actual committees, boards, access brokers and competing hidden-control models are named. Documented power, structural inference and speculative theories remain visibly separate.</p>');
html=html.replace('The names, institutions, dynasties, control pathways and competing ideas positioned above the visible system.','The public rulers, permanent operators, capital gatekeepers, infrastructure controllers, intelligence chiefs, policy architects, access brokers, dynasties and competing ideas positioned above the visible system.');
const capstone=`<section class="pyr-section" id="capstone-gateway"><div class="container"><div class="symbolic-hall"><div class="pyr-section-head"><div class="eyebrow">The Final Chamber</div><h2>THE CAPSTONE.</h2><p>The Black Nobility claim, Orsini and the Roman houses, Baal, Moloch, Saturn and the Lightbringer are examined in a separate cinematic chamber where documented history, structural inference and speculation cannot be confused.</p></div><div class="pyr-boundary"><strong>SPECULATION IS INCLUDED — AND MARKED.</strong><p>Historical continuity is documented. A unified aristocratic or occult command system is not established. The capstone shows the claim, the counter-evidence and the proof that would be required.</p></div><div class="pyr-cta"><a class="btn btn-primary" href="behind-the-curtain-capstone.html">ENTER THE CAPSTONE</a></div></div></div></section>`;
if(!html.includes('id="capstone-gateway"'))html=html.replace('</main>',`${capstone}</main>`);
html=html.replace(/href="behind-the-curtain-capstone"/g,'href="behind-the-curtain-capstone.html"');
if(!html.includes('href="#capstone-gateway"'))html=html.replace('<a href="#sources">Sources</a>','<a href="#sources">Sources</a><a href="#capstone-gateway">Capstone</a>');
fs.writeFileSync(file,html);

const capstoneFile=path.join(root,'behind-the-curtain-capstone.html');
if(fs.existsSync(capstoneFile)){
  let capstoneHtml=fs.readFileSync(capstoneFile,'utf8');
  capstoneHtml=capstoneHtml
    .replace(/href="behind-the-curtain-access"/g,'href="behind-the-curtain-access.html"')
    .replace(/href="source-vault"/g,'href="source-vault.html"');
  fs.writeFileSync(capstoneFile,capstoneHtml);
}
console.log('Behind the Curtain tier-specific interface, capstone gateway and canonical routes patched.');
