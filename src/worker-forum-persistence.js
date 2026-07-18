import legacyWorker from './worker.js';
import { memberSessionContext } from './worker-member-experience.js';

const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'SAMEORIGIN',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Matrix-Origin':'cloudflare-worker-forum-d1'
};
const boardLabels={main:'Main Signal Board',speculation:'Dark Speculation Board','epstein-alive':'Epstein Alive / Sighting Board'};
const validBoards=new Set(Object.keys(boardLabels));
const routeMap={
  '/forum-health':{action:'health'},
  '/forum-feed':{action:'feed',board:'main'},
  '/forum-feed-main':{action:'feed',board:'main'},
  '/forum-feed-speculation':{action:'feed',board:'speculation'},
  '/forum-feed-epstein-alive':{action:'feed',board:'epstein-alive'},
  '/forum-posts.json':{action:'json',board:'all'},
  '/downloads/forum-posts.json':{action:'json',board:'all'},
  '/forum-posts.md':{action:'markdown',board:'all'},
  '/downloads/forum-posts.md':{action:'markdown',board:'all'},
  '/submit-forum-post':{action:'submit',board:'main'},
  '/submit-main-post':{action:'submit',board:'main'},
  '/submit-speculation-post':{action:'submit',board:'speculation'},
  '/submit-epstein-alive-post':{action:'submit',board:'epstein-alive'},
  '/report-forum-post':{action:'report',board:'main'},
  '/report-main-post':{action:'report',board:'main'},
  '/report-speculation-post':{action:'report',board:'speculation'},
  '/report-epstein-alive-post':{action:'report',board:'epstein-alive'},
  '/.netlify/functions/forum-feed':{action:'feed',board:'main'},
  '/.netlify/functions/submit-forum-post':{action:'submit',board:'main'},
  '/.netlify/functions/report-forum-post':{action:'report',board:'main'}
};
let schemaPromise;
let migrationPromise;

function response(data,status=200){return new Response(JSON.stringify(data,null,2),{status,headers})}
function clean(value,max=1000){return String(value??'').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function bool(value){return value===true||value===1||value==='1'||String(value||'').toLowerCase()==='true'}
function normalizeBoard(value='main'){const board=clean(value,80).toLowerCase().replace(/[^a-z0-9-]/g,'-');return validBoards.has(board)?board:'main'}
function makeId(prefix='signal'){return`${prefix}-${Date.now()}-${crypto.randomUUID()}`}
function hasD1(env){return Boolean(env?.MEMBERS_DB&&typeof env.MEMBERS_DB.prepare==='function')}
function kvMirrorEnabled(env){return bool(env?.ENABLE_KV_COMPATIBILITY_MIRROR||'false')&&Boolean(env?.FORUM_POSTS)}
function safeUrl(value){const raw=clean(value,800);if(!raw)return'';try{const url=new URL(raw);return['http:','https:'].includes(url.protocol)?url.href:''}catch{return''}}
async function first(statement){try{return await statement.first()}catch{return null}}
async function all(statement){try{const result=await statement.all();return Array.isArray(result?.results)?result.results:[]}catch{return[]}}
async function requestBody(request){const type=request.headers.get('content-type')||'';if(type.includes('application/json'))return request.json().catch(()=>({}));const form=await request.formData().catch(()=>null);return form?Object.fromEntries(form.entries()):{}}
function safePost(post={}){const stamp=new Date().toISOString();return{id:clean(post.id||makeId(),160),board:normalizeBoard(post.board||post.category||'main'),title:clean(post.title||'Reader Signal',180),body:clean(post.body||post.message||'',6000),category:clean(post.category||'Signal',100),name:clean(post.name||post.display_name||'Verified Member',100),sourceUrl:safeUrl(post.sourceUrl||post.source_url||post.source||''),createdAt:clean(post.createdAt||post.created_at||stamp,80),approvedAt:clean(post.approvedAt||post.approved_at||post.createdAt||post.created_at||stamp,80),updatedAt:clean(post.updatedAt||post.updated_at||stamp,80),status:clean(post.status||'live',40),authorVerified:Boolean(post.authorVerified??post.author_verified)}}
function synthetic(post){const value=[post.id,post.title,post.body,post.category,post.name,post.status].map(item=>String(item||'').toLowerCase()).join(' ');return/synthetic|smoke test|health check|demo post|fixture|qa post|seed post|system check|generated check|pressure test/.test(value)}
function publicPosts(posts){return posts.map(safePost).filter(post=>post.status==='live'&&!synthetic(post))}

async function ensureSchema(env){
  if(!hasD1(env))throw new Error('MEMBERS_DB D1 binding is unavailable');
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    const statements=[
      `CREATE TABLE IF NOT EXISTS forum_posts (id TEXT PRIMARY KEY,board TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Signal',display_name TEXT NOT NULL DEFAULT 'Verified Member',source_url TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,approved_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'live',storage_origin TEXT NOT NULL DEFAULT 'd1',updated_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_forum_posts_board_created ON forum_posts(board,created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_forum_posts_status_created ON forum_posts(status,created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS forum_post_owners (post_id TEXT PRIMARY KEY,member_id TEXT NOT NULL,session_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE)`,
      `CREATE INDEX IF NOT EXISTS idx_forum_post_owners_member ON forum_post_owners(member_id,created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS forum_reports (id TEXT PRIMARY KEY,board TEXT NOT NULL,post_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open')`,
      `CREATE INDEX IF NOT EXISTS idx_forum_reports_post ON forum_reports(post_id,created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS forum_report_owners (report_id TEXT PRIMARY KEY,member_id TEXT NOT NULL,session_id TEXT,created_at TEXT NOT NULL,FOREIGN KEY(report_id) REFERENCES forum_reports(id) ON DELETE CASCADE,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS forum_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS forum_board_state (board TEXT PRIMARY KEY,post_count INTEGER NOT NULL DEFAULT 0,last_post_at TEXT,updated_at TEXT NOT NULL)`
    ];
    for(const sql of statements)await env.MEMBERS_DB.prepare(sql).run();
    for(const board of validBoards)await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO forum_board_state (board,post_count,updated_at) VALUES (?,0,?)`).bind(board,new Date().toISOString()).run();
    return true
  })().catch(error=>{schemaPromise=null;throw error});
  return schemaPromise
}

async function metaValue(env,key){return(await first(env.MEMBERS_DB.prepare('SELECT value FROM forum_meta WHERE key=? LIMIT 1').bind(key)))?.value||null}
async function setMeta(env,key,value){const stamp=new Date().toISOString();await env.MEMBERS_DB.prepare(`INSERT INTO forum_meta (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(key,value,stamp).run()}
async function updateBoardState(env,board){const stamp=new Date().toISOString();const count=await first(env.MEMBERS_DB.prepare(`SELECT COUNT(*) AS count,MAX(created_at) AS last_post_at FROM forum_posts WHERE board=? AND status='live'`).bind(board));await env.MEMBERS_DB.prepare(`INSERT INTO forum_board_state (board,post_count,last_post_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(board) DO UPDATE SET post_count=excluded.post_count,last_post_at=excluded.last_post_at,updated_at=excluded.updated_at`).bind(board,Number(count?.count||0),count?.last_post_at||null,stamp).run()}
async function insertPost(env,post,{origin='d1',memberId=null,sessionId=null}={}){const item=safePost(post);const stamp=new Date().toISOString();await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO forum_posts (id,board,title,body,category,display_name,source_url,created_at,approved_at,status,storage_origin,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(item.id,item.board,item.title,item.body,item.category,item.name,item.sourceUrl,item.createdAt,item.approvedAt,item.status,origin,stamp).run();if(memberId)await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO forum_post_owners (post_id,member_id,session_id,created_at,updated_at) VALUES (?,?,?,?,?)`).bind(item.id,memberId,sessionId||null,stamp,stamp).run();await updateBoardState(env,item.board);return{...item,authorVerified:Boolean(memberId)}}

async function migrateKvPosts(env){
  await ensureSchema(env);
  if(!kvMirrorEnabled(env))return{migrated:0,source:'D1 authoritative; KV compatibility mirror disabled by default'};
  if(await metaValue(env,'kv_forum_migration_v1'))return{migrated:0,source:'already-complete'};
  if(!migrationPromise)migrationPromise=(async()=>{
    const candidates=new Map();
    try{const index=await env.FORUM_POSTS.get('posts:index','json');if(Array.isArray(index))for(const item of index){const post=safePost(item);if(post.id)candidates.set(post.id,post)}}catch{}
    let cursor,pages=0;
    do{
      const listed=await env.FORUM_POSTS.list({prefix:'post:',limit:1000,cursor});
      const keys=Array.isArray(listed?.keys)?listed.keys:[];
      const values=await Promise.all(keys.map(async key=>{try{return await env.FORUM_POSTS.get(key.name,'json')}catch{return null}}));
      for(const item of values)if(item){const post=safePost(item);if(post.id)candidates.set(post.id,post)}
      cursor=listed?.list_complete?undefined:listed?.cursor;pages+=1
    }while(cursor&&pages<20);
    let migrated=0;for(const post of candidates.values()){await insertPost(env,post,{origin:'kv-migration'});migrated+=1}
    await setMeta(env,'kv_forum_migration_v1',JSON.stringify({migrated,completedAt:new Date().toISOString()}));return{migrated,source:'Cloudflare KV recovery import'}
  })().catch(error=>{migrationPromise=null;throw error});
  return migrationPromise
}

async function loadPosts(env,requestedBoard='all',limit=100){await ensureSchema(env);await migrateKvPosts(env);const board=requestedBoard==='all'?'all':normalizeBoard(requestedBoard);const sql=board==='all'?`SELECT p.id,p.board,p.title,p.body,p.category,p.display_name AS name,p.source_url AS sourceUrl,p.created_at AS createdAt,p.approved_at AS approvedAt,p.updated_at AS updatedAt,p.status,CASE WHEN o.member_id IS NULL THEN 0 ELSE 1 END AS author_verified FROM forum_posts p LEFT JOIN forum_post_owners o ON o.post_id=p.id WHERE p.status='live' ORDER BY p.created_at DESC LIMIT ?`:`SELECT p.id,p.board,p.title,p.body,p.category,p.display_name AS name,p.source_url AS sourceUrl,p.created_at AS createdAt,p.approved_at AS approvedAt,p.updated_at AS updatedAt,p.status,CASE WHEN o.member_id IS NULL THEN 0 ELSE 1 END AS author_verified FROM forum_posts p LEFT JOIN forum_post_owners o ON o.post_id=p.id WHERE p.status='live' AND p.board=? ORDER BY p.created_at DESC LIMIT ?`;const rows=board==='all'?await all(env.MEMBERS_DB.prepare(sql).bind(limit)):await all(env.MEMBERS_DB.prepare(sql).bind(board,limit));return publicPosts(rows)}
async function counts(env){const rows=await all(env.MEMBERS_DB.prepare(`SELECT board,COUNT(*) AS count,MAX(created_at) AS last_post_at FROM forum_posts WHERE status='live' GROUP BY board`));const output={main:{count:0,lastPostAt:null},speculation:{count:0,lastPostAt:null},'epstein-alive':{count:0,lastPostAt:null}};for(const row of rows)output[normalizeBoard(row.board)]={count:Number(row.count||0),lastPostAt:row.last_post_at||null};return output}
async function syncKvMirror(env){if(!kvMirrorEnabled(env))return;const posts=await loadPosts(env,'all',300);await env.FORUM_POSTS.put('posts:index',JSON.stringify(posts),{metadata:{updatedAt:new Date().toISOString(),count:posts.length,storage:'D1 authoritative; optional KV recovery mirror'}})}
async function mirrorPost(env,post){if(!kvMirrorEnabled(env))return;await env.FORUM_POSTS.put(`post:${post.id}`,JSON.stringify(post),{metadata:{board:post.board,status:post.status,createdAt:post.createdAt,storage:'D1 authoritative mirror'}})}

async function forumData(env,board){const selected=board==='all'?'all':normalizeBoard(board);const posts=await loadPosts(env,selected,selected==='all'?300:100);return{ok:true,persistent:true,'persistent: true':true,authoritativeStorage:'Cloudflare D1 MEMBERS_DB.forum_posts + forum_post_owners',compatibilityMirror:kvMirrorEnabled(env),source:'Cloudflare D1 forum_posts',generatedAt:new Date().toISOString(),board:selected,boardLabel:selected==='all'?'All Boards':boardLabels[selected],boardCounts:await counts(env),count:posts.length,postingAccess:'verified-free-member-session',posts,boundary:'Posts are user-submitted public resources. They are not verified claims unless separately cited and evidence-graded.'}}
function markdown(data){return['# Matrix Reprogrammed Signal Board Posts','',`Generated: ${data.generatedAt}`,`Posts: ${data.posts.length}`].concat(data.posts.flatMap(post=>['',`## ${post.title}`,post.body])).join('\n')}
async function requireVerifiedMember(request,env){const auth=await memberSessionContext(request,env);if(!auth||auth.member?.status!=='active'||!auth.member?.email_verified_at)return{response:response({ok:false,authenticated:false,persistent:true,saved:false,error:'A verified free member account is required to post.',loginUrl:`/member-login.html?return=${encodeURIComponent(new URL(request.url).pathname)}`,requiredTier:'registered'},401)};return{auth}}

async function handle(route,request,env,ctx){
  await ensureSchema(env);await migrateKvPosts(env);
  if(route.action==='health'){
    const countRow=await first(env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM forum_posts'));const ownerRow=await first(env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM forum_post_owners'));const migration=await metaValue(env,'kv_forum_migration_v1');return response({ok:true,backend:'src/worker-forum-persistence.js',d1Binding:'MEMBERS_DB',d1Connected:true,schemaReady:true,authoritativeStorage:'Cloudflare D1 MEMBERS_DB.forum_posts + forum_post_owners',kvBinding:kvMirrorEnabled(env)?'optional recovery mirror enabled':'D1 authoritative; KV compatibility mirror disabled by default',storedPostCount:Number(countRow?.count||0),ownedPostCount:Number(ownerRow?.count||0),boardCounts:await counts(env),kvMigration:migration?JSON.parse(migration):null,persistent:true,postingAccess:'verified-free-member-session',crossDevice:true,indexSelfHealing:'D1 authoritative',deployedFrom:'GitHub main',checkedAt:new Date().toISOString()})
  }
  if(route.action==='feed'||route.action==='json'){const url=new URL(request.url);return response(await forumData(env,clean(url.searchParams.get('board')||route.board||'main',80)))}
  if(route.action==='markdown'){const data=await forumData(env,route.board||'all');return new Response(markdown(data),{headers:{...headers,'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="forum-posts.md"'}})}
  if(route.action==='submit'){
    const required=await requireVerifiedMember(request,env);if(required.response)return required.response;const input=await requestBody(request);if(input.website)return response({ok:false,error:'Spam trap triggered'},400);const displayName=clean(input.name||required.auth.member.display_name||'Verified Member',100);const post=safePost({id:makeId(),board:route.board||input.board,title:input.title||'Reader Signal',body:input.body||input.message||'',category:input.category||'Signal',name:displayName,sourceUrl:input.sourceUrl||input.source||'',status:'live'});if(post.title.length<3||post.body.length<10)return response({ok:false,persistent:true,saved:false,error:'A title and meaningful message are required.'},400);const saved=await insertPost(env,post,{origin:'d1-verified-member-submit',memberId:required.auth.member.id,sessionId:required.auth.session?.id});if(ctx?.waitUntil&&kvMirrorEnabled(env))ctx.waitUntil(Promise.allSettled([mirrorPost(env,saved),syncKvMirror(env)]));return response({ok:true,persistent:true,saved:true,crossDevice:true,storage:'Cloudflare D1 MEMBERS_DB.forum_posts + forum_post_owners',mirroredToKv:kvMirrorEnabled(env),board:saved.board,boardLabel:boardLabels[saved.board],postingAccess:'verified-free-member-session',post:saved},201)
  }
  if(route.action==='report'){
    const required=await requireVerifiedMember(request,env);if(required.response)return required.response;const input=await requestBody(request);const postId=clean(input.id||input.postId,160);const target=await first(env.MEMBERS_DB.prepare(`SELECT id,board FROM forum_posts WHERE id=? AND status='live' LIMIT 1`).bind(postId));if(!target)return response({ok:false,error:'Post not found'},404);const report={id:makeId('report'),board:normalizeBoard(route.board||input.board||target.board),postId,reason:clean(input.reason||'Reported by verified member',1200),createdAt:new Date().toISOString()};await env.MEMBERS_DB.prepare(`INSERT INTO forum_reports (id,board,post_id,reason,created_at,status) VALUES (?,?,?,?,?,'open')`).bind(report.id,report.board,report.postId,report.reason,report.createdAt).run();await env.MEMBERS_DB.prepare(`INSERT INTO forum_report_owners (report_id,member_id,session_id,created_at) VALUES (?,?,?,?)`).bind(report.id,required.auth.member.id,required.auth.session?.id||null,report.createdAt).run();return response({ok:true,persistent:true,storage:'Cloudflare D1 MEMBERS_DB.forum_reports + forum_report_owners',reportId:report.id,board:report.board})
  }
  return response({ok:false,error:'Unsupported forum action'},404)
}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';const route=routeMap[path];if(!route)return legacyWorker.fetch(request,env,ctx);if(!hasD1(env))return response({ok:false,persistent:false,saved:false,error:'Forum storage is unavailable; no browser or legacy fallback was accepted.',authoritativeStorage:'Cloudflare D1 MEMBERS_DB.forum_posts'},503);try{return await handle(route,request,env,ctx)}catch(error){return response({ok:false,persistent:false,saved:false,error:'Forum storage is temporarily unavailable; the post was not accepted as persistent.',detail:clean(error?.message||error,300)},503)}
  }
};
