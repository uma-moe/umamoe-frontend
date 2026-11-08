import type { Options as LegacyOptions } from '@vitejs/plugin-legacy';
import type { Plugin, Rollup } from 'vite';
import { describe, expect, it } from 'vitest';
import { skipModernPolyfillScan } from './modern-polyfill-scan';

const chunkOf = (...moduleIds: string[]) => ({ moduleIds }) as Rollup.RenderedChunk;

/** A stand-in for the plugin's post-process step that records whether it would scan each chunk. */
function legacyPluginsRecording(options: LegacyOptions) {
  const scanned: boolean[] = [];
  const postProcess = {
    name: 'vite:legacy-post-process',
    renderChunk() {
      scanned.push(Boolean(options.modernPolyfills));
      return null;
    }
  } as Plugin;

  return { plugins: [{ name: 'vite:legacy-config' } as Plugin, postProcess], scanned };
}

function render(plugins: Plugin[], chunk: Rollup.RenderedChunk) {
  const postProcess = plugins.find((plugin) => plugin.name === 'vite:legacy-post-process');
  const renderChunk = postProcess?.renderChunk as (
    code: string,
    chunk: Rollup.RenderedChunk
  ) => unknown;
  renderChunk('', chunk);
}

describe('skipModernPolyfillScan', () => {
  it('renders a listed package chunk without the scan and leaves the option as it was', () => {
    const options: LegacyOptions = { modernPolyfills: true };
    const { plugins, scanned } = legacyPluginsRecording(options);
    const wrapped = skipModernPolyfillScan(plugins, options, ['mediabunny']);

    render(wrapped, chunkOf('C:\\app\\node_modules\\mediabunny\\dist\\modules\\src\\index.js'));
    render(
      wrapped,
      chunkOf('/app/node_modules/mediabunny/dist/index.js', '__vite-browser-external')
    );
    render(wrapped, chunkOf('\0commonjsHelpers.js', '/app/node_modules/mediabunny/dist/index.js'));

    expect(scanned).toEqual([false, false, false]);
    expect(options.modernPolyfills).toBe(true);
  });

  it('keeps scanning app chunks and chunks that mix app code with the package', () => {
    const options: LegacyOptions = { modernPolyfills: true };
    const { plugins, scanned } = legacyPluginsRecording(options);
    const wrapped = skipModernPolyfillScan(plugins, options, ['mediabunny']);

    render(wrapped, chunkOf('/app/src/main.ts'));
    render(wrapped, chunkOf('/app/node_modules/mediabunny/index.js', '/app/src/clip.ts'));
    render(wrapped, chunkOf());

    expect(scanned).toEqual([true, true, true]);
  });

  it('fails the build when the plugin no longer has its post-process step', () => {
    const options: LegacyOptions = { modernPolyfills: true };

    expect(() =>
      skipModernPolyfillScan([{ name: 'vite:legacy-config' }], options, ['mediabunny'])
    ).toThrow('@vitejs/plugin-legacy changed');
  });
});
