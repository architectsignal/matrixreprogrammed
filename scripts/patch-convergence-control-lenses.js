const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const updated=new Date().toISOString();
const daily=js('data/daily-power-conclusions.json',{conclusions:[]});
const lenses=[
 {id:'one-world-governance',title:'One-world governance convergence',route:'power-structure-map.html',plain:'Track whether national decision-making is being pulled upward into global policy bodies, treaty systems, standards bodies, public-private forums and emergency frameworks.',records:['UN / WHO / IMF / BIS / G20 policy documents','treaty texts and implementation laws','public-private partnership records','national law adopting global standards','meeting attendance and funding records'],boundary:'This does not prove a single hidden world government. It tracks documented convergence of policy authority and institutional coordination.'},
 {id:'one-world-currency',title:'One-world currency / digital-money rail',route:'deep-intel-feed.html',plain:'Track CBDC pilots, BIS settlement projects, digital ID, payment rails, stablecoin regulation, programmable payments and central-bank coordination.',records:['central-bank papers','BIS project pages','IMF digital-money reports','CBDC pilot records','payment regulation and digital-ID laws'],boundary:'This does not prove one single currency is already here. It tracks the infrastructure that could make money more centralized, programmable and surveillable.'},
 {id:'one-world-religion',title:'One-world religion / interfaith convergence',route:'secret-societies-tracker.html',plain:'Track interfaith diplomacy, religious soft-power forums, Vatican/UN routes, global ethics language, education programmes and institutional spiritual framing.',records:['official interfaith declarations','Vatican and UN records','registered NGO and foundation records','conference attendance lists','education and curriculum records'],boundary:'This does not prove a single world religion. It tracks public institutional convergence around religion, ethics, diplomacy and social doctrine.'},
 {id:'elite-control-infrastructure',title:'Elite-control infrastructure',route:'evidence-graph.html',plain:'Track how asset managers, central banks, contractors, think tanks, governments, tech platforms, media systems, foundations and elite networks connect through records.',records:['SEC filings and proxy votes','government contracts','lobbying and donation records','board overlaps','court and enforcement records','public mandates and procurement records'],boundary:'Association is not guilt. A control route strengthens only when records show money, office, contract, mandate, voting power or policy influence.'}
];
const data={ok:true,updated,title:'Convergence Control Lenses',boundary:'These are analytical lenses for tracking public-record convergence. They are not treated as proof of a hidden plan unless records support a specific claim.',lenses};
wr('data/convergence-control-lenses.json',JSON.stringify(data,null,2));
wr('downloads/convergence-control-lenses.md','# Convergence Control Lenses\n\nGenerated: '+updated+'\n\nBoundary: '+data.boundary+'\n\n'+lenses.map(x=>'## '+x.title+'\n'+x.plain+'\n\nRecords to pull:\n'+x.records.map(r=>'- '+r).join('\n')+'\n\nBoundary: '+x.boundary).join('\n\n'));
if(Array.isArray(daily.conclusions)){
 const keep=daily.conclusions.filter(x=>!/^one-world|^elite-control/i.test(x.title||''));
 const add=lenses.map(x=>({title:x.title,text:x.plain+' Evidence route: '+x.records[0]+'. Boundary: '+x.boundary,route:x.route}));
 daily.conclusions=[...keep,...add];daily.updated=updated;daily.convergenceLenses=true;wr('data/daily-power-conclusions.json',JSON.stringify(daily,null,2));
}
function card(x){return `<article class="intel-card"><h3>${esc(x.title)}</h3><p>${esc(x.plain)}</p><h4>Records needed</h4><ul>${x.records.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><p><strong>Boundary:</strong> ${esc(x.boundary)}</p><a href="${esc(x.route)}">Open route</a></article>`}
if(ex('daily-power-conclusions.html')){
 let html=rd('daily-power-conclusions.html');
 html=html.replace(/<section id="convergence-control-lenses"[\s\S]*?<\/section>/,'');
 const block=`<section id="convergence-control-lenses" class="section wrap"><div class="eyebrow">Deep Convergence Lens</div><h2>Governance, Religion, Currency and Elite-Control Routes</h2><p class="lead">This section turns the daily report toward the deepest mission question: whether public records show convergence toward global governance, centralized money rails, interfaith/institutional religion routes, and elite-control infrastructure.</p><div class="intel-grid">${lenses.map(card).join('')}</div><div class="cta-row"><a class="btn" href="data/convergence-control-lenses.json">Lens Data</a><a class="btn alt" href="power-structure-map.html">Power Map</a><a class="btn alt" href="deep-intel-feed.html">Deep Intel Feed</a><a class="btn alt" href="daily-missing-records.html">Missing Records</a></div></section>`;
 html=html.includes('</main>')?html.replace('</main>',block+'</main>'):html+block;
 wr('daily-power-conclusions.html',html);
}
console.log('Convergence control lenses patched.');
