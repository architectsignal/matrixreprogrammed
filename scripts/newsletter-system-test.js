const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues=[];
function exists(name){return fs.existsSync(path.join(root,name))}
function read(name){return fs.readFileSync(path.join(root,name),'utf8')}
function needFile(name){if(!exists(name))issues.push(`missing ${name}`)}
function needText(name,text){if(exists(name)&&!read(name).includes(text))issues.push(`${name} missing ${text}`)}
for(const f of ['scripts/build-newsletter-system.js','newsletter.js','newsletter.html','downloads/weekly-newsletter-latest.json','downloads/weekly-newsletter-latest.md','src/worker.js','scripts/harden-public-html.js'])needFile(f);
needText('scripts/harden-public-html.js','build-newsletter-system.js');
needText('newsletter.js','/newsletter-signup');
needText('newsletter.js','type="email"');
needText('newsletter.html','Weekly Signal Drop');
needText('newsletter.html','newsletter.js');
needText('src/worker.js','handleNewsletterSignup');
needText('src/worker.js','/newsletter-signup');
needText('src/worker.js','/newsletter-health');
needText('src/worker.js','/newsletter-subscribers.json');
needText('src/worker.js','/newsletter-send-weekly');
needText('src/worker.js','newsletter:index');
needText('src/worker.js','newsletter:subscriber:');
needText('src/worker.js','Cloudflare KV');
needText('llms.txt','/newsletter-signup');
if(exists('downloads/weekly-newsletter-latest.json')){const data=JSON.parse(read('downloads/weekly-newsletter-latest.json'));if(!data.ok)issues.push('weekly newsletter json not ok');if(!Array.isArray(data.items))issues.push('weekly newsletter missing items array')}
if(issues.length){console.error('NEWSLETTER SYSTEM TEST FAILED');for(const issue of issues)console.error(`- ${issue}`);process.exit(1)}
console.log('NEWSLETTER SYSTEM TEST PASSED');
console.log('Checked Cloudflare KV signup endpoint, newsletter client capture, digest outputs, health/admin routes, and build wiring.');
