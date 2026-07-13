const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.cwd();
const outputDir=process.env.PHASE3_SEARCH_OUTPUT_DIR?path.resolve(process.env.PHASE3_SEARCH_OUTPUT_DIR):path.join(root,'downloads','phase3-search-repair');
const policyPath=path.join(root,'data','phase3-search-repair-policy.json');
const redirectPath=path.join(root,'downloads','phase3-redirect-map','redirect-map.json');
const tierPath=path.join(root,'downloads','phase3-tier-matrix','tier-matrix.json');
const classificationPath=path.join(root,'downloads','phase3-public-private-classification','classification.json');

function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function stableValue(value){if(Array.isArray(value))return value.map(stableValue);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));return value;}
function stableJson(value){return JSON.stringify(stableValue(value),null,2)+'\n';}
function ensureDir(target){fs.mkdirSync(target,{recursive:true});}
function writeJson(name,value){ensureDir(outputDir);fs.writeFileSync(path.join(outputDir,name),stableJson(value));}
function writeText(name,value){ensureDir(outputDir);fs.writeFileSync(path.join(outputDir,name),value);}
function unique(values){return[...new Set(values.filter(Boolean))];}
function countBy(items,getter){const counts={};for(const item of items){const key=String(getter(item)??'unknown');counts[key]=(counts[key]||0)+1;}return Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));}
function run(script){const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});if(result.status!==0)throw new Error(`${script} failed\n${result.stdout||''}\n${result.stderr||''}`);process.stdout.write(result.stdout||'');}
function summaryText(item){
  const type=String(item.contentType).replaceAll('_',' ');
  const category=String(item.primaryCategory).replaceAll('_',' ');
  const subcategory=String(item.primarySubcategory).replaceAll('_',' ');
  if(item.targetAccessClass==='separate_product')return `${item.title} is a public commercial ${type} in ${category} / ${subcategory}.`;
  if(item.publicPreviewRequired)return `${item.title} is an evidence-bounded public preview of a ${type} in ${category} / ${subcategory}; deeper structural sections require ${item.minimumTier}.`;
  return `${item.title} is a ${type} in ${category} / ${subcategory}.`;
}
function searchState(item,redirect){
  if(item.targetAccessClass==='internal_only')return'internal_noindex';
  if(item.targetAccessClass==='restricted_sensitive')return'restricted_noindex';
  if(item.targetAccessClass==='separate_product')return'commercial_index';
  if(item.targetAccessClass==='public_core')return redirect.historicalValue.retainAsHistoricalRoute?'historical_index':'public_index';
  if(item.publicPreviewRequired)return'public_preview_index';
  return'authenticated_noindex';
}
function repairActions(item,redirect,state){
  const actions=[];
  if(state==='public_index'||state==='historical_index')actions.push('keep_canonical_document');
  if(state==='public_preview_index')actions.push('create_public_preview_document');
  if(state==='commercial_index')actions.push('create_commercial_document');
  if(state==='authenticated_noindex')actions.push('create_authenticated_document');
  if(state==='internal_noindex')actions.push('mark_internal_noindex');
  if(state==='restricted_noindex')actions.push('mark_restricted_noindex');
  if(redirect.currentRoute!==redirect.finalCanonicalRoute)actions.push('replace_old_route_with_alias');
  if(redirect.searchReferenceCount>0&&redirect.currentRoute!==redirect.finalCanonicalRoute)actions.push('remove_obsolete_competing_document');
  if(item.primaryCategory==='migration_review')actions.push('manual_search_review');
  return unique(actions);
}
function interpretiveLabel(item){
  if(item.interpretiveBoundaryRule==='association_boundary_required')return'speculative research hint — association not proof';
  if(item.interpretiveBoundaryRule==='scenario_boundary_required')return'speculative scenario analysis — not a factual forecast';
  if(item.interpretiveBoundaryRule==='interpretive_label_required')return'speculative or interpretive status must remain visible';
  return'evidence and claim status preserved';
}

fs.rmSync(outputDir,{recursive:true,force:true});
run('scripts/build-phase3-redirect-map.js');
run('scripts/build-phase3-tier-matrix.js');
const policy=readJson(policyPath);const redirect=readJson(redirectPath);const tier=readJson(tierPath);const classification=readJson(classificationPath);
if(policy.mode!=='plan-only'||redirect.mode!=='plan-only'||tier.mode!=='report-only'||classification.mode!=='report-only'||!redirect.ok||!tier.ok||!classification.ok)throw new Error('Search repair requires healthy non-enforcing inputs.');
const redirectById=new Map(redirect.rows.map(row=>[row.canonicalId,row]));
const tierById=new Map(tier.rows.map(row=>[row.canonicalId,row]));
const publicDocuments=[];const authenticatedDocuments=[];const noindex=[];const aliases=[];const actions=[];
for(const item of classification.rows){
  const redirectRow=redirectById.get(item.canonicalId);const tierRow=tierById.get(item.canonicalId);
  if(!redirectRow||!tierRow)throw new Error(`${item.canonicalId}: redirect or tier row missing`);
  const state=searchState(tierRow,redirectRow);const actionList=repairActions(tierRow,redirectRow,state);
  const base={
    canonicalId:item.canonicalId,
    canonicalRoute:redirectRow.finalCanonicalRoute,
    currentRoute:redirectRow.currentRoute,
    title:item.title,
    summary:summaryText(tierRow),
    contentType:item.contentType,
    primaryCategory:item.primaryCategory,
    primarySubcategory:item.primarySubcategory,
    accessClass:item.targetAccessClass,
    minimumTier:tierRow.minimumTier,
    publicViewState:tierRow.views.public.state,
    interpretiveBoundaryRule:tierRow.interpretiveBoundaryRule,
    interpretiveLabel:interpretiveLabel(tierRow),
    currentReviewStatus:item.migrationState,
    factualStatusInvariantKey:tierRow.factualStatusInvariant.invariantKey
  };
  if(['public_index','public_preview_index','commercial_index','historical_index'].includes(state)){
    publicDocuments.push({...base,searchState:state,publicSafetySections:tierRow.requiredPublicSafetySections,memberSectionsIncluded:false,privateDownloadsIncluded:false,internalDataIncluded:false,restrictedDataIncluded:false});
  }
  if(!['internal_noindex','restricted_noindex','commercial_index'].includes(state)){
    const visibleTiers=policy.authenticatedTiers.filter(memberTier=>tierRow.views[memberTier]?.state==='full');
    authenticatedDocuments.push({...base,searchState:'authenticated_index',visibleTiers,fullSectionsByTier:Object.fromEntries(visibleTiers.map(memberTier=>[memberTier,tierRow.views[memberTier].sections])),filterRequired:true});
  }
  if(['authenticated_noindex','internal_noindex','restricted_noindex'].includes(state))noindex.push({...base,searchState:state,reason:state.replaceAll('_',' ')});
  if(redirectRow.currentRoute!==redirectRow.finalCanonicalRoute)aliases.push({aliasRoute:redirectRow.currentRoute,canonicalRoute:redirectRow.finalCanonicalRoute,canonicalId:item.canonicalId,indexAsDocument:false,redirectActivated:false});
  actions.push({canonicalId:item.canonicalId,sourcePath:item.sourcePath,currentRoute:redirectRow.currentRoute,canonicalRoute:redirectRow.finalCanonicalRoute,searchState:state,existingSearchReferences:redirectRow.searchReferences,existingSearchReferenceCount:redirectRow.searchReferenceCount,actions:actionList,searchMutation:false,migrationState:'search_repaired'});
}
const publicRouteGroups=new Map();for(const doc of publicDocuments){if(!publicRouteGroups.has(doc.canonicalRoute))publicRouteGroups.set(doc.canonicalRoute,[]);publicRouteGroups.get(doc.canonicalRoute).push(doc.canonicalId);}
const competingRoutes=[...publicRouteGroups.entries()].filter(([,ids])=>ids.length>1).map(([route,ids])=>({route,ids}));
const publicIdDuplicates=publicDocuments.length-new Set(publicDocuments.map(doc=>doc.canonicalId)).size;
const privateLeakage=publicDocuments.filter(doc=>doc.memberSectionsIncluded||doc.privateDownloadsIncluded||doc.internalDataIncluded||doc.restrictedDataIncluded);
const unresolved=actions.filter(item=>!item.searchState||!item.actions.length);
const summary={
  totalItems:actions.length,
  publicDocuments:publicDocuments.length,
  authenticatedDocuments:authenticatedDocuments.length,
  noindexItems:noindex.length,
  routeAliases:aliases.length,
  bySearchState:countBy(actions,item=>item.searchState),
  byRepairAction:countBy(actions.flatMap(item=>item.actions.map(action=>({action}))),item=>item.action),
  competingCanonicalRoutes:competingRoutes.length,
  duplicatePublicIds:publicIdDuplicates,
  privateLeakage:privateLeakage.length,
  unresolved:unresolved.length,
  referencedOldRoutes:actions.filter(item=>item.existingSearchReferenceCount>0).length
};
const report={
  ok:actions.length===classification.rows.length&&competingRoutes.length===0&&publicIdDuplicates===0&&privateLeakage.length===0&&unresolved.length===0,
  mode:'plan-only',version:policy.version,generatedAt:classification.generatedAt,
  searchMutation:false,searchRemoval:false,routeMovement:false,redirectActivation:false,lockedSectionEnforcement:false,authenticationActivation:false,entitlementActivation:false,paymentActivation:false,contentMutation:false,
  boundary:'Search repair plan only. It creates proposed canonical documents, aliases and noindex decisions without modifying the live search index or routes.',
  summary,actions
};
writeJson('search-repair-plan.json',report);
writeJson('public-search-index.json',{ok:privateLeakage.length===0,mode:'plan-only',generatedAt:report.generatedAt,recordCount:publicDocuments.length,records:publicDocuments});
writeJson('authenticated-search-index.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:authenticatedDocuments.length,records:authenticatedDocuments});
writeJson('noindex-manifest.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:noindex.length,records:noindex});
writeJson('route-aliases.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:aliases.length,records:aliases});
writeJson('competition-report.json',{ok:competingRoutes.length===0&&publicIdDuplicates===0,mode:'plan-only',generatedAt:report.generatedAt,competingCanonicalRoutes:competingRoutes,duplicatePublicIds:publicIdDuplicates,privateLeakage:privateLeakage.map(doc=>doc.canonicalId)});
const lines=['# Phase 3 Search Repair','',`Generated: ${report.generatedAt}`,`Mode: ${report.mode}`,'','## Safety boundary','',report.boundary,'','## Coverage','',`- Items: ${summary.totalItems}`,`- Public search documents: ${summary.publicDocuments}`,`- Authenticated search documents: ${summary.authenticatedDocuments}`,`- Noindex items: ${summary.noindexItems}`,`- Route aliases: ${summary.routeAliases}`,`- Competing canonical routes: ${summary.competingCanonicalRoutes}`,`- Private leakage: ${summary.privateLeakage}`,`- Unresolved: ${summary.unresolved}`,'','## Search states','',...Object.entries(summary.bySearchState).map(([key,value])=>`- ${key}: ${value}`),'','## Exit condition','',policy.exitCondition];
writeText('summary.md',lines.join('\n')+'\n');
console.log(`PHASE 3 SEARCH REPAIR: ${summary.publicDocuments} public docs; ${summary.authenticatedDocuments} authenticated docs; ${summary.privateLeakage} leaks.`);
console.log(`Output: ${outputDir}`);
if(!report.ok)process.exit(1);
