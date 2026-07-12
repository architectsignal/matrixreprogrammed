const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=path.join(root,'start-here.html');
if(!fs.existsSync(file)) throw new Error('start-here.html not found');
let html=fs.readFileSync(file,'utf8');
const navMarker='<!-- safety-start-nav -->';
if(!html.includes(navMarker)){
  html=html.replace('</nav></header>',`<a href="security-privacy.html">Security Tools</a><a href="dark-web-safety.html">Dark Web Safety</a>${navMarker}</nav></header>`);
}
const start='<!-- safety-start-cards:start -->';
const end='<!-- safety-start-cards:end -->';
const cards=`${start}<article class="intel-card"><h3>Security Tools</h3><p>Build a layered privacy, device-security, encrypted-communication and lawful OSINT safety system using vetted free tools.</p><a class="btn alt" href="security-privacy.html">Open Security Tools</a></article><article class="intel-card"><h3>Dark Web Safety</h3><p>Learn a lawful Tor workflow, verified onion-address checks, identity separation, hostile-file precautions and emergency response.</p><a class="btn alt" href="dark-web-safety.html">Open Dark Web Safety</a></article>${end}`;
const re=new RegExp(`${start}[\\s\\S]*?${end}`,'g');
if(re.test(html)) html=html.replace(re,cards);
else html=html.replace('</div></section></main>',`${cards}</div></section></main>`);
fs.writeFileSync(file,html);
console.log('Start Here safety and dark-web routes patched.');
