const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.cwd();
const outputDir=process.env.PHASE3_RELATED_OUTPUT_DIR?path.resolve(process.env.PHASE3_RELATED_OUTPUT_DIR):path.join(root,'downloads','phase3-related-content');
const policyPath=path.join(root,'data','phase3-related-content-policy.json');
const tagsPath=path.join(root,'downloads','phase3-entity-topic-tags','item-tags.json');
const searchPlanPath=path.join(root,'downloads','phase3-search-repair','search-repair-plan.json');
const publicSearchPath=path.join(root,'downloads','phase3-search-repair','public-search-index.json');
const authSearchPath=path.join(root,'downloads','phase3-search-repair','authenticated-search-index.json');
const tierPath=path.join(root,'downloads','phase3-tier-matrix','tier-matrix.json');

function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function stableValue(value){if(Array.isArray(value))return value.map(stableValue);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));return value;}
function stableJson(value){return JSON.stringify(stableValue(value),null,2)+'\n';}
function ensureDir(target){fs.mkdirSync(target,{recursive:true});}
function writeJson(name,value){ensureDir(outputDir);fs.writeFileSync(path.join(outputDir,name),stableJson(value));}
function writeText(name,value){ensureDir(outputDir);fs.writeFileSync(path.join(outputDir,name),value);}
function unique(values){return[...new Set(values.filter(Boolean))];}
function normalize(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function countBy(items,getter){const counts={};for(const item of items){const key=String(getter(item)??'unknown');counts[key]=(counts[key]||0)+1;}return Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));}
function run(script){const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});if(result.status!==0)throw new Error(`${script} failed\n${result.stdout||''}\n${result.stderr||''}`);process.stdout.write(result.stdout||'');}
function complementary(policy,a,b){return(policy.complementaryContentTypes[a]||[]).includes(b)||(policy.complementaryContentTypes[b]||[]).includes(a);}
function scorePair(policy,source,target){
  let score=0;const reasons=[];
  if(source.primarySubcategory===target.primarySubcategory){score+=policy.scores.samePrimarySubcategory;reasons.push('same_primary_subcategory');}
  else if(source.primaryCategory===target.primaryCategory){score+=policy.scores.samePrimaryCategory;reasons.push('same_primary_category');}
  const sourceEntity=source.entityTag?.name&&normalize(source.entityTag.name);const targetEntity=target.entityTag?.name&&normalize(target.entityTag.name);
  if(sourceEntity&&targetEntity&&sourceEntity===targetEntity&&source.entityTag.type===target.entityTag.type){score+=policy.scores.sameSubjectLabel;reasons.push('same_subject_label');}
  const sharedTopics=source.topicTags.filter(tag=>target.topicTags.includes(tag));
  if(sharedTopics.length){score+=Math.min(policy.scores.sharedTopicMaximum,sharedTopics.length*policy.scores.sharedTopicPerTag);reasons.push('shared_topic');}
  if(complementary(policy,source.contentType,target.contentType)){score+=policy.scores.complementaryContentType;reasons.push('complementary_content_type');}
  if(source.interpretiveBoundaryRule===target.interpretiveBoundaryRule){score+=policy.scores.sameInterpretiveBoundary;reasons.push('same_interpretive_boundary');}
  if(source.accessClass===target.accessClass)score+=policy.scores.sameAccessClass;
  if(target.accessClass==='separate_product'){score+=policy.scores.commercialPenalty;reasons.push('commercial_related');}
  if(target.primaryCategory==='migration_review')score+=policy.scores.manualReviewPenalty;
  return{score,reasons:unique(reasons),sharedTopics};
}
function selectLinks(policy,source,candidates,limit,publicMode){
  const scored=[];
  for(const target of candidates){if(target.canonicalId===source.canonicalId)continue;const result=scorePair(policy,source,target);if(result.score<policy.limits.minimumScore)continue;scored.push({target,result});}
  scored.sort((a,b)=>b.result.score-a.result.score||a.target.title.localeCompare(b.target.title)||a.target.canonicalId.localeCompare(b.target.canonicalId));
  const selected=[];const subcategoryCounts={};const contentTypeCounts={};let commercialCount=0;
  for(const item of scored){
    const target=item.target;
    if((subcategoryCounts[target.primarySubcategory]||0)>=policy.limits.maximumSameSubcategoryLinks)continue;
    if((contentTypeCounts[target.contentType]||0)>=policy.limits.maximumSameContentTypeLinks)continue;
    if(target.accessClass==='separate_product'&&commercialCount>=policy.limits.commercialLinksPerItem)continue;
    selected.push({
      canonicalId:target.canonicalId,
      canonicalRoute:target.canonicalRoute,
      title:target.title,
      contentType:target.contentType,
      primaryCategory:target.primaryCategory,
      primarySubcategory:target.primarySubcategory,
      accessClass:target.accessClass,
      minimumTier:target.minimumTier,
      score:item.result.score,
      reasons:item.result.reasons,
      reasonLabels:item.result.reasons.map(reason=>policy.reasonLabels[reason]).filter(Boolean),
      sharedTopics:item.result.sharedTopics,
      interpretiveLabel:target.interpretiveLabel,
      associationBoundary:'This recommendation is based on shared taxonomy, controlled topics, content format or the same deterministic subject label. It does not establish an external relationship, guilt, coordination or control.',
      protectedBodyIncluded:false,
      entitlementBypass:false,
      navigationActivated:false,
      surface:publicMode?'public_related_preview':'authenticated_related'
    });
    subcategoryCounts[target.primarySubcategory]=(subcategoryCounts[target.primarySubcategory]||0)+1;
    contentTypeCounts[target.contentType]=(contentTypeCounts[target.contentType]||0)+1;
    if(target.accessClass==='separate_product')commercialCount++;
    if(selected.length>=limit)break;
  }
  return selected;
}

fs.rmSync(outputDir,{recursive:true,force:true});
run('scripts/build-phase3-search-repair.js');
run('scripts/build-phase3-entity-topic-tags.js');
const policy=readJson(policyPath);const tags=readJson(tagsPath);const searchPlan=readJson(searchPlanPath);const publicSearch=readJson(publicSearchPath);const authSearch=readJson(authSearchPath);const tier=readJson(tierPath);
if(policy.mode!=='plan-only'||tags.mode!=='plan-only'||searchPlan.mode!=='plan-only'||tier.mode!=='report-only'||!tags.ok||!searchPlan.ok||!publicSearch.ok||!authSearch.ok||!tier.ok)throw new Error('Related-content planning requires healthy non-enforcing inputs.');
const routeById=new Map(searchPlan.actions.map(row=>[row.canonicalId,row.canonicalRoute]));
const tierById=new Map(tier.rows.map(row=>[row.canonicalId,row]));
const tagById=new Map(tags.rows.map(row=>[row.canonicalId,row]));
const all=tags.rows.map(row=>{const tierRow=tierById.get(row.canonicalId);if(!tierRow)throw new Error(`${row.canonicalId}: tier row missing`);return{...row,canonicalRoute:routeById.get(row.canonicalId),views:tierRow.views};});
const publicIds=new Set(publicSearch.records.map(row=>row.canonicalId));
const authById=new Map(authSearch.records.map(row=>[row.canonicalId,row]));
const publicCandidates=all.filter(row=>publicIds.has(row.canonicalId));
const authCandidates=all.filter(row=>authById.has(row.canonicalId));
const publicRecords=[];const authenticatedRecords=[];const orphanRecords=[];
for(const source of all){
  if(publicIds.has(source.canonicalId)){
    const links=selectLinks(policy,source,publicCandidates,policy.limits.publicLinksPerItem,true);
    publicRecords.push({canonicalId:source.canonicalId,canonicalRoute:source.canonicalRoute,title:source.title,interpretiveLabel:source.interpretiveLabel,linkCount:links.length,links,boundary:'Public related links expose only public core, evidence-bounded previews or commercial landing pages. They do not expose protected body content.'});
    if(links.length<policy.limits.minimumPublicLinksWhenCandidatesExist&&publicCandidates.length>1)orphanRecords.push({canonicalId:source.canonicalId,surface:'public',linkCount:links.length,reason:'fewer-than-minimum-public-related-links',reviewRequired:true});
  }
  if(authById.has(source.canonicalId)){
    const byTier={};
    for(const memberTier of policy.authenticatedTiers){
      const sourceVisible=source.views[memberTier]?.state==='full';
      if(!sourceVisible){byTier[memberTier]={available:false,linkCount:0,links:[]};continue;}
      const candidates=authCandidates.filter(target=>target.views[memberTier]?.state==='full');
      const links=selectLinks(policy,source,candidates,policy.limits.authenticatedLinksPerTierPerItem,false);
      byTier[memberTier]={available:true,linkCount:links.length,links};
      if(links.length<policy.limits.minimumAuthenticatedLinksWhenCandidatesExist&&candidates.length>1)orphanRecords.push({canonicalId:source.canonicalId,surface:`authenticated:${memberTier}`,linkCount:links.length,reason:'fewer-than-minimum-authenticated-related-links',reviewRequired:true});
    }
    authenticatedRecords.push({canonicalId:source.canonicalId,canonicalRoute:source.canonicalRoute,title:source.title,byTier,boundary:'Authenticated related links remain tier-filtered and do not bypass locked-section decisions.'});
  }
}
const publicTargetIds=new Set(publicRecords.flatMap(record=>record.links.map(link=>link.canonicalId)));
const authTargetIds=new Set(authenticatedRecords.flatMap(record=>Object.values(record.byTier).flatMap(view=>view.links.map(link=>link.canonicalId))));
const discoverability=all.map(row=>({canonicalId:row.canonicalId,canonicalRoute:row.canonicalRoute,publicSource:publicIds.has(row.canonicalId),publicInbound:publicTargetIds.has(row.canonicalId),authenticatedSource:authById.has(row.canonicalId),authenticatedInbound:authTargetIds.has(row.canonicalId),internalOrRestricted:['internal_only','restricted_sensitive'].includes(row.accessClass),taxonomyOwnerRequired:row.reviewReasons.includes('taxonomy-owner-required')}));
const inaccessible=discoverability.filter(row=>!row.internalOrRestricted&&!row.publicSource&&!row.authenticatedSource);
const publicLeakage=publicRecords.flatMap(record=>record.links.filter(link=>!publicIds.has(link.canonicalId)).map(link=>({source:record.canonicalId,target:link.canonicalId})));
const relationshipAssertions=[...publicRecords,...authenticatedRecords].filter(record=>record.relationshipAssertion);
const duplicatePublicTargets=publicRecords.flatMap(record=>{const ids=record.links.map(link=>link.canonicalId);return ids.length===new Set(ids).size?[]:[record.canonicalId];});
const summary={totalItems:all.length,publicSourceItems:publicRecords.length,authenticatedSourceItems:authenticatedRecords.length,publicLinks:publicRecords.reduce((sum,row)=>sum+row.linkCount,0),authenticatedLinks:authenticatedRecords.reduce((sum,row)=>sum+Object.values(row.byTier).reduce((tierSum,view)=>tierSum+view.linkCount,0),0),orphanReviewItems:orphanRecords.length,inaccessibleNonRestrictedItems:inaccessible.length,publicLeakage:publicLeakage.length,duplicatePublicTargets:duplicatePublicTargets.length,publicInboundCoverage:publicTargetIds.size,authenticatedInboundCoverage:authTargetIds.size,byOrphanReason:countBy(orphanRecords,row=>row.reason)};
const report={ok:all.length===tags.rows.length&&new Set(publicRecords.map(row=>row.canonicalId)).size===publicRecords.length&&new Set(authenticatedRecords.map(row=>row.canonicalId)).size===authenticatedRecords.length&&!publicLeakage.length&&!relationshipAssertions.length&&!duplicatePublicTargets.length&&!inaccessible.length,mode:'plan-only',version:policy.version,generatedAt:tags.generatedAt,navigationMutation:false,contentMutation:false,routeMovement:false,searchMutation:false,relationshipAssertion:false,lockedSectionEnforcement:false,authenticationActivation:false,entitlementActivation:false,paymentActivation:false,boundary:'Related-content links are deterministic navigation recommendations only. Shared taxonomy, topics or subject labels do not establish external relationships.',summary};
writeJson('related-content-plan.json',report);
writeJson('public-related-links.json',{ok:publicLeakage.length===0,mode:'plan-only',generatedAt:report.generatedAt,recordCount:publicRecords.length,records:publicRecords});
writeJson('authenticated-related-links.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:authenticatedRecords.length,records:authenticatedRecords});
writeJson('discoverability-report.json',{ok:inaccessible.length===0,mode:'plan-only',generatedAt:report.generatedAt,recordCount:discoverability.length,inaccessibleNonRestricted:inaccessible,records:discoverability});
writeJson('orphan-review-queue.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:orphanRecords.length,records:orphanRecords});
const lines=['# Phase 3 Related Content Links','',`Generated: ${report.generatedAt}`,`Mode: ${report.mode}`,'','## Boundary','',report.boundary,'','## Coverage','',`- Items: ${summary.totalItems}`,`- Public source items: ${summary.publicSourceItems}`,`- Public related links: ${summary.publicLinks}`,`- Authenticated source items: ${summary.authenticatedSourceItems}`,`- Authenticated related links: ${summary.authenticatedLinks}`,`- Inaccessible non-restricted items: ${summary.inaccessibleNonRestrictedItems}`,`- Public leakage: ${summary.publicLeakage}`,`- Orphan review items: ${summary.orphanReviewItems}`,'','## Exit condition','',policy.exitCondition];
writeText('summary.md',lines.join('\n')+'\n');
console.log(`PHASE 3 RELATED CONTENT: ${summary.publicLinks} public links; ${summary.authenticatedLinks} authenticated links; ${summary.inaccessibleNonRestrictedItems} inaccessible.`);
console.log(`Output: ${outputDir}`);
if(!report.ok)process.exit(1);
