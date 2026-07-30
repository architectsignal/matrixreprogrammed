const crypto=require('crypto');

function hash(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function clean(value=''){return String(value||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();}
function compact(value='',max=700){const text=clean(value);return text.length>max?`${text.slice(0,max-1).trim()}…`:text;}
function absoluteUrl(value,base){try{return new URL(String(value||''),base).href;}catch{return '';}}
function tag(block,name){const match=String(block).match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'));return match?clean(match[1]):'';}
function attr(block,name){const match=String(block).match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`,'i'));return match?match[1]:'';}
function parseDate(value,fallback){const date=new Date(value||fallback);return Number.isFinite(date.getTime())?date.toISOString():fallback;}
function extractEntities(value,seed=[]){
  const text=clean(value);
  const found=[...seed];
  const candidates=text.match(/\b(?:[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,})(?:\s+(?:[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,})){0,4}\b/g)||[];
  for(const candidate of candidates){
    if(/^(The|This|That|France|European Union|United States)$/i.test(candidate))continue;
    if(!found.includes(candidate))found.push(candidate);
    if(found.length>=12)break;
  }
  return found;
}
function sourceType(source){return source.category||source.format||'public-record';}
function boundaryFor(source){
  if(source.evidenceClassification==='news-signal-not-evidence')return 'This is a secondary news signal. It must be linked to a primary record before it supports a factual accountability conclusion.';
  return 'This record establishes only what the linked source publishes within its stated date, jurisdiction and scope. It does not prove motive, coordination or unrelated allegations.';
}
function normalizeRecord(source,raw,retrievedAt=new Date().toISOString()){
  const title=compact(raw.title||raw.name||raw.headline||source.label,300);
  const itemUrl=absoluteUrl(raw.url||raw.link||raw.html_url||source.url,source.url);
  const summary=compact(raw.summary||raw.description||raw.abstract||raw.content||title,900);
  const publicationDate=parseDate(raw.published||raw.publication_date||raw.date||raw.updated,retrievedAt);
  const claim=compact(raw.claim||title,500);
  const entities=extractEntities(`${title} ${summary}`,[...(source.entities||[]),...(raw.entities||[])]);
  return {
    id:hash(`${source.id}|${title.toLowerCase()}|${itemUrl}|${publicationDate.slice(0,10)}`).slice(0,24),
    sourceId:source.id,
    sourceCategory:source.category,
    sourceLabel:source.label,
    sourceUrl:source.url,
    itemUrl,
    publisher:source.publisher,
    publicationDate,
    retrievedAt,
    jurisdiction:source.jurisdiction,
    sourceType:sourceType(source),
    sourceQuality:source.sourceQuality,
    evidenceClassification:source.evidenceClassification,
    title,
    summary,
    entities,
    claims:[{
      text:claim,
      classification:source.evidenceClassification,
      sourceUrl:itemUrl,
      evidenceBoundary:boundaryFor(source)
    }],
    keywords:[...new Set([...(source.keywords||[]),...(raw.keywords||[])])].slice(0,30),
    rawHash:hash(raw.rawBody||JSON.stringify(raw.rawMeta||raw)).slice(0,64),
    evidenceBoundary:boundaryFor(source),
    analysisGeneratedByAI:false,
    rawMeta:raw.rawMeta||null
  };
}
function parseRss(source,body,retrievedAt){
  const items=[...body.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]);
  const blocks=items.length?items:[...body.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m=>m[0]);
  return blocks.slice(0,100).map(block=>{
    const linkTag=block.match(/<link\b[^>]*>/i)?.[0]||'';
    return normalizeRecord(source,{
      title:tag(block,'title'),
      url:tag(block,'link')||attr(linkTag,'href')||tag(block,'guid'),
      summary:tag(block,'description')||tag(block,'summary')||tag(block,'content'),
      published:tag(block,'pubDate')||tag(block,'published')||tag(block,'updated'),
      rawBody:block
    },retrievedAt);
  }).filter(item=>item.title&&item.itemUrl);
}
function parseHtml(source,body,retrievedAt){
  const pageTitle=clean(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||source.label);
  const records=[],seen=new Set();
  for(const match of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const href=attr(match[1],'href'),title=clean(match[2]);
    if(!href||title.length<8)continue;
    const url=absoluteUrl(href,source.url);
    if(!/^https?:/i.test(url))continue;
    const key=`${title.toLowerCase()}|${url}`;if(seen.has(key))continue;seen.add(key);
    const lower=`${title} ${url}`.toLowerCase();
    const keywordMatches=(source.keywords||[]).filter(term=>lower.includes(String(term).toLowerCase()));
    records.push(normalizeRecord(source,{title,url,summary:pageTitle,keywords:keywordMatches,rawBody:match[0]},retrievedAt));
  }
  const matching=records.filter(record=>record.keywords.length);
  return (matching.length?matching:records).slice(0,80);
}
function parseOpenDataSoft(source,data,retrievedAt){
  const rows=data.results||data.records||[];
  return rows.slice(0,100).map(entry=>{
    const row=entry.record?.fields||entry.fields||entry;
    const title=row.objet||row.titre||row.title||row.nomacheteur||source.label;
    const buyer=row.nomacheteur||row.acheteur||row.buyer||'';
    const supplier=row.titulaire||row.supplier||'';
    const url=row.url_avis||row.url||source.url;
    const summary=[buyer&&`Buyer: ${buyer}`,supplier&&`Supplier: ${supplier}`,row.famille_libelle,row.type_marche,row.procedure_libelle].filter(Boolean).join(' · ');
    return normalizeRecord(source,{title,url,summary,published:row.dateparution||row.date_publication,entities:[buyer,supplier].filter(Boolean),rawMeta:row},retrievedAt);
  });
}
function categoryOrder(category){
  if(!category)return [];
  if(Array.isArray(category.index))return category.index;
  if(category.index&&typeof category.index==='object')return Object.entries(category.index).sort((a,b)=>Number(a[1])-Number(b[1])).map(([key])=>key);
  return [];
}
function parseEurostat(source,data,retrievedAt){
  const ids=data.id||[];
  const sizes=data.size||[];
  const dimensions=data.dimension||{};
  const values=data.value||{};
  const dimensionCodes=ids.map(id=>categoryOrder(dimensions[id]?.category));
  const total=sizes.reduce((a,b)=>a*b,1);
  const rows=[];
  for(let flat=0;flat<total;flat++){
    const value=Array.isArray(values)?values[flat]:values[String(flat)];
    if(value===undefined||value===null)continue;
    let remainder=flat;
    const coords={};
    for(let i=ids.length-1;i>=0;i--){
      const size=sizes[i]||1;
      const position=remainder%size;remainder=Math.floor(remainder/size);
      const code=dimensionCodes[i]?.[position]??String(position);
      coords[ids[i]]=code;
    }
    const labels=Object.fromEntries(Object.entries(coords).map(([id,code])=>[id,dimensions[id]?.category?.label?.[code]||code]));
    rows.push({value,coords,labels});
  }
  return rows.slice(-100).reverse().map(row=>{
    const time=row.labels.time||row.coords.time||'latest';
    const geo=row.labels.geo||row.coords.geo||source.jurisdiction;
    const unit=row.labels.unit||row.coords.unit||'';
    const tax=row.labels.tax||row.coords.tax||'';
    const title=`${source.label} — ${geo} — ${time}`;
    const summary=`Official Eurostat observation: ${row.value}${unit?` ${unit}`:''}${tax?` · ${tax}`:''}. Dataset ${data.label||'nrg_pc_204'}.`;
    return normalizeRecord(source,{title,url:source.officialDocs||source.url,summary,published:String(time).match(/^\d{4}/)?`${String(time).slice(0,4)}-12-31`:retrievedAt,claim:summary,rawMeta:{value:row.value,dimensions:row.coords,labels:row.labels,dataset:data.label,updated:data.updated}},retrievedAt);
  });
}
function parsePayload(source,body,contentType='',retrievedAt=new Date().toISOString()){
  if(source.format==='rss'||/rss|atom|xml/i.test(contentType))return parseRss(source,body,retrievedAt);
  if(source.format==='json'||/json/i.test(contentType)){
    const data=typeof body==='string'?JSON.parse(body):body;
    if(source.parser==='eurostat-jsonstat')return parseEurostat(source,data,retrievedAt);
    if(source.parser==='opendatasoft-records')return parseOpenDataSoft(source,data,retrievedAt);
    const rows=Array.isArray(data)?data:(data.results||data.items||data.records||[]);
    return rows.slice(0,100).map(row=>normalizeRecord(source,row,retrievedAt));
  }
  return parseHtml(source,String(body||''),retrievedAt);
}
module.exports={hash,clean,compact,normalizeRecord,parseRss,parseHtml,parseOpenDataSoft,parseEurostat,parsePayload};
