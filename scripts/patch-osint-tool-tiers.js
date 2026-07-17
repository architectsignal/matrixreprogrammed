const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerFile = path.join(root, 'src', 'worker.js');
const pageFile = path.join(root, 'research-tools.html');
const uiFile = path.join(root, 'research-tools.js');
const deliveryFile = path.join(root, 'src', 'worker-report-delivery.js');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, text) { fs.writeFileSync(file, text); }
function replaceRequired(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`${label} patch target not found`);
  return text.replace(oldValue, newValue);
}

let worker = read(workerFile);
const oldPolicies = "const osintToolPolicies={holehe:{label:'Email account signals',access:'member',dailyLimit:5},spiderfoot:{label:'Passive digital footprint scan',access:'member',dailyLimit:2},h8mail:{label:'Breach exposure review',access:'admin',dailyLimit:10}};";
const priorPolicies = "const osintToolPolicies={holehe:{label:'Email account signals',access:'member',minimumTier:'registered',dailyLimit:5},spiderfoot:{label:'Passive digital footprint scan',access:'member',minimumTier:'intelligence_6',dailyLimit:2},h8mail:{label:'Breach exposure review',access:'admin',minimumTier:'admin',dailyLimit:10}};";
const finalPolicies = "const osintToolPolicies={holehe:{label:'Email account signals',access:'member',minimumTier:'registered',dailyLimit:5},spiderfoot:{label:'Passive digital footprint scan',access:'member',minimumTier:'intelligence_6',dailyLimit:2},h8mail:{label:'Breach exposure review',access:'member',minimumTier:'intelligence_6',selfOnlyForMembers:true,dailyLimit:10}};";
if (!worker.includes(finalPolicies)) {
  if (worker.includes(priorPolicies)) worker = worker.replace(priorPolicies, finalPolicies);
  else worker = replaceRequired(worker, oldPolicies, finalPolicies, 'OSINT policy');
}

const oldAdmin = "function osintIsAdmin(member){return osintRole(member)==='admin'}";
const tierHelpers = "function osintIsAdmin(member){return osintRole(member)==='admin'}const osintTierRank={anonymous:0,registered:1,supporter_3:2,intelligence_6:3,research_pro_9:4,admin:99};const osintTierAlias={free:'registered',registered:'registered',supporter:'supporter_3',supporter_3:'supporter_3',intelligence:'intelligence_6',intelligence_6:'intelligence_6',research_pro:'research_pro_9',research_pro_9:'research_pro_9'};async function osintEffectiveTier(env,member){if(osintIsAdmin(member))return'admin';const row=await d1First(env.MEMBERS_DB.prepare('SELECT effective_tier,tier_rank FROM member_effective_entitlements WHERE member_id=? LIMIT 1').bind(member.id));return osintTierAlias[String(row&&row.effective_tier||member.tier||'free').toLowerCase()]||'registered'}function osintTierAllowed(current,required){return Number(osintTierRank[current]||0)>=Number(osintTierRank[required]||99)}";
if (!worker.includes('function osintEffectiveTier')) worker = replaceRequired(worker, oldAdmin, tierHelpers, 'OSINT tier helper');

const oldConfig = "const now=Date.now();const role=osintRole(required.auth.member);const tools={};for(const [id,policy] of Object.entries(osintToolPolicies)){const online=runners.some(row=>{const supported=osintParseJson(row.supported_tools_json,[]);return Array.isArray(supported)&&supported.includes(id)&&now-new Date(row.last_seen_at||0).getTime()<5*60*1000});tools[id]={...policy,allowed:policy.access==='member'||role==='admin',runnerOnline:online}}return json({ok:true,authenticated:true,configured:osintConfigured(env),member:{role,tier:required.auth.member.tier||'free'},tools,evidenceBoundary:";
const finalConfig = "const now=Date.now();const role=osintRole(required.auth.member);const effectiveTier=await osintEffectiveTier(env,required.auth.member);const tools={};for(const [id,policy] of Object.entries(osintToolPolicies)){const online=runners.some(row=>{const supported=osintParseJson(row.supported_tools_json,[]);return Array.isArray(supported)&&supported.includes(id)&&now-new Date(row.last_seen_at||0).getTime()<5*60*1000});tools[id]={...policy,allowed:role==='admin'||(policy.access==='member'&&osintTierAllowed(effectiveTier,policy.minimumTier)),runnerOnline:online}}return json({ok:true,authenticated:true,configured:osintConfigured(env),member:{role,tier:effectiveTier},tools,evidenceBoundary:";
if (!worker.includes(finalConfig)) worker = replaceRequired(worker, oldConfig, finalConfig, 'OSINT config tier');

const oldCreateGate = "const policy=osintToolPolicies[tool];if(!policy)return json({ok:false,error:'Unknown tool'},400);if(policy.access==='admin'&&!osintIsAdmin(required.auth.member))return json({ok:false,error:'Administrator access required'},403);const target=";
const priorCreateGate = "const policy=osintToolPolicies[tool];if(!policy)return json({ok:false,error:'Unknown tool'},400);const effectiveTier=await osintEffectiveTier(env,required.auth.member);if(policy.access==='admin'&&!osintIsAdmin(required.auth.member))return json({ok:false,error:'Administrator access required',requiredTier:'admin'},403);if(policy.access==='member'&&!osintTierAllowed(effectiveTier,policy.minimumTier))return json({ok:false,error:'This tool is not included in the current membership tier',currentTier:effectiveTier,requiredTier:policy.minimumTier,upgradeUrl:'/membership.html'},403);const target=";
const finalCreateGate = "const policy=osintToolPolicies[tool];if(!policy)return json({ok:false,error:'Unknown tool'},400);const effectiveTier=await osintEffectiveTier(env,required.auth.member);if(policy.access==='member'&&!osintTierAllowed(effectiveTier,policy.minimumTier))return json({ok:false,error:'This tool is not included in the current membership tier',currentTier:effectiveTier,requiredTier:policy.minimumTier,upgradeUrl:'/membership.html'},403);const target=";
if (!worker.includes(finalCreateGate)) {
  if (worker.includes(priorCreateGate)) worker = worker.replace(priorCreateGate, finalCreateGate);
  else worker = replaceRequired(worker, oldCreateGate, finalCreateGate, 'OSINT create-job tier');
}

const selfVerifiedOriginal = "const selfVerified=Boolean(required.auth.member.email_verified_at&&String(required.auth.member.email||'').trim().toLowerCase()===target);if(!consentGranted(body.confirmLawfulUse)||!consentGranted(body.confirmNoMinor))";
const selfVerifiedFinal = "const selfVerified=Boolean(required.auth.member.email_verified_at&&String(required.auth.member.email||'').trim().toLowerCase()===target);if(policy.selfOnlyForMembers&&!osintIsAdmin(required.auth.member)&&!selfVerified)return json({ok:false,error:'This Intelligence tool may review only your own verified account email',requiredTier:policy.minimumTier,selfVerifiedRequired:true},403);if(!consentGranted(body.confirmLawfulUse)||!consentGranted(body.confirmNoMinor))";
if (!worker.includes(selfVerifiedFinal)) worker = replaceRequired(worker, selfVerifiedOriginal, selfVerifiedFinal, 'h8mail verified-self boundary');
write(workerFile, worker);

let page = read(pageFile);
page = page.replace('administrator-only breach exposure review', 'Intelligence-tier verified-self breach exposure review');
page = page.replace('Member Tool · Holehe', 'Registered Tool · Holehe');
page = page.replace('Member Tool · SpiderFoot', 'Intelligence Tool · SpiderFoot');
page = page.replace('<article class="card redline" data-admin-tool hidden><span class="label">Administrator Only · h8mail</span>', '<article class="card redline" data-h8mail-tool><span class="label">Intelligence Tool · h8mail</span>');
page = page.replace('Administrator-only breach exposure review. Verified-self reports show recognisable masked identifiers, affected sources, dates, counts and every detected data category while reusable secret values remain withheld.', 'Intelligence members can review their own verified email for breach-exposure signals. Administrators may use the wider documented-investigation scope. Reports show masked identifiers, affected sources, dates, counts and detected data categories while reusable secret values remain withheld.');
page = page.replace('placeholder="State the case, authority or public-interest purpose."', 'placeholder="State the defensive self-review purpose. Administrators should state the documented case authority."');
page = page.replace('I confirm administrator authority and a documented lawful purpose.', 'I confirm a lawful defensive self-review purpose, or administrator authority for a documented investigation.');
page = page.replace('Run Admin Review', 'Run Breach Review');
page = page.replace('Administrator authentication required.', 'Intelligence membership required. Members may review only their own verified email.');
write(pageFile, page);

let ui = read(uiFile);
ui = ui.replace("const adminCard = document.querySelector('[data-admin-tool]');", "const h8mailCard = document.querySelector('[data-h8mail-tool]');");
ui = ui.replace("if (adminCard && role === 'admin') adminCard.hidden = false;", "if (h8mailCard) h8mailCard.hidden = false;");
ui = ui.replace("setText(authState, role === 'admin' ? 'Administrator authenticated' : 'Verified member authenticated');", "setText(authState, role === 'admin' ? 'Administrator authenticated' : `Verified member · ${config.member?.tier || 'registered'}`);");
ui = ui.replace("if (!toolConfig?.allowed) setText(output, tool === 'h8mail' ? 'Administrator authentication required.' : 'This membership tier cannot use this tool.', 'error');", "if (!toolConfig?.allowed) setText(output, tool === 'h8mail' ? 'Intelligence membership required. Members may review only their own verified email.' : 'This membership tier cannot use this tool.', 'error');");
write(uiFile, ui);

let delivery = read(deliveryFile);
const oldSelect = "SELECT j.id,j.member_id,j.tool,j.status,j.target_hash,j.result_summary,j.result_json,j.completed_at,\n           m.email,m.display_name,m.email_verified_at,m.status AS member_status\n    FROM osint_tool_jobs j\n    JOIN members m ON m.id=j.member_id";
const finalSelect = "SELECT j.id,j.member_id,j.tool,j.status,j.target_hash,j.result_summary,j.result_json,j.completed_at,\n           m.email,m.display_name,m.email_verified_at,m.status AS member_status,\n           COALESCE(e.effective_tier,'registered') AS effective_tier,COALESCE(e.is_admin,0) AS is_admin\n    FROM osint_tool_jobs j\n    JOIN members m ON m.id=j.member_id\n    LEFT JOIN member_effective_entitlements e ON e.member_id=j.member_id";
if (!delivery.includes(finalSelect)) delivery = replaceRequired(delivery, oldSelect, finalSelect, 'report delivery entitlement join');
const deliveryTierAnchor = "if (row.member_status !== 'active' || !row.email_verified_at || !row.email) {\n    return { queued: false, reason: 'verified-active-member-required' };\n  }";
const deliveryTierFinal = `${deliveryTierAnchor}\n  const tierRank = { registered: 1, supporter_3: 2, intelligence_6: 3, research_pro_9: 4 };\n  const requiredTier = ['spiderfoot', 'h8mail'].includes(row.tool) ? 'intelligence_6' : 'registered';\n  if (!Number(row.is_admin || 0) && Number(tierRank[row.effective_tier] || 0) < Number(tierRank[requiredTier] || 99)) {\n    return { queued: false, reason: 'current-membership-tier-required', requiredTier, currentTier: row.effective_tier || 'registered' };\n  }`;
if (!delivery.includes("reason: 'current-membership-tier-required'")) delivery = replaceRequired(delivery, deliveryTierAnchor, deliveryTierFinal, 'report delivery tier boundary');
write(deliveryFile, delivery);

require('./sanitize-machine-entity-outputs.js');
require('./patch-geographic-power-atlas-runtime.js');
require('./patch-login-email-delivery.js');
require('./disable-production-kv-traffic.js');
require('./repair-empty-public-controls.js');
require('./patch-homepage-command-builder-shell.js');
console.log('OSINT tiers enforced: Holehe registered; SpiderFoot Intelligence; h8mail Intelligence verified-self, with administrator investigation scope. KV-safe production policy, empty-control repair and homepage builder shell recovery applied.');
