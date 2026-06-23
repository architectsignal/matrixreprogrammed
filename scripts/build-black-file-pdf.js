const fs = require('fs');
const path = require('path');

const W = 612, H = 792, M = 54;
const GREEN = [0, 1, 0.4], SOFT = [0.78, 1, 0.84], PALE = [0.92, 1, 0.94], GOLD = [0.86, 0.70, 0.34], DARK = [0.005, 0.015, 0.008], PANEL = [0.015, 0.045, 0.025], MUTED = [0.55, 0.78, 0.60];
const outPath = path.join(process.cwd(), 'downloads', 'the-black-file-matrix-reprogrammed.pdf');

const rgb = c => `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const text = (x, y, s, size = 10, font = 'F1', color = SOFT) => `BT /${font} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(s)}) Tj ET\n`;
const rect = (x, y, w, h, fill = null, stroke = null, lw = .7) => `${fill ? `${rgb(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n` : ''}${stroke ? `${lw.toFixed(2)} w ${rgb(stroke)} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n` : ''}`;
const line = (x1, y1, x2, y2, color = GREEN, lw = .7) => `${lw.toFixed(2)} w ${rgb(color)} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;

function wrap(s, max = 72) {
  const words = String(s).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!w) continue;
    if ((cur + ' ' + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function multi(x, y, s, size = 9.5, font = 'F1', color = SOFT, width = 72, leading = null) {
  let o = '';
  if (!leading) leading = size * 1.42;
  for (const para of String(s).split('\n')) {
    if (!para.trim()) { y -= leading; continue; }
    for (const ln of wrap(para, width)) {
      o += text(x, y, ln, size, font, color);
      y -= leading;
    }
  }
  return [o, y];
}

function frame(title, subtitle, pageNum) {
  let c = '';
  c += rect(0, 0, W, H, DARK);
  for (let x = 18, i = 0; x < W; x += 54, i++) c += rect(x, 0, 1, H, [0, 0.08 + (i % 3) * 0.012, 0.035]);
  c += rect(26, 24, W - 52, H - 48, null, [0, 0.42, 0.18], .85);
  c += rect(36, 34, W - 72, H - 68, null, [0.44, 0.34, 0.13], .35);
  c += line(M, H - 58, W - M, H - 58, GOLD, .9);
  c += line(M, 54, W - M, 54, GREEN, .65);
  c += text(M, H - 44, 'MATRIX REPROGRAMMED', 8.2, 'F2', GOLD);
  c += text(W - 205, H - 44, 'THE BLACK FILE', 8.2, 'F2', GREEN);
  if (title) {
    c += text(M, H - 88, title.toUpperCase(), 18, 'F2', PALE);
    c += line(M, H - 99, W - M, H - 99, GREEN, .55);
  }
  if (subtitle) c += text(M, H - 116, subtitle, 9.5, 'F1', GOLD);
  if (pageNum) {
    c += text(M, 34, 'THE TRUTH IS NOT HIDDEN. IT IS ENCODED.', 7.5, 'F2', MUTED);
    c += text(W - 92, 34, String(pageNum).padStart(2, '0'), 8, 'F2', GOLD);
  }
  return c;
}

const pages = [];
let c = '';
c += rect(0, 0, W, H, DARK);
c += rect(34, 34, W - 68, H - 68, null, GREEN, 1.1);
c += rect(50, 50, W - 100, H - 100, null, GOLD, .55);
c += rect(74, 160, W - 148, 420, [0, 0.025, 0.012], [0, 0.55, 0.22], .8);
for (let x = 72, i = 0; x < W - 72; x += 28, i++) c += line(x, 92, x, H - 90, [0, 0.16 + (i % 4) * 0.025, 0.06], .35);
c += text(92, 690, 'MATRIX REPROGRAMMED', 10, 'F2', GOLD);
c += line(92, 674, W - 92, 674, GOLD, .8);
c += text(92, 606, 'THE', 28, 'F2', GREEN);
c += text(92, 548, 'BLACK FILE', 58, 'F2', PALE);
c += text(96, 510, 'A 33-SYSTEM READER GATEWAY', 14, 'F2', GOLD);
c += multi(96, 456, 'The world does not run on headlines. It runs on systems. This file is the first map: symbols, intelligence, crime, media, money, war, psychology, ritual, surveillance, institutions, and consent.', 11, 'F1', SOFT, 58)[0];
c += rect(96, 242, 420, 88, [0, 0.035, 0.016], [0, 0.62, 0.25], .9);
c += text(116, 300, 'ACCESS LEVEL: READER INITIATION', 12, 'F2', GREEN);
c += text(116, 274, 'FUNCTION: TURN NOISE INTO STRUCTURE', 10, 'F1', GOLD);
c += text(116, 250, 'RULE: SOURCE FIRST. CLAIM SECOND.', 10, 'F1', SOFT);
c += text(92, 96, 'THE TRUTH IS NOT HIDDEN. IT IS ENCODED.', 10, 'F2', GREEN);
pages.push(c);

c = frame('Reader Briefing', 'Why this file exists', 2);
c += rect(M, 160, W - 2 * M, 445, PANEL, [0, 0.45, 0.18], .7);
c += multi(M + 24, 570, 'The Black File is not another pile of headlines. It is a map for seeing the systems behind the visible story. Most people collect fragments and drown in them. This file teaches the first discipline of Matrix Reprogrammed: pattern recognition.\n\nA story matters when it reveals structure. A court record matters when it exposes a route. A symbol matters when it repeats across institutions. A war story matters when it shows logistics, money, intelligence, propaganda, and public fear moving together.\n\nThe purpose is not panic. The purpose is literacy. Once a reader sees the structure, they can choose the correct door into the archive.', 11, 'F1', SOFT, 67)[0];
c += text(M + 24, 210, 'CORE FORMULA', 12, 'F2', GOLD);
c += text(M + 24, 184, 'TRAFFIC -> BLACK FILE -> SHELF -> BOOK PAGE -> AMAZON / KU / HARDBACK', 9, 'F2', GREEN);
pages.push(c);

c = frame('How To Use The File', 'Do not browse. Choose a door.', 3);
c += rect(M, 142, W - 2 * M, 466, PANEL, [0, 0.45, 0.18], .7);
['Read the 33 systems once without arguing with them.', 'Mark the systems you already see in current events.', 'Choose the shelf that matches your obsession.', 'Enter the first book page in that shelf.', 'Use the Intel Desk to connect live events to the archive.', 'Keep evidence boundaries: fact, inference, allegation, speculation.'].forEach((it, i) => {
  const y = 560 - i * 54;
  c += rect(M + 24, y - 9, 34, 24, [0, 0.08, 0.035], GOLD, .55);
  c += text(M + 33, y - 2, String(i + 1).padStart(2, '0'), 9, 'F2', GOLD);
  c += text(M + 70, y, it, 10.5, 'F1', SOFT);
});
c += text(M + 24, 190, 'If a story does not lead to a source, a shelf, a book, or a useful question, it is probably noise.', 10, 'F2', GREEN);
pages.push(c);

const systems = [
  ['01', 'The Attention System', 'What captures attention becomes the first gate of control.'],
  ['02', 'The Fear System', 'Fear compresses judgement and makes the public seek authority.'],
  ['03', 'The Symbol System', 'Symbols compress doctrine, hierarchy, memory, and power into images.'],
  ['04', 'The Money System', 'Money is permission, pressure, access, and memory.'],
  ['05', 'The Intelligence System', 'Agencies, contractors, archives, secrecy, and oversight failure form a hidden state language.'],
  ['06', 'The Crime-State Overlap', 'Organized crime scales through logistics, corruption, finance, and official blindness.'],
  ['07', 'The Media Frame', 'The frame decides what the public sees before the argument begins.'],
  ['08', 'The War Machine', 'War moves through weapons, banks, sanctions, logistics, propaganda, and fear.'],
  ['09', 'The Surveillance Net', 'Collection turns private life into strategic material.'],
  ['10', 'The Foundation Network', 'Philanthropy can fund culture, policy, research, narrative, and access.'],
  ['11', 'The Ritual Layer', 'Ceremony teaches the body before doctrine reaches the mind.'],
  ['12', 'The Education Gate', 'Education can open the world or define the allowed map.'],
  ['13', 'The Legal Mask', 'Law can reveal truth, bury truth, or dress power in procedure.'],
  ['14', 'The Corporate Shell', 'Companies can hold assets, distance actors, and transform liability into fog.'],
  ['15', 'The Propaganda Weather', 'Propaganda works best when it feels like the atmosphere.'],
  ['16', 'The Crisis Dialectic', 'Crisis creates the emotional conditions for pre-written solutions.'],
  ['17', 'The Controlled Opposition Door', 'A false enemy can protect the real structure by absorbing dissent.'],
  ['18', 'The Technocratic Priesthood', 'Technical language becomes priesthood when the public cannot audit it.'],
  ['19', 'The Data Harvest', 'Data turns behavior into prediction, ranking, targeting, and control.'],
  ['20', 'The Security State', 'Security expands fastest when fear is treated as consent.'],
  ['21', 'The Philanthropy Shield', 'Good language can shield hard power from public suspicion.'],
  ['22', 'The Occult Architecture', 'Older symbolic systems still echo in institutions, monuments, logos, and rituals.'],
  ['23', 'The Social Credit Mind', 'The cage begins inside behavior long before it becomes policy.'],
  ['24', 'The Financial Choke Point', 'Control the payment rails and you control what can move.'],
  ['25', 'The Memory Hole', 'Forgetting is not absence. It can be engineered.'],
  ['26', 'The Celebrity Veil', 'Fame redirects attention away from structure toward theatre.'],
  ['27', 'The Public-Private Switch', 'Power moves when public authority and private infrastructure blur.'],
  ['28', 'The Archive Drop', 'A release has timing, provenance, motive, and framing.'],
  ['29', 'The Court Record', 'Court records show what can be said under pressure and procedure.'],
  ['30', 'The Dossier Pattern', 'A dossier maps names, routes, institutions, timelines, and evidence boundaries.'],
  ['31', 'The False Light', 'Not all illumination liberates. Some light makes the cage easier to navigate.'],
  ['32', 'The Black File', 'The gateway file that turns curiosity into a structured archive path.'],
  ['33', 'The Architect Signal', 'The reader stops collecting fragments and begins seeing design.']
];

for (let p = 0; p < 6; p++) {
  const chunk = systems.slice(p * 6, p * 6 + 6);
  if (!chunk.length) break;
  c = frame('The 33 Systems', `Layer ${p + 1}: hidden architecture behind visible events`, 4 + p);
  let y = 610;
  for (const [num, name, desc] of chunk) {
    c += rect(M, y - 58, W - 2 * M, 50, PANEL, [0, 0.34, 0.14], .45);
    c += text(M + 14, y - 27, num, 20, 'F2', GOLD);
    c += text(M + 60, y - 16, name.toUpperCase(), 10.2, 'F2', PALE);
    c += multi(M + 60, y - 33, desc, 8.8, 'F1', SOFT, 62, 11)[0];
    y -= 72;
  }
  pages.push(c);
}

c = frame('Choose Your Door', 'Four shelves. One archive.', 10);
const paths = [
  ['MASONIC & ESOTERIC', 'Symbols -> Degree I -> Degree III -> D.O.G The Architect', 'For readers who see symbols, ritual architecture, temples, degrees, sacred number, mystery schools, and hidden meaning.'],
  ['SURVIVAL & WAR', 'Intel Desk -> WWIII -> KEEP CALM', 'For readers watching war, system failure, cyber pressure, shortages, blackouts, propaganda, and civilian stress.'],
  ['DARK PSYCHOLOGY', 'Analyze Anyone -> Manipulation Immunity -> Mind Control', 'For readers studying behavior, manipulation defense, influence, narcissists, persuasion, emotional pressure, and mental sovereignty.'],
  ['DOSSIERS & PUBLIC RECORD', 'Intel Desk -> Masons in the UN -> Intelligence -> Crime', 'For readers who want court records, declassified files, sanctions, agency archives, crime-state overlap, and evidence boundaries.']
];
let y = 590;
for (const row of paths) {
  c += rect(M, y - 86, W - 2 * M, 76, PANEL, row[0].includes('MASONIC') ? GOLD : [0, 0.45, 0.18], .7);
  c += text(M + 20, y - 28, row[0], 12, 'F2', PALE);
  c += text(M + 20, y - 50, row[1], 9, 'F2', GREEN);
  c += multi(M + 20, y - 67, row[2], 8.7, 'F1', SOFT, 72, 10)[0];
  y -= 105;
}
pages.push(c);

c = frame('Evidence Boundary', 'The serious reader does not fake certainty.', 11);
c += rect(M, 124, W - 2 * M, 510, PANEL, [0, 0.45, 0.18], .7);
const labels = [
  ['CONFIRMED', 'Directly supported by reliable public record, official documents, court filings, or primary source material.'],
  ['STRONGLY DOCUMENTED', 'Supported by multiple credible sources or consistent official/public-record material.'],
  ['INFERENCE', 'A careful connection drawn from documented facts, clearly marked as interpretation.'],
  ['ALLEGATION', 'A claim made by a party, witness, source, or document, not treated as proven fact.'],
  ['SPECULATION', 'A possibility or theory clearly labelled as such.'],
  ['SYMBOLIC INTERPRETATION', 'Meaning analysis of images, rituals, architecture, numbers, or repeated motifs.']
];
y = 585;
for (const [lab, desc] of labels) {
  c += text(M + 24, y, lab, 10, 'F2', lab.startsWith('S') || lab === 'CONFIRMED' ? GOLD : GREEN);
  c += multi(M + 180, y, desc, 8.8, 'F1', SOFT, 50, 11)[0];
  y -= 68;
}
c += text(M + 24, 162, 'RULE: Evidence boundaries do not weaken the archive. They make it harder to dismiss.', 9, 'F2', PALE);
pages.push(c);

c = frame('The Flagship Door', 'D.O.G The Architect', 12);
c += rect(M, 200, W - 2 * M, 390, PANEL, GOLD, .85);
c += multi(M + 28, 545, 'D.O.G The Architect is the centre of the Matrix Reprogrammed machine. It is not just a book about symbols. It is a book about the architecture behind symbols. Thirty-three gates through mystery schools, temples, sacred number, myths, ritual structures, artificial intelligence, false light, body-as-temple doctrine, the lost Word, the false crown, the true crown, and the hidden war over meaning itself.', 11.3, 'F1', SOFT, 63, 16)[0];
c += text(M + 28, 292, 'THE COLLECTOR PATH', 12, 'F2', GOLD);
c += multi(M + 28, 266, 'Black File -> Masonic Shelf -> D.O.G Page -> Collector Sequence -> Premium Hardback / Masterwork', 10, 'F2', GREEN, 62)[0];
pages.push(c);

c = rect(0, 0, W, H, DARK);
c += rect(40, 40, W - 80, H - 80, null, GREEN, 1.2);
c += rect(60, 60, W - 120, H - 120, null, GOLD, .6);
for (let x = 90; x < W - 90; x += 36) c += line(x, 90, x, H - 90, [0, 0.13, 0.055], .4);
c += text(86, 642, 'FINAL SIGNAL', 16, 'F2', GOLD);
c += text(86, 575, 'THE TRUTH IS NOT HIDDEN.', 32, 'F2', PALE);
c += text(86, 526, 'IT IS ENCODED.', 44, 'F2', GREEN);
c += multi(90, 444, 'Enter the archive. Choose the shelf. Follow the source. Read the system. Then return to the world with a different eye.', 13, 'F1', SOFT, 54, 18)[0];
c += rect(90, 230, 432, 72, [0, 0.035, 0.016], [0, 0.55, 0.22], .8);
c += text(112, 274, 'MATRIXREPROGRAMMED.COM', 14, 'F2', GOLD);
c += text(112, 250, 'BOOKS  |  INTEL DESK  |  BLACK FILE  |  D.O.G', 9, 'F2', GREEN);
c += text(90, 112, 'MATRIX REPROGRAMMED', 10, 'F2', GOLD);
pages.push(c);

function buildPdf(pageStreams) {
  const objects = [];
  const add = o => { objects.push(o); return objects.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  const f3 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>');
  const pageIds = [];
  pageStreams.forEach(content => {
    const len = Buffer.byteLength(content, 'ascii');
    const cid = add(`<< /Length ${len} >>\nstream\n${content}endstream`);
    const pid = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${cid} 0 R >>`);
    pageIds.push(pid);
  });
  objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(off => { pdf += `${String(off).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buildPdf(pages), 'ascii');
console.log(`Generated ${outPath} with ${pages.length} pages`);
