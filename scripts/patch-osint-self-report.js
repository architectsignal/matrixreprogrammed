const fs = require('fs');
const path = require('path');
const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
if (!fs.existsSync(workerPath)) throw new Error('src/worker.js not found');
let source = fs.readFileSync(workerPath, 'utf8');

const oldPublicJob = "function osintPublicJob(row){if(!row)return null;return{id:row.id,tool:row.tool,status:row.status,accessLevel:row.access_level,targetReference:String(row.target_hash||'').slice(0,12),purpose:row.lawful_purpose,createdAt:row.created_at,claimedAt:row.claimed_at,completedAt:row.completed_at,expiresAt:row.expires_at,summary:row.result_summary||'',error:row.error_message||'',result:row.result_json?osintParseJson(row.result_json,{}):null}}";
const newPublicJob = "function osintPublicJob(row,revealSelf=false){if(!row)return null;let result=row.result_json?osintParseJson(row.result_json,{}):null;if(result&&typeof result==='object'&&!revealSelf&&Object.prototype.hasOwnProperty.call(result,'recognitionHints')){result={...result};delete result.recognitionHints}return{id:row.id,tool:row.tool,status:row.status,accessLevel:row.access_level,targetReference:String(row.target_hash||'').slice(0,12),purpose:row.lawful_purpose,createdAt:row.created_at,claimedAt:row.claimed_at,completedAt:row.completed_at,expiresAt:row.expires_at,summary:row.result_summary||'',error:row.error_message||'',selfVerified:Boolean(revealSelf),disclosureMode:revealSelf?'verified-self':'standard',result}}";
if (source.includes(oldPublicJob)) source = source.replace(oldPublicJob, newPublicJob);

source = source.replace(
  "if(!osintValidEmail(target))return json({ok:false,error:'A single valid email address is required'},400);",
  "if(!osintValidEmail(target))return json({ok:false,error:'A single valid email address is required'},400);const selfVerified=Boolean(required.auth.member.email_verified_at&&String(required.auth.member.email||'').trim().toLowerCase()===target);"
);

const oldCreateReturn = "return json({ok:true,accepted:true,job:osintPublicJob({id:jobId,tool,status:'queued',access_level:policy.access,target_hash:targetHash,lawful_purpose:purpose,created_at:createdAt,expires_at:expiresAt})},202)";
const newCreateReturn = "return json({ok:true,accepted:true,selfVerified,job:osintPublicJob({id:jobId,tool,status:'queued',access_level:policy.access,target_hash:targetHash,lawful_purpose:purpose,created_at:createdAt,expires_at:expiresAt},selfVerified)},202)";
if (source.includes(oldCreateReturn)) source = source.replace(oldCreateReturn, newCreateReturn);

source = source.replace(
  /async function handleOsintListJobs\(request,env\)\{[\s\S]*?\}\nasync function osintOwnedJob/,
  "async function handleOsintListJobs(request,env){const required=await osintRequireMember(request,env);if(required.response)return required.response;const admin=osintIsAdmin(required.auth.member);const rows=admin&&new URL(request.url).searchParams.get('scope')==='all'?await d1All(env.MEMBERS_DB.prepare('SELECT * FROM osint_tool_jobs ORDER BY created_at DESC LIMIT 100')):await d1All(env.MEMBERS_DB.prepare('SELECT * FROM osint_tool_jobs WHERE member_id=? ORDER BY created_at DESC LIMIT 30').bind(required.auth.member.id));const memberHash=await authHash(String(required.auth.member.email||'').trim().toLowerCase());const verified=Boolean(required.auth.member.email_verified_at);const jobs=rows.map(row=>osintPublicJob(row,verified&&row.member_id===required.auth.member.id&&secureEqual(String(row.target_hash||''),memberHash)));return json({ok:true,count:jobs.length,jobs})}\nasync function osintOwnedJob"
);

source = source.replace(
  /async function handleOsintGetJob\(request,env,id\)\{[\s\S]*?\}\nasync function handleOsintCancelJob/,
  "async function handleOsintGetJob(request,env,id){const owned=await osintOwnedJob(request,env,id);if(owned.response)return owned.response;const memberHash=await authHash(String(owned.auth.member.email||'').trim().toLowerCase());const selfVerified=Boolean(owned.auth.member.email_verified_at&&owned.row.member_id===owned.auth.member.id&&secureEqual(String(owned.row.target_hash||''),memberHash));if(selfVerified)await osintAudit(env,owned.auth.member.id,'osint.self_report.viewed',id,{tool:owned.row.tool});return json({ok:true,selfVerified,job:osintPublicJob(owned.row,selfVerified)})}\nasync function handleOsintCancelJob"
);

fs.writeFileSync(workerPath, source);
console.log('Verified-self OSINT report gate applied.');
