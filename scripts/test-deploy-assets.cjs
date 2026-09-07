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
    for (const artwork of [false, true]) {
      for (const manual of [false, true]) {
        const values = {
          'steps.asset_changes.outputs.assets': String(assets),
          'steps.timeline_artwork.outputs.changed': artwork ? 'true' : '',
          'github.event_name': manual ? 'workflow_dispatch' : 'push',
          "github.event.inputs.deploy_assets || 'false'": String(manual),
        };
        const command = script.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, key) => {
          assert.ok(key in values, `Unknown workflow expression: ${key}`);
          return values[key];
        });
        fs.writeFileSync(output, '');
        execFileSync(bash, ['--noprofile', '--norc', '-eu', '-c', command], {
          env: { ...process.env, GITHUB_OUTPUT: output.replace(/\\/g, '/') },
        });
        assert.equal(fs.readFileSync(output, 'utf8').trim(), `should_build=${assets || artwork || manual}`);
      }
    }
  }
  console.log('Asset deployment decision: all 8 cases passed.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
