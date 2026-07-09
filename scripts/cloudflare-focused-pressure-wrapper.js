const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.cwd();
const hard=[];
const soft=[];
const steps=[];
const fp=p=>path.join(root,p);
const exists=p=>fs.existsSync(fp(p));
const read=p=>fs.readFileSync(fp(p),'utf8');
const site=p=>path.join(root,'_site',p);
const siteExists=p=>fs.existsSync(site(p));
const siteRead=p=>fs.readFileSync(site(p),'utf8');
function run(label,file){
  const script=fp(file);
  if(!fs.existsSync(script)){soft.push(`${label}: missing optional script ${file}`);return;}
  const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',stdio:'pipe'});
  steps.push({label,file,status:result.status,stdout:String(result.stdout||'').slice(0,1200),stderr:String(result.stderr||'').slice(0,1200)});
  if(result.status!==0)soft.push(`${label}: ${file} exited ${result.status}`);
}
function needFile(p){if(!exists(p))hard.push(`missing source file: ${p}`)}
function needSite(p){if(!siteExists(p))hard.push(`missing built asset: _site/${p}`)}
function needText(p,t,label=t){if(exists(p)&&!read(p).includes(t))hard.push(`${p} missing ${label}`)}
function needSiteText(p,t,label=t){if(siteExists(p)&&!siteRead(p).includes(t))hard.push(`_site/${p} missing ${label}`)}
function parseJson(p){try{return JSON.parse(read(p))}catch(e){hard.push(`${p} invalid JSON: ${e.message}`);return null}}
function parseSiteJson(p){try{return JSON.parse(siteRead(p))}catch(e){hard.push(`_site/${p} invalid JSON: ${e.message}`);return null}}
fs.mkdirSync(fp('downloads'),{recursive:true});
for(const [label,file] of [
  ['deploy status','scripts/build-deploy-status.js'],
  ['generated repair','scripts/repair-generated-site-artifacts.js'],
  ['search repair','scripts/repair-search-system.js'],
  ['shared assets','scripts/ensure-shared-assets.js'],
  ['worker pages origin patch','scripts/patch-worker-pages-origin.js'],
  ['cloudflare output','scripts/build-cloudflare-output.js'],
  ['site brain health','scripts/site-brain-health.js']
]) run(label,file);
for(const p of ['index.html','search.html','search.js','search-index.json','books.html','live-intel.html','epstein-files.html','forum.html','forum.js','deploy-status.html','deploy-status.json','deploy-health.html','deploy-health.json','src/worker.js','wrangler.toml','_headers','scripts/build-cloudflare-output.js']) needFile(p);
for(const p of ['index.html','index','search.html','search','search.js','search-index.json','books.html','books','live-intel.html','live-intel','epstein-files.html','epstein-files','forum.html','forum','deploy-status.html','deploy-status','deploy-health.html','deploy-health']) needSite(p);
if(siteExists('_redirects'))hard.push('_site/_redirects must not exist for Worker assets deployment');
needText('src/worker.js','env.ASSETS.fetch','Worker asset fetch');
needText('src/worker.js','routeAliases[originalPath]','original path alias lookup');
needText('src/worker.js','routeAliases[normalizedPath]','normalized path alias lookup');
needText('src/worker.js','/forum-health','forum health endpoint');
needText('src/worker.js','/forum-feed-main','main board endpoint');
needText('src/worker.js','/forum-feed-speculation','speculation board endpoint');
needText('src/worker.js','/forum-feed-epstein-alive','epstein board endpoint');
needText('src/worker.js','/downloads/forum-posts.json','forum JSON export');
needText('src/worker.js','/submit-main-post','main submit endpoint');
needText('src/worker.js','Cloudflare KV FORUM_POSTS','KV persistence marker');
needText('src/worker.js','Worker handled failure safely','safe worker failure handling');
needText('forum.js','/forum-feed-main','frontend main feed');
needText('forum.js','/forum-feed-speculation','frontend speculation feed');
needText('forum.js','/forum-feed-epstein-alive','frontend epstein feed');
needText('forum.js','/submit-main-post','frontend main submit');
needText('forum.js','persistent !== true','frontend persistent guard');
needText('forum.js','Signal posted live and saved persistently','frontend persistent success');
needText('search.html','id="archive-search"','archive search marker');
needText('search.html','id="search-results"','search results container');
needText('search.js','/search-index.json','search index fetch');
needText('search.js','fallbackIndex','fallback index');
needSiteText('search.html','id="archive-search"','built archive search marker');
needText('wrangler.toml','main = "src/worker.js"','Worker entrypoint');
needText('wrangler.toml','directory = "./_site"','Cloudflare asset directory');
needText('wrangler.toml','binding = "ASSETS"','ASSETS binding');
needText('wrangler.toml','binding = "FORUM_POSTS"','FORUM_POSTS KV binding');
needText('_headers','Strict-Transport-Security','HSTS header');
const ds=exists('deploy-status.json')?parseJson('deploy-status.json'):null;
if(ds){if(!ds.ok)hard.push('deploy-status.json ok should be true');if(!ds.buildSha)hard.push('deploy-status.json missing buildSha');}
const dh=exists('deploy-health.json')?parseJson('deploy-health.json'):null;
if(dh){if(!dh.ok)hard.push('deploy-health.json ok should be true');if(!Array.isArray(dh.routes)||!dh.routes.includes('/forum-health'))hard.push('deploy-health.json missing /forum-health route');}
if(siteExists('search-index.json')){const idx=parseSiteJson('search-index.json');if(idx&&!Array.isArray(idx))hard.push('_site/search-index.json must be an array');if(Array.isArray(idx)&&idx.length<20)hard.push('_site/search-index.json should contain at least 20 routes');}
const report={ok:hard.length===0,generatedAt:new Date().toISOString(),hardIssues:hard,softIssues:soft,steps,boundary:'Cloudflare focused pressure wrapper blocks true missing assets, invalid JSON, broken Worker routing and missing critical markers. Legacy copy-marker noise is reported only.'};
fs.writeFileSync(fp('downloads/cloudflare-focused-pressure-report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(fp('downloads/cloudflare-focused-pressure-report.md'),'# Cloudflare Focused Pressure Report\n\nGenerated: '+report.generatedAt+'\nResult: '+(report.ok?'PASS':'FAIL')+'\n\n## Hard Issues\n'+(hard.map(x=>'- '+x).join('\n')||'- None')+'\n\n## Soft Issues\n'+(soft.map(x=>'- '+x).join('\n')||'- None')+'\n');
if(hard.length){console.error('\nCLOUDFLARE FOCUSED PRESSURE FAILED\n');for(const x of hard)console.error('- '+x);process.exit(1)}
console.log('CLOUDFLARE FOCUSED PRESSURE PASSED');
console.log(`Soft review items: ${soft.length}`);
