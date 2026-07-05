const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(p){ return fs.existsSync(path.join(root,p)); }
function read(p){ return fs.readFileSync(path.join(root,p),'utf8'); }
const failures = [];
function file(p){ if(!exists(p)) failures.push(`${p} missing`); }
function text(p,m){ if(!exists(p) || !read(p).includes(m)) failures.push(`${p} missing ${m}`); }
file('elite-reports.html');
file('data/elite-reports.json');
file('downloads/elite-reports.md');
file('reports/daily-revelation-report.html');
file('reports/missing-records-report.html');
file('reports/contradiction-watch-report.html');
text('elite-reports.html','ELITE REPORTS');
text('elite-reports.html','Daily Revelation Report');
text('reports/daily-revelation-report.html','Why it matters');
text('reports/daily-revelation-report.html','Evidence status');
text('reports/daily-revelation-report.html','What cannot be concluded');
text('reports/missing-records-report.html','A missing record is a watch trigger');
try {
  const data = JSON.parse(read('data/elite-reports.json'));
  if (!Array.isArray(data.reports)) failures.push('elite reports JSON missing reports array');
  if ((data.reports || []).length < 3) failures.push('elite reports JSON has too few reports');
} catch (error) {
  failures.push('elite reports JSON invalid');
}
if (failures.length) {
  console.error('ELITE REPORT WRITER TEST FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('ELITE REPORT WRITER TEST PASSED');
