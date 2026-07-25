const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=process.cwd();
const registryPath=path.join(root,'data','money-intelligence-registry.json');
const seedPath=path.join(root,'scripts','complete-money-top100.js');
const today=new Date().toISOString().slice(0,10);

const normalise=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const slug=value=>normalise(value).replace(/\s+/g,'-').slice(0,100);

function extractObject(source,assignment){
  const start=source.indexOf(assignment);
  if(start<0)throw new Error(`${assignment} not found in seed generator`);
  const open=source.indexOf('{',start);
  if(open<0)throw new Error(`${assignment} object start not found`);
  let depth=0,quote='',escape=false;
  for(let index=open;index<source.length;index+=1){
    const char=source[index];
    if(quote){
      if(escape){escape=false;continue}
      if(char==='\\'){escape=true;continue}
      if(char===quote)quote='';
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue}
    if(char==='{')depth+=1;
    if(char==='}'){
      depth-=1;
      if(depth===0)return source.slice(open,index+1);
    }
  }
  throw new Error(`${assignment} object is unterminated`);
}

function main(){
  if(!fs.existsSync(registryPath)||!fs.existsSync(seedPath))throw new Error('Money registry or Top 100 seed generator is missing');
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  const source=fs.readFileSync(seedPath,'utf8');
  const literal=extractObject(source,'const researchSets =');
  const researchSets=vm.runInNewContext(`(${literal})`,Object.create(null),{timeout:1000});
  if(Array.isArray(researchSets['Top 100 Sovereign Wealth Funds'])&&researchSets['Top 100 Sovereign Wealth Funds'].length===99&&!researchSets['Top 100 Sovereign Wealth Funds'].includes('Nepal Investment Board sovereign vehicles'))researchSets['Top 100 Sovereign Wealth Funds'].push('Nepal Investment Board sovereign vehicles');
  const diagnostics=[];
  for(const category of registry.categories||[]){
    const target=Number(category.target)||100;
    const existing=(registry.records||[]).filter(record=>record.category===category.id);
    const names=Array.isArray(researchSets[category.title])?researchSets[category.title]:[];
    const seen=new Set(existing.map(record=>normalise(record.name)).filter(Boolean));
    const merged=[...existing];
    for(const name of names){
      if(merged.length>=target)break;
      const identity=normalise(name);if(!identity||seen.has(identity))continue;seen.add(identity);
      merged.push({
        id:`${category.id}-${slug(name)}`,
        category:category.id,
        rank:null,
        candidateOrder:null,
        name,
        ticker:'',
        jurisdiction:'',
        value:'Not uniformly disclosed',
        fee:'',
        metric:category.metric||'Public-record research coverage',
        status:'Research lead · measure pending',
        sourceTitle:`${category.title} research universe`,
        sourceUrl:category.sourceUrl||category.primarySourceUrl||'',
        sourceDate:today,
        categorySourceTitle:category.primarySourceTitle||category.rankingStatus||`${category.title} research source`,
        categorySourceUrl:category.sourceUrl||category.primarySourceUrl||'',
        categorySourceDate:today,
        evidenceClass:'Research Lead',
        confidence:'Candidate identity requires entity-level verification',
        established:'The named entity is retained as a candidate for public-record research within this category.',
        notEstablished:'Candidate inclusion does not establish a current global rank, exact value, beneficial ownership, control, coordination or wrongdoing.',
        nextResearch:`Obtain a dated entity-level disclosure for ${category.metric||'the category measure'}, confirm jurisdiction and legal identity, then connect sourced owners, subsidiaries, mandates, contracts and counterparties.`,
        identityVerified:false,
        financialMeasureVerified:false,
        verificationStatus:'research-lead-measure-pending'
      });
    }
    let lead=0;
    for(const record of merged){
      const synthetic=/research index rank/i.test(String(record.value||''))||/research lead|watch list|measure pending/i.test(`${record.status||''} ${record.evidenceClass||''}`);
      if(synthetic&&Number(record.rank)>0){record.candidateOrder=Number(record.candidateOrder)||Number(record.rank);record.rank=null}
      if(!Number(record.rank)){lead+=1;record.candidateOrder=Number(record.candidateOrder)||lead}
    }
    registry.records=[...(registry.records||[]).filter(record=>record.category!==category.id),...merged.slice(0,target)];
    const finalRows=registry.records.filter(record=>record.category===category.id);
    category.coverage=finalRows.length;category.candidates=finalRows.length;
    diagnostics.push({category:category.id,title:category.title,target,seeds:names.length,before:existing.length,after:finalRows.length,added:Math.max(0,finalRows.length-existing.length),complete:finalRows.length===target});
  }
  registry.updated=new Date().toISOString();
  registry.researchCandidateExpansion={generatedAt:registry.updated,boundary:'Candidate completeness is not verification completeness. These names enter the research queue without invented ranks or measurements.',diagnostics};
  fs.writeFileSync(registryPath,`${JSON.stringify(registry,null,2)}\n`);
  const report={ok:diagnostics.every(item=>item.complete),generatedAt:registry.updated,totalCandidates:registry.records.length,categories:diagnostics};
  fs.writeFileSync(path.join(root,'data','money-research-candidate-expansion.json'),`${JSON.stringify(report,null,2)}\n`);
  if(!report.ok)throw new Error(`Top 100 candidate expansion incomplete: ${diagnostics.filter(item=>!item.complete).map(item=>`${item.category}:${item.after}/${item.target}`).join(', ')}`);
  console.log(`Money research candidate expansion PASS: ${registry.records.length} candidates across ${diagnostics.length} complete Top 100 universes.`);
}

try{main()}catch(error){console.error(error.stack||error.message);process.exit(1)}
