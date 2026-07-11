const fs=require('fs');
const path=require('path');
const root=process.cwd();
const files=[path.join(root,'membership.html'),path.join(root,'_site','membership.html'),path.join(root,'_site','membership')];
const freeSection=`<section class="section money-card" id="always-free-access"><h2>Always free to the public</h2><p>Public claims must remain verifiable without payment.</p><ul><li>basic search across the public archive</li><li>daily public investigation summary</li><li>current interactive evidence map</li><li>primary-source links and evidence boundaries</li><li>corrections, retractions and record-status labels</li></ul><div class="account-actions"><a class="btn" href="daily-investigation-conclusions.html">Read Daily Conclusions</a><a class="btn alt" href="evidence-network-map.html">Open Evidence Map</a></div></section>`;
function patch(html){
  html=html
    .replace('Membership System','Member Access')
    .replace('JOIN THE PRIVATE MEMBER LAYER.','CHOOSE HOW DEEPLY YOU WANT TO INVESTIGATE.')
    .replace('Create a free account or upgrade through a PayPal subscription that is verified by the Matrix Reprogrammed backend before access is granted.','Public evidence remains public. Membership adds alerts, history, exports, deeper analysis and research tools.')
    .replace('Free membership and Daily Control Brief','Free account')
    .replace('Create a member account','Create Free Account')
    .replace('Creating your member record…','Creating your account…')
    .replace('Account saved. Check your email for the one-time verification link.','Check your email for your verification link.')
    .replace('Account saved, but verification email delivery is unavailable.','Your account was saved, but the verification email could not be sent. Please try again later.')
    .replace('PayPal membership tiers','Monthly investigation memberships')
    .replace('Checking your member session and PayPal configuration…','Checking membership availability…')
    .replace('PayPal activation pending.','Coming soon.')
    .replace('The browser cannot activate a membership. The backend checks the PayPal subscription, Plan ID, checkout intent and webhook status. Paid access is granted only while PayPal reports <strong>ACTIVE</strong>.','PayPal confirms each active subscription before paid access begins. Payment details remain with PayPal.')
    .replace('weekly member brief</li><li>member newsletter</li><li>sample premium reports</li><li>member-only source drops','member weekly investigation brief</li><li>early access to selected reports</li><li>watchlist alerts</li><li>member source drops</li><li>supporter archive')
    .replace('premium daily brief</li><li>full card intelligence</li><li>full source ledger</li><li>deeper dossiers</li><li>downloadable card decks</li><li>weekly control map</li><li>missing-record queue','premium daily investigation brief</li><li>historical evidence-map views</li><li>advanced relationship and date filters</li><li>full source-ledger change history</li><li>entity comparison</li><li>downloadable reports and datasets</li><li>missing-record queue')
    .replace('advanced search</li><li>full dossier exports</li><li>monthly PDF intelligence report</li><li>source route maps</li><li>policy tracker</li><li>jurisdiction tracker</li><li>card score movement reports</li><li>priority source requests','bulk evidence exports</li><li>research API access</li><li>private case boards</li><li>document text and metadata extraction</li><li>priority source requests</li><li>professional monthly intelligence pack</li><li>policy and jurisdiction exports')
    .replace('<p class="mini">Verification links expire after 15 minutes and can be used once. Login sessions use secure, HttpOnly cookies.</p>','<p class="mini">Verification links expire after 15 minutes and can only be used once.</p>')
    .replace('<footer class="footer wrap"><p><strong>Billing boundary:</strong> PayPal holds payment details. Matrix Reprogrammed stores only the verified subscription identifiers, status and entitlement tier.</p></footer>','<footer class="footer wrap"><p><strong>Membership principle:</strong> public claims remain verifiable without payment. Membership funds preservation, alerts, exports and deeper investigation tools.</p></footer>');
  if(!html.includes('id="always-free-access"')){
    const marker='<section class="section money-card">';
    html=html.includes(marker)?html.replace(marker,freeSection+marker):html.replace('</main>',freeSection+'</main>');
  }
  html=html.replace(/<a href="review-dashboard\.html">Review<\/a>/g,'');
  return html;
}
let changed=0;
for(const file of files){if(!fs.existsSync(file))continue;const before=fs.readFileSync(file,'utf8'),after=patch(before);if(after!==before){fs.writeFileSync(file,after);changed++;}}
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','membership-access-copy-report.json'),JSON.stringify({ok:true,generatedAt:new Date().toISOString(),changed,principle:'Primary sources and evidence boundaries remain free. Membership adds convenience, history, alerts, exports and research tools.'},null,2));
console.log(`Membership access copy patched: ${changed} file(s).`);
