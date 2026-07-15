const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'worker.js');
let text = fs.readFileSync(file, 'utf8');

const oldPolicies = "const osintToolPolicies={holehe:{label:'Email account signals',access:'member',dailyLimit:5},spiderfoot:{label:'Passive digital footprint scan',access:'member',dailyLimit:2},h8mail:{label:'Breach exposure review',access:'admin',dailyLimit:10}};";
const newPolicies = "const osintToolPolicies={holehe:{label:'Email account signals',access:'member',minimumTier:'registered',dailyLimit:5},spiderfoot:{label:'Passive digital footprint scan',access:'member',minimumTier:'intelligence_6',dailyLimit:2},h8mail:{label:'Breach exposure review',access:'admin',minimumTier:'admin',dailyLimit:10}};";
if (text.includes(oldPolicies)) text = text.replace(oldPolicies, newPolicies);
else if (!text.includes("minimumTier:'intelligence_6'")) throw new Error('OSINT policy block not found');

const oldAdmin = "function osintIsAdmin(member){return osintRole(member)==='admin'}";
const newAdmin = "function osintIsAdmin(member){return osintRole(member)==='admin'}const osintTierRank={anonymous:0,registered:1,supporter_3:2,intelligence_6:3,research_pro_9:4,admin:99};const osintTierAlias={free:'registered',registered:'registered',supporter:'supporter_3',supporter_3:'supporter_3',intelligence:'intelligence_6',intelligence_6:'intelligence_6',research_pro:'research_pro_9',research_pro_9:'research_pro_9'};async function osintEffectiveTier(env,member){if(osintIsAdmin(member))return'admin';const row=await d1First(env.MEMBERS_DB.prepare('SELECT effective_tier,tier_rank FROM member_effective_entitlements WHERE member_id=? LIMIT 1').bind(member.id));return osintTierAlias[String(row&&row.effective_tier||member.tier||'free').toLowerCase()]||'registered'}function osintTierAllowed(current,required){return Number(osintTierRank[current]||0)>=Number(osintTierRank[required]||99)}";
if (text.includes(oldAdmin) && !text.includes('function osintEffectiveTier')) text = text.replace(oldAdmin, newAdmin);
else if (!text.includes('function osintEffectiveTier')) throw new Error('OSINT admin helper block not found');

const oldConfig = "const now=Date.now();const role=osintRole(required.auth.member);const tools={};for(const [id,policy] of Object.entries(osintToolPolicies)){const online=runners.some(row=>{const supported=osintParseJson(row.supported_tools_json,[]);return Array.isArray(supported)&&supported.includes(id)&&now-new Date(row.last_seen_at||0).getTime()<5*60*1000});tools[id]={...policy,allowed:policy.access==='member'||role==='admin',runnerOnline:online}}return json({ok:true,authenticated:true,configured:osintConfigured(env),member:{role,tier:required.auth.member.tier||'free'},tools,evidenceBoundary:";
const newConfig = "const now=Date.now();const role=osintRole(required.auth.member);const effectiveTier=await osintEffectiveTier(env,required.auth.member);const tools={};for(const [id,policy] of Object.entries(osintToolPolicies)){const online=runners.some(row=>{const supported=osintParseJson(row.supported_tools_json,[]);return Array.isArray(supported)&&supported.includes(id)&&now-new Date(row.last_seen_at||0).getTime()<5*60*1000});tools[id]={...policy,allowed:role==='admin'||(policy.access==='member'&&osintTierAllowed(effectiveTier,policy.minimumTier)),runnerOnline:online}}return json({ok:true,authenticated:true,configured:osintConfigured(env),member:{role,tier:effectiveTier},tools,evidenceBoundary:";
if (text.includes(oldConfig)) text = text.replace(oldConfig, newConfig);
else if (!text.includes('const effectiveTier=await osintEffectiveTier')) throw new Error('OSINT config tier block not found');

const oldCreate = "const policy=osintToolPolicies[tool];if(!policy)return json({ok:false,error:'Unknown tool'},400);if(policy.access==='admin'&&!osintIsAdmin(required.auth.member))return json({ok:false,error:'Administrator access required'},403);const target=";
const newCreate = "const policy=osintToolPolicies[tool];if(!policy)return json({ok:false,error:'Unknown tool'},400);const effectiveTier=await osintEffectiveTier(env,required.auth.member);if(policy.access==='admin'&&!osintIsAdmin(required.auth.member))return json({ok:false,error:'Administrator access required',requiredTier:'admin'},403);if(policy.access==='member'&&!osintTierAllowed(effectiveTier,policy.minimumTier))return json({ok:false,error:'This tool is not included in the current membership tier',currentTier:effectiveTier,requiredTier:policy.minimumTier,upgradeUrl:'/membership.html'},403);const target=";
if (text.includes(oldCreate)) text = text.replace(oldCreate, newCreate);
else if (!text.includes("requiredTier:policy.minimumTier")) throw new Error('OSINT create-job tier block not found');

fs.writeFileSync(file, text);
console.log('OSINT tier policy enforced: Holehe registered, SpiderFoot Intelligence, h8mail administrator.');
