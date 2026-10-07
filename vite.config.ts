import { svelte } from '@sveltejs/vite-plugin-svelte';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { demoData } from './scripts/demo-data';
import { seoPagesPlugin } from './scripts/seo-pages';
import { environment as production } from './src/config/environment.prod';
import { environment as beta } from './src/config/environment.beta';

const rootDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(async ({ mode, command }) => {
  // Keep the existing CI-injected public provider IDs during the framework migration.
  const environment = mode === 'production' ? production : beta;
  const variables = loadEnv(mode, rootDirectory, 'VITE_');
  const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG) && ['production', 'beta'].includes(mode);
  if (command === 'build' && ['production', 'beta'].includes(mode) && !uploadSourceMaps) {
    console.warn('Sentry build credentials are unset: source-map upload is disabled for this build.');
  }
  return {
    root: rootDirectory,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [{
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
    }), svelte(), seoPagesPlugin(), ...(mode === 'demo' ? [await demoData()] : []), sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: 'umamoe-frontend',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      applicationKey: 'umamoe-frontend',
      errorHandler: error => { throw error; },
      release: { name: process.env.APP_BUILD_VERSION, inject: false, create: uploadSourceMaps, finalize: uploadSourceMaps },
      sourcemaps: { disable: !uploadSourceMaps, filesToDeleteAfterUpload: ['./dist/**/*.map'] },
    })],
    optimizeDeps: {
      noDiscovery: true,
      include: ['exceljs'],
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
      sourcemap: uploadSourceMaps ? 'hidden' : !['production', 'beta'].includes(mode)
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
        '/resources': 'http://127.0.0.1:3004',
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
