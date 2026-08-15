'use strict';

const fs = require('fs');
const path = require('path');

const generatorPath = path.join(process.cwd(), 'scripts', 'build-phase5-ai-answer-engine.js');
const source = fs.readFileSync(generatorPath, 'utf8');
const required = [
  '<a href="ai-speculative-conclusions.html">AI Hypotheses</a>',
  '<a class="btn alt" href="ai-speculative-conclusions.html">AI Speculative Conclusions</a>'
];
const missing = required.filter(marker => !source.includes(marker));

if (missing.length) {
  console.error(`AI speculation link owner test failed: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('AI speculation link owner test passed: the controlled Answer Engine generator owns both visible routes.');
