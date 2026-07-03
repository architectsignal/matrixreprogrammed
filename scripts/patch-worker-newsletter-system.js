const fs = require('fs');
const path = require('path');
const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
const newsletterPath = path.join(root, 'newsletter.html');
if (!fs.existsSync(workerPath)) {
  console.error('Newsletter patch failed: src/worker.js missing');
  process.exit(1);
}
const worker = fs.readFileSync(workerPath, 'utf8');
for (const marker of ['handleNewsletterSignup', '/newsletter-signup', '/newsletter-health']) {
  if (!worker.includes(marker)) {
    console.error(`Newsletter patch failed: Worker missing ${marker}`);
    process.exit(1);
  }
}
if (fs.existsSync(newsletterPath)) {
  const before = fs.readFileSync(newsletterPath, 'utf8');
  const after = before.includes('data-newsletter-form') ? before : before.replace('<form id="newsletter-form"', '<form id="newsletter-form" data-newsletter-form');
  if (after !== before) fs.writeFileSync(newsletterPath, after);
}
console.log('Newsletter Worker patch OK: compact Worker already contains newsletter endpoints.');
