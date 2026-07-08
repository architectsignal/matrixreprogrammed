const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=js('data/monetisation-dashboard.json',{moneyAudit:{},products:[],membership:[],revenueConclusions:[],remainingGaps:[]});
const review=js('data/review-dashboard.json',{totals:{},topRisks:[]});
const audit=money.moneyAudit||{};
const moneyHealth={emailCapturePoints:audit.emailCapturePoints||0,productPages:audit.productPages||0,membershipPages:audit.membershipPages||0,cardDeckProducts:audit.cardDeckProducts||0,bookLinks:audit.bookLinks||0,reportProducts:audit.reportProducts||0,customResearchPages:audit.customResearchPages||0,pagesMissingCTA:(audit.pagesMissingCTA||[]).length,pagesMissingPaidUpgrade:(audit.pagesMissingPaidUpgrade||[]).length,highTrafficPotential:(audit.pagesWithHighTrafficPotential||[]).length,remainingGaps:money.remainingGaps||[]};
review.moneyHealth=moneyHealth;
review.productPipeline=money.products||[];
review.revenueNextActions=money.revenueConclusions||[];
review.totals=review.totals||{};
review.totals.monetisationGaps=(money.remainingGaps||[]).length;
review.updated=new Date().toISOString();
wr('data/review-dashboard.json',JSON.stringify(review,null,2));
function moneyCards(){const cards=[['Email Capture Points',moneyHealth.emailCapturePoints],['Product Pages',moneyHealth.productPages],['Membership Pages',moneyHealth.membershipPages],['Card Deck Products',moneyHealth.cardDeckProducts],['Report Products',moneyHealth.reportProducts],['Paid Upgrade Gaps',moneyHealth.pagesMissingPaidUpgrade]];return cards.map(([a,b])=>`<article class="review-card"><div class="stat">${esc(b)}</div><p>${esc(a)}</p></article>`).join('')}
function productCards(){return (money.products||[]).slice(0,12).map(p=>`<article class="review-card"><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><p class="mini">${esc(p.price)} · ${esc(p.type)}</p><a class="btn alt" href="${esc(p.preview||'store.html')}">Free Preview</a></article>`).join('')||'<article class="review-card"><h3>No products</h3><p>Run monetisation generator.</p></article>'}
function actionCards(){return (money.revenueConclusions||[]).map(c=>`<article class="review-card"><h3>${esc(c.category)}</h3><p><strong>Conclusion:</strong> ${esc(c.conclusion)}</p><p><strong>Why:</strong> ${esc(c.whyItMatters)}</p><p><strong>Missing:</strong> ${esc(c.missingRecord)}</p><p class="mini">Confidence: ${esc(c.confidence)}</p><p><strong>Next:</strong> ${esc(c.nextAction)}</p></article>`).join('')||'<article class="review-card"><h3>No revenue actions</h3><p>Run monetisation generator.</p></article>'}
if(ex('review-dashboard.html')){let html=rd('review-dashboard.html');html=html.replace(/<!-- money-health:start -->[\s\S]*?<!-- money-health:end -->/,'');const block=`<!-- money-health:start --><section class="section"><h2>Money Health</h2><div class="review-grid">${moneyCards()}</div><div class="cta-row"><a class="btn" href="monetisation-dashboard.html">Monetisation Dashboard</a><a class="btn alt" href="store.html">Store</a><a class="btn alt" href="membership.html">Membership</a><a class="btn alt" href="card-deck-store.html">Deck Store</a></div></section><section class="section"><h2>Product Pipeline</h2><div class="review-grid">${productCards()}</div></section><section class="section"><h2>Revenue Next Actions</h2><div class="review-grid">${actionCards()}</div></section><!-- money-health:end -->`;if(html.includes('<section class="section"><h2>Artwork Pipeline</h2>'))html=html.replace('<section class="section"><h2>Artwork Pipeline</h2>',block+'<section class="section"><h2>Artwork Pipeline</h2>');else html=html.replace('</main>',block+'</main>');wr('review-dashboard.html',html)}
console.log(`Review dashboard money sections patched: ${moneyHealth.reportProducts} products / ${moneyHealth.pagesMissingPaidUpgrade} upgrade gaps.`);
