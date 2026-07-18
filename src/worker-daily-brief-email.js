function text(value,max=4000){return String(value??'').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function html(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function list(value){if(Array.isArray(value))return value.map(item=>text(typeof item==='string'?item:item?.title||item?.name||item?.record||item?.label||'',800)).filter(Boolean);if(value===undefined||value===null||value==='')return[];return[text(value,800)].filter(Boolean)}
function first(...values){for(const value of values){const clean=text(value,4000);if(clean)return clean}return''}
function sentence(value,fallback='Not established in the current source bundle.'){return first(value,fallback)}
function unique(values,limit=16){return[...new Set(values.filter(Boolean))].slice(0,limit)}
function route(baseUrl,value){const raw=text(value,500);if(!raw)return'';if(/^https?:\/\//i.test(raw))return raw;return`${String(baseUrl||'https://matrixreprogrammed.com').replace(/\/$/,'')}/${raw.replace(/^\//,'')}`}
function titleCase(value){return text(value,120).replace(/\b\w/g,char=>char.toUpperCase())}

function normalizedBrief(item,index,sourceData){
  const integrity=item?.integrity&&typeof item.integrity==='object'?item.integrity:{};
  const records=unique([...list(item?.records),...list(item?.recordsNeeded),...list(item?.missingEvidence)],12);
  const watch=unique([...list(item?.watch),...list(item?.watchNext),...list(item?.triggers)],10);
  const entities=unique([...list(item?.institutions),...list(item?.entities),...list(item?.keyEntities)],12);
  const pages=unique([...list(item?.pages),...list(item?.publicPageTargets),...list(item?.sourceLinks)],10);
  const situation=first(item?.situation,item?.summary,item?.description,item?.body,item?.finding);
  const meaning=first(item?.meaning,item?.whatItMeans,item?.mechanismOfPower,item?.conclusion);
  const likely=first(item?.likely,item?.likelyOutcome,item?.speculativeConclusion,integrity?.conclusion);
  const section=first(item?.section,item?.lane,item?.category,`Signal ${index+1}`);
  const confidence=first(item?.confidence,integrity?.confidence,'unrated');
  const recordStatus=first(item?.recordStatus,integrity?.classification,integrity?.freshness?`Evidence checkpoint ${integrity.freshness}`:'Evidence-graded analysis');
  const facts=unique([...list(item?.establishedFacts),...list(item?.facts)],10);
  if(!facts.length&&situation)facts.push(situation);
  const counter=first(item?.counterAnalysis,item?.counterEvidence,integrity?.counterEvidence,watch.length?`The conclusion should weaken if these watch conditions do not appear: ${watch.join('; ')}.`:'No counter-analysis was supplied by the source bundle.');
  const authority=first(item?.moneyAndAuthority,item?.moneyRoute,item?.authorityRoute,entities.length?`Authority and leverage should be tested through ${entities.join(', ')}. Financial influence is not established without filings, contracts, grants, custody records or another named money trail.`:'No named authority or money route is established in the current source bundle.');
  const convergence=first(item?.globalConvergenceAssessment,section.toLowerCase().includes('policy')?`The visible pattern is interoperability across access systems. This supports a convergence assessment, not proof of centralized command. The decisive tests are mandatory use, shared identifiers, cross-border data exchange, vendor concentration and appeal rights.`:`No global convergence claim should be made from this item alone. Cross-jurisdiction records, common standards, shared vendors or coordinated legal changes would be needed.`);
  return{
    id:first(item?.id,item?.signalId,item?.canonicalId,`DB-${String(index+1).padStart(3,'0')}`),
    section,
    headline:first(item?.headline,item?.title,item?.subject,section),
    trigger:first(item?.trigger,situation,'A tracked record, filing, policy change or source update entered the daily evidence bundle.'),
    primaryRecord:first(item?.primaryRecord,records[0],integrity?.sources?.[0],'No single primary record is designated; treat this as a synthesis pending a named source.'),
    recordStatus,
    establishedFacts:facts,
    keyEntities:entities,
    moneyAndAuthority:authority,
    mechanismOfPower:sentence(meaning),
    solidConclusion:sentence(item?.solidConclusion||meaning,'The current evidence supports continued monitoring but not a stronger conclusion.'),
    missionRelevance:first(item?.missionRelevance,`This matters to the Matrix Reprogrammed mission because it identifies how records, institutions, infrastructure, money or access systems shape public power.`),
    eliteControlRelevance:first(item?.eliteControlRelevance,`Relevant only where records show control over access, infrastructure, funding, custody, disclosure or enforcement. Association, status or institutional overlap alone is not proof of coordinated control.`),
    globalConvergenceAssessment:convergence,
    speculativeConclusion:sentence(likely,'No responsible speculative conclusion is available from the current source bundle.'),
    counterAnalysis:counter,
    missingEvidence:records,
    watchNext:watch,
    confidence,
    accessTier:first(item?.accessTier,'Public / Free Member evidence layer'),
    sourceLinks:pages,
    freshness:first(integrity?.freshness,item?.updatedAt,sourceData?.updated,sourceData?.generatedAt,sourceData?.updatedAt)
  };
}

export function normalizeBriefSource(source,{kind='daily',date=''}={}){
  const data=source?.data&&typeof source.data==='object'?source.data:{};
  const candidates=[data.briefings,data.sectionBriefings,data.records,data.items,data.findings,data.entries,data.results,data.cards,data.topSignals];
  const raw=candidates.find(Array.isArray)||[];
  const briefings=raw.slice(0,kind==='weekly'?12:8).map((item,index)=>normalizedBrief(item,index,data));
  const topConclusions=unique(list(data.topConclusions),8);
  const missingRecords=unique(list(data.missingRecords).map(item=>typeof item==='string'?item:first(item?.record,item?.title)),16);
  const watch=unique([...list(data.tomorrowWatchList),...list(data.watchNext),...briefings.flatMap(item=>item.watchNext)],16);
  const signals=Array.isArray(data.topSignals)?data.topSignals.slice(0,8).map((item,index)=>({id:first(item?.id,item?.signalId,`signal-${index+1}`),title:first(item?.title,item?.headline,`Signal ${index+1}`),lane:first(item?.lane,item?.section,'unclassified'),status:first(item?.status,item?.sourceStatus,'unrated'),why:first(item?.why,item?.whyItMatters,item?.summary)})):[];
  const summary=data.summary&&typeof data.summary==='object'?data.summary:{};
  return{
    kind,
    date:first(date,new Date().toISOString().slice(0,10)),
    title:kind==='weekly'?'Weekly Signal Drop':'Daily Control Brief',
    sourcePath:first(source?.pathname,'unknown source'),
    generatedAt:first(data.generatedAt,data.updatedAt,data.updated,new Date().toISOString()),
    boundary:first(data.boundary,'Records, reporting, analysis and speculation are separated. Association is not proof.'),
    executiveSummary:first(data.executiveSummary,data.purpose,topConclusions[0],briefings[0]?.solidConclusion,'No verified source changes were available for a deeper executive summary.'),
    topConclusions,
    briefings,
    signals,
    missingRecords,
    watchNext:watch,
    summary
  };
}

function bullets(items){return items.length?`<ul style="margin:8px 0 14px;padding-left:20px">${items.map(item=>`<li style="margin:6px 0">${html(item)}</li>`).join('')}</ul>`:'<p style="color:#b9aa82">No item was established in the current source bundle.</p>'}
function textBullets(items){return items.length?items.map(item=>`- ${item}`).join('\n'):'- No item was established in the current source bundle.'}
function field(label,value){return`<p style="margin:8px 0"><strong style="color:#d8b56a">${html(label)}:</strong> ${html(value)}</p>`}
function textField(label,value){return`${label}: ${value}`}

export function buildBriefEmail({kind='daily',source,baseUrl='https://matrixreprogrammed.com',date='',recipientTier='public'}={}){
  const brief=normalizeBriefSource(source,{kind,date});
  const openUrl=route(baseUrl,kind==='weekly'?'weekly-investigation-report.html':'daily-brain-brief.html');
  const evidenceUrl=route(baseUrl,'evidence-vault.html');
  const signalUrl=route(baseUrl,'forum.html');
  const cards=brief.briefings.map((item,index)=>`<section style="margin:22px 0;padding:20px;border:1px solid #5f4c27;border-radius:16px;background:#0d0b07"><div style="font-size:12px;letter-spacing:.12em;color:#d8b56a">${html(item.id)} · ${html(titleCase(item.section))} · ${html(item.confidence)} confidence</div><h2 style="margin:8px 0 12px;color:#f3e6bd">${index+1}. ${html(item.headline)}</h2>${field('Trigger',item.trigger)}${field('Primary record',item.primaryRecord)}${field('Record status',item.recordStatus)}<h3 style="color:#d8b56a">Established facts</h3>${bullets(item.establishedFacts)}<h3 style="color:#d8b56a">Key entities</h3>${bullets(item.keyEntities)}${field('Money and authority',item.moneyAndAuthority)}${field('Mechanism of power',item.mechanismOfPower)}${field('Solid conclusion',item.solidConclusion)}${field('Mission relevance',item.missionRelevance)}${field('Elite-control relevance',item.eliteControlRelevance)}${field('Global convergence assessment',item.globalConvergenceAssessment)}<div style="margin:14px 0;padding:14px;border-left:4px solid #8d7137;background:#160f08">${field('Speculative conclusion',item.speculativeConclusion)}</div>${field('Counter-analysis',item.counterAnalysis)}<h3 style="color:#d8b56a">Missing evidence</h3>${bullets(item.missingEvidence)}<h3 style="color:#d8b56a">Watch next</h3>${bullets(item.watchNext)}${field('Access tier',item.accessTier)}${item.sourceLinks.length?`<p>${item.sourceLinks.map(value=>`<a href="${html(route(baseUrl,value))}" style="color:#d8b56a;margin-right:12px">Open related route</a>`).join('')}</p>`:''}</section>`).join('');
  const htmlContent=`<!doctype html><html><body style="margin:0;background:#050505;color:#f3e6bd;font-family:Arial,sans-serif"><div style="max-width:760px;margin:auto;padding:28px"><div style="border:1px solid #8d7137;border-radius:20px;padding:26px;background:#0b0905"><div style="font-size:12px;letter-spacing:.16em;color:#d8b56a">MATRIX REPROGRAMMED · ${html(brief.date)}</div><h1 style="font-size:34px;margin:10px 0;color:#d8b56a">${html(brief.title)}</h1><p style="font-size:18px;line-height:1.55">${html(brief.executiveSummary)}</p><p style="padding:12px;border-left:4px solid #8d7137;background:#130f08"><strong>Evidence boundary:</strong> ${html(brief.boundary)}</p><p><strong>Source:</strong> ${html(brief.sourcePath)} · <strong>Generated:</strong> ${html(brief.generatedAt)} · <strong>Recipient layer:</strong> ${html(recipientTier)}</p>${brief.topConclusions.length?`<h2 style="color:#d8b56a">Executive conclusions</h2>${bullets(brief.topConclusions)}`:''}${brief.signals.length?`<h2 style="color:#d8b56a">Signal board</h2>${bullets(brief.signals.map(item=>`${item.title} — ${item.lane}; ${item.status}. ${item.why}`))}`:''}${cards||'<p>No evidence-graded briefings were available. No unverified claims were inserted.</p>'}<h2 style="color:#d8b56a">Missing records</h2>${bullets(brief.missingRecords)}<h2 style="color:#d8b56a">Watch next</h2>${bullets(brief.watchNext)}<p style="margin-top:24px"><a href="${html(openUrl)}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d8b56a;color:#090702;text-decoration:none;font-weight:bold">Open full brief</a> <a href="${html(evidenceUrl)}" style="color:#d8b56a;margin-left:12px">Evidence Vault</a> <a href="${html(signalUrl)}" style="color:#d8b56a;margin-left:12px">Persistent Signal Board</a></p><p style="font-size:12px;color:#b9aa82">You received this because your verified preferences include this briefing. Manage preferences or unsubscribe through your subscriber dashboard.</p></div></div></body></html>`;
  const textSections=brief.briefings.map((item,index)=>[`## ${index+1}. ${item.headline}`,textField('ID / section / confidence',`${item.id} / ${item.section} / ${item.confidence}`),textField('Trigger',item.trigger),textField('Primary record',item.primaryRecord),textField('Record status',item.recordStatus),'Established facts:',textBullets(item.establishedFacts),'Key entities:',textBullets(item.keyEntities),textField('Money and authority',item.moneyAndAuthority),textField('Mechanism of power',item.mechanismOfPower),textField('Solid conclusion',item.solidConclusion),textField('Mission relevance',item.missionRelevance),textField('Elite-control relevance',item.eliteControlRelevance),textField('Global convergence assessment',item.globalConvergenceAssessment),textField('Speculative conclusion',item.speculativeConclusion),textField('Counter-analysis',item.counterAnalysis),'Missing evidence:',textBullets(item.missingEvidence),'Watch next:',textBullets(item.watchNext),textField('Access tier',item.accessTier)].join('\n')).join('\n\n');
  const textContent=[`${brief.title} — ${brief.date}`,'',brief.executiveSummary,'',`Evidence boundary: ${brief.boundary}`,`Source: ${brief.sourcePath}`,`Generated: ${brief.generatedAt}`,brief.topConclusions.length?'\nExecutive conclusions:\n'+textBullets(brief.topConclusions):'',brief.signals.length?'\nSignal board:\n'+textBullets(brief.signals.map(item=>`${item.title} — ${item.lane}; ${item.status}. ${item.why}`)):'',textSections,'Missing records:',textBullets(brief.missingRecords),'Watch next:',textBullets(brief.watchNext),`Open full brief: ${openUrl}`,`Evidence Vault: ${evidenceUrl}`,`Persistent Signal Board: ${signalUrl}`].filter(Boolean).join('\n\n');
  const canonicalRecordIds=unique(brief.briefings.map(item=>item.id),50);
  const strongestHeadline=first(brief.briefings[0]?.headline,brief.signals[0]?.title,'Current evidence update');
  const subject=`${brief.title}: ${strongestHeadline} — ${brief.date}`.slice(0,180);
  return{subject,preheader:first(brief.executiveSummary,brief.topConclusions[0]).slice(0,180),htmlContent,textContent,canonicalRecordIds,evidenceCheckpointAt:brief.generatedAt,brief};
}
