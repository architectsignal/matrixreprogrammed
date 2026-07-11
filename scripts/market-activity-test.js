const fs = require('fs');
const path = require('path');
const {
  classifyTransactionCode,
  parseForm4,
  parse13F,
  compare13F
} = require('./sec-market-utils');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'market-activity-test.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) console.error(`FAILED: ${name}${detail ? ` — ${detail}` : ''}`);
}
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }

const form4Xml = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType><periodOfReport>2026-07-01</periodOfReport>
  <issuer><issuerCik>0001318605</issuerCik><issuerName>Tesla, Inc.</issuerName><issuerTradingSymbol>TSLA</issuerTradingSymbol></issuer>
  <reportingOwner><reportingOwnerId><rptOwnerCik>0000000001</rptOwnerCik><rptOwnerName>Example Director</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector></reportingOwnerRelationship></reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-07-01</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>100</value></transactionShares><transactionPricePerShare><value>250</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts><postTransactionAmounts><sharesOwnedFollowingTransaction><value>500</value></sharesOwnedFollowingTransaction></postTransactionAmounts><ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature></nonDerivativeTransaction>
    <nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-07-02</value></transactionDate><transactionCoding><transactionCode>F</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>10</value></transactionShares><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts><postTransactionAmounts><sharesOwnedFollowingTransaction><value>490</value></sharesOwnedFollowingTransaction></postTransactionAmounts><ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature></nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

const current13fXml = `<?xml version="1.0"?><informationTable>
<infoTable><nameOfIssuer>EXAMPLE CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>123456789</cusip><value>1500</value><shrsOrPrnAmt><sshPrnamt>15000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><investmentDiscretion>SOLE</investmentDiscretion><votingAuthority><Sole>15000</Sole><Shared>0</Shared><None>0</None></votingAuthority></infoTable>
<infoTable><nameOfIssuer>NEW CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>987654321</cusip><value>500</value><shrsOrPrnAmt><sshPrnamt>5000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><investmentDiscretion>SOLE</investmentDiscretion><votingAuthority><Sole>5000</Sole><Shared>0</Shared><None>0</None></votingAuthority></infoTable>
</informationTable>`;
const previous13fXml = `<?xml version="1.0"?><informationTable>
<infoTable><nameOfIssuer>EXAMPLE CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>123456789</cusip><value>1000</value><shrsOrPrnAmt><sshPrnamt>10000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><investmentDiscretion>SOLE</investmentDiscretion><votingAuthority><Sole>10000</Sole><Shared>0</Shared><None>0</None></votingAuthority></infoTable>
<infoTable><nameOfIssuer>EXIT CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>111111111</cusip><value>200</value><shrsOrPrnAmt><sshPrnamt>2000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><investmentDiscretion>SOLE</investmentDiscretion><votingAuthority><Sole>2000</Sole><Shared>0</Shared><None>0</None></votingAuthority></infoTable>
</informationTable>`;

const form4 = parseForm4(form4Xml, { form: '4', accessionNumber: '0001-26-000001', filingDate: '2026-07-03', reportDate: '2026-07-01', sourceUrl: 'https://www.sec.gov/example-form4.xml' });
check('Form 4 fixture parses two transactions', form4.transactions.length === 2, String(form4.transactions.length));
check('P code is open-market purchase', form4.transactions[0].transactionCategory === 'open-market-purchase' && form4.transactions[0].marketTrade === true);
check('P code value is calculated', form4.transactions[0].reportedTransactionValue === 25000, String(form4.transactions[0].reportedTransactionValue));
check('F code is not mislabelled as a sale', form4.transactions[1].transactionCategory === 'tax-or-exercise-withholding' && form4.transactions[1].marketTrade === false);
check('Unknown transaction code remains other', classifyTransactionCode('Q').category === 'other-sec-transaction');

const current13f = parse13F(current13fXml, { subjectId: 'manager-example', subjectName: 'Example Manager', cik: '0000000002', form: '13F-HR', accessionNumber: 'current', filingDate: '2026-05-15', reportDate: '2026-03-31', sourceUrl: 'https://www.sec.gov/current.xml' });
const previous13f = parse13F(previous13fXml, { subjectId: 'manager-example', subjectName: 'Example Manager', cik: '0000000002', form: '13F-HR', accessionNumber: 'previous', filingDate: '2026-02-14', reportDate: '2025-12-31', sourceUrl: 'https://www.sec.gov/previous.xml' });
const changes = compare13F(current13f.filing, current13f.holdings, previous13f.filing, previous13f.holdings);
check('13F fixture creates three changes', changes.length === 3, String(changes.length));
check('13F increase detected', changes.some(item => item.cusip === '123456789' && item.changeType === 'increased-position' && item.shareChange === 5000));
check('13F new position detected', changes.some(item => item.cusip === '987654321' && item.changeType === 'new-position'));
check('13F exit detected', changes.some(item => item.cusip === '111111111' && item.changeType === 'exited-position'));
check('13F limitation remains attached', changes.every(item => /exact trade date/i.test(item.doesNotEstablish || '')));

for (const file of ['data/market-activity-watchlist.json','data/market-activity.json','market-activity.js','market-watchlist.html','market-watchlist.js','migrations/0003_market_watchlists.sql','scripts/collect-sec-market-activity.js','scripts/build-market-activity-pages.js','scripts/integrate-market-activity-data.js','scripts/patch-market-watchlists-worker.js']) check(`Required file exists: ${file}`, exists(file));
const watchlist = JSON.parse(read('data/market-activity-watchlist.json'));
check('Watchlist has enabled subjects', (watchlist.subjects || []).filter(item => item.enabled).length >= 10);
check('Every enabled subject has a ten-digit CIK', (watchlist.subjects || []).filter(item => item.enabled).every(item => /^\d{10}$/.test(String(item.cik || ''))));
check('Watchlist carries no-guilt boundary', /does not imply wrongdoing/i.test(watchlist.evidenceBoundary || ''));

const pageBuilder = read('scripts/build-market-activity-pages.js');
check('Page reads canonical positionChanges field', pageBuilder.includes('output.positionChanges'));
check('Page distinguishes Form 4 transaction codes', pageBuilder.includes('transactionCode'));
check('Page carries investment-advice boundary', /not investment advice/i.test(pageBuilder));
check('Page has URL filters', read('market-activity.js').includes('URLSearchParams'));

const workerPatch = read('scripts/patch-market-watchlists-worker.js');
check('Watchlist API requires authenticated member', workerPatch.includes('authSessionMember'));
check('Watchlist API has tier limits', workerPatch.includes("tier==='research_pro'?100"));
check('Watchlist API exposes list, create and delete routes', ['/api/market/watchlists', "request.method==='POST'", "request.method==='DELETE'"].every(marker => workerPatch.includes(marker)));
const migration = read('migrations/0003_market_watchlists.sql');
check('D1 watchlists are member-scoped', /member_id TEXT NOT NULL/.test(migration));
check('D1 watchlist target is unique per member', /UNIQUE\(member_id,target_type,target_key\)/.test(migration));
check('Alert delivery deduplicates activity', /UNIQUE\(member_id,activity_id,delivery_channel\)/.test(migration));

const collector = read('scripts/collect-sec-market-activity.js');
check('Collector identifies itself to SEC', collector.includes('SEC_USER_AGENT'));
check('Collector serialises SEC requests', collector.includes('requestDelayMs') && collector.includes('await sleep(requestDelayMs)'));
check('Collector preserves holdings and change files', collector.includes('market-holdings') && collector.includes('market-position-changes'));
check('Collector fails when every subject fails', collector.includes('summary.collectionFailures >= summary.trackedSubjects'));

const integration = read('scripts/integrate-market-activity-data.js');
check('Search integration prioritises official source', integration.includes("sourceAuthority: 'official'"));
check('Graph relationships carry established and not-established fields', integration.includes('established:') && integration.includes('notEstablished:'));
check('Graph does not imply motive or wrongdoing', /does not(?: by itself)? establish[^.]{0,160}motive|does not establish[^.]{0,160}wrongdoing/i.test(integration));

const cloudflare = read('scripts/build-cloudflare-output.js');
check('Cloudflare build runs Phase 6 tests', cloudflare.includes("runRequired('Phase 6 market activity test'"));
check('Cloudflare package requires public tracker routes', cloudflare.includes("'market-activity.html'") && cloudflare.includes("'market-watchlist.html'"));
check('Phase 6 diagnostics remain private', cloudflare.includes("'downloads/market-activity-test.json'"));

const failed = checks.filter(item => !item.pass);
const report = { ok: failed.length === 0, generatedAt: new Date().toISOString(), checks: checks.length, failures: failed.length, results: checks };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Phase 6 market activity test: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
