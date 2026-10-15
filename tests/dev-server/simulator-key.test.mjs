import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer, resolveConfig } from 'vite';

test('only local development injects the simulator key, without exposing it to the browser', async () => {
  const key = 'local-simulator-test-credential';
  const upstream = createHttpServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ key: request.headers['x-api-key'] ?? null, proof: request.headers['x-browser-proof'] }));
  });
  const previous = { SIMULATOR_API_KEY: process.env.SIMULATOR_API_KEY, VITE_SIM_PROXY_TARGET: process.env.VITE_SIM_PROXY_TARGET };
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  process.env.SIMULATOR_API_KEY = key;
  process.env.VITE_SIM_PROXY_TARGET = `http://127.0.0.1:${upstream.address().port}`;
  const configFile = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));
  try {
    for (const mode of ['development', 'beta', 'production']) {
      const server = await createServer({ configFile, configLoader: 'runner', mode, logLevel: 'silent', cacheDir: fileURLToPath(new URL(`../../.tmp/simulator-proxy-tests/${mode}`, import.meta.url)), server: { port: 5273, strictPort: false, hmr: false, watch: null } });
      try {
        await server.listen();
        const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
        const response = await fetch(`${origin}/api/sim/races/resimulate`, { method: 'POST', headers: { 'X-Browser-Proof': 'browser-proof' }, body: '{}' });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { key: mode === 'development' ? key : null, proof: 'browser-proof' });
        assert.equal(server.config.env.SIMULATOR_API_KEY, undefined);
        assert.ok(!(await (await fetch(`${origin}/src/services/race/race-resimulation.ts`)).text()).includes(key));
      } finally { await server.close(); }
    }
    const build = await resolveConfig({ configFile, configLoader: 'runner', mode: 'development', logLevel: 'silent' }, 'build');
    assert.equal(build.server.proxy['/api/sim'].headers, undefined);
  } finally {
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
