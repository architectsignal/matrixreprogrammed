const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
const newsletterPath = path.join(root, 'newsletter.html');
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

function fail(message) {
  const report = { ok: false, generatedAt: new Date().toISOString(), error: message };
  fs.writeFileSync(path.join(reportDir, 'newsletter-worker-patch-report.json'), JSON.stringify(report, null, 2));
  console.error(`Newsletter patch failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(workerPath)) fail('src/worker.js missing');

let worker = fs.readFileSync(workerPath, 'utf8');
for (const marker of ['handleNewsletterSignup', '/newsletter-signup', '/newsletter-health', 'getSubscribers', 'subscriberId']) {
  if (!worker.includes(marker)) fail(`Worker missing ${marker}`);
}

const beforeWorker = worker;
const signupResponse = "async function handleNewsletterSignup(request,env){const body=await readBody(request);const email=cleanText(body.email||'',240).toLowerCase();const name=cleanText(body.name||'',120);if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return json({ok:false,persistent:false,saved:false,error:'Valid email required'},400);if(!env||!env.FORUM_POSTS)return json({ok:false,configured:false,persistent:false,saved:false,subscriber:null,error:'newsletter storage not configured'},503);const id=subscriberId(email);const subscriber={id,email,name,status:'subscribed',source:cleanText(body.source||'newsletter',120),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};const current=await getSubscribers(env);const next=[...current.filter(item=>item&&String(item.email||'').toLowerCase()!==email),subscriber].slice(-5000);const subscriberSaved=Boolean(await withTimeout(env.FORUM_POSTS.put(`newsletter:subscriber:${id}`,JSON.stringify(subscriber),{metadata:{email,status:'subscribed',updatedAt:subscriber.updatedAt}}).then(()=>true).catch(()=>false),1200,false));const indexSaved=Boolean(await withTimeout(env.FORUM_POSTS.put('newsletter:index',JSON.stringify(next),{metadata:{count:next.length,updatedAt:subscriber.updatedAt}}).then(()=>true).catch(()=>false),1200,false));const saved=subscriberSaved&&indexSaved;return json({ok:saved,configured:true,persistent:true,saved,subscriberId:id,subscriber,status:saved?'subscribed':'storage-error',storage:'Cloudflare KV FORUM_POSTS',message:saved?'Saved. Weekly Signal Drop enabled.':'Subscriber could not be persisted.'},saved?200:503)}";

const patterns = [
  /async function handleNewsletterSignup\(request,env\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/,
  /async function handleNewsletterSignup\(request, env\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/,
  /async function handleNewsletterSignup\(\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/
];
let replaced = false;
for (const pattern of patterns) {
  if (pattern.test(worker)) {
    worker = worker.replace(pattern, signupResponse + '\nasync function handleSubscribeNewsletter');
    replaced = true;
    break;
  }
}
if (!replaced) fail('newsletter signup handler shape not recognized');

worker = worker.replace(
  /async function handleNewsletterHealth\(env\)\{[\s\S]*?\}\nasync function handleNewsletterSubscribers/,
  "async function handleNewsletterHealth(env){const subscribers=await getSubscribers(env);return json({ok:Boolean(env&&env.FORUM_POSTS),capturePersistent:Boolean(env&&env.FORUM_POSTS),storage:'Cloudflare KV FORUM_POSTS',configured:Boolean(env&&env.FORUM_POSTS),subscribers:subscribers.length,digest:'/downloads/weekly-newsletter-latest.json',signup:'/newsletter-signup',weekly:'/newsletter-send-weekly',updatedAt:new Date().toISOString()})}\nasync function handleNewsletterSubscribers"
);

const required = [
  "env.FORUM_POSTS.put(`newsletter:subscriber:${id}`",
  "env.FORUM_POSTS.put('newsletter:index'",
  'const saved=subscriberSaved&&indexSaved',
  "error:'Valid email required'",
  'persistent:false,saved:false'
];
const missing = required.filter(marker => !worker.includes(marker));
if (missing.length) fail(`patched Worker missing persistence marker(s): ${missing.join(', ')}`);
if (worker.includes('return json({ok:true,persistent:true,saved:true,subscriberId:id,subscriber')) fail('old unconditional success handler still present');

if (worker !== beforeWorker) fs.writeFileSync(workerPath, worker);

if (fs.existsSync(newsletterPath)) {
  const before = fs.readFileSync(newsletterPath, 'utf8');
  const after = before.includes('data-newsletter-form') ? before : before.replace('<form id="newsletter-form"', '<form id="newsletter-form" data-newsletter-form');
  if (after !== before) fs.writeFileSync(newsletterPath, after);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: worker !== beforeWorker,
  required,
  mode: 'real Cloudflare KV persistence enforcement'
};
fs.writeFileSync(path.join(reportDir, 'newsletter-worker-patch-report.json'), JSON.stringify(report, null, 2));
console.log('Newsletter Worker patch OK: signup now validates email and persists both subscriber record and newsletter index to KV.');
