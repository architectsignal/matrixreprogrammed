#!/usr/bin/env node
'use strict';

const { createRuntime } = require('./runtime');

async function main() {
  const maxTasksArg = process.argv.find((argument) => argument.startsWith('--max-tasks='));
  const maxTasks = maxTasksArg ? Number.parseInt(maxTasksArg.split('=')[1], 10) : 10;
  const runtime = createRuntime();
  const results = await runtime.missionDirector.run({ maxTasks });
  const audit = runtime.auditLog.verify();
  process.stdout.write(`${JSON.stringify({
    rootDir: runtime.rootDir,
    publicationMode: runtime.publicationGate.mode,
    results,
    audit,
  }, null, 2)}\n`);
  if (!audit.valid) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
