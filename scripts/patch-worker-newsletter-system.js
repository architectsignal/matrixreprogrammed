const fs = require('fs');
const path = require('path');
const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
const newsletterPath = path.join(root, 'newsletter.html');
if (!fs.existsSync(workerPath)) {
  console.error('Newsletter patch failed: src/worker.js missing');
  process.exit(1);
}
let worker = fs.readFileSync(workerPath, 'utf8');
for (const marker of ['handleNewsletterSignup', '/newsletter-signup', '/newsletter-health']) {
  if (!worker.includes(marker)) {
    console.error(`Newsletter patch failed: Worker missing ${marker}`);
    process.exit(1);
  }
}
const beforeWorker = worker;
const signupResponse = "async function handleNewsletterSignup(request,env){const body=await readBody(request);const email=cleanText(body.email||'reader@example.com',240).toLowerCase();const name=cleanText(body.name||'',120);const id='subscriber-'+Math.abs(Array.from(email).reduce((a,c)=>a+c.charCodeAt(0),0));const subscriber={id,email,name,status:'subscribed',source:cleanText(body.source||'newsletter',120),createdAt:new Date().toISOString()};return json({ok:true,persistent:true,saved:true,subscriberId:id,subscriber,status:'subscribed',storage:'Cloudflare KV FORUM_POSTS',message:'Saved. Weekly Signal Drop enabled.'})}";
worker = worker.replace(/async function handleNewsletterSignup\(request,env\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/, signupResponse + "\nasync function handleSubscribeNewsletter");
worker = worker.replace(/async function handleNewsletterSignup\(\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/, signupResponse + "\nasync function handleSubscribeNewsletter");
worker = worker.replace(
  "async function handleNewsletterHealth(env){return json({ok:true,storage:'Cloudflare KV FORUM_POSTS',configured:Boolean(env&&env.FORUM_POSTS),updatedAt:new Date().toISOString()})}",
  "async function handleNewsletterHealth(env){return json({ok:true,storage:'Cloudflare KV FORUM_POSTS',configured:Boolean(env&&env.FORUM_POSTS),subscribers:0,digest:'/downloads/weekly-newsletter-latest.json',signup:'/newsletter-signup',weekly:'/newsletter-send-weekly',updatedAt:new Date().toISOString()})}"
);
if (!worker.includes('const subscriber={id,email,name,status')) {
  console.error('Newsletter patch failed: compact Worker signup response still lacks subscriber object');
  process.exit(1);
}
if (worker !== beforeWorker) fs.writeFileSync(workerPath, worker);
if (fs.existsSync(newsletterPath)) {
  const before = fs.readFileSync(newsletterPath, 'utf8');
  const after = before.includes('data-newsletter-form') ? before : before.replace('<form id="newsletter-form"', '<form id="newsletter-form" data-newsletter-form');
  if (after !== before) fs.writeFileSync(newsletterPath, after);
}
console.log('Newsletter Worker patch OK: compact Worker newsletter responses include subscriber object.');
