const fs=require('fs');const path=require('path');const root=process.cwd();const file=p=>path.join(root,p);
const registry=JSON.parse(fs.readFileSync(file('data/money-intelligence-registry.json'),'utf8'));
const today=new Date().toISOString().slice(0,10);
const slug=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
const disclosedTrusts=[
  ['Wellcome Trust','https://wellcome.org/about-us/governance'],
  ['Pew Charitable Trusts','https://www.pewtrusts.org/en/about'],
  ['Garfield Weston Foundation','https://garfieldweston.org/about-us/'],
  ['Esmée Fairbairn Foundation','https://esmeefairbairn.org.uk/about-us/'],
  ['Leverhulme Trust','https://www.leverhulme.ac.uk/about-us'],
  ['Nuffield Foundation','https://www.nuffieldfoundation.org/about'],
  ['Joseph Rowntree Charitable Trust','https://www.jrct.org.uk/about-us'],
  ['Joseph Rowntree Foundation','https://www.jrf.org.uk/about-us'],
  ['Sainsbury Family Charitable Funds','https://www.sfct.org.uk/'],
  ['Wolfson Foundation','https://www.wolfson.org.uk/about/'],
  ['Calouste Gulbenkian Foundation','https://gulbenkian.pt/uk-branch/about-us/'],
  ['Rhodes Trust','https://www.rhodeshouse.ox.ac.uk/about/rhodes-trust/'],
  ['National Trust','https://www.nationaltrust.org.uk/who-we-are'],
  ['John Lewis Partnership Trust Structure','https://www.johnlewispartnership.co.uk/about-us/our-constitution.html'],
  ['Royal Collection Trust','https://www.rct.uk/about'],
  ['Prince of Wales Charitable Fund','https://www.pwcf.org.uk/'],
  ['Rockefeller Brothers Fund','https://www.rbf.org/about'],
  ['Rockefeller Family Fund','https://www.rffund.org/about'],
  ['J. Paul Getty Trust','https://www.getty.edu/about/'],
  ['Leona M. and Harry B. Helmsley Charitable Trust','https://helmsleytrust.org/about/'],
  ['Fidelity Charitable','https://www.fidelitycharitable.org/about-us.html'],
  ['Schwab Charitable','https://www.schwabcharitable.org/about'],
  ['National Philanthropic Trust','https://www.nptrust.org/about-us/'],
  ['Charities Aid Foundation','https://www.cafonline.org/about-us'],
  ['Silicon Valley Community Foundation','https://www.siliconvalleycf.org/about'],
  ['The Crown Estate','https://www.thecrownestate.co.uk/about-us'],
  ['Duchy of Lancaster','https://www.duchyoflancaster.co.uk/about-the-duchy/'],
  ['Duchy of Cornwall','https://duchyofcornwall.org/about-the-duchy.html'],
  ['Royal Collection Trust of Belgium','https://www.kbs-frb.be/en'],
  ['Community Foundation Network UK','https://www.ukcommunityfoundations.org/about-us']
];
function trustRecord([name,sourceUrl]){return{
  id:`trusts-${slug(name)}`,category:'trusts',rank:null,sourceRank:null,name,ticker:'',jurisdiction:'',region:'',value:'Not uniformly disclosed',valueNumeric:null,fee:'',
  metric:'Publicly disclosed trust or charitable structure',status:'Publicly disclosed trust-structure research record',entityType:'Trust or Trust-Like Structure',subtype:'Disclosed trust / charitable trust structure',capitalRole:'Trustee-governed asset owner / grantmaker / steward',
  sourceTitle:'Official entity governance or about page',sourceUrl,sourceDate:today,evidenceClass:'Official Institutional Disclosure',confidence:'Identity and legal or governance structure publicly disclosed; values require entity-level verification',dataQuality:'Official identity and governance route',
  established:`The official source identifies ${name} as a trust, charitable trust, trust-governed institution or comparable publicly disclosed stewardship structure.`,
  notEstablished:'The public identity does not establish all beneficiaries, underlying assets, beneficial ownership, private arrangements, influence, coordination, misconduct or wrongdoing.',
  nextResearch:'Open governing documents, charity or company registers, trustees, annual reports, accounts, investment managers, grants, subsidiaries and related-party disclosures.'
};}
const endowments=(registry.records||[]).filter(r=>r.category==='trusts').map(r=>({...r,rank:null,sourceRank:r.sourceRank||r.rank||null,entityType:'Endowment',subtype:'Institutional endowment',capitalRole:'Long-term endowed asset owner / allocator',status:'Source-ranked endowment within composite trust-and-endowment coverage',established:`The cited endowment ranking identifies ${r.name}${r.sourceRank||r.rank?` at source rank ${r.sourceRank||r.rank}`:''}. It is included as an endowment, not represented as a private trust.`,notEstablished:'Endowment status does not make the institution a private trust and does not establish beneficial ownership, control, coordination, misconduct or wrongdoing.'}));
const seen=new Set(),rows=[];
for(const r of [...disclosedTrusts.map(trustRecord),...endowments]){const key=slug(r.name);if(!key||seen.has(key))continue;seen.add(key);rows.push(r);if(rows.length>=100)break;}
registry.records=(registry.records||[]).filter(r=>r.category!=='trusts').concat(rows);
const category=(registry.categories||[]).find(c=>c.id==='trusts');
if(category)Object.assign(category,{title:'Top 100 Publicly Disclosed Trust & Endowment Structures',coverage:rows.length,ranked:0,sourceRanked:rows.filter(r=>Number(r.sourceRank)>0).length,metric:'Publicly disclosed trust structure / endowment assets',rankingStatus:'Composite public trust and source-ranked endowment coverage',sourceUrl:'https://dev.swfinstitute.org/fund-rankings/endowment',description:'Thirty publicly disclosed trust or trust-like structures plus source-ranked institutional endowments. Source ranks remain visible as source metadata but are not presented as a single global trust ranking.',lastChecked:today,adapter:'trust-and-endowment-composite'});
fs.writeFileSync(file('data/money-intelligence-registry.json'),`${JSON.stringify(registry,null,2)}\n`);
console.log(`Refined trust coverage: ${rows.filter(r=>r.entityType.startsWith('Trust')).length} trust structures and ${rows.filter(r=>r.entityType==='Endowment').length} endowments.`);
