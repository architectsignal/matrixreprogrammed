const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {spawnSync}=require('child_process');

const root=process.cwd();
const outputDir=process.env.PHASE3_COMPLETION_OUTPUT_DIR?path.resolve(process.env.PHASE3_COMPLETION_OUTPUT_DIR):path.join(root,'downloads','phase3-completion-audit');

function readJson(rel){return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}
function stableValue(value){if(Array.isArray(value))return value.map(stableValue);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));return value;}
function stableJson(value){return JSON.stringify(stableValue(value),null,2)+'\n';}
function ensureDir(target){fs.mkdirSync(target,{recursive:true});}
function writeJson(name,value){ensureDir(outputDir);fs.writeFileSync(path.join(outputDir,name),stableJson(value));}
function writeText(name,value){ensureDir(outputDir);fs.writeFileSync(path.join(outputDir,name),value);}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function run(script){const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});if(result.status!==0)throw new Error(`${script} failed\n${result.stdout||''}\n${result.stderr||''}`);process.stdout.write(result.stdout||'');}
function protectedActions(value){return Object.entries(value||{}).filter(([,enabled])=>enabled).map(([name])=>name);}

fs.rmSync(outputDir,{recursive:true,force:true});
run('scripts/build-phase3-preview-generation.js');
run('scripts/build-phase3-related-content-links.js');

const policy=readJson('data/phase3-completion-policy.json');
const classification=readJson('downloads/phase3-public-private-classification/classification.json');
const tier=readJson('downloads/phase3-tier-matrix/tier-matrix.json');
const locks=readJson('downloads/phase3-locked-section-simulation/locked-section-decisions.json');
const leakage=readJson('downloads/phase3-locked-section-simulation/leakage-report.json');
const preview=readJson('downloads/phase3-preview-generation/manifest.json');
const previewCatalogue=readJson('downloads/phase3-preview-generation/catalogue.json');
const previewNavigation=readJson('downloads/phase3-preview-generation/navigation-report.json');
const redirect=readJson('downloads/phase3-redirect-map/redirect-map.json');
const search=readJson('downloads/phase3-search-repair/search-repair-plan.json');
const publicSearch=readJson('downloads/phase3-search-repair/public-search-index.json');
const authenticatedSearch=readJson('downloads/phase3-search-repair/authenticated-search-index.json');
const tags=readJson('downloads/phase3-entity-topic-tags/item-tags.json');
const tagReview=readJson('downloads/phase3-entity-topic-tags/tag-review-queue.json');
const related=readJson('downloads/phase3-related-content/related-content-plan.json');
const relatedDiscoverability=readJson('downloads/phase3-related-content/discoverability-report.json');
const relatedOrphans=readJson('downloads/phase3-related-content/orphan-review-queue.json');

const packages={classification,tier_matrix:tier,locked_section_simulation:locks,preview_generation:preview,redirect_map:redirect,search_repair:search,entity_topic_tags:tags,related_content:related};
const packageHealth=Object.fromEntries(Object.entries(packages).map(([name,value])=>[name,Boolean(value&&value.ok)]));
const counts={
  importantItems:classification.summary.totalItems,
  unresolvedTaxonomy:classification.summary.unresolvedTaxonomy,
  exactHashDuplicateCandidates:classification.summary.exactHashDuplicateCandidates,
  lockedSectionLeakage:leakage.failureCount,
  previewOrphans:previewNavigation.orphanCount,
  previewSafetyErrors:preview.summary.safetyErrors,
  redirectLoops:redirect.summary.redirectLoops,
  redirectChains:redirect.summary.redirectChains,
  redirectCollisions:redirect.summary.destinationCollisions,
  redirectUnresolved:redirect.summary.unresolved,
  resolvedProposedRouteCollisions:redirect.summary.collisionAdjusted,
  searchCompetingRoutes:search.summary.competingCanonicalRoutes,
  searchDuplicateIds:search.summary.duplicatePublicIds,
  searchPrivateLeakage:search.summary.privateLeakage,
  searchUnresolved:search.summary.unresolved,
  tagMissingTopics:tags.rows.filter(row=>!Array.isArray(row.topicTags)||!row.topicTags.length).length,
  tagInvalidTopics:0,
  relatedPublicLeakage:related.summary.publicLeakage,
  relatedDuplicateTargets:related.summary.duplicatePublicTargets,
  inaccessibleNonRestrictedItems:related.summary.inaccessibleNonRestrictedItems,
  publicSearchDocuments:publicSearch.recordCount,
  authenticatedSearchDocuments:authenticatedSearch.recordCount,
  publicPreviewPages:preview.summary.publicItemPreviews,
  topicTaggedItems:tags.summary.totalItems,
  publicRelatedLinks:related.summary.publicLinks,
  authenticatedRelatedLinks:related.summary.authenticatedLinks,
  tagReviewItems:tagReview.recordCount,
  relatedOrphanReviewItems:relatedOrphans.recordCount,
  previewReviewQueueItems:preview.summary.reviewQueueItems,
  redirectReviewQueueItems:redirect.summary.reviewQueue
};
const knownTopics=new Set(readJson('data/phase3-entity-topic-tagging-policy.json').topicTags);
counts.tagInvalidTopics=tags.rows.reduce((sum,row)=>sum+row.topicTags.filter(tag=>!knownTopics.has(tag)).length,0);

const idSets={
  classification:new Set(classification.rows.map(row=>row.canonicalId)),
  tier:new Set(tier.rows.map(row=>row.canonicalId)),
  locks:new Set(locks.rows.map(row=>row.canonicalId)),
  preview:new Set(previewCatalogue.records.map(row=>row.canonicalId)),
  redirect:new Set(redirect.rows.map(row=>row.canonicalId)),
  search:new Set(search.actions.map(row=>row.canonicalId)),
  tags:new Set(tags.rows.map(row=>row.canonicalId)),
  discoverability:new Set(relatedDiscoverability.records.map(row=>row.canonicalId))
};
const referenceIds=[...idSets.classification].sort();
const coverageMismatches=[];
for(const [name,set] of Object.entries(idSets)){
  const ids=[...set].sort();
  if(ids.length!==referenceIds.length||ids.some((id,index)=>id!==referenceIds[index]))coverageMismatches.push({package:name,recordCount:ids.length,missing:referenceIds.filter(id=>!set.has(id)).slice(0,100),extra:ids.filter(id=>!idSets.classification.has(id)).slice(0,100)});
}

const protectedStates={
  classification:protectedActions({paymentActivation:classification.paymentActivation,visibilityEnforcement:classification.visibilityEnforcement,routeMovement:classification.routeMovement,redirectActivation:classification.redirectActivation,searchRemoval:classification.searchRemoval,navigationRemoval:classification.navigationRemoval,authenticationActivation:classification.authenticationActivation,entitlementActivation:classification.entitlementActivation}),
  tier:protectedActions({lockedSectionEnforcement:tier.lockedSectionEnforcement,authenticationActivation:tier.authenticationActivation,entitlementActivation:tier.entitlementActivation,emailDeliveryActivation:tier.emailDeliveryActivation,paymentActivation:tier.paymentActivation,routeMovement:tier.routeMovement,searchRemoval:tier.searchRemoval,contentMutation:tier.contentMutation}),
  locks:protectedActions({enforcement:locks.enforcement,authentication:locks.authentication,entitlements:locks.entitlements,emailDelivery:locks.emailDelivery,payment:locks.payment,routeMovement:locks.routeMovement,searchMutation:locks.searchMutation,contentMutation:locks.contentMutation}),
  preview:protectedActions({routeMovement:preview.routeMovement,redirectActivation:preview.redirectActivation,searchMutation:preview.searchMutation,navigationMutation:preview.navigationMutation,lockedSectionEnforcement:preview.lockedSectionEnforcement,authenticationActivation:preview.authenticationActivation,entitlementActivation:preview.entitlementActivation,emailDeliveryActivation:preview.emailDeliveryActivation,paymentActivation:preview.paymentActivation,contentMutation:preview.contentMutation}),
  redirect:protectedActions({redirectActivation:redirect.redirectActivation,routeMovement:redirect.routeMovement,fileMovement:redirect.fileMovement,searchMutation:redirect.searchMutation,navigationMutation:redirect.navigationMutation,contentDeletion:redirect.contentDeletion,paymentActivation:redirect.paymentActivation}),
  search:protectedActions({searchMutation:search.searchMutation,searchRemoval:search.searchRemoval,routeMovement:search.routeMovement,redirectActivation:search.redirectActivation,lockedSectionEnforcement:search.lockedSectionEnforcement,authenticationActivation:search.authenticationActivation,entitlementActivation:search.entitlementActivation,paymentActivation:search.paymentActivation,contentMutation:search.contentMutation}),
  tags:protectedActions({tagEnforcement:tags.tagEnforcement,contentMutation:tags.contentMutation,routeMovement:tags.routeMovement,searchMutation:tags.searchMutation,navigationMutation:tags.navigationMutation,relationshipAssertion:tags.relationshipAssertion,lockedSectionEnforcement:tags.lockedSectionEnforcement,authenticationActivation:tags.authenticationActivation,entitlementActivation:tags.entitlementActivation,paymentActivation:tags.paymentActivation}),
  related:protectedActions({navigationMutation:related.navigationMutation,contentMutation:related.contentMutation,routeMovement:related.routeMovement,searchMutation:related.searchMutation,relationshipAssertion:related.relationshipAssertion,lockedSectionEnforcement:related.lockedSectionEnforcement,authenticationActivation:related.authenticationActivation,entitlementActivation:related.entitlementActivation,paymentActivation:related.paymentActivation})
};
const activatedProtectedActions=Object.entries(protectedStates).filter(([,actions])=>actions.length).map(([packageName,actions])=>({package:packageName,actions}));
const zeroFailures=[];
for(const key of policy.requiredZeroCounts){if(Number(counts[key]||0)!==0)zeroFailures.push({metric:key,value:counts[key]});}
if(counts.redirectUnresolved!==0)zeroFailures.push({metric:'redirectUnresolved',value:counts.redirectUnresolved});
const minimumFailures=[];
for(const [metric,minimum] of Object.entries(policy.minimums)){if(Number(counts[metric]||0)<minimum)minimumFailures.push({metric,value:counts[metric],minimum});}
const duplicateCanonicalRoutes={
  redirectFinal:redirect.rows.length-new Set(redirect.rows.map(row=>row.finalCanonicalRoute)).size,
  publicSearch:publicSearch.records.length-new Set(publicSearch.records.map(row=>row.canonicalRoute)).size
};
const duplicateFailures=Object.entries(duplicateCanonicalRoutes).filter(([,count])=>count>0).map(([surface,count])=>({surface,count}));
const inaccessible=relatedDiscoverability.inaccessibleNonRestricted||[];
const complete=Object.values(packageHealth).every(Boolean)&&coverageMismatches.length===0&&zeroFailures.length===0&&minimumFailures.length===0&&duplicateFailures.length===0&&activatedProtectedActions.length===0&&inaccessible.length===0;
const readiness={
  ok:complete,
  mode:'audit-only',
  version:policy.version,
  generatedAt:classification.generatedAt,
  phase3PlanComplete:complete,
  liveMigrationReady:false,
  liveMigrationBlockedReasons:[
    'This programme remains report-only, simulation-only and preview-only.',
    'Authentication and entitlement enforcement are not active.',
    'Email delivery and payment lifecycles are not active.',
    'Redirects, search repair and navigation links are plans, not live mutations.',
    'Outstanding editorial review queues require human review before migration waves.'
  ],
  exitCondition:policy.exitCondition,
  packageHealth,
  counts,
  coverageMismatches,
  zeroFailures,
  minimumFailures,
  duplicateFailures,
  activatedProtectedActions,
  outstandingReview:{tagReviewItems:counts.tagReviewItems,relatedOrphanReviewItems:counts.relatedOrphanReviewItems,previewReviewQueueItems:counts.previewReviewQueueItems,redirectReviewQueueItems:counts.redirectReviewQueueItems,allowedClasses:policy.allowedOutstandingReview},
  boundary:'Phase 3 structural planning may be complete while live migration remains explicitly disabled. This audit does not move routes, enforce access, modify search or navigation, send email or take payment.'
};
writeJson('readiness.json',readiness);
writeJson('coverage-report.json',{ok:coverageMismatches.length===0,mode:'audit-only',generatedAt:readiness.generatedAt,recordCount:referenceIds.length,packageCounts:Object.fromEntries(Object.entries(idSets).map(([name,set])=>[name,set.size])),mismatches:coverageMismatches});
writeJson('zero-count-report.json',{ok:zeroFailures.length===0,mode:'audit-only',generatedAt:readiness.generatedAt,required:policy.requiredZeroCounts,counts:Object.fromEntries(policy.requiredZeroCounts.map(key=>[key,counts[key]||0])),failures:zeroFailures});
writeJson('protected-boundary-report.json',{ok:activatedProtectedActions.length===0,mode:'audit-only',generatedAt:readiness.generatedAt,liveMigrationReady:false,activatedProtectedActions,states:protectedStates});
writeJson('review-queues.json',{ok:true,mode:'audit-only',generatedAt:readiness.generatedAt,...readiness.outstandingReview});
const lines=['# Phase 3 Completion Audit','',`Generated: ${readiness.generatedAt}`,`Mode: ${readiness.mode}`,'',`## Decision: ${readiness.phase3PlanComplete?'PHASE 3 PLAN COMPLETE':'PHASE 3 PLAN NOT COMPLETE'}`,'',readiness.boundary,'','## Coverage','',...Object.entries(counts).map(([key,value])=>`- ${key}: ${value}`),'','## Package health','',...Object.entries(packageHealth).map(([name,healthy])=>`- ${name}: ${healthy?'healthy':'failed'}`),'','## Live migration boundary','',...readiness.liveMigrationBlockedReasons.map(reason=>`- ${reason}`),'','## Exit condition','',readiness.exitCondition];
writeText('summary.md',lines.join('\n')+'\n');
const hashes={};for(const file of fs.readdirSync(outputDir).sort()){if(file==='manifest.json')continue;hashes[file]=sha256(fs.readFileSync(path.join(outputDir,file)));}
writeJson('manifest.json',{ok:readiness.ok,mode:'audit-only',version:policy.version,generatedAt:readiness.generatedAt,phase3PlanComplete:readiness.phase3PlanComplete,liveMigrationReady:false,fileHashes:hashes,boundary:readiness.boundary});
console.log(`PHASE 3 COMPLETION AUDIT: ${readiness.phase3PlanComplete?'COMPLETE':'INCOMPLETE'}; ${counts.importantItems} important items; ${counts.unresolvedTaxonomy} uncategorized; ${counts.inaccessibleNonRestrictedItems} inaccessible.`);
console.log(`Output: ${outputDir}`);
if(!readiness.ok)process.exit(1);
