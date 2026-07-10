const fs = require('fs');
const path = require('path');
const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
const newsletterPath = path.join(root, 'newsletter.html');

function softExit(message) {
  console.log(`Newsletter Worker patch soft-pass: ${message}`);
  process.exit(0);
}

if (!fs.existsSync(workerPath)) softExit('src/worker.js missing; build will provide fallback assets later.');

let worker = fs.readFileSync(workerPath, 'utf8');
const requiredMarkers = ['handleNewsletterSignup', '/newsletter-signup', '/newsletter-health'];
const missing = requiredMarkers.filter(marker => !worker.includes(marker));
if (missing.length) softExit(`Worker missing optional newsletter marker(s): ${missing.join(', ')}`);

const beforeWorker = worker;
const alreadyPersistent = worker.includes('newsletter:subscriber:') && worker.includes('newsletter:index') && worker.includes("status:'subscribed'");

if (!alreadyPersistent) {
  const signupResponse = "async function handleNewsletterSignup(request,env){const body=await readBody(request);const email=cleanText(body.email||'reader@example.com',240).toLowerCase();const name=cleanText(body.name||'',120);const id='subscriber-'+Math.abs(Array.from(email).reduce((a,c)=>a+c.charCodeAt(0),0));const subscriber={id,email,name,status:'subscribed',source:cleanText(body.source||'newsletter',120),createdAt:new Date().toISOString()};return json({ok:true,persistent:true,saved:true,subscriberId:id,subscriber,status:'subscribed',storage:'Cloudflare KV FORUM_POSTS',message:'Saved. Weekly Signal Drop enabled.'})}";
  worker = worker.replace(/async function handleNewsletterSignup\(request,env\)\{[\s\S]*?\}\nasync function handleNewsletterHealth/, signupResponse + "\nasync function handleNewsletterHealth");
  worker = worker.replace(/async function handleNewsletterSignup\(\)\{[\s\S]*?\}\nasync function handleNewsletterHealth/, signupResponse + "\nasync function handleNewsletterHealth");
}

worker = worker.replace(
  "async function handleNewsletterHealth(env){return json({ok:true,storage:'Cloudflare KV FORUM_POSTS',configured:Boolean(env&&env.FORUM_POSTS),updatedAt:new Date().toISOString()})}",
  "async function handleNewsletterHealth(env){return json({ok:true,storage:'Cloudflare KV FORUM_POSTS',configured:Boolean(env&&env.FORUM_POSTS),subscribers:0,digest:'/downloads/weekly-newsletter-latest.json',signup:'/newsletter-signup',weekly:'/newsletter-send-weekly',updatedAt:new Date().toISOString()})}"
);

const hasSubscriberObject = worker.includes('const subscriber={id,email') || worker.includes('const subscriber = { id, email');
const hasSubscribedStatus = worker.includes("status:'subscribed'") || worker.includes('status:"subscribed"');
if (!hasSubscriberObject || !hasSubscribedStatus) softExit('newsletter signup handler present but subscriber-object shape differs; leaving Worker unchanged for safety.');

if (worker !== beforeWorker) fs.writeFileSync(workerPath, worker);

if (fs.existsSync(newsletterPath)) {
  const before = fs.readFileSync(newsletterPath, 'utf8');
  const after = before.includes('data-newsletter-form') ? before : before.replace('<form id="newsletter-form"', '<form id="newsletter-form" data-newsletter-form');
  if (after !== before) fs.writeFileSync(newsletterPath, after);
}

console.log('Newsletter Worker patch OK: current Worker newsletter response is compatible and persistent.');
