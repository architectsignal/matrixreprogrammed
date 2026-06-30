const fs = require('fs');
const path = require('path');
const root = process.cwd();
const targets = ['optin-center.html', 'download-center.html', 'index.html'];
const block = `<section id="newsletter-capture" class="section wrap split"><div class="card redline"><span class="label">Weekly Signal</span><h2>Get the weekly Matrix Reprogrammed signal</h2><p>Daily updates stay fresh. Old updates move to the vault. The weekly email sends the strongest signal, source route, branded download, and book path.</p><form data-newsletter-form data-source="site-capture-panel" data-tags="weekly,live-intel,downloads,black-file"><input type="text" name="name" placeholder="Name" autocomplete="name" /><input type="email" name="email" placeholder="Email address" autocomplete="email" required /><input type="text" name="website" tabindex="-1" autocomplete="off" style="display:none" aria-hidden="true" /><label class="warning"><input type="checkbox" name="consent" value="yes" required /> I agree to receive the Matrix Reprogrammed weekly signal and understand I can unsubscribe.</label><button class="btn" type="submit">Join Weekly Signal</button><p data-newsletter-status class="warning"></p></form></div><aside class="terminal">CAPTURE SYSTEM\n&gt; Persistent Cloudflare KV subscriber record\n&gt; Weekly newsletter sender\n&gt; Vault route\n&gt; Download route\n&gt; Book path</aside></section>`;
let changed = [];
for (const target of targets) {
  const p = path.join(root, target);
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p, 'utf8');
  const before = html;
  html = html.replace(/Netlify forms/gi, 'Cloudflare Worker newsletter capture');
  if (!html.includes('id="newsletter-capture"')) html = html.replace('</main>', `${block}</main>`);
  if (!html.includes('newsletter.js')) html = html.replace('</body>', '<script src="newsletter.js"></script></body>');
  if (html !== before) { fs.writeFileSync(p, html); changed.push(target); }
}
console.log(`Newsletter capture UI patched: ${changed.length ? changed.join(', ') : 'already current'}`);
