const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/docker-image.yml'), 'utf8');
const step = workflow.match(/- name: Decide whether assets should deploy[\s\S]*?run: \|\r?\n([\s\S]*?)(?=\r?\n      - name:)/)[1];
const script = step.replace(/^          /gm, '').replace(/\r/g, '');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-assets-test-'));
const output = path.join(directory, 'output');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

try {
  for (const assets of [false, true]) {
    for (const manual of [false, true]) {
      for (const force of [false, true]) {
        const values = {
          'steps.asset_changes.outputs.assets': String(assets),
          'github.event_name': manual ? 'workflow_dispatch' : 'push',
          "github.event.inputs.deploy_assets || 'false'": String(force),
        };
        const command = script.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, key) => {
          assert.ok(key in values, `Unknown workflow expression: ${key}`);
          return values[key];
        });
        fs.writeFileSync(output, '');
        execFileSync(bash, ['--noprofile', '--norc', '-eu', '-c', command], {
          env: { ...process.env, GITHUB_OUTPUT: output.replace(/\\/g, '/') },
        });
        assert.equal(fs.readFileSync(output, 'utf8').trim(), `should_build=${assets || (manual && force)}`);
      }
    }
  }
  console.log('Asset deployment decision: all 8 cases passed.');
  const permissionSteps = [...workflow.matchAll(/- name: Ensure remote asset directories are writable[\s\S]*?run: \|\r?\n([\s\S]*?)(?=\r?\n      - name:)/g)];
  assert.equal(permissionSteps.length, 2);
  for (const [, body] of permissionSteps) {
    // Simulate writable parents containing foreign-owned files: chmod must
    // fail until the existing Docker ownership repair has run.
    const mocks = `
      repaired=false
      ssh() { eval "\u0024{@: -1}"; }
      mkdir() { :; }
      test() { if [[ \u00241 == -w ]]; then return 0; fi; builtin test "\u0024@"; }
      docker() { repaired=true; printf '%s\\n' "\u0024@"; }
      chmod() { [[ \u0024repaired == true ]]; }
      touch() { :; }
      rm() { :; }
    `;
    const result = execFileSync(bash, ['--noprofile', '--norc', '-eu', '-c', mocks + body.replace(/^          /gm, '').replace(/\r/g, '')], {
      env: { ...process.env, DEPLOY_PORT: '22', DEPLOY_USER: 'deploy', DEPLOY_HOST: 'test', REMOTE_ASSETS_DIR: '/assets' },
      encoding: 'utf8',
    });
    assert.ok(result.includes('/assets/timeline-images:/target/timeline-images'));
    assert.ok(!result.includes('statistics'));
  }
  console.log('Asset permissions: both deployments repair foreign-owned descendants.');
  const shellSteps = [...workflow.matchAll(/- name: Deploy (?:beta|production) shell bundle[\s\S]*?run: \|\r?\n([\s\S]*?)(?=\r?\n      - name:)/g)];
  assert.equal(shellSteps.length, 2);
  for (const [index, [, body]] of shellSteps.entries()) {
    const options = [...body.matchAll(/--(delete|delay-updates|exclude|filter)(?: '([^']+)')?/g)].flatMap(([, option, value]) => value ? ['--' + option, value] : ['--' + option]);
    assert.ok(options.includes('--delay-updates'));
    assert.ok(options.includes('P /app/***'));
    if (process.platform === 'win32') continue; // Real rsync fixtures run on the Linux CI runner.
    const source = path.join(directory, `source-${index}`), target = path.join(directory, `target-${index}`);
    for (const root of [source, target]) fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(source, 'index.html'), 'new shell');
    fs.writeFileSync(path.join(source, 'app/new.js'), 'new code');
    fs.writeFileSync(path.join(source, 'app/new.css'), 'new styles');
    fs.writeFileSync(path.join(target, 'app/old.js'), 'old code');
    fs.writeFileSync(path.join(target, 'app/old.css'), 'old styles');
    fs.writeFileSync(path.join(target, 'obsolete.html'), 'obsolete');
    execFileSync('rsync', ['-a', ...options, source + '/', target + '/']);
    assert.equal(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), 'new shell');
    for (const file of ['new.js', 'new.css', 'old.js', 'old.css']) assert.ok(fs.existsSync(path.join(target, 'app', file)), `Missing ${file}`);
    assert.ok(!fs.existsSync(path.join(target, 'obsolete.html')));
  }
  console.log('Shell deployment: both environments protect older chunks and stage updates.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
