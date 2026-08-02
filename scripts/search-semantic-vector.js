(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.MatrixSemanticVector=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='matrix-semantic-vector-v1';
  const DIMENSIONS=96;
  const CONCEPTS={
    electricity:['electricity','electric','power','current','utility','grid','lights','lighting','kwh','kilowatt'],
    energy_bill:['electricity bill','energy bill','power bill','utility bill','facture electricite','facture d electricite','energy account'],
    price_increase:['price increase','cost increase','gone up','higher bill','more expensive','paying more','rise','rising','surge','hausse','augmentation'],
    tariff:['tariff','rate','unit rate','price cap','pricing','tarif','regulated tariff'],
    standing_charge:['standing charge','fixed daily fee','daily charge','base fee','service charge','abonnement'],
    supplier:['supplier','provider','utility company','energy company','fournisseur'],
    regulator:['regulator','regulatory authority','price regulator','cre','ofgem','commission de regulation'],
    wholesale:['wholesale','generation cost','market price','commodity price'],
    legislation:['law','legislation','statute','bill','regulation','rule','official journal','eur lex','decree','act'],
    parliament:['parliament','assembly','senate','committee','hearing','vote','deputy','member of parliament'],
    government:['government','ministry','department','authority','agency','public body'],
    contract:['contract','procurement','tender','award','public deal','supplier award','grant','purchase order'],
    company_filing:['company filing','sec filing','edgar','annual report','10 k','10 q','8 k','ownership report','shareholder filing','corporate annual disclosure','business ownership report'],
    court:['court','judge','judgment','ruling','case','lawsuit','appeal','docket','opinion','decision'],
    disclosure:['disclosure','records','documents','files','redaction','withheld','sealed','foia','archive','missing record'],
    enforcement:['charged','indicted','convicted','sanction','penalty','enforcement','investigation','settlement'],
    money:['money','spending','budget','profit','revenue','payment','funding','tax','levy'],
    ownership:['ownership','owner','shareholder','beneficial owner','control','board','parent company'],
    media:['news','media','press','journalism','report','coverage','headline'],
    health:['aids','hiv','health','medical','medicine','disease','hospital','patient','treatment','vaccine']
  };
  function ascii(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}
  function clean(value){return ascii(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function hash(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function add(vector,key,weight){const h=hash(key);const index=h%DIMENSIONS;const sign=(h&0x80000000)?-1:1;vector[index]+=sign*weight;}
  function conceptHits(text){const normalized=clean(text);const hits=[];for(const [concept,aliases] of Object.entries(CONCEPTS)){if(aliases.some(alias=>{const a=clean(alias);return a&&(` ${normalized} `).includes(` ${a} `);})){hits.push(concept);}}return hits;}
  function semanticFeatures(text){
    const normalized=clean(text);const tokens=normalized.split(/\s+/).filter(Boolean);const features=[];
    for(const token of tokens){if(token.length>1)features.push([`t:${token}`,1]);}
    for(let i=0;i<tokens.length-1;i++)features.push([`b:${tokens[i]}_${tokens[i+1]}`,0.65]);
    for(const [concept,aliases] of Object.entries(CONCEPTS)){
      let hits=0;
      for(const alias of aliases){const a=clean(alias);if(a&&(` ${normalized} `).includes(` ${a} `)){hits++;features.push([`c:${concept}`,2.6]);}}
      if(hits>1)features.push([`c2:${concept}`,Math.min(2,hits-1)]);
    }
    return features;
  }
  function embed(text){
    const vector=new Float32Array(DIMENSIONS);
    for(const [key,weight] of semanticFeatures(text))add(vector,key,weight);
    let norm=0;for(const value of vector)norm+=value*value;norm=Math.sqrt(norm)||1;
    for(let i=0;i<vector.length;i++)vector[i]/=norm;
    return vector;
  }
  function encode(vector){
    const bytes=new Uint8Array(DIMENSIONS);
    for(let i=0;i<DIMENSIONS;i++){const q=Math.max(-127,Math.min(127,Math.round(Number(vector[i]||0)*127)));bytes[i]=q<0?q+256:q;}
    if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');
    let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);
  }
  function decode(encoded){
    let bytes;
    if(typeof Buffer!=='undefined')bytes=Uint8Array.from(Buffer.from(String(encoded||''),'base64'));
    else {const binary=atob(String(encoded||''));bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));}
    const vector=new Float32Array(DIMENSIONS);
    for(let i=0;i<Math.min(bytes.length,DIMENSIONS);i++){const signed=bytes[i]>127?bytes[i]-256:bytes[i];vector[i]=signed/127;}
    let norm=0;for(const value of vector)norm+=value*value;norm=Math.sqrt(norm)||1;for(let i=0;i<vector.length;i++)vector[i]/=norm;
    return vector;
  }
  function cosine(a,b){let dot=0;const length=Math.min(a?.length||0,b?.length||0);for(let i=0;i<length;i++)dot+=Number(a[i]||0)*Number(b[i]||0);return Math.max(-1,Math.min(1,dot));}
  function similarity(queryVector,encoded){return cosine(queryVector,decode(encoded));}
  function documentText(item){
    const keywords=Array.isArray(item?.keywords)?item.keywords.join(' '):String(item?.keywords||'');
    return [item?.title,item?.title,item?.entity,item?.category,item?.layer,keywords,keywords,item?.description,item?.sourceType,item?.publisher,item?.jurisdiction].filter(Boolean).join(' ');
  }
  function buildIndexMap(raw){
    if(raw instanceof Map)return raw;const map=new Map();
    const records=Array.isArray(raw?.records)?raw.records:[];
    for(const record of records){if(Array.isArray(record)&&record.length>=2)map.set(String(record[0]),String(record[1]));}
    return map;
  }
  return {VERSION,DIMENSIONS,CONCEPTS,clean,conceptHits,semanticFeatures,embed,encode,decode,cosine,similarity,documentText,buildIndexMap};
});
