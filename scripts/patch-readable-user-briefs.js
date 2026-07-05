const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ar=x=>Array.isArray(x)?x.filter(Boolean):(x?[x]:[]);
const updated=new Date().toISOString();
const conclusions=js('data/daily-power-conclusions.json',{conclusions:[]});
const feed=js('data/deep-intel-feed-matrix.json',{lanes:[],items:[]});
const graph=js('data/evidence-weighted-relationship-graph.json',{nodes:[],edges:[]});
const readable={ok:true,updated,title:'Readable User Briefs',summary:'Plain-English brief layer for readers who want the machine output translated into what matters, why it matters, what proves it and what to open next.',sections:[{title:'What matters today',body:'Start with the strongest route, the highest clock, the top capital lane and the most important missing record. These are the quickest paths to understanding the structure.'},{title:'Why it matters',body:'The site is not only tracking names. It is tracking how money, policy, contracts, ownership, votes, institutions and records connect.'},{title:'What proves it',body:'A claim becomes stronger when it has filings, official records, contracts, court records, proxy-voting records, public mandates or dated primary sources.'},{title:'What to open first',body:'Open Daily Power Conclusions, then Evidence Graph, then the entity or company page, then Missing Records if the claim still needs proof.'}],topRoutes:ar(conclusions.conclusions).map(x=>({title:x.title,text:x.text,route:x.route})).slice(0,10),topFeed:ar(feed.lanes).slice(0,10),topNodes:ar(graph.nodes).slice(0,10).map(n=>({name:n.name,score:n.score,route:n.route,type:n.type}))};
wr('data/readable-user-briefs.json',JSON.stringify(readable,null,2));
wr('downloads/readable-user-briefs.md','# Readable User Briefs\n\nGenerated: '+updated+'\n\n'+readable.sections.map(s=>'## '+s.title+'\n'+s.body).join('\n\n')+'\n\n## Top Routes\n'+readable.topRoutes.map(x=>'- '+x.title+': '+x.text+' ('+x.route+')').join('\n'));
function card(title,body,route){return `<article class="intel-card"><h3>${esc(title)}</h3><p>${esc(body)}</p>${route?`<a href="${esc(route)}">Open route</a>`:''}</article>`}
if(ex('daily-power-conclusions.html')){
 let html=rd('daily-power-conclusions.html');
 html=html.replace(/<section id="reader-plain-english-brief"[\s\S]*?<\/section>/,'');
 const sections=readable.sections.map(s=>card(s.title,s.body,'')).join('');
 const routes=readable.topRoutes.map(x=>card(x.title,x.text,x.route)).join('');
 const feeds=readable.topFeed.map(x=>card(x.title,x.summary,x.route)).join('');
 const block=`<section id="reader-plain-english-brief" class="section wrap"><div class="eyebrow">Reader Translation</div><h2>Plain-English Brief</h2><p class="lead">This section explains what the machine output means, what evidence would prove it, and what the reader should open next.</p><div class="intel-grid">${sections}</div><h2>Best routes to open first</h2><div class="intel-grid">${routes}</div><h2>Deep feed lanes behind the brief</h2><div class="intel-grid">${feeds}</div><div class="cta-row"><a class="btn" href="data/readable-user-briefs.json">Readable Brief Data</a><a class="btn alt" href="deep-intel-feed.html">Deep Intel Feed</a><a class="btn alt" href="daily-missing-records.html">Missing Records</a></div></section>`;
 html=html.includes('</main>')?html.replace('</main>',block+'</main>'):html+block;
 wr('daily-power-conclusions.html',html);
}
console.log('Readable user briefs patched.');
