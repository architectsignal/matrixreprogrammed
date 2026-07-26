const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();

function run(script) {
  const file = path.join(root, 'scripts', script);
  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 100
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit ${result.status}`);
  }
}

// Every Death Files build is immediately followed by the canonical pressure
// test. This prevents any late caller from regenerating readable dossiers and
// then publishing structured JavaScript values as literal "[object Object]".
run('build-death-files-core.js');
run('death-files-pressure-test.js');
