const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = process.env.PHASE3_REDIRECT_OUTPUT_DIR
  ? path.resolve(process.env.PHASE3_REDIRECT_OUTPUT_DIR)
  : path.join(root, 'downloads', 'phase3-redirect-map');
const policyPath = path.join(root, 'data', 'phase3-redirect-policy.json');
const classificationPath = path.join(root, 'downloads', 'phase3-public-private-classification', 'classification.json');
const ignoredDirs = new Set(['.git','node_modules','_site','.wrangler']);

function readJson(file) { return JSON.parse(fs.readFileSync(file,'utf8')); }
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,stableValue(value[key])]));
  return value;
}
function stableJson(value) { return JSON.stringify(stableValue(value),null,2) + '\n'; }
function ensureDir(target) { fs.mkdirSync(target,{recursive:true}); }
function writeJson(name,value) { ensureDir(outputDir); fs.writeFileSync(path.join(outputDir,name),stableJson(value)); }
function writeText(name,value) { ensureDir(outputDir); fs.writeFileSync(path.join(outputDir,name),value); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function countBy(items,getter) {
  const counts={}; for(const item of items){const key=String(getter(item)??'unknown');counts[key]=(counts[key]||0)+1;}
  return Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));
}
function walk(dir,out=[]) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(ignoredDirs.has(entry.name)) continue;
    const target=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(target,out); else out.push(path.relative(root,target).split(path.sep).join('/'));
  }
  return out;
}
function runClassification(){
  const result=spawnSync(process.execPath,['scripts/build-phase3-public-private-classification.js'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(result.status!==0) throw new Error(`Phase 3 classification failed\n${result.stdout||''}\n${result.stderr||''}`);
  process.stdout.write(result.stdout||'');
}
function normaliseRoute(value){
  if(!value) return null;
  try{
    const decoded=decodeURIComponent(String(value));
    const url=new URL(decoded,'https://matrixreprogrammed.com/');
    if(url.hostname!=='matrixreprogrammed.com') return null;
    let pathname=url.pathname.replace(/\\/g,'/').replace(/\/+/g,'/');
    if(!pathname.startsWith('/')) pathname=`/${pathname}`;
    if(pathname==='/index.html') pathname='/';
    return pathname;
  }catch{return null;}
}
function resolveLink(raw,baseRoute){
  if(!raw||/^(mailto:|tel:|javascript:|data:|#)/i.test(raw)) return null;
  try{
    const base=`https://matrixreprogrammed.com${baseRoute||'/'}`;
    const url=new URL(raw,base);
    if(url.hostname!=='matrixreprogrammed.com') return null;
    return normaliseRoute(url.pathname);
  }catch{return null;}
}
function extractLinks(html,baseRoute){
  const links=[]; const regex=/(?:href|src)\s*=\s*["']([^"']+)["']/gi; let match;
  while((match=regex.exec(html))) { const route=resolveLink(match[1],baseRoute); if(route) links.push(route); }
  return unique(links);
}
function extractNavLinks(html,baseRoute){
  const links=[]; const navRegex=/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi; let match;
  while((match=navRegex.exec(html))) links.push(...extractLinks(match[1],baseRoute));
  return unique(links);
}
function addReference(map,target,source){
  if(!map.has(target)) map.set(target,new Set());
  map.get(target).add(source);
}
function suffixRoute(route,suffix){
  if(route==='/') return `/home--${suffix}/`;
  const trailing=route.endsWith('/');
  const clean=trailing?route.slice(0,-1):route;
  const slash=clean.lastIndexOf('/');
  const parent=clean.slice(0,slash+1);
  const leaf=clean.slice(slash+1)||'item';
  const next=`${parent}${leaf}--${suffix}`;
  return trailing?`${next}/`:next;
}
function decisionFor(row,current,final){
  if(row.targetAccessClass==='internal_only') return 'plan_internalisation_after_public_replacement';
  if(row.targetAccessClass==='restricted_sensitive') return 'plan_restricted_review';
  if(row.primaryCategory==='migration_review') return 'plan_manual_route_review';
  if(row.targetAccessClass==='separate_product') return current===final?'keep_current_canonical':'plan_product_route_review';
  if(row.fileType!=='html_route') return current===final?'keep_current_canonical':'plan_asset_route_migration';
  return current===final?'keep_current_canonical':'plan_permanent_redirect';
}
function historicalValue(row){
  const text=`${row.sourcePath} ${row.title} ${row.primarySubcategory}`.toLowerCase();
  const markers=['correction','corrected','withdrawn','superseded','archive','historical','version','source-change'];
  const matches=markers.filter(marker=>text.includes(marker));
  return {retainAsHistoricalRoute:matches.length>0,markers:matches};
}

runClassification();
const policy=readJson(policyPath);
const classification=readJson(classificationPath);
if(policy.mode!=='plan-only'||classification.mode!=='report-only'||!classification.ok) throw new Error('Redirect planning requires healthy non-enforcing inputs.');
fs.rmSync(outputDir,{recursive:true,force:true});

const currentOwner=new Map();
for(const row of classification.rows){
  const route=normaliseRoute(row.currentRoute);
  if(route){if(!currentOwner.has(route)) currentOwner.set(route,[]);currentOwner.get(route).push(row.canonicalId);}
}
const proposedGroups=new Map();
for(const row of classification.rows){
  const proposed=normaliseRoute(row.proposedCanonicalRoute)||normaliseRoute(row.currentRoute);
  if(!proposedGroups.has(proposed)) proposedGroups.set(proposed,[]);
  proposedGroups.get(proposed).push(row.canonicalId);
}
const initialDestinations=new Map();
for(const row of classification.rows){
  const current=normaliseRoute(row.currentRoute);
  let proposed=normaliseRoute(row.proposedCanonicalRoute)||current;
  const collidesByProposal=(proposedGroups.get(proposed)||[]).length>1;
  const occupiedByOther=(currentOwner.get(proposed)||[]).some(id=>id!==row.canonicalId);
  if(collidesByProposal||occupiedByOther) proposed=suffixRoute(proposed,sha256(row.canonicalId).slice(0,policy.collisionStrategy.suffixLength));
  initialDestinations.set(row.canonicalId,proposed);
}
const destinationGroups=new Map();
for(const [id,route] of initialDestinations){if(!destinationGroups.has(route)) destinationGroups.set(route,[]);destinationGroups.get(route).push(id);}
for(const [route,ids] of destinationGroups){
  if(ids.length>1) for(const id of ids) initialDestinations.set(id,suffixRoute(route,sha256(id).slice(0,policy.collisionStrategy.suffixLength)));
}

const inbound=new Map(); const navigation=new Map(); const canonicalRefs=new Map();
for(const row of classification.rows){
  if(row.fileType!=='html_route') continue;
  const file=path.join(root,row.sourcePath); if(!fs.existsSync(file)) continue;
  const html=fs.readFileSync(file,'utf8');
  const base=normaliseRoute(row.currentRoute)||'/';
  for(const target of extractLinks(html,base)) addReference(inbound,target,row.sourcePath);
  for(const target of extractNavLinks(html,base)) addReference(navigation,target,row.sourcePath);
  const canonicalRegex=/<link\b[^>]*rel=["'][^"']*(?:canonical|alternate)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi; let match;
  while((match=canonicalRegex.exec(html))){const target=resolveLink(match[1],base);if(target)addReference(canonicalRefs,target,row.sourcePath);}
}

const searchRefs=new Map();
const referenceFiles=walk(root).filter(file=>{
  const ext=path.extname(file).toLowerCase(); const lower=file.toLowerCase();
  if(!['.json','.xml','.txt'].includes(ext)) return false;
  return /search|index|sitemap|manifest|navigation|routes/.test(lower) && !lower.startsWith('downloads/phase3-');
});
const knownRoutes=new Set(classification.rows.map(row=>normaliseRoute(row.currentRoute)).filter(Boolean));
for(const file of referenceFiles){
  let text; try{text=fs.readFileSync(path.join(root,file),'utf8');}catch{continue;}
  const candidateRegex=/\/[A-Za-z0-9_./%-]+(?:\.html|\.pdf|\.csv|\.json|\.zip|\/)/g;
  const candidates=unique(text.match(candidateRegex)||[]).map(normaliseRoute).filter(Boolean);
  for(const route of candidates) if(knownRoutes.has(route)) addReference(searchRefs,route,file);
}

const rows=[];
for(const row of classification.rows){
  const current=normaliseRoute(row.currentRoute);
  const proposed=normaliseRoute(row.proposedCanonicalRoute)||current;
  const final=initialDestinations.get(row.canonicalId);
  const decision=decisionFor(row,current,final);
  const history=historicalValue(row);
  const collisionReasons=[];
  if((proposedGroups.get(proposed)||[]).length>1) collisionReasons.push('proposed_destination_collision');
  if((currentOwner.get(proposed)||[]).some(id=>id!==row.canonicalId)) collisionReasons.push('destination_occupied_by_existing_route');
  rows.push({
    canonicalId:row.canonicalId,
    sourcePath:row.sourcePath,
    fileType:row.fileType,
    title:row.title,
    primaryCategory:row.primaryCategory,
    primarySubcategory:row.primarySubcategory,
    targetAccessClass:row.targetAccessClass,
    currentRoute:current,
    proposedCanonicalRoute:proposed,
    finalCanonicalRoute:final,
    decision,
    plannedStatusCode:decision==='plan_permanent_redirect'?301:decision==='plan_asset_route_migration'?308:null,
    redirectActivated:false,
    routeMoved:false,
    collisionAdjusted:final!==proposed,
    collisionReasons,
    inboundReferences:[...(inbound.get(current)||new Set())].sort(),
    navigationReferences:[...(navigation.get(current)||new Set())].sort(),
    searchReferences:[...(searchRefs.get(current)||new Set())].sort(),
    canonicalOrAlternateReferences:[...(canonicalRefs.get(current)||new Set())].sort(),
    inboundReferenceCount:(inbound.get(current)||new Set()).size,
    navigationReferenceCount:(navigation.get(current)||new Set()).size,
    searchReferenceCount:(searchRefs.get(current)||new Set()).size,
    historicalValue:history,
    rollback:{
      currentRoute:current,
      destinationRoute:final,
      sourcePath:row.sourcePath,
      contentHash:row.exactContentHash,
      activationCommit:null,
      rollbackCommit:null
    },
    reviewFlags:unique([
      ...row.reviewFlags,
      ...collisionReasons,
      ...(decision==='plan_internalisation_after_public_replacement'?['public_replacement_required_before_internalisation']:[]),
      ...(history.retainAsHistoricalRoute?['historical_route_review_required']:[])
    ]),
    migrationState:'redirect_planned'
  });
}

const finalGroups=new Map();
for(const row of rows){if(!finalGroups.has(row.finalCanonicalRoute)) finalGroups.set(row.finalCanonicalRoute,[]);finalGroups.get(row.finalCanonicalRoute).push(row.canonicalId);}
const destinationCollisions=[...finalGroups.entries()].filter(([,ids])=>ids.length>1).map(([route,ids])=>({route,ids}));
const redirectEdges=new Map(rows.filter(row=>row.decision==='plan_permanent_redirect').map(row=>[row.currentRoute,row.finalCanonicalRoute]));
const chains=[]; const loops=[];
for(const [source,destination] of redirectEdges){
  if(redirectEdges.has(destination)) chains.push({source,destination,next:redirectEdges.get(destination)});
  const seen=new Set([source]); let cursor=destination;
  while(redirectEdges.has(cursor)){if(seen.has(cursor)){loops.push({source,at:cursor});break;}seen.add(cursor);cursor=redirectEdges.get(cursor);}
}
const unresolved=rows.filter(row=>!policy.decisionTypes.includes(row.decision)||!row.currentRoute||!row.finalCanonicalRoute);
const reviewQueue=rows.filter(row=>row.reviewFlags.length||!['keep_current_canonical','plan_permanent_redirect'].includes(row.decision));
const summary={
  totalItems:rows.length,
  byDecision:countBy(rows,row=>row.decision),
  collisionAdjusted:rows.filter(row=>row.collisionAdjusted).length,
  destinationCollisions:destinationCollisions.length,
  redirectChains:chains.length,
  redirectLoops:loops.length,
  unresolved:unresolved.length,
  totalInboundReferences:rows.reduce((sum,row)=>sum+row.inboundReferenceCount,0),
  totalNavigationReferences:rows.reduce((sum,row)=>sum+row.navigationReferenceCount,0),
  totalSearchReferences:rows.reduce((sum,row)=>sum+row.searchReferenceCount,0),
  historicalReviewRoutes:rows.filter(row=>row.historicalValue.retainAsHistoricalRoute).length,
  reviewQueue:reviewQueue.length
};
const report={
  ok:rows.length===classification.rows.length&&destinationCollisions.length===0&&chains.length===0&&loops.length===0&&unresolved.length===0,
  mode:'plan-only',version:policy.version,generatedAt:classification.generatedAt,
  redirectActivation:false,routeMovement:false,fileMovement:false,searchMutation:false,navigationMutation:false,contentDeletion:false,paymentActivation:false,
  boundary:'Redirect plan only. Existing routes and files remain unchanged until migration, search, navigation and rollback checks are approved.',
  summary,rows
};
writeJson('redirect-map.json',report);
writeJson('reference-map.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,records:rows.map(row=>({canonicalId:row.canonicalId,currentRoute:row.currentRoute,inboundReferences:row.inboundReferences,navigationReferences:row.navigationReferences,searchReferences:row.searchReferences,canonicalOrAlternateReferences:row.canonicalOrAlternateReferences}))});
writeJson('collision-report.json',{ok:destinationCollisions.length===0,mode:'plan-only',generatedAt:report.generatedAt,adjustedCount:summary.collisionAdjusted,destinationCollisions,redirectChains:chains,redirectLoops:loops});
writeJson('review-queue.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:reviewQueue.length,records:reviewQueue});
const lines=['# Phase 3 Redirect Map','',`Generated: ${report.generatedAt}`,`Mode: ${report.mode}`,'','## Safety boundary','',report.boundary,'','## Coverage','',`- Items: ${summary.totalItems}`,`- Collision-adjusted destinations: ${summary.collisionAdjusted}`,`- Remaining destination collisions: ${summary.destinationCollisions}`,`- Redirect chains: ${summary.redirectChains}`,`- Redirect loops: ${summary.redirectLoops}`,`- Unresolved routes: ${summary.unresolved}`,`- Inbound references: ${summary.totalInboundReferences}`,`- Navigation references: ${summary.totalNavigationReferences}`,`- Search references: ${summary.totalSearchReferences}`,`- Review queue: ${summary.reviewQueue}`,'','## Planned decisions','',...Object.entries(summary.byDecision).map(([key,value])=>`- ${key}: ${value}`),'','## Exit condition','',policy.exitCondition];
writeText('summary.md',lines.join('\n')+'\n');
console.log(`PHASE 3 REDIRECT MAP: ${rows.length} items; ${summary.collisionAdjusted} adjusted; ${summary.redirectLoops} loops; ${summary.redirectChains} chains.`);
console.log(`Output: ${outputDir}`);
if(!report.ok) process.exit(1);
