const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
if(!fs.existsSync(fp('index.html')))process.exit(0);
let html=fs.readFileSync(fp('index.html'),'utf8');
if(!html.includes('review-dashboard.html')){
  if(html.includes('site-brain-router.html">Site Brain Router</a>')){
    html=html.replace('site-brain-router.html">Site Brain Router</a>','site-brain-router.html">Site Brain Router</a><a class="btn alt" href="review-dashboard.html">Review Dashboard</a>');
  }else if(html.includes('<section id="power-deck-home-link"')){
    html=html.replace('<div class="cta-row">','<div class="cta-row"><a class="btn" href="review-dashboard.html">Review Dashboard</a>');
  }else if(html.includes('</main>')){
    html=html.replace('</main>','<section class="section wrap"><div class="eyebrow">Living Intelligence Machine</div><h2>REVIEW DASHBOARD.</h2><p class="lead">Operator view for unresolved source leads, missing records, card health, conclusions, score movement and submissions awaiting review.</p><div class="cta-row"><a class="btn" href="review-dashboard.html">Open Review Dashboard</a><a class="btn alt" href="data/review-dashboard.json">Dashboard Data</a></div></section></main>');
  }else{
    html+='<section class="section wrap"><h2>Review Dashboard</h2><a class="btn" href="review-dashboard.html">Open Review Dashboard</a></section>';
  }
}
fs.writeFileSync(fp('index.html'),html);
console.log('Review dashboard homepage link patched.');
