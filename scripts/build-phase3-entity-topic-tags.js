const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.cwd();
const outputDir=process.env.PHASE3_TAG_OUTPUT_DIR?path.resolve(process.env.PHASE3_TAG_OUTPUT_DIR):path.join(root,'downloads','phase3-entity-topic-tags');
const policyPath=path.join(root,'data','phase3-entity-topic-tagging-policy.json');
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
function normalizeText(value){return String(value||'').toLowerCase().replace(/[’']/g,"'").replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function titleSubject(title){return String(title||'').replace(/\s+[|—–-]\s+Matrix Reprogrammed.*$/i,'').replace(/^Matrix Reprogrammed\s*[:|—–-]\s*/i,'').replace(/\s+/g,' ').trim();}
function pathMatches(sourcePath,prefixes){const lower=String(sourcePath||'').toLowerCase();return prefixes.some(prefix=>lower.startsWith(String(prefix).toLowerCase()));}
function interpretiveLabel(rule){if(rule==='association_boundary_required')return'speculative research hint — association not proof';if(rule==='scenario_boundary_required')return'speculative scenario analysis — not a factual forecast';if(rule==='interpretive_label_required')return'speculative or interpretive status must remain visible';return'evidence and claim status preserved';}
function publicVisibility(accessClass,policy){if(accessClass==='public_core')return policy.publicTagRules.publicCoreVisible;if(accessClass==='paid_private')return policy.publicTagRules.publicPreviewVisible;if(accessClass==='separate_product')return policy.publicTagRules.separateProductVisible;if(accessClass==='registered_private')return policy.publicTagRules.registeredPrivateVisible;if(accessClass==='internal_only')return policy.publicTagRules.internalVisible;if(accessClass==='restricted_sensitive')return policy.publicTagRules.restrictedVisible;return false;}

fs.rmSync(outputDir,{recursive:true,force:true});
run('scripts/build-phase3-public-private-classification.js');
const policy=readJson(policyPath);const classification=readJson(classificationPath);
if(policy.mode!=='plan-only'||classification.mode!=='report-only'||!classification.ok)throw new Error('Tagging requires healthy non-enforcing classification.');
const allowedTopics=new Set(policy.topicTags);const allowedEntityTypes=new Set(policy.allowedEntityTypes);
const rows=[];const entityReview=[];const tagCounts={};
for(const item of classification.rows){
  const provenance=[];const topics=[];
  for(const tag of policy.categoryDefaults[item.primaryCategory]||[]){topics.push(tag);provenance.push({tag,source:'category_default',value:item.primaryCategory});}
  for(const tag of policy.subcategoryTopicMap[item.primarySubcategory]||[]){topics.push(tag);provenance.push({tag,source:'subcategory_map',value:item.primarySubcategory});}
  const haystack=normalizeText(`${item.title} ${item.sourcePath} ${item.primaryCategory} ${item.primarySubcategory}`);
  for(const rule of policy.keywordTopicRules){if(rule.terms.some(term=>haystack.includes(normalizeText(term)))){topics.push(rule.tag);provenance.push({tag:rule.tag,source:'keyword_rule',value:rule.terms.filter(term=>haystack.includes(normalizeText(term)))});}}
  const controlledTopics=unique(topics).filter(tag=>allowedTopics.has(tag)).sort();
  if(!controlledTopics.length){controlledTopics.push('migration_review');provenance.push({tag:'migration_review',source:'fallback',value:'no controlled topic rule matched'});}
  const entityRule=policy.entityPathRules.find(rule=>pathMatches(item.sourcePath,rule.pathStartsWith));
  let entityType='none_identified';let entityName=null;let entityConfidence='not_applicable';let entityRole='none';let entitySource='no_entity_rule';
  if(entityRule){entityType=entityRule.entityType;entityName=titleSubject(item.title);entityConfidence=entityName&&entityName.length>=2?'medium_high':'low';entityRole=entityRule.role;entitySource='path_rule';}
  else if(['evidence_document','source_record'].includes(item.contentType)){entityType='document_or_source';entityName=titleSubject(item.title);entityConfidence='medium';entityRole='page_subject';entitySource='content_type';}
  else if(item.targetAccessClass==='separate_product'){entityType='product';entityName=titleSubject(item.title);entityConfidence='medium';entityRole='page_subject';entitySource='access_class';}
  else if(item.primaryCategory==='migration_review'){entityType='needs_editorial_review';entityConfidence='low';entityRole='unknown';entitySource='editorial_fallback';}
  if(!allowedEntityTypes.has(entityType))throw new Error(`${item.canonicalId}: invalid entity type ${entityType}`);
  const associationBoundary=entityType==='none_identified'?'No entity subject was asserted by the deterministic tagging rules.':'This entity tag identifies the apparent subject or directory type of the item. It does not establish wrongdoing, membership, coordination, control or a relationship to another tagged entity.';
  const reviewReasons=[];
  if(entityType==='needs_editorial_review')reviewReasons.push('entity-type-needs-editorial-review');
  if(entityRule&&(!entityName||entityName.length<2))reviewReasons.push('entity-name-extraction-failed');
  if(item.taxonomyOwnerRequired)reviewReasons.push('taxonomy-owner-required');
  if(item.interpretiveBoundaryRule!=='evidence_boundary_required')reviewReasons.push('interpretive-label-must-remain-visible');
  const visiblePublicly=publicVisibility(item.targetAccessClass,policy);
  const row={
    canonicalId:item.canonicalId,
    sourcePath:item.sourcePath,
    currentRoute:item.currentRoute,
    title:item.title,
    contentType:item.contentType,
    primaryCategory:item.primaryCategory,
    primarySubcategory:item.primarySubcategory,
    accessClass:item.targetAccessClass,
    minimumTier:item.minimumTier,
    topicTags:controlledTopics,
    tagProvenance:provenance,
    entityTag:{name:entityName,type:entityType,role:entityRole,confidence:entityConfidence,source:entitySource,associationBoundary},
    interpretiveBoundaryRule:item.interpretiveBoundaryRule,
    interpretiveLabel:interpretiveLabel(item.interpretiveBoundaryRule),
    publicTagVisibility:visiblePublicly,
    authenticatedTagVisibility:!['internal_only','restricted_sensitive'].includes(item.targetAccessClass),
    reviewRequired:reviewReasons.length>0,
    reviewReasons,
    factualStatusMutation:false,
    relationshipAssertion:false,
    contentMutation:false,
    routeMovement:false,
    searchMutation:false,
    navigationMutation:false
  };
  rows.push(row);
  if(row.reviewRequired)entityReview.push(row);
  for(const tag of controlledTopics)tagCounts[tag]=(tagCounts[tag]||0)+1;
}
const publicRows=rows.filter(row=>row.publicTagVisibility).map(row=>({canonicalId:row.canonicalId,currentRoute:row.currentRoute,title:row.title,contentType:row.contentType,primaryCategory:row.primaryCategory,primarySubcategory:row.primarySubcategory,topicTags:row.topicTags,entityTag:row.entityTag,interpretiveLabel:row.interpretiveLabel,associationBoundary:row.entityTag.associationBoundary}));
const entityCatalog=new Map();for(const row of rows){const entity=row.entityTag;if(!entity.name||['none_identified','needs_editorial_review'].includes(entity.type))continue;const key=`${entity.type}|${normalizeText(entity.name)}`;if(!entityCatalog.has(key))entityCatalog.set(key,{entityId:`entity:${entity.type}:${normalizeText(entity.name).replace(/\s+/g,'-').slice(0,120)}`,name:entity.name,type:entity.type,associationBoundary:entity.associationBoundary,itemIds:[]});entityCatalog.get(key).itemIds.push(row.canonicalId);}
const entities=[...entityCatalog.values()].map(entity=>({...entity,itemIds:unique(entity.itemIds).sort(),itemCount:unique(entity.itemIds).length})).sort((a,b)=>b.itemCount-a.itemCount||a.name.localeCompare(b.name));
const summary={totalItems:rows.length,publicTagItems:publicRows.length,authenticatedTagItems:rows.filter(row=>row.authenticatedTagVisibility).length,entityTaggedItems:rows.filter(row=>row.entityTag.name).length,noEntityIdentified:rows.filter(row=>row.entityTag.type==='none_identified').length,entityReviewItems:entityReview.length,uniqueEntities:entities.length,topicCoverage:Object.fromEntries(Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))),byEntityType:countBy(rows,row=>row.entityTag.type),byReviewReason:countBy(entityReview.flatMap(row=>row.reviewReasons.map(reason=>({reason}))),row=>row.reason)};
const invalidTopics=rows.flatMap(row=>row.topicTags.filter(tag=>!allowedTopics.has(tag)).map(tag=>({id:row.canonicalId,tag})));
const missingTopics=rows.filter(row=>!row.topicTags.length);
const relationshipAssertions=rows.filter(row=>row.relationshipAssertion||row.factualStatusMutation);
const report={ok:rows.length===classification.rows.length&&new Set(rows.map(row=>row.canonicalId)).size===rows.length&&!invalidTopics.length&&!missingTopics.length&&!relationshipAssertions.length,mode:'plan-only',version:policy.version,generatedAt:classification.generatedAt,tagEnforcement:false,contentMutation:false,routeMovement:false,searchMutation:false,navigationMutation:false,relationshipAssertion:false,lockedSectionEnforcement:false,authenticationActivation:false,entitlementActivation:false,paymentActivation:false,boundary:'Entity and topic tags are navigational metadata only. They do not establish guilt, membership, coordination, control or relationships.',summary,rows};
writeJson('item-tags.json',report);
writeJson('public-tag-index.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:publicRows.length,records:publicRows});
writeJson('entity-catalog.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:entities.length,records:entities});
writeJson('tag-catalog.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:policy.topicTags.length,records:policy.topicTags.map(tag=>({tag,itemCount:tagCounts[tag]||0}))});
writeJson('tag-review-queue.json',{ok:true,mode:'plan-only',generatedAt:report.generatedAt,recordCount:entityReview.length,records:entityReview});
const lines=['# Phase 3 Entity And Topic Tagging','',`Generated: ${report.generatedAt}`,`Mode: ${report.mode}`,'','## Boundary','',report.boundary,'','## Coverage','',`- Items tagged: ${summary.totalItems}`,`- Public-safe tag items: ${summary.publicTagItems}`,`- Entity-tagged items: ${summary.entityTaggedItems}`,`- Unique entities: ${summary.uniqueEntities}`,`- Entity or taxonomy review items: ${summary.entityReviewItems}`,'','## Topic coverage','',...Object.entries(summary.topicCoverage).map(([tag,count])=>`- ${tag}: ${count}`),'','## Exit condition','',policy.exitCondition];
writeText('summary.md',lines.join('\n')+'\n');
console.log(`PHASE 3 TAGGING: ${summary.totalItems} items; ${summary.uniqueEntities} entities; ${summary.entityReviewItems} review items.`);
console.log(`Output: ${outputDir}`);
if(!report.ok)process.exit(1);
