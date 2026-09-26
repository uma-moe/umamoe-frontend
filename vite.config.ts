import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { demoData } from './scripts/demo-data';
import { environment as production } from './src/config/environment.prod';
import { environment as beta } from './src/config/environment.beta';
import { fuseAllowed, insertFuseScript } from './src/services/ads/fuse-bootstrap';

const rootDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(async ({ mode }) => {
  // Keep the existing CI-injected public provider IDs during the framework migration.
  const environment = mode === 'production' ? production : beta;
  const variables = loadEnv(mode, rootDirectory, 'VITE_');
  return {
    root: rootDirectory,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [{
      name: 'fuse-head-loader',
      transformIndexHtml: (html: string) => html.replace('<!-- fuse-bootstrap -->',
        mode === 'production' || mode === 'beta'
          ? `<script>if((${fuseAllowed.toString()})(true))(${insertFuseScript.toString()})(${JSON.stringify(environment.fuse.scriptUrl)});</script>`
          : '')
    }, {
      name: 'svelte-runtime-error-details',
      enforce: 'pre',
      transform(code, id) {
        if (!/\/svelte\/src\/internal\/(client|shared)\/errors\.js$/.test(id.replaceAll('\\', '/'))) return;
        // Retain parameterized error messages without enabling Svelte's dev runtime.
        const devImport = "import { DEV } from 'esm-env';";
        if (!code.includes(devImport)) this.error('Svelte runtime error format changed; update the diagnostic transform.');
        return { code: code.replace(devImport, 'const DEV = true;'), map: null };
      }
    }, legacy({
      // Last Windows 7 browser generations, plus the existing Safari baseline.
      modernTargets: ['Chrome >= 109', 'Edge >= 109', 'Firefox >= 115', 'Safari >= 16.4', 'iOS >= 16.4'],
      modernPolyfills: true,
      renderLegacyChunks: false
    }), svelte(), ...(mode === 'demo' ? [await demoData()] : [])],
    optimizeDeps: {
      noDiscovery: true,
      include: ['exceljs', 'sql.js'],
      exclude: ['svelte', 'svelte/store', 'sv-router']
    },
    define: {
      __APP_ENVIRONMENT__: JSON.stringify(mode),
      __APP_CONFIG__: JSON.stringify({
        siteKey: variables.VITE_TURNSTILE_SITE_KEY ?? environment.turnstile.siteKey,
        measurementId: variables.VITE_GOOGLE_ANALYTICS_ID ?? environment.googleAnalytics.measurementId,
        providersEnabled: mode === 'production' || mode === 'beta',
        fuseSlots: environment.fuse.slots,
        statusApiUrl: environment.statusApiUrl
      }),
      __UI_LAB_ENABLED__: JSON.stringify(mode !== 'production')
    },
    build: {
      // Native imports remain lazy; Vite still loads split CSS before each page.
      // ponytail: skip JS preloading until WebKit's failed-preload cache is fixed:
      // https://bugs.webkit.org/show_bug.cgi?id=270357
      modulePreload: false,
      // Compiled code belongs to the shell artifact; /assets is deployed separately.
      assetsDir: 'app',
      manifest: true,
      sourcemap: mode !== 'production'
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: {
        strict: true,
        allow: [rootDirectory]
      },
      proxy: {
        '/api': 'http://127.0.0.1:3001',
        '/search': 'http://127.0.0.1:3002',
        '/ingest': 'http://127.0.0.1:3003',
        '/resources': { target: variables.VITE_RESOURCE_PROXY_TARGET ?? 'http://127.0.0.1:3004', changeOrigin: true },
        '/assets/data': { target: 'https://uma.moe', changeOrigin: true }
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']
    }
  };
});
