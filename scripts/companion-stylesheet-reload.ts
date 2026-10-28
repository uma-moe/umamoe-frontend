import type { Plugin } from 'vite';

/**
 * Components load their companion stylesheet with `@import` inside `<style>`. vite-plugin-svelte records that
 * stylesheet as a dependency under a forward-slash path, but the Windows file watcher reports changes with
 * backslashes, so the lookup misses and the component keeps its old styles until something else touches it.
 * Re-announcing stylesheet changes with the normalized path lets the plugin recompile the importing component.
 */
export function companionStylesheetReload(): Plugin {
  return {
    name: 'companion-stylesheet-reload',
    apply: 'serve',
    configureServer(server) {
      if (process.platform !== 'win32') return;

      server.watcher.on('change', (file) => {
        if (!file.endsWith('.css') || !file.includes('\\')) return;
        server.watcher.emit('change', file.replaceAll('\\', '/'));
      });
    }
  };
}
