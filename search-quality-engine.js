(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.MatrixSearchQuality=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='matrix-search-quality-v1';
  const STOP=new Set(('a an and are as at be been being but by can could did do does for from had has have having he her hers him his how i if in into is it its may me might more most my no not of on or our ours she should so than that the their theirs them then there these they this those to too up us was we were what when where which who why will with would you your yours latest update updates show tell site page pages').split(/\s+/));
  const TYPO_MAP={
    'why7':'why','wh7':'why','yhy':'why',
    'eletric':'electricity','electricty':'electricity','electrc':'electricity','electic':'electricity','electicity':'electricity',
    'gine':'gone','gobe':'gone','gon':'gone',
    'bil':'bill','bll':'bill','biil':'bill',
    'energry':'energy','enrgy':'energy','enery':'energy',
    'prce':'price','prize':'price','higer':'higher','highr':'higher',
    'goverment':'government','governement':'government',
    'parliment':'parliament','parlimentary':'parliamentary',
    'regulater':'regulator','regulartor':'regulator',
    'contrct':'contract','compny':'company','procurment':'procurement',
    'epstien':'epstein','blackrok':'blackrock','redacton':'redaction',
    'aids':'aids','hiv':'hiv'
  };
  const PHRASE_REWRITES=[
    [/\bwhy\s+has\s+my\s+electricity\s+gone\s+up\b/g,'why has my electricity bill gone up'],
    [/\bwhy\s+has\s+my\s+electric\s+gone\s+up\b/g,'why has my electricity bill gone up'],
    [/\belectricity\s+gone\s+up\b/g,'electricity bill price increase'],
    [/\belectric\s+gone\s+up\b/g,'electricity bill price increase'],
    [/\bpower\s+bill\b/g,'electricity bill'],
    [/\benergy\s+costs?\b/g,'energy bill price'],
    [/\bstanding\s+fee\b/g,'standing charge']
  ];
  const DOMAINS={
    'household-energy':{
      label:'Household energy',
      terms:['electricity','electric','energy','power','gas','bill','tariff','standing','charge','unit','rate','supplier','utility','grid','wholesale','meter','levy','kwh'],
      phrases:['electricity bill','energy bill','standing charge','unit rate','price cap','wholesale energy'],
      incompatible:['health-medical']
    },
    'health-medical':{
      label:'Health and medicine',
      terms:['aids','hiv','health','medical','medicine','disease','vaccine','hospital','pharma','virus','patient','cancer','treatment','trial','clinic','waiting'],
      phrases:['public health','health policy','cancer treatment','medical trial'],
      incompatible:['household-energy']
    },
    'government-policy':{
      label:'Government and policy',
      terms:['government','policy','law','bill','legislation','regulation','regulator','ministry','department','authority','parliament','senate','assembly','council','vote'],
      phrases:['public policy','government decision','regulatory decision'],
      incompatible:[]
    },
    'money-contracts':{
      label:'Money and contracts',
      terms:['money','contract','procurement','tender','award','spending','budget','grant','company','supplier','revenue','profit','ownership','filing','shareholder'],
      phrases:['public contract','company filing','contract award'],
      incompatible:[]
    },
    'courts-enforcement':{
      label:'Courts and enforcement',
      terms:['court','case','lawsuit','judgment','ruling','conviction','convicted','charged','indicted','enforcement','sanction','docket','appeal','judicial','legal'],
      phrases:['court record','legal case','lawsuit against','judicial decision'],
      incompatible:[]
    },
    'disclosure-files':{
      label:'Disclosure and records',
      terms:['epstein','file','files','record','records','redaction','withheld','sealed','foia','document','leak','wikileaks','archive','disclosure','removed','missing'],
      phrases:['missing records','public records','court files','public disclosure','record removed','missing evidence'],
      incompatible:[]
    },
    'power-networks':{
      label:'Power and institutions',
      terms:['blackrock','billionaire','elite','foundation','institution','control','power','lobbying','influence','network','family','board','connection','connections'],
      phrases:['power network','institutional control','who controls','who control','corporate influence','foundation board'],
      incompatible:[]
    },
    'information-media':{
      label:'Information and media',
      terms:['media','news','narrative','censorship','information','report','journalism','broadcast','press','coverage','correction'],
      phrases:['news report','media narrative','news coverage','journalism source','media ownership'],
      incompatible:[]
    }
  };

  function ascii(value){
    return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  }
  function cleanRaw(value){
    return ascii(value).toLowerCase()
      .replace(/([a-z])\d+(?=\s|$)/g,'$1')
      .replace(/\d+(?=[a-z])/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }
  function squashRepeats(word){ return word.replace(/(.)\1{2,}/g,'$1$1'); }
  function editDistance(a,b){
    if(a===b) return 0;
    if(!a.length) return b.length;
    if(!b.length) return a.length;
    const prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      let left=i,diag=i-1;
      prev[0]=i;
      for(let j=1;j<=b.length;j++){
        const up=prev[j],cost=a[i-1]===b[j-1]?0:1;
        const next=Math.min(up+1,left+1,diag+cost);
        diag=up; prev[j]=next; left=next;
      }
    }
    return prev[b.length];
  }
  const VOCAB=[...new Set(Object.values(DOMAINS).flatMap(d=>d.terms).concat([
    'gone','higher','increase','increased','rising','rise','why','what','cost','price','prices',
    'decision','authority','implementation','promised','benefit','outcome','question','questions',
    'france','french','europe','european','uk','britain','usa','american'
  ]))];

  function correctToken(token){
    let value=squashRepeats(token);
    if(TYPO_MAP[value]) return TYPO_MAP[value];
    if(value.length<4||/^\d+$/.test(value)||VOCAB.includes(value)) return value;
    let best=value,bestDistance=99;
    for(const candidate of VOCAB){
      if(Math.abs(candidate.length-value.length)>2) continue;
      const d=editDistance(value,candidate);
      const max=value.length<=5?1:2;
      if(d<=max&&d<bestDistance){best=candidate;bestDistance=d;}
    }
    return best;
  }
  function normalizeQuery(query){
    const original=String(query||'').trim();
    const cleaned=cleanRaw(original);
    const rawTokens=cleaned.split(/\s+/).filter(Boolean);
    const correctedTokens=rawTokens.map(correctToken);
    let corrected=correctedTokens.join(' ');
    for(const [pattern,replacement] of PHRASE_REWRITES) corrected=corrected.replace(pattern,replacement);
    corrected=corrected.replace(/\s+/g,' ').trim();
    let tokens=corrected.split(/\s+/).filter(Boolean);
    const expansions=[];
    const hasEnergy=tokens.some(t=>['electricity','electric','energy','power','gas','kwh','meter'].includes(t));
    const hasRise=tokens.some(t=>['gone','up','higher','increase','increased','rising','rise','price','prices','cost','more','paying'].includes(t));
    if(hasEnergy&&hasRise){
      for(const term of ['bill','price','tariff','supplier','regulator','standing','charge']){
        if(!tokens.includes(term)){tokens.push(term);expansions.push(term);}
      }
    }
    const meaningful=tokens.filter(t=>t.length>1&&!STOP.has(t)&&!['gone','up'].includes(t));
    const corrections=[];
    rawTokens.forEach((t,i)=>{if(correctedTokens[i]&&t!==correctedTokens[i])corrections.push({from:t,to:correctedTokens[i]});});
    return {original,cleaned,corrected,tokens:[...new Set(tokens)],meaningful:[...new Set(meaningful)],corrections,expansions};
  }
  function includesTerm(text,term){
    const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp('(?:^|\\b)'+escaped+'(?:\\b|$)','i').test(text);
  }
  function classifyText(value){
    const text=' '+cleanRaw(value)+' ';
    const scores={};
    for(const [id,domain] of Object.entries(DOMAINS)){
      let score=0;
      for(const term of domain.terms) if(includesTerm(text,term)) score+=1;
      for(const phrase of domain.phrases) if(text.includes(phrase)) score+=2.5;
      scores[id]=score;
    }
    const ordered=Object.entries(scores).filter(([,s])=>s>0).sort((a,b)=>b[1]-a[1]);
    return {primary:ordered[0]?.[0]||'general',scores,matched:ordered.map(([id])=>id)};
  }
  function interpretQuery(query){
    const normalized=normalizeQuery(query);
    const domain=classifyText(normalized.tokens.join(' '));
    let consequence='general-question';
    if(domain.primary==='household-energy'&&normalized.tokens.some(t=>['increase','increased','higher','rise','rising','price','bill','tariff'].includes(t))) consequence='household-energy-price-increase';
    return {
      ...normalized,
      domain:domain.primary,
      domainLabel:DOMAINS[domain.primary]?.label||'General',
      domainScores:domain.scores,
      consequence,
      missingContext:domain.primary==='household-energy'?['country','supplier','billing period','tariff type']:[]
    };
  }
  function itemText(item){
    const keywords=Array.isArray(item?.keywords)?item.keywords.join(' '):String(item?.keywords||'');
    return [item?.title,item?.category,item?.layer,item?.description,keywords,item?.sourceType,item?.entity,item?.statusClass].filter(Boolean).join(' ');
  }
  function itemFields(item){
    const keywords=Array.isArray(item?.keywords)?item.keywords.join(' '):String(item?.keywords||'');
    return {
      title:cleanRaw(item?.title),
      keywords:cleanRaw(keywords),
      category:cleanRaw(item?.category),
      layer:cleanRaw(item?.layer),
      description:cleanRaw(item?.description),
      all:cleanRaw(itemText(item))
    };
  }
  function tokenList(value){return cleanRaw(value).split(/\s+/).filter(Boolean);}
  function termFrequency(tokens){
    const map=new Map();
    for(const token of tokens) map.set(token,(map.get(token)||0)+1);
    return map;
  }
  function prepareIndex(index){
    const docs=(Array.isArray(index)?index:[]).filter(item=>item&&item.url).map(item=>{
      const fields=itemFields(item);
      const tokens=tokenList(fields.all);
      return {item,fields,tokens,tf:termFrequency(tokens),length:Math.max(tokens.length,1),domain:classifyText(fields.all)};
    });
    const df=new Map();
    for(const doc of docs){
      for(const term of new Set(doc.tokens)) df.set(term,(df.get(term)||0)+1);
    }
    const avgdl=docs.length?docs.reduce((n,d)=>n+d.length,0)/docs.length:1;
    return {docs,df,avgdl,total:docs.length};
  }
  function idf(prepared,term){
    const n=prepared.total||1, d=prepared.df.get(term)||0;
    return Math.log(1+(n-d+0.5)/(d+0.5));
  }
  function bm25(prepared,doc,term){
    const tf=doc.tf.get(term)||0;
    if(!tf)return 0;
    const k1=1.35,b=0.72;
    return idf(prepared,term)*(tf*(k1+1))/(tf+k1*(1-b+b*(doc.length/prepared.avgdl)));
  }
  function fieldBoost(doc,term){
    let score=0;
    if(includesTerm(doc.fields.title,term)) score+=3.8;
    if(includesTerm(doc.fields.keywords,term)) score+=2.8;
    if(includesTerm(doc.fields.category,term)) score+=1.8;
    if(includesTerm(doc.fields.layer,term)) score+=1.5;
    if(includesTerm(doc.fields.description,term)) score+=0.8;
    return score;
  }
  function domainAdjustment(queryDomain,docDomain){
    if(!queryDomain||queryDomain==='general')return 0;
    if(docDomain.primary===queryDomain)return 6;
    if(docDomain.matched.includes(queryDomain))return 3;
    const incompatible=DOMAINS[queryDomain]?.incompatible||[];
    if(incompatible.some(id=>docDomain.primary===id||docDomain.matched.includes(id)))return -18;
    return -1.5;
  }
  function scoreDocument(prepared,doc,interpretation){
    const terms=interpretation.meaningful;
    if(!terms.length)return {score:0,matched:[],coverage:0,reasons:[]};
    let lexical=0;
    const matched=[];
    const reasons=[];
    for(const term of terms){
      const base=bm25(prepared,doc,term);
      const fields=fieldBoost(doc,term);
      if(base>0||fields>0){matched.push(term);lexical+=base+fields;}
    }
    const correctedPhrase=cleanRaw(interpretation.corrected);
    let phrase=0;
    if(correctedPhrase.length>4&&doc.fields.all.includes(correctedPhrase)){phrase=10;reasons.push('exact corrected phrase');}
    const domain=domainAdjustment(interpretation.domain,doc.domain);
    if(domain>=3) reasons.push('subject domain match');
    if(domain<=-10) reasons.push('subject domain conflict');
    const coverage=matched.length/Math.max(terms.length,1);
    const coverageBoost=coverage>=0.75?4:coverage>=0.5?2:0;
    const priorityTie=Math.min(Math.max(Number(doc.item.priority||0),0),120)/240;
    const score=lexical+phrase+domain+coverageBoost+(matched.length?priorityTie:0);
    if(matched.length) reasons.push(`matched ${matched.slice(0,5).join(', ')}`);
    return {score,matched,coverage,reasons,domain:doc.domain.primary};
  }
  function confidenceFor(top,second,interpretation){
    if(!top)return 0;
    const margin=Math.max(0,top._score-(second?second._score:0));
    let value=0.18+Math.min(0.42,top._score/30)+Math.min(0.24,top._coverage*0.3)+Math.min(0.16,margin/20);
    if(top._domainConflict)value-=0.45;
    if(interpretation.domain!=='general'&&top._itemDomain!==interpretation.domain)value-=0.08;
    return Math.max(0,Math.min(0.99,value));
  }
  function search(index,query,options={}){
    const interpretation=interpretQuery(query);
    const prepared=prepareIndex(index);
    let ranked=prepared.docs.map(doc=>{
      const detail=scoreDocument(prepared,doc,interpretation);
      return {...doc.item,_score:detail.score,_coverage:detail.coverage,_matched:detail.matched,_reasons:detail.reasons,_itemDomain:detail.domain,_domainConflict:detail.reasons.includes('subject domain conflict')};
    }).filter(item=>item._score>0&&!item._domainConflict)
      .sort((a,b)=>b._score-a._score||b._coverage-a._coverage||String(a.title||'').localeCompare(String(b.title||'')));
    const top=ranked[0],second=ranked[1];
    const confidence=confidenceFor(top,second,interpretation);
    const minScore=Number(options.minScore??4.5);
    const minConfidence=Number(options.minConfidence??0.44);
    const minCoverage=Number(options.minCoverage??(interpretation.domain==='general'?(interpretation.meaningful.length<=2?0.5:0.4):0.25));
    const strong=Boolean(top&&top._score>=minScore&&top._coverage>=minCoverage&&confidence>=minConfidence);
    if(!strong) ranked=[];
    return {
      version:VERSION,
      query:String(query||''),
      interpretation,
      confidence,
      strong,
      results:ranked.slice(0,Number(options.limit||36)),
      boundary:strong?'Relevant routes found. Search relevance is not proof; follow the underlying sources.':'No reliable evidence-backed match was found.'
    };
  }

  return {VERSION,STOP,DOMAINS,normalizeQuery,interpretQuery,classifyText,prepareIndex,search};
});