const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root=process.cwd();
const site=path.join(root,'_site');
const reportPath=path.join(root,'downloads','persistent-signal-board-patch.json');
const report={ok:true,generatedAt:new Date().toISOString(),written:[],checks:[],failures:[],integrated:[]};
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
function write(rel,content){const target=path.join(root,rel);fs.writeFileSync(target,content);report.written.push(rel);if(fs.existsSync(site)){const output=path.join(site,rel);if(fs.existsSync(output)&&!fs.statSync(output).isDirectory()){fs.writeFileSync(output,content);report.written.push(`_site/${rel}`)}if(rel.endsWith('.html')){const extensionless=path.join(site,rel.replace(/\.html$/,''));if(fs.existsSync(extensionless)&&!fs.statSync(extensionless).isDirectory()){fs.writeFileSync(extensionless,content);report.written.push(`_site/${rel.replace(/\.html$/,'')}`)}}}}
function check(name,condition,detail=''){const ok=Boolean(condition);report.checks.push({name,ok,detail});if(!ok)report.failures.push(detail||name)}
function run(script,label){const result=spawnSync(process.execPath,[path.join(root,script)],{cwd:root,encoding:'utf8',maxBuffer:30*1024*1024});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);report.integrated.push({script,label,status:result.status});if(result.status!==0)throw new Error(`${label} failed with status ${result.status}`)}

const memberRel='src/worker-member-experience.js';
let member=read(memberRel);
if(!member.includes('export async function memberSessionContext')){
  const anchor='async function requireAuth(request,env)';
  if(!member.includes(anchor))throw new Error('Member session export anchor is missing');
  member=member.replace(anchor,`export async function memberSessionContext(request,env){return authContext(request,env)}\n${anchor}`);
}
member=member.replace("registered:['free_dashboard','session_controls','saved_public_content','followed_public_topics','public_download_history','public_weekly_archive','newsletter_preferences']","registered:['free_dashboard','session_controls','saved_public_content','followed_public_topics','public_download_history','public_weekly_archive','newsletter_preferences','signal_board_posting']");
write(memberRel,member);

const loginHref='member-login.html?return=%2Fforum.html%23submit-signal';
const pages=['forum.html','dark-speculation-forum.html','epstein-alive-board.html'];
for(const rel of pages){
  if(!fs.existsSync(path.join(root,rel)))continue;
  let html=read(rel);
  const boardName=rel==='dark-speculation-forum.html'?'Dark Speculation Board':rel==='epstein-alive-board.html'?'Epstein Sighting Board':'Main Signal Board';
  const verifiedSection=`<section id="signal-pass" class="section wrap split"><div class="card redline"><h2>Verified Free Member Access</h2><p>${boardName} is free to read. A verified Free Member session replaces the old device-only Signal Pass and unlocks persistent posting on every signed-in device.</p><a class="btn" href="${loginHref}">Log in or create a free account</a><button class="btn alt" type="button" id="unlock-signal-pass">Check member session</button><p class="form-status" id="signal-pass-status">Checking verified member session…</p></div><aside class="card"><h2>Persistence promise</h2><p>Posts and reports are accepted only after Cloudflare D1 confirms the write. No browser-only, temporary or local-storage post is treated as saved.</p></aside></section>`;
  html=html.replace(/<aside class="card redline"><h2>Signal Pass<\/h2>[\s\S]*?<\/aside>/i,`<aside class="card redline"><h2>Verified Free Member Posting</h2><p>Reading is public. Posting requires a verified free account so every accepted signal is stored persistently in Cloudflare D1 and remains available across devices and deployments.</p><div class="cta-row small"><a class="btn" href="${loginHref}">Create or access free account</a><a class="btn alt" href="#submit-signal">Post a signal</a></div></aside>`);
  if(/<section id="signal-pass"[\s\S]*?<\/section>/i.test(html))html=html.replace(/<section id="signal-pass"[\s\S]*?<\/section>/i,verifiedSection);
  else if(html.includes('<section id="submit-signal"'))html=html.replace('<section id="submit-signal"',`${verifiedSection}<section id="submit-signal"`);
  else if(html.includes('</main>'))html=html.replace('</main>',`${verifiedSection}</main>`);
  html=html.replace(/https:\/\/www\.paypal\.me\/njmgroup\/1/gi,loginHref).replace(/https:\/\/paypal\.me\/njmgroup\/1/gi,loginHref);
  html=html.replace(/Pay €1 Signal Pass/gi,'Create or access free account').replace(/Pay €1 via PayPal/gi,'Log in or create a free account').replace(/I[’']ve Paid — Unlock Posting/gi,'Check member session');
  html=html.replace(/Signal Pass required to post/gi,'Verified Free Member session required to post').replace(/Signal Pass anti-spam gate/gi,'verified Free Member anti-spam gate').replace(/after Signal Pass unlock/gi,'after verified member login').replace(/until Signal Pass is unlocked on this device/gi,'until a verified Free Member session is active').replace(/until Signal Pass is unlocked/gi,'until a verified Free Member session is active').replace(/Signal Pass unlocked/gi,'Verified member session active').replace(/Signal Pass not unlocked yet/gi,'Verified member session not active');
  html=html.replace(/A tiny anti-spam gate keeps the board human\. Once unlocked, posts go live by default\. This is not pre-approval\./gi,'Verified member login keeps the board persistent and reduces anonymous spam. Posts remain user submissions and are not treated as verified claims.');
  html=html.replace(/A small one-time Signal Pass adds friction against bots, spam, and drive-by abuse\./gi,'A verified free account provides persistent identity and session controls without charging for the right to post.');
  html=html.replace(/Payment does not buy agreement\. It only unlocks posting\./gi,'Membership does not buy agreement or editorial approval.');
  html=html.replace(/Posting uses the existing Signal Pass anti-spam gate\. Reading is free\. Payment does not buy agreement or approval\./gi,'Reading is free. Posting uses a verified Free Member session and persistent D1 storage. Membership does not buy agreement or approval.');
  if(!html.includes('forum.js'))html=html.replace('</body>','<script src="forum.js"></script></body>');
  write(rel,html);
  check(`${rel}:no-paypalme`,!html.includes('paypal.me'),`${rel} still contains PayPalMe Signal Pass`);
  check(`${rel}:member-login`,html.includes('Verified Free Member')&&html.includes('member-login.html'),`${rel} does not expose verified member posting`);
  check(`${rel}:persistence`,html.includes('Cloudflare D1'),`${rel} does not explain persistent D1 storage`);
}

const dailyBuilderRel='scripts/build-daily-brain-brief.js';
if(fs.existsSync(path.join(root,dailyBuilderRel))){
  let builder=read(dailyBuilderRel);
  const marker='late-signal-board-owner';
  if(!builder.includes(marker))builder+=`\n// ${marker}: legacy daily dependencies may rebuild board pages; persistent D1 ownership runs last.\nrequire('./patch-persistent-signal-board.js');\n`;
  fs.writeFileSync(path.join(root,dailyBuilderRel),builder);
  report.written.push(dailyBuilderRel);
}

// Remove the old KV import/mirror route in a separate process. This is run every
// time the Signal Board becomes final owner so module caching cannot hide a late restore.
run('scripts/disable-production-kv-traffic.js','D1-only Signal Board storage enforcement');

const forumJs=read('forum.js');
const worker=read('src/worker-forum-persistence.js');
member=read(memberRel);
check('forum-js-no-local-pass',!forumJs.includes('localStorage')&&!forumJs.includes('matrix_signal_pass_unlocked'),'forum.js still uses a browser-only unlock');
check('forum-js-member-session',forumJs.includes('/api/member/me')&&forumJs.includes('emailVerifiedAt'),'forum.js does not require a verified member session');
check('worker-member-session',worker.includes("import { memberSessionContext } from './worker-member-experience.js';")&&worker.includes('verified-free-member-session'),'Forum Worker is not tied to member sessions');
check('worker-owner-ledger',worker.includes('forum_post_owners')&&worker.includes('forum_report_owners'),'Forum Worker owner ledgers are missing');
check('worker-no-legacy-for-forum',worker.includes('no browser or legacy fallback was accepted'),'Forum Worker does not fail closed for persistence');
check('worker-no-kv-helper',!worker.includes('kvMirrorEnabled('),'Forum Worker still exposes the old KV mirror helper');
check('worker-no-kv-reads',!worker.includes('FORUM_POSTS.get(')&&!worker.includes('FORUM_POSTS.list('),'Forum Worker still reads Signal Board state from KV');
check('worker-no-kv-writes',!worker.includes('FORUM_POSTS.put('),'Forum Worker still writes Signal Board state to KV');
check('worker-d1-only-state',worker.includes('compatibilityMirror:false')&&worker.includes('mirroredToKv:false'),'Forum Worker does not declare D1-only state');
check('member-export',member.includes('export async function memberSessionContext'),'Member session context is not exported');

for(const rel of [memberRel,'forum.js','src/worker-forum-persistence.js',dailyBuilderRel]){
  const syntax=spawnSync(process.execPath,['--check',path.join(root,rel)],{cwd:root,encoding:'utf8'});
  check(`syntax:${rel}`,syntax.status===0,syntax.stderr||syntax.stdout||`${rel} syntax failed`);
}
report.ok=report.failures.length===0;
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
if(!report.ok){console.error(JSON.stringify(report,null,2));process.exit(1)}
console.log(`Persistent Signal Board patched: ${report.written.length} source/output writes; verified member, D1-only and late-generator ownership gates passed.`);
