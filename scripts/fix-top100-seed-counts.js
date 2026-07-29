const fs = require("fs");
const path = require("path");
const root = process.cwd();
const file = path.join(root, "scripts", "complete-money-top100.js");
let text = fs.readFileSync(file, "utf8");
const textNewline = text.includes("\r\n") ? "\r\n" : "\n";
text = text.replace(/\r\n/g, "\n");
const repairs = [
  {
    label: "Sovereign Wealth Funds",
    anchor:
      '    "Sri Lanka sovereign investment initiatives"\n  ],\n  "Top 100 Pension Funds"',
    replacement:
      '    "Sri Lanka sovereign investment initiatives",\n    "Nepal Investment Board sovereign vehicles"\n  ],\n  "Top 100 Pension Funds"',
  },
  {
    label: "Media Owners",
    anchor: '    "CJ ENM"\n  ],\n  "Top 100 Technology-Control Companies"',
    replacement:
      '    "CJ ENM",\n    "Seven West Media"\n  ],\n  "Top 100 Technology-Control Companies"',
  },
  {
    label: "Political Money Networks",
    anchor:
      '    "No Labels political network"\n  ],\n  "Top 100 Philanthropic Power Networks"',
    replacement:
      '    "No Labels political network",\n    "National Association of Home Builders BUILD-PAC"\n  ],\n  "Top 100 Philanthropic Power Networks"',
  },
];
let changed = 0;
for (const repair of repairs) {
  if (text.includes(repair.replacement)) continue;
  if (!text.includes(repair.anchor))
    throw new Error(`${repair.label} seed repair anchor missing`);
  text = text.replace(repair.anchor, repair.replacement);
  changed++;
}
if (changed) fs.writeFileSync(file, text.replace(/\n/g, textNewline));
const workerPath = path.join(root, "src", "worker-contact-intake.js");
let worker = fs.readFileSync(workerPath, "utf8");
const workerNewline = worker.includes("\r\n") ? "\r\n" : "\n";
worker = worker.replace(/\r\n/g, "\n");
let workerChanged = false;
if (
  !worker.includes(
    "submission.encryptedPayload) lines.push('', submission.encryptedPayload)",
  )
) {
  const pattern = /  const body = \[\n([\s\S]*?)\n  \]\.join\('\\n'\);/;
  if (!pattern.test(worker))
    throw new Error("Contact ciphertext notification block not found");
  worker = worker.replace(
    pattern,
    (match, body) =>
      `  const lines = [\n${body}\n  ];\n  if (submission.encrypted && submission.encryptedPayload) lines.push('', submission.encryptedPayload);\n  const body = lines.join('\\n');`,
  );
  const oldCall =
    "sendNotification(env, { reference, route, encrypted, subject, urgent: urgent === 1 })";
  const newCall =
    "sendNotification(env, { reference, route, encrypted, encryptedPayload, subject, urgent: urgent === 1 })";
  if (!worker.includes(newCall)) {
    if (!worker.includes(oldCall))
      throw new Error("Contact notification call anchor not found");
    worker = worker.replace(oldCall, newCall);
  }
  fs.writeFileSync(workerPath, worker.replace(/\n/g, workerNewline));
  workerChanged = true;
}
console.log(
  `Top 100 seed counts repaired: ${repairs.length} categories checked, ${changed} mutation(s) applied; PGP ciphertext notification ${workerChanged ? "repaired" : "already current"}.`,
);
