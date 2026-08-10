'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const target = path.join(root, 'newsletter.js');
const required = [
  "credentials:'include'",
  "wordingVersion:'newsletter-explicit-consent-v3'",
  'marketingConsent:consentGranted',
  'Please confirm that you agree to receive the selected briefings.',
  "form.dataset.newsletterCapture==='active'"
];

function isCanonical(source) {
  return required.every(marker => String(source || '').includes(marker));
}

const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
if (!isCanonical(current)) {
  let checkedIn = '';
  try {
    checkedIn = execFileSync('git', ['show', 'HEAD:newsletter.js'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    throw new Error(`Canonical newsletter client could not be read from the checked-out release: ${error?.message || error}`);
  }
  if (!isCanonical(checkedIn)) {
    const missing = required.filter(marker => !checkedIn.includes(marker));
    throw new Error(`Checked-in newsletter client is not consent-safe: ${missing.join(', ')}`);
  }
  fs.writeFileSync(target, checkedIn);
  console.log('Canonical consent-bound newsletter client restored from the checked-out release SHA.');
} else {
  console.log('Canonical consent-bound newsletter client already current.');
}

