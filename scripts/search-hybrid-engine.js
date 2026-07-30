(function(root,factory){
  const quality=typeof module==='object'&&module.exports?require('./search-quality-engine.js'):root.MatrixSearchQuality;
  const semantic=typeof module==='object'&&module.exports?require('./search-semantic-vector.js'):root.MatrixSemanticVector;
  const api=factory(quality,semantic);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MatrixHybridSearch=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(quality,semantic){
  'use strict';
  const VERSION='matrix-hybrid-search-v1';
  function text(item){const keys=Array.isArray(item?.keywords)?item.keywords.join(' '):String(item?.keywords||'');return [item?.title,item?.entity,item?.category,item?.layer,item?.description,keys,item?.sourceType,item?.publisher,item?.jurisdiction].filter(Boolean).join(' ');}
  function incompatible(queryDomain,itemDomain){const blocked=quality.DOMAINS?.[queryDomain]?.incompatible||[];return blocked.some(id=>itemDomain.primary===id||itemDomain.matched.includes(id));}
  function exactBoost(item,interpretation){
    const hay=semantic.clean(text(item));const title=semantic.clean(item?.title);const entity=semantic.clean(item?.entity);const phrase=semantic.clean(interpretation.corrected);
    let score=0;const reasons=[];
    if(phrase.length>4&&hay.includes(phrase)){score+=12;reasons.push('exact phrase');}
    const terms=interpretation.meaningful||[];let exactTerms=0;
    for(const term of terms){if((` ${title} `).includes(` ${term} `)||(` ${entity} `).includes(` ${term} `))exactTerms++;}
    if(exactTerms){score+=Math.min(8,exactTerms*2.4);reasons.push(`exact title/entity ${exactTerms}`);}
    return {score,reasons};
  }
  function confidence(top,second,interpretation){
    if(!top)return 0;const margin=Math.max(0,top._hybridScore-(second?second._hybridScore:0));
    let value=0.16+Math.min(0.36,top._hybridScore/42)+Math.min(0.22,top._semantic*0.28)+Math.min(0.16,top._coverage*0.25)+Math.min(0.12,margin/18);
    if(interpretation.domain!=='general'&&top._itemDomain!==interpretation.domain)value-=0.08;
    return Math.max(0,Math.min(0.99,value));
  }
  function search(index,query,options={}){
    const interpretation=quality.interpretQuery(query);const concepts=semantic.conceptHits(query+' '+interpretation.corrected);if(concepts.some(c=>['electricity','energy_bill','price_increase','tariff','standing_charge','supplier','regulator','wholesale'].includes(c))){interpretation.domain='household-energy';interpretation.domainLabel='Household energy';interpretation.consequence='household-energy-price-increase';interpretation.missingContext=['country','supplier','billing period','tariff type'];}else if(concepts.some(c=>['company_filing','contract','ownership','money'].includes(c))){interpretation.domain='money-contracts';interpretation.domainLabel='Money and contracts';}else if(concepts.includes('court')){interpretation.domain='courts-enforcement';interpretation.domainLabel='Courts and enforcement';}else if(concepts.some(c=>['legislation','parliament','government'].includes(c))){interpretation.domain='government-policy';interpretation.domainLabel='Government and policy';}const items=Array.isArray(index)?index.filter(item=>item&&item.url):[];
    const lexicalQuery=[interpretation.corrected,(interpretation.expansions||[]).join(' '),concepts.join(' ')].filter(Boolean).join(' ');
    const relaxed=quality.search(items,lexicalQuery,{limit:items.length||1,minScore:-999,minConfidence:0,minCoverage:0});
    const lexicalMap=new Map((relaxed.results||[]).map(item=>[String(item.url),item]));
    const semanticMap=semantic.buildIndexMap(options.semanticIndex);const semanticAvailable=semanticMap.size>0;
    const queryVector=semantic.embed([interpretation.corrected,interpretation.domainLabel,interpretation.consequence,(interpretation.expansions||[]).join(' ')].join(' '));
    const ranked=[];
    for(const item of items){
      const itemDomain=quality.classifyText(text(item));if(incompatible(interpretation.domain,itemDomain))continue;
      const lexical=lexicalMap.get(String(item.url));const encoded=semanticMap.get(String(item.url));
      const sem=encoded?semantic.similarity(queryVector,encoded):semantic.cosine(queryVector,semantic.embed(semantic.documentText(item)));
      const exact=exactBoost(item,interpretation);const domain=itemDomain.primary===interpretation.domain?5:itemDomain.matched.includes(interpretation.domain)?2:interpretation.domain==='general'?0:-1;
      const lexicalScore=Number(lexical?._score||0);const coverage=Number(lexical?._coverage||0);const semanticScore=Math.max(0,sem-0.04)*13;
      const hybridScore=lexicalScore+semanticScore+exact.score+domain;
      const reasons=[...(lexical?._reasons||[]),...exact.reasons];if(sem>=0.12)reasons.push(`semantic similarity ${Math.round(sem*100)}%`);
      ranked.push({...item,_score:hybridScore,_hybridScore:hybridScore,_lexicalScore:lexicalScore,_semantic:sem,_coverage:coverage,_itemDomain:itemDomain.primary,_reasons:[...new Set(reasons)]});
    }
    ranked.sort((a,b)=>b._hybridScore-a._hybridScore||b._semantic-a._semantic||b._coverage-a._coverage||String(a.title||'').localeCompare(String(b.title||'')));
    const top=ranked[0],second=ranked[1];const conf=confidence(top,second,interpretation);
    const minScore=Number(options.minScore??4.6),minConfidence=Number(options.minConfidence??0.36),minSemantic=Number(options.minSemantic??0.12);
    const lexicalEnough=Boolean(top&&top._lexicalScore>0&&top._coverage>=Number(options.minCoverage??0.2));
    const semanticEnough=Boolean(top&&top._semantic>=minSemantic&&(interpretation.domain==='general'||top._itemDomain===interpretation.domain));
    const strong=Boolean(top&&top._hybridScore>=minScore&&conf>=minConfidence&&(lexicalEnough||semanticEnough));
    return {version:VERSION,query:String(query||''),interpretation,confidence:conf,strong,results:strong?ranked.slice(0,Number(options.limit||36)):[],retrieval:{exact:true,entity:true,bm25:true,semantic:semanticAvailable?'precomputed-local':'computed-local',domainFiltering:true,lightweightReranking:true,confidenceGate:true},boundary:strong?'Hybrid relevance found. Relevance is not proof; follow the underlying sources.':'No reliable evidence-backed match was found.'};
  }
  return {VERSION,search};
});
