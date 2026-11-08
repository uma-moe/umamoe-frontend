import type { Options as LegacyOptions } from '@vitejs/plugin-legacy';
import type { Plugin, Rollup } from 'vite';

type RenderChunk = (
  this: Rollup.PluginContext,
  ...args: Parameters<Rollup.RenderChunkHook>
) => ReturnType<Rollup.RenderChunkHook>;

/**
 * Leaves the chunks of on-demand packages out of the modern polyfill scan. @vitejs/plugin-legacy scans every modern
 * chunk and puts what it finds into the polyfill script that every page loads first, so one lazily loaded package
 * would cost every visit. Only list packages (or `@scopes`) that cope without those polyfills on the modern targets.
 */
export function skipModernPolyfillScan(
  legacyPlugins: Plugin[],
  legacyOptions: LegacyOptions,
  packages: string[]
): Plugin[] {
  const postProcess = legacyPlugins.find((plugin) => plugin.name === 'vite:legacy-post-process');
  const renderChunk = postProcess?.renderChunk as RenderChunk | undefined;
  if (!postProcess || typeof renderChunk !== 'function')
    throw new Error('@vitejs/plugin-legacy changed; update the modern polyfill scan exclusion.');

  const packagePaths = packages.map((name) => `/node_modules/${name}/`);
  // Virtual modules, such as Vite's empty stand-ins for Node built-ins, have no file path.
  const isVirtual = (id: string) => id.startsWith('\0') || !/[\\/]/.test(id);
  const fromPackages = (chunk: Rollup.RenderedChunk) => {
    const files = chunk.moduleIds.filter((id) => !isVirtual(id));

    return (
      files.length > 0 &&
      files.every((id) => {
        const path = id.replaceAll('\\', '/');
        return packagePaths.some((packagePath) => path.includes(packagePath));
      })
    );
  };

  const renderChunkWithoutPackages: RenderChunk = function (code, chunk, ...rest) {
    if (!fromPackages(chunk)) return renderChunk.call(this, code, chunk, ...rest);

    // The plugin reads the option when it starts on a chunk, before its first await.
    const modernPolyfills = legacyOptions.modernPolyfills;
    legacyOptions.modernPolyfills = false;
    try {
      return renderChunk.call(this, code, chunk, ...rest);
    } finally {
      legacyOptions.modernPolyfills = modernPolyfills;
    }
  };

  postProcess.renderChunk = renderChunkWithoutPackages;
  return legacyPlugins;
}
