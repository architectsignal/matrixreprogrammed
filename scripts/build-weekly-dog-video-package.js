const fs = require('fs');
const path = require('path');

const root = process.cwd();
const latestPath = path.join(root, 'data', 'latest-drop.json');
const today = new Date().toISOString().slice(0, 10);

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function slugify(s = '') { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'dog-video'; }

if (!fs.existsSync(latestPath)) {
  throw new Error('Missing data/latest-drop.json. Run scripts/intel-drop-engine.js first.');
}

const drop = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const slug = `${today}-${slugify(drop.title)}`;
const outDir = path.join(root, 'video-packages', slug);
ensureDir(outDir);

const narration = [
  'Matrix Reprogrammed transmission.',
  'Tonight the signal is not hidden in rumour. It is sitting inside the public record.',
  `Evidence label: ${drop.label}.`,
  `Source: ${drop.source}.`,
  `The headline: ${drop.title}.`,
  'Do not treat one headline as the whole machine. Treat it as a door.',
  'Ask what structure it reveals: files, money, intelligence, crime, war, symbols, media, or consent.',
  'This is the D.O.G method: the guardian at the threshold, the file on the table, the pattern behind the noise.',
  `Reader path: ${drop.book.title}.`,
  'Download The Black File. The truth is not hidden. It is encoded.'
].join(' ');

const scenes = [
  {
    title: 'THE SIGNAL OPENS',
    prompt: 'dark D.O.G manga intro, black archive room, green Matrix rain, gold sigil glow, dog guardian silhouette at doorway, cinematic panel composition, no real person likeness'
  },
  {
    title: 'THE FILE',
    prompt: `redacted public-record dossier labelled ${drop.label}, source desk, court-file texture, intelligence archive mood, black green gold manga ink style`
  },
  {
    title: 'THE MACHINE BEHIND THE HEADLINE',
    prompt: 'shadow architecture behind news headline, gears of money, media, war, crime, intelligence and symbols, dog architect watching from threshold, graphic novel style'
  },
  {
    title: 'THE READER PATH',
    prompt: `book gateway scene for ${drop.book.title}, Matrix Reprogrammed archive shelves, black file on table, gold light, dark manga linework`
  },
  {
    title: 'THE BLACK FILE',
    prompt: 'final frame, black file opens, green code and gold seal, D.O.G guardian, text: The truth is not hidden. It is encoded. dark manga poster style'
  }
];

const metadata = {
  date: today,
  slug,
  title: `The File Behind The Headline: ${drop.title}`.slice(0, 96),
  evidenceLabel: drop.label,
  source: drop.source,
  sourceLink: drop.sourceLink,
  readerPath: drop.book,
  style: 'dark D.O.G manga dossier style, black/green/gold palette, Matrix rain, dog guardian, occult archive terminal, redacted files, cinematic shadows, no real person likeness, evidence label visible',
  narration,
  scenes,
  youtube: {
    title: `The File Behind The Headline: ${drop.title}`.slice(0, 96),
    description: [
      `Evidence label: ${drop.label}`,
      `Source: ${drop.source}`,
      drop.sourceLink,
      '',
      'Matrix Reprogrammed follows source, structure, and pattern. One headline is not the machine. It is the doorway.',
      '',
      `Reader path: ${drop.book.title}`,
      drop.book.localUrl,
      '',
      'Download The Black File:',
      'https://matrixreprogrammed.com/black-file.html'
    ].join('\n'),
    tags: ['Matrix Reprogrammed', 'D.O.G The Architect', 'Black File', 'Intel Desk', drop.label, 'public record', 'manga dossier']
  },
  facebook: {
    caption: [
      `WEEKLY D.O.G TRANSMISSION: ${drop.title}`,
      '',
      `Evidence label: ${drop.label}`,
      `Source: ${drop.source}`,
      '',
      'The headline is not the machine. It is the doorway.',
      '',
      `Reader path: ${drop.book.title}`,
      drop.book.localUrl,
      '',
      'Download The Black File: https://matrixreprogrammed.com/black-file.html',
      '',
      '#MatrixReprogrammed #DOGTheArchitect #BlackFile #IntelDesk'
    ].join('\n')
  }
};

const md = `# Weekly D.O.G Video Package — ${today}\n\n## Title\n\n${metadata.title}\n\n## Evidence\n\n- Label: ${drop.label}\n- Source: ${drop.source}\n- Source link: ${drop.sourceLink}\n\n## Narration\n\n${narration}\n\n## Visual Style\n\n${metadata.style}\n\n## Scene Prompts\n\n${scenes.map((s, i) => `### Scene ${i + 1}: ${s.title}\n\n${s.prompt}`).join('\n\n')}\n\n## YouTube Description\n\n\`\`\`text\n${metadata.youtube.description}\n\`\`\`\n\n## Facebook Caption\n\n\`\`\`text\n${metadata.facebook.caption}\n\`\`\`\n`;

fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(metadata, null, 2));
fs.writeFileSync(path.join(outDir, 'package.md'), md);
fs.writeFileSync(path.join(root, 'data', 'latest-video-package.json'), JSON.stringify(metadata, null, 2));
fs.writeFileSync(path.join(outDir, 'narration.txt'), narration);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#010302"/><defs><radialGradient id="g" cx="50%" cy="30%" r="70%"><stop offset="0%" stop-color="#003d1b"/><stop offset="60%" stop-color="#020503"/><stop offset="100%" stop-color="#000"/></radialGradient></defs><rect width="1080" height="1920" fill="url(#g)" opacity="0.9"/>${Array.from({length:55}).map((_,i)=>`<text x="${20+(i*73)%1040}" y="${60+(i*137)%1800}" fill="#00ff66" opacity="${0.08+(i%6)*0.025}" font-family="monospace" font-size="${18+(i%5)*8}">DOG FILE SIGNAL</text>`).join('')}<rect x="70" y="100" width="940" height="1720" fill="none" stroke="#00ff66" stroke-opacity="0.55" stroke-width="3"/><rect x="100" y="130" width="880" height="1660" fill="none" stroke="#d7b35a" stroke-opacity="0.45" stroke-width="2"/><text x="100" y="290" fill="#d7b35a" font-family="monospace" font-size="38" letter-spacing="5">MATRIX REPROGRAMMED</text><text x="100" y="440" fill="#eaffef" font-family="Georgia,serif" font-size="92" font-weight="bold">THE FILE</text><text x="100" y="545" fill="#00ff66" font-family="Georgia,serif" font-size="76" font-weight="bold">BEHIND THE</text><text x="100" y="645" fill="#00ff66" font-family="Georgia,serif" font-size="76" font-weight="bold">HEADLINE</text><text x="100" y="760" fill="#d7b35a" font-family="monospace" font-size="30">${esc(drop.label).toUpperCase()}</text><foreignObject x="100" y="820" width="860" height="420"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;color:#cffff0;font-size:44px;line-height:1.25;font-weight:700;">${esc(drop.title)}</div></foreignObject><circle cx="540" cy="1370" r="170" fill="none" stroke="#00ff66" stroke-opacity="0.5" stroke-width="4"/><text x="360" y="1385" fill="#eaffef" font-family="Georgia,serif" font-size="84" font-weight="bold">D.O.G</text><text x="100" y="1670" fill="#00ff66" font-family="monospace" font-size="30">THE TRUTH IS NOT HIDDEN. IT IS ENCODED.</text></svg>`;
fs.writeFileSync(path.join(outDir, 'poster.svg'), svg);

console.log(`Weekly D.O.G video package created: ${outDir}`);
