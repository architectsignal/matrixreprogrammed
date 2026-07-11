const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

const BASE = (process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const EXPECTED_HOST = new URL(BASE).host;
const TIMEOUT_MS = Number(process.env.LIVE_CRAWL_TIMEOUT_MS || 15000);
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.LIVE_CRAWL_CONCURRENCY || 6)));
const CHECK_EXTERNAL = String(process.env.CHECK_EXTERNAL_LINKS || 'true').toLowerCase() !== 'false';
const MAX_EXTERNAL = Number(process.env.MAX_EXTERNAL_LINKS || 500);

const HARD_FORBIDDEN = [
  'Free public intelligence builds trust', 'Email capture builds the list',
  'TURN THE INTELLIGENCE MACHINE INTO PRODUCTS', 'READER MONEY PATH',
  'CAPTURE SYSTEM', 'Persistent Cloudflare D1 member record',
  'Weekly newsletter sender', 'Monetisation Dashboard', 'Mission + Money Engine'
];
const DYNAMIC_RE = /(?:live|daily|news|intel|watch|tracker|dashboard|timer|clock|current|latest|update|brief|migration|conflict|epstein|risk|accountability|conclusion)/i;
const CONCLUSION_RE = /(?:conclusion|theory|brief|intel|analysis|dossier|watch|power|control|accountability|investigation)/i;
const API_PATHS = ['/deploy-status.json','/deploy-health.json','/forum-health','/api/membership/health','/api/auth/health','/api/paypal/health'];

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function decodeEntities(text = '') { return String(text).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))); }
function visibleMarkup(html = '') {
  let out = String(html).replace(/<!--[\s\S]*?-->/g,' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi,' ');
  for (const tag of ['section','article','aside','details','footer','div','form','p','li','a','span','blockquote','pre','ul','ol','h1','h2','h3','h4','h5','h6']) {
    const re = new RegExp(`<${tag}\\b[^>]*(?:internal-only|commercial-internal|data-internal-only=["']true["']|data-commercial-internal=["']true["']|\\shidden(?:\\s|>|=))[^>]*>[\\s\\S]*?<\\/${tag}>`,'gi');
    let before; do { before = out; out = out.replace(re,' '); } while (out !== before);
  }
  return out;
}
function visibleText(html = '') { return decodeEntities(visibleMarkup(html).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()); }
function words(text='') { return text.trim() ? text.trim().split(/\s+/).length : 0; }
function extractAll(html,re,group=1){const out=[];let m;while((m=re.exec(html)))out.push(m[group]);return out;}
function collectIds(html){return new Set(extractAll(html,/\sid\s*=\s*["']([^"']+)["']/gi));}
function parseDates(text){const dates=[];let m;const iso=/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])(?:T[0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z?)?\b/g;while((m=iso.exec(text))){const v=Date.parse(m[0].length===10?`${m[0]}T00:00:00Z`:m[0]);if(Number.isFinite(v))dates.push(v);}const named=/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-3]?\d)(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi;while((m=named.exec(text))){const v=Date.parse(m[0]);if(Number.isFinite(v))dates.push(v);}return dates;}
function conclusionScore(text,html){const lower=text.toLowerCase();const links=(html.match(/<a\b[^>]*href\s*=\s*["']https?:\/\/[^"']+["']/gi)||[]).length;const checks={substantial:words(text)>=220,sources:links>=2||/source|court record|official|filing|report|document|dataset|archive/i.test(text),specifics:/\b20\d{2}\b|\b\d+(?:\.\d+)?%\b|[€$£]\s?\d|\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/i.test(text),evidenceBoundary:/evidence boundary|documented fact|sourced analysis|not proof|does not prove|association is not|speculation/i.test(text),mechanism:/because|through|mechanism|route|pipeline|incentive|dependency|control layer|operates through|works by/i.test(lower),implication:/this means|therefore|implication|impact|consequence|risk|why it matters/i.test(lower),limitation:/however|but this does not|limitation|caveat|uncertain|unknown|cannot establish|counterpoint|alternative explanation/i.test(lower),nextStep:/next record|watch for|what to watch|check next|missing record|next step|follow the|verify|request|monitor/i.test(lower)};return{score:Object.values(checks).filter(Boolean).length,checks,sourceLinks:links};}
function isChallenge(status,text){return status===403&&/Just a moment|cf-chl|challenge-platform|checking your browser|Cloudflare Ray ID/i.test(text||'');}
async function fetchWithTimeout(url,options={}){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);try{return await fetch(url,{redirect:'follow',...options,signal:controller.signal,headers:{'User-Agent':'MatrixReprogrammedExhaustiveAudit/1.0','Accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',...(options.headers||{})}});}finally{clearTimeout(timer);}}
async function fetchText(url,attempts=2){let last;for(let i=0;i<attempts;i++){try{const response=await fetchWithTimeout(url);const text=await response.text();return{response,text};}catch(error){last=error;if(i+1<attempts)await delay(350*(i+1));}}throw last;}
async function mapLimit(items,limit,fn){const results=new Array(items.length);let cursor=0;async function worker(){while(true){const index=cursor++;if(index>=items.length)return;try{results[index]=await fn(items[index],index);}catch(error){results[index]={error:error.message||String(error)};}}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return results;}
function sameSite(url){try{const u=new URL(url,BASE);return u.host===EXPECTED_HOST||u.host===`www.${EXPECTED_HOST}`||`www.${u.host}`===EXPECTED_HOST;}catch{return false;}}
function canonicalize(input,from=BASE+'/'){try{const u=new URL(input,from);u.hash='';if(u.host===`www.${EXPECTED_HOST}`)u.host=EXPECTED_HOST;if(u.pathname==='')u.pathname='/';return u.href;}catch{return null;}}

async function getSitemap(){const {response,text}=await fetchText(`${BASE}/sitemap.xml`);if(!response.ok)throw new Error(`sitemap HTTP ${response.status}`);return unique(extractAll(text,/<loc>([^<]+)<\/loc>/gi).map(url=>canonicalize(url)).filter(Boolean));}

async function auditPage(url){
  const result={url,status:null,finalUrl:null,contentType:null,challenged:false,hard:[],warnings:[],links:[],assets:[],anchors:[],title:'',h1:'',words:0,newestDate:null,newestAgeDays:null,conclusion:null};
  let response,text;
  try{({response,text}=await fetchText(url));}catch(error){result.hard.push(`fetch failed: ${error.message}`);return result;}
  result.status=response.status;result.finalUrl=response.url||url;result.contentType=response.headers.get('content-type')||'';result.challenged=isChallenge(response.status,text);
  if(result.challenged){result.warnings.push('Cloudflare challenge blocked body inspection');return result;}
  if(response.status<200||response.status>=400)result.hard.push(`HTTP ${response.status}`);
  if(!sameSite(result.finalUrl))result.hard.push(`redirected off canonical site to ${result.finalUrl}`);
  if(!/text\/html|application\/xhtml\+xml/i.test(result.contentType))result.hard.push(`unexpected content type ${result.contentType||'(none)'}`);
  const markup=visibleMarkup(text);const visible=visibleText(text);result.words=words(visible);
  const titleMatch=text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);result.title=titleMatch?visibleText(titleMatch[1]):'';
  const h1Match=markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);result.h1=h1Match?visibleText(h1Match[1]):'';
  if(!result.title)result.hard.push('missing title');
  if(!result.h1)result.hard.push('missing visible H1');
  if(result.words<70)result.warnings.push(`thin visible copy (${result.words} words)`);
  for(const phrase of HARD_FORBIDDEN)if(visible.toLowerCase().includes(phrase.toLowerCase()))result.hard.push(`visible author-facing phrase: ${phrase}`);
  const ids=collectIds(text);const attrs=[];const re=/\s(href|src|action)\s*=\s*["']([^"']+)["']/gi;let m;while((m=re.exec(text)))attrs.push({attr:m[1].toLowerCase(),target:m[2].trim()});
  for(const item of attrs){if(!item.target||item.target==='#'){result.warnings.push(`${item.attr} placeholder ${item.target||'(empty)'}`);continue;}if(/^(?:mailto:|tel:|javascript:|data:|blob:)/i.test(item.target))continue;if(item.target.startsWith('#')){const id=item.target.slice(1);if(id&&!ids.has(id))result.hard.push(`missing same-page anchor ${item.target}`);continue;}const absolute=canonicalize(item.target,result.finalUrl||url);if(!absolute)continue;const entry={attr:item.attr,target:item.target,url:absolute};if(item.attr==='src')result.assets.push(entry);else result.links.push(entry);}
  const dates=parseDates(visible);if(dates.length){const newest=Math.max(...dates);result.newestDate=new Date(newest).toISOString();result.newestAgeDays=Math.floor((Date.now()-newest)/86400000);}
  const pathName=new URL(url).pathname;const dynamic=DYNAMIC_RE.test(pathName)||/\b(?:latest|current|today|daily|live|this week|updated|watch|tracker)\b/i.test(visible);if(dynamic){if(result.newestAgeDays==null)result.warnings.push('dynamic page has no visible machine-readable date');else if(result.newestAgeDays>21)result.warnings.push(`dynamic page newest visible date is ${result.newestAgeDays} days old`);}
  if(CONCLUSION_RE.test(pathName)||/\b(?:conclusion|what this means|why it matters|assessment|analysis)\b/i.test(visible)){result.conclusion=conclusionScore(visible,text);if(result.conclusion.score<5)result.warnings.push(`shallow conclusion/analysis score ${result.conclusion.score}/8`);if(/conclusion/i.test(pathName)&&result.conclusion.score<6)result.hard.push(`conclusion page score ${result.conclusion.score}/8`);}
  return result;
}

async function checkUrl(url,kind){
  try{const response=await fetchWithTimeout(url,{method:'HEAD'});let status=response.status;let finalUrl=response.url||url;if(status===405||status===501){const fallback=await fetchWithTimeout(url,{method:'GET',headers:{Range:'bytes=0-2047'}});status=fallback.status;finalUrl=fallback.url||url;try{await fallback.body?.cancel();}catch{}}
    return{url,kind,status,finalUrl,ok:status>=200&&status<400,blocked:[401,403,429].includes(status),hard:[404,410].includes(status)?`HTTP ${status}`:null};
  }catch(error){return{url,kind,status:null,ok:false,blocked:false,hard:`fetch failed: ${error.message}`};}
}

async function main(){
  if(typeof fetch!=='function')throw new Error('Node 18+ fetch required');
  const sitemapUrls=await getSitemap();
  const pageResults=await mapLimit(sitemapUrls,CONCURRENCY,auditPage);
  const discoveredInternal=[];const discoveredExternal=[];
  for(const page of pageResults){for(const item of [...(page.links||[]),...(page.assets||[])]){if(sameSite(item.url))discoveredInternal.push(item.url);else discoveredExternal.push(item.url);}}
  const internalUrls=unique([...sitemapUrls,...discoveredInternal]);
  const internalChecks=await mapLimit(internalUrls,CONCURRENCY,url=>checkUrl(url,'internal'));
  const externalUrls=CHECK_EXTERNAL?unique(discoveredExternal).slice(0,MAX_EXTERNAL):[];
  const externalChecks=CHECK_EXTERNAL?await mapLimit(externalUrls,Math.min(4,CONCURRENCY),url=>checkUrl(url,'external')):[];
  const apiResults=await mapLimit(API_PATHS,3,async pathname=>{const url=BASE+pathname;try{const{response,text}=await fetchText(url);let json=null;try{json=JSON.parse(text);}catch{}return{path:pathname,url,status:response.status,ok:response.ok,json,error:response.ok?null:`HTTP ${response.status}`};}catch(error){return{path:pathname,url,status:null,ok:false,error:error.message};}});

  const hard=[];const warnings=[];
  for(const page of pageResults){for(const issue of page.hard||[])hard.push(`${new URL(page.url).pathname}: ${issue}`);for(const issue of page.warnings||[])warnings.push(`${new URL(page.url).pathname}: ${issue}`);}
  for(const check of internalChecks){if(check.hard)hard.push(`${check.url}: ${check.hard}`);else if(!check.ok&&check.blocked)warnings.push(`${check.url}: blocked with HTTP ${check.status}`);else if(!check.ok)hard.push(`${check.url}: HTTP ${check.status||'fetch failed'}`);}
  for(const check of externalChecks){if(check.hard)hard.push(`external ${check.url}: ${check.hard}`);else if(!check.ok&&check.blocked)warnings.push(`external ${check.url}: blocked with HTTP ${check.status}`);else if(!check.ok)warnings.push(`external ${check.url}: HTTP ${check.status||'fetch failed'}`);}
  for(const api of apiResults)if(!api.ok)hard.push(`${api.path}: ${api.error||`HTTP ${api.status}`}`);

  const conclusionPages=pageResults.filter(p=>p.conclusion);const deep=conclusionPages.filter(p=>p.conclusion.score>=6);const shallow=conclusionPages.filter(p=>p.conclusion.score<5);
  const report={ok:hard.length===0,generatedAt:new Date().toISOString(),base:BASE,scope:'Every sitemap page plus every discovered internal link, asset, form action, external destination, core API health endpoint, freshness marker and conclusion-depth signal.',totals:{sitemapPages:sitemapUrls.length,pagesFetched:pageResults.length,internalUrlsChecked:internalChecks.length,externalUrlsChecked:externalChecks.length,apiEndpointsChecked:apiResults.length,conclusionPages:conclusionPages.length,deepConclusionPages:deep.length,shallowConclusionPages:shallow.length,hardFailures:hard.length,warnings:warnings.length},hardFailures:hard,warnings,pages:pageResults,internalChecks,externalChecks,apiResults,boundary:'External sites may return 401, 403 or 429 to automated checks; those are warnings. 404/410 links, failed internal routes, failed APIs, visible author-facing copy and shallow dedicated conclusion pages are hard failures.'};
  fs.writeFileSync(path.join(reportDir,'live-exhaustive-site-crawl.json'),JSON.stringify(report,null,2));
  const md=['# Live Exhaustive Site Crawl','',`Generated: ${report.generatedAt}`,`Base: ${BASE}`,`Result: ${report.ok?'PASS':'FAIL'}`,'','## Coverage','',`- Sitemap pages: ${report.totals.sitemapPages}`,`- Internal URLs and assets checked: ${report.totals.internalUrlsChecked}`,`- External destinations checked: ${report.totals.externalUrlsChecked}`,`- API endpoints checked: ${report.totals.apiEndpointsChecked}`,`- Conclusion/analysis pages scored: ${report.totals.conclusionPages}`,`- Deep conclusions (6+/8): ${report.totals.deepConclusionPages}`,`- Shallow conclusions (<5/8): ${report.totals.shallowConclusionPages}`,'','## Hard Failures','',...(hard.length?hard.map(x=>`- ${x}`):['- None']),'','## Warnings','',...(warnings.length?warnings.slice(0,400).map(x=>`- ${x}`):['- None']),'','## Page Results','','| Path | HTTP | Words | Freshness | Conclusion | Hard | Warnings |','|---|---:|---:|---|---:|---:|---:|',...pageResults.map(p=>{const pathname=new URL(p.url).pathname;return`| ${pathname.replace(/\|/g,'\\|')} | ${p.status??'—'} | ${p.words||0} | ${p.newestAgeDays==null?'—':`${p.newestAgeDays}d`} | ${p.conclusion?`${p.conclusion.score}/8`:'—'} | ${(p.hard||[]).length} | ${(p.warnings||[]).length} |`;})].join('\n');
  fs.writeFileSync(path.join(reportDir,'live-exhaustive-site-crawl.md'),md);
  console.log(`LIVE EXHAUSTIVE SITE CRAWL ${report.ok?'PASSED':'FAILED'}: ${sitemapUrls.length} pages, ${internalChecks.length} internal URLs, ${externalChecks.length} external links, ${hard.length} hard issue(s), ${warnings.length} warning(s).`);
  if(!report.ok){hard.slice(0,100).forEach(x=>console.error(`- ${x}`));process.exit(1);}
}
main().catch(error=>{fs.writeFileSync(path.join(reportDir,'live-exhaustive-site-crawl.json'),JSON.stringify({ok:false,generatedAt:new Date().toISOString(),base:BASE,error:error.message,stack:error.stack},null,2));console.error(error.stack||error.message);process.exit(1);});
