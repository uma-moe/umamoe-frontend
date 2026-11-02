// One command for local development against the Docker stack, on Windows, macOS and Linux:
//   npm run dev:local          build what changed, start the stack, then run Vite on this machine
//   npm run dev:local -- down  stop the stack (data volumes are kept)
//   npm run dev:local -- logs | ps
// Vite runs outside Docker on purpose: Docker Desktop reads Windows folders slowly and never
// reports file changes into containers, so a containerised dev server is slow or out of date.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const first = process.argv[2], action = !first || first.startsWith('-') ? 'dev' : first;
// Anything after the action (or every argument, when none is given) goes to Vite, e.g. `npm run dev:local -- --port 5180`.
const viteArgs = process.argv.slice(action === first ? 3 : 2);
const actions = ['dev', 'up', 'down', 'logs', 'ps', 'config'];
if (!actions.includes(action)) fail('Usage: npm run dev:local [-- ' + actions.join('|') + ']');

const settings = join(root, '.env.stack.local'), keyFile = join(root, '.tmp', 'local-stack', 'simulator.key');
if (!existsSync(settings)) {
  copyFileSync(join(root, '.env.stack.local.example'), settings);
  console.log('Created .env.stack.local; existing development settings were left untouched.');
}
mkdirSync(dirname(keyFile), { recursive: true });
if (!existsSync(keyFile) || !readFileSync(keyFile, 'utf8').trim()) {
  writeFileSync(keyFile, 'uma_k_' + randomBytes(24).toString('hex') + '\n');
  // Compose bind-mounts file secrets; the non-root backend container must be able to read this local-only key.
  chmodSync(keyFile, 0o644);
}
const stack = Object.fromEntries(readFileSync(settings, 'utf8').split(/\r?\n/).flatMap(line => {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
}));
const port = (name, fallback) => stack[name] || fallback;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { cwd: root, stdio: options.quiet ? 'ignore' : 'inherit' });
  if (result.error) fail('Docker with Compose is required: ' + result.error.message);
  return result.status ?? 1;
}
const compose = (...args) => docker(['compose', '--env-file', '.env.stack.local', '-f', 'compose.local.yaml', '--profile', 'app', ...args]);
function fail(message) { console.error(message); process.exit(1); }

if (compose('config', '--quiet') !== 0) fail('compose.local.yaml or .env.stack.local is invalid.');
if (action === 'config') { console.log('Local Compose configuration is valid.'); process.exit(0); }
if (docker(['info'], { quiet: true }) !== 0) fail('Start Docker Desktop (or Docker Engine), then run this command again.');
if (action === 'down') process.exit(compose('down'));
if (action === 'logs') process.exit(compose('logs', '--follow', '--tail', '100'));
if (action === 'ps') process.exit(compose('ps'));

// Rebuild whatever changed in the sibling repositories and (re)start everything except the containerised frontend.
console.log('Starting the local stack; the first build takes a while, later starts only rebuild what changed…');
if (compose('up', '--build', '--detach', '--wait', '--wait-timeout', '900', '--remove-orphans', '--scale', 'frontend=0') !== 0) {
  fail('The local stack did not become healthy. See `npm run dev:local -- logs` or `npm run dev:local -- ps`.');
}
if (action === 'up') { compose('ps'); process.exit(0); }

const local = 'http://127.0.0.1:';
const env = {
  ...process.env,
  // Environment variables override .env.development.local for this process only; that file stays untouched.
  VITE_API_PROXY_TARGET: local + port('LOCAL_BACKEND_PORT', '3301'),
  VITE_SIM_PROXY_TARGET: local + port('LOCAL_BACKEND_PORT', '3301'),
  VITE_SEARCH_PROXY_TARGET: local + port('LOCAL_SEARCH_PORT', '3302'),
  VITE_INGEST_PROXY_TARGET: local + port('LOCAL_INGEST_PORT', '3303'),
  VITE_RESOURCE_PROXY_TARGET: local + port('LOCAL_RESOURCES_PORT', '3304'),
  SIMULATOR_API_KEY: readFileSync(keyFile, 'utf8').trim()
};
console.log('Stack is up. Open /simulator/race on the address Vite prints below. Ctrl+C stops Vite; the stack keeps running until `npm run dev:local -- down`.');
const vite = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--configLoader', 'runner', '--mode', 'development', ...viteArgs], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => vite.kill(signal));
vite.on('exit', code => process.exit(code ?? 0));
