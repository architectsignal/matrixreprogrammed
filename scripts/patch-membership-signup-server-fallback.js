const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'membership-signup-server-fallback.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

const helperMarker = 'function normalizeSignupPreferences(input)';
if (!source.includes(helperMarker)) {
  const anchor = 'async function upsertSignupMember(env,input,{resubscribe=false}={}){';
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error('Membership signup fallback insertion anchor missing');
  const helper = `function normalizeSignupPreferences(input){
  const next={...(input||{})};
  const sourcePage=clean(next.path||next.sourcePage||'',240).toLowerCase();
  const sourceLabel=clean(next.source||'',240).toLowerCase();
  const interest=clean(next.interest||'',500).toLowerCase();
  const membershipRoute=/\\/membership(?:\\.html)?$/.test(sourcePage)||sourceLabel.includes('membership-daily-control-brief')||interest.includes('get the free daily control brief');
  const newsletterRoute=/\\/newsletter(?:\\.html)?$/.test(sourcePage)||sourceLabel.includes('weekly-signal')||interest.includes('weekly signal drop')||interest.includes('get the weekly file');
  const absent=name=>next[name]===undefined||next[name]===null||next[name]==='';
  if(membershipRoute){
    if(absent('public_daily_brief')&&absent('daily')){next.public_daily_brief=true;next.daily=true;}
    if(absent('release_notices'))next.release_notices=true;
  }
  if(newsletterRoute&&absent('public_weekly_digest')&&absent('weekly')){next.public_weekly_digest=true;next.weekly=true;}
  return next;
}

`;
  source = `${source.slice(0,index)}${helper}${source.slice(index)}`;
  changed = true;
}

const oldSignupStart = "async function handleSignup(request,env,{resubscribe=false}={}){await ensureSchema(env);const input=await body(request);";
const newSignupStart = "async function handleSignup(request,env,{resubscribe=false}={}){await ensureSchema(env);let input=normalizeSignupPreferences(await body(request));";
if (!source.includes(newSignupStart)) {
  if (!source.includes(oldSignupStart)) throw new Error('Membership signup handler input anchor missing');
  source = source.replace(oldSignupStart, newSignupStart);
  changed = true;
}

for (const marker of [
  helperMarker,
  "sourceLabel.includes('membership-daily-control-brief')",
  "interest.includes('get the free daily control brief')",
  "next.public_daily_brief=true;next.daily=true",
  'let input=normalizeSignupPreferences(await body(request))'
]) if (!source.includes(marker)) throw new Error(`Membership signup server fallback marker missing: ${marker}`);

if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  membershipDefaultsWhenAbsent: {
    publicDailyBrief: true,
    releaseNotices: true,
    publicWeeklyDigest: false
  },
  newsletterDefaultsWhenAbsent: {
    publicWeeklyDigest: true
  },
  explicitSubmittedChoicesPreserved: true,
  purpose: 'Accept the membership Daily Control Brief form even when a cached page or script omits preference fields.',
  boundary: 'Defaults apply only when the relevant fields are absent. Explicit true or false choices remain authoritative.'
}, null, 2)}\n`);
console.log(`Membership signup server fallback ${changed ? 'installed' : 'already current'}.`);
