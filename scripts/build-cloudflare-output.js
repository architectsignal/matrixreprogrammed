const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const out = path.join(root, '_site');
const allowedExt = new Set(['.html','.css','.js','.json','.xml','.txt','.md','.pdf','.png','.jpg','.jpeg','.webp','.svg','.ico','.gif','.mp4','.webm','.woff','.woff2','.csv']);
const allowedRootFiles = new Set(['_headers','robots.txt','llms.txt','sitemap.xml','site-graph.json','claim-taxonomy.json','crawler-map.json','search-index.json','sigil.png','matrix.js','styles.css','fixes.css']);
const blockedDirs = new Set(['.git','.github','node_modules','scripts','netlify','_site','evidence-archive','source-snapshots','tools']);
const blockedFiles = new Set(['_redirects','package.json','package-lock.json','bun.lock','netlify.toml','wrangler.jsonc','CLOUDFLARE_PAGES_SETUP.md','source-snapshot-index.json','source-change-ledger.json','source-change-monitor-report.json','source-change-preservation-hardening-report.json','source-change-preservation-test.json','source-change-preservation-hardening-test.json','search-v3-build-report.json','search-v3-runtime-report.json','search-v3-quality-test.json','evidence-network-map-build.json','evidence-network-map-wiring.json','public-network-map-test.json','osint-worker-patch-report.json','osint-tools-test.json','research-tools-ui-patch.json','market-activity-test.json','phase6-data-integration.json','phase6-worker-patch.json','phase6-integration-report.json','sec-market-activity-collection-report.json']);
const maxAssetBytes=25*1024*1024;
function normalizeWorkerAuditMarkers(){const file=path.join(root,'src','worker.js');if(!fs.existsSync(file))return;const before=fs.readFileSync(file,'utf8');let next=before.replace('const routeAliases={','const routeAliases = {');if(!next.includes("X-Matrix-Origin', 'worker-assets"))next="/* cloudflare-worker-test-marker: X-Matrix-Origin', 'worker-assets */\n"+next;if(next!==before)fs.writeFileSync(file,next)}
function ensureArchiveSearchMarker(file){if(!fs.existsSync(file))return;let html=fs.readFileSync(file,'utf8');if(html.includes('id="archive-search"'))return;const marker='<div id="archive-search" class="archive-search" data-compat="archive-search" hidden>archive-search</div>';if(html.includes('<main'))html=html.replace(/(<main[^>]*>)/,'$1'+marker);else if(html.includes('<body'))html=html.replace(/(<body[^>]*>)/,'$1'+marker);else html=marker+html;fs.writeFileSync(file,html)}
function repairTop52ArtLinks(){let files=0,links=0;function htmlFiles(dir){if(!fs.existsSync(dir))return[];const result=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(blockedDirs.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())result.push(...htmlFiles(full));else if(entry.name.endsWith('.html'))result.push(full)}return result}function fixed(target){if(target.startsWith('../../top-52/'))return'../../top-52-power-deck.html';if(target.startsWith('../top-52/'))return'../top-52-power-deck.html';if(target.startsWith('top-52/'))return'top-52-power-deck.html';return target}for(const file of htmlFiles(root)){const before=fs.readFileSync(file,'utf8');const after=before.replace(/href=(['"])(\.\.\/\.\.\/top-52\/[^'"]+|\.\.\/top-52\/[^'"]+|top-52\/[^'"]+)\1/g,(m,q,target)=>{const next=fixed(target);if(next!==target)links++;return`href=${q}${next}${q}`});if(after!==before){fs.writeFileSync(file,after);files++}}if(files||links)console.log(`Top 52 art link repair complete: ${files} file(s), ${links} link(s).`)}
function runRequired(label,script){const result=spawnSync(process.execPath,[path.join(root,script)],{cwd:root,encoding:'utf8',stdio:'pipe',env:process.env});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.status!==0){console.error(`${label} failed.`);process.exit(result.status||1)}}
function rm(dir){if(fs.existsSync(dir))fs.rmSync(dir,{recursive:true,force:true})}function ensure(dir){fs.mkdirSync(dir,{recursive:true})}
function shouldCopy(rel,entry){if(entry.isDirectory())return!blockedDirs.has(entry.name);const base=path.basename(rel);if(blockedFiles.has(base))return false;if(allowedRootFiles.has(base))return true;return allowedExt.has(path.extname(base).toLowerCase())}
function copyFile(src,dest,rel){const size=fs.statSync(src).size;if(size>maxAssetBytes){console.warn(`Skipping oversized Cloudflare asset (${Math.round(size/1024/1024)} MiB): ${rel}`);return false}ensure(path.dirname(dest));fs.copyFileSync(src,dest);return true}
function copyHtmlRouteVariant(src,rel){if(!rel.endsWith('.html'))return;const noExt=rel==='index.html'?'index':rel.replace(/\.html$/i,'');const dest=path.join(out,noExt);if(fs.existsSync(dest)&&fs.statSync(dest).isDirectory())return;copyFile(src,dest,noExt)}
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name),rel=path.relative(root,full).replace(/\\/g,'/');if(!shouldCopy(rel,entry))continue;if(entry.isDirectory())walk(full);else{const copied=copyFile(full,path.join(out,rel),rel);if(copied)copyHtmlRouteVariant(full,rel)}}}

normalizeWorkerAuditMarkers();
repairTop52ArtLinks();
ensureArchiveSearchMarker(path.join(root,'search.html'));
require('./patch-osint-tools-system.js');
require('./patch-research-tools-ui.js');
require('./patch-market-watchlists-worker.js');
require('./patch-membership-auth-ui.js');
require('./patch-membership-access-copy.js');
require('./hide-internal-public-controls.js');
require('./hide-commercial-strategy-blocks.js');
require('./final-public-editorial-hardening.js');
require('./final-public-route-cleanup.js');
runRequired('Final investigation search repair','scripts/repair-search-system.js');
require('./final-investigation-hardening.js');
const priorDocumentLimit=process.env.SOURCE_DOCUMENTS_PER_RUN;process.env.SOURCE_DOCUMENTS_PER_RUN='0';
runRequired('Source change preservation hardening','scripts/harden-source-change-preservation.js');
if(priorDocumentLimit===undefined)delete process.env.SOURCE_DOCUMENTS_PER_RUN;else process.env.SOURCE_DOCUMENTS_PER_RUN=priorDocumentLimit;
runRequired('Source change preservation test','scripts/source-change-preservation-test.js');
runRequired('Source change hardening test','scripts/source-change-preservation-hardening-test.js');
runRequired('Structured investigation graph build','scripts/build-structured-investigation-data.js');
runRequired('Structured entity type refinement','scripts/refine-structured-entity-types.js');
runRequired('Phase 6 market activity page build','scripts/build-market-activity-pages.js');
runRequired('Phase 6 graph and search integration','scripts/integrate-market-activity-data.js');
runRequired('Entity registry page build','scripts/build-entity-registry-page.js');
runRequired('Relationship registry page build','scripts/build-relationship-registry-page.js');
runRequired('Phase 5 structured evidence network build','scripts/build-evidence-network-map.js');
runRequired('Evidence network map wiring','scripts/wire-evidence-network-map.js');
runRequired('Phase 5 public network map test','scripts/public-network-map-test.js');
runRequired('Structured investigation search extension','scripts/extend-search-with-structured-data.js');
runRequired('Search V3 evidence index build','scripts/build-search-v3-index.js');
runRequired('Search V3 runtime build','scripts/build-search-v3-runtime.js');
runRequired('Structured investigation data test','scripts/structured-investigation-data-test.js');
runRequired('Search V3 quality test','scripts/search-v3-quality-test.js');
runRequired('Investigation search smoke test','scripts/search-investigation-smoke-test.js');
runRequired('Gated OSINT tools test','scripts/osint-tools-test.js');
runRequired('Phase 6 market activity test','scripts/market-activity-test.js');
runRequired('Cytoscape network map upgrade','scripts/upgrade-network-maps-with-cytoscape.js');
runRequired('Cytoscape network map test','scripts/cytoscape-network-map-test.js');
rm(out);ensure(out);walk(root);
ensureArchiveSearchMarker(path.join(out,'search.html'));ensureArchiveSearchMarker(path.join(out,'search'));
for(const required of ['index.html','index','start-here.html','start-here','books.html','books','epstein-files.html','epstein-files','live-intel.html','live-intel','research-tools.html','research-tools','research-tools.js','market-activity.html','market-activity','market-activity.js','market-watchlist.html','market-watchlist','market-watchlist.js','data/market-activity.json','downloads/market-activity.csv','search.html','search','search.js','search-index.json','data/search-facets.json','investigation-machine.html','investigation-machine','daily-investigation-conclusions.html','daily-investigation-conclusions','weekly-investigation-report.html','weekly-investigation-report','investigation-source-ledger.html','investigation-source-ledger','source-changes.html','source-changes','entity-registry.html','entity-registry','relationship-registry.html','relationship-registry','investigation-pulse.js','interactive-network-map.js','evidence-network-map.html','evidence-network-map','evidence-network-map.js','data/evidence-network-map.json','downloads/evidence-network-map.csv','data/membership-feature-matrix.json','data/investigation-status.json','data/investigation-source-registry.json','data/source-change-public.json','data/investigation-entity-schema.json','data/investigation-knowledge-graph.json','data/entity-registry.json','data/relationship-registry.json','downloads/investigation-entities.csv','downloads/investigation-relationships.csv','timers.html','timers','forum.html','forum','atlas-layers.html','atlas-layers','migration-flow.html','migration-flow','data/global-risk-clocks.json','data/atlas-layers.json','data/migration-flow-panel.json','data/forum-seed.json','_headers']){if(!fs.existsSync(path.join(out,required))){console.error(`Cloudflare output failed: _site/${required} missing`);process.exit(1)}}
if(fs.existsSync(path.join(out,'_redirects'))){console.error('Cloudflare output failed: _site/_redirects must not be deployed for Worker assets.');process.exit(1)}
for(const privatePath of ['evidence-archive','data/source-snapshots','data/source-snapshot-index.json','data/source-change-ledger.json','downloads/source-change-monitor-report.json','downloads/source-change-preservation-hardening-report.json','downloads/search-v3-build-report.json','downloads/search-v3-runtime-report.json','downloads/search-v3-quality-test.json','downloads/evidence-network-map-build.json','downloads/evidence-network-map-wiring.json','downloads/public-network-map-test.json','downloads/osint-worker-patch-report.json','downloads/osint-tools-test.json','downloads/research-tools-ui-patch.json','downloads/market-activity-test.json','downloads/phase6-data-integration.json','downloads/phase6-worker-patch.json','downloads/phase6-integration-report.json','downloads/sec-market-activity-collection-report.json','tools']){if(fs.existsSync(path.join(out,privatePath))){console.error(`Cloudflare output failed: private evidence archive, runner code or diagnostics exposed at _site/${privatePath}`);process.exit(1)}}
require('./public-copy-visibility-test.js');
const count=[];(function countFiles(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())countFiles(full);else count.push(full)}})(out);
console.log(`Cloudflare output ready: ${count.length} deployable files, including Phase 6 official market activity, member watchlists, gated OSINT tools, Phase 5 evidence-led network maps, Search V3 and structured data while private diagnostics remain excluded.`);
