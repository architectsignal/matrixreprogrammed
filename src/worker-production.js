import forumWorker from './worker-forum-persistence.js';
import emailWorker, { emailRoutes } from './worker-email-lifecycle.js';
import memberWorker, { isMemberExperienceRoute } from './worker-member-experience.js';
import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js';

const forumRoutes = new Set([
  '/forum-health','/forum-feed','/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive','/forum-posts.json','/downloads/forum-posts.json','/forum-posts.md','/downloads/forum-posts.md','/submit-forum-post','/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post','/report-forum-post','/report-main-post','/report-speculation-post','/report-epstein-alive-post','/.netlify/functions/forum-feed','/.netlify/functions/submit-forum-post','/.netlify/functions/report-forum-post'
]);

const jsonHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin','X-Matrix-Origin':'cloudflare-worker-production-boundary'};
function unavailable(reason,detail='',subsystem='forum'){
  const authoritativeStorage=subsystem==='email'?'Cloudflare D1 MEMBERS_DB email lifecycle tables':subsystem==='member'?'Cloudflare D1 MEMBERS_DB member, session and entitlement tables':subsystem==='paypal'?'Cloudflare D1 MEMBERS_DB PayPal billing ledger':'Cloudflare D1 MEMBERS_DB.forum_posts';
  const error=subsystem==='email'?'Email lifecycle storage is unavailable. No legacy success response was accepted.':subsystem==='member'?'Member authentication or entitlement storage is unavailable. No legacy success response was accepted.':subsystem==='paypal'?'PayPal billing storage is unavailable. No legacy or unverified payment response was accepted.':'Forum storage is unavailable. No legacy success response was accepted.';
  return new Response(JSON.stringify({ok:false,persistent:false,saved:false,d1Connected:false,authoritativeStorage,error,reason,detail:String(detail||'').slice(0,300),checkedAt:new Date().toISOString()},null,2),{status:503,headers:jsonHeaders});
}
function hasD1(env){return Boolean(env?.MEMBERS_DB&&typeof env.MEMBERS_DB.prepare==='function')}
function d1OnlyForumEnv(env){return{...env,FORUM_POSTS:undefined}}
async function validateForumResponse(path,response){const origin=response.headers.get('x-matrix-origin');if(origin!=='cloudflare-worker-forum-d1')return unavailable('non-authoritative-forum-response-blocked',`Origin was ${origin||'missing'}`);if(path==='/forum-health'){let health;try{health=await response.clone().json()}catch{return unavailable('invalid-forum-health-json')}const valid=response.ok&&health?.persistent===true&&health?.d1Connected===true&&health?.backend==='src/worker-forum-persistence.js'&&String(health?.authoritativeStorage||'').includes('D1');if(!valid)return unavailable('forum-health-did-not-prove-d1',JSON.stringify(health||{}))}return response}
async function validateSubsystemResponse(response,expected,subsystem){const origin=response.headers.get('x-matrix-origin');return origin===expected?response:unavailable(`non-authoritative-${subsystem}-response-blocked`,`Origin was ${origin||'missing'}`,subsystem)}

export default{
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';
    if(emailRoutes.has(path)){if(!hasD1(env))return unavailable('members-db-binding-unavailable','','email');try{return validateSubsystemResponse(await emailWorker.fetch(request,env,ctx),'cloudflare-worker-email-lifecycle','email')}catch(error){return unavailable('email-worker-exception',error?.message||error,'email')}}
    if(isMemberExperienceRoute(path)){if(!hasD1(env))return unavailable('members-db-binding-unavailable','','member');try{return validateSubsystemResponse(await memberWorker.fetch(request,env,ctx),'cloudflare-worker-member-experience','member')}catch(error){return unavailable('member-worker-exception',error?.message||error,'member')}}
    if(isPayPalRoute(path)){if(!hasD1(env))return unavailable('members-db-binding-unavailable','','paypal');try{return validateSubsystemResponse(await paypalWorker.fetch(request,env,ctx),'cloudflare-worker-paypal-subscriptions','paypal')}catch(error){return unavailable('paypal-worker-exception',error?.message||error,'paypal')}}
    if(!forumRoutes.has(path))return forumWorker.fetch(request,env,ctx);
    if(!hasD1(env))return unavailable('members-db-binding-unavailable');
    try{return validateForumResponse(path,await forumWorker.fetch(request,d1OnlyForumEnv(env),ctx))}catch(error){return unavailable('forum-worker-exception',error?.message||error)}
  },
  async scheduled(event,env,ctx){if(!hasD1(env))return;return emailWorker.scheduled(event,env,ctx)}
};
