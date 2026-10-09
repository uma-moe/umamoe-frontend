import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fuseAllowed, insertFuseScript, fuseScriptUrl } from './fuse-bootstrap';

vi.mock('@/services/runtime-config', () => ({ runtimeConfig: { providersEnabled: true } }));
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); history.replaceState(null, '', '/database'); });
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); localStorage.clear();
  document.head.innerHTML = ''; document.body.innerHTML = ''; delete window.fusetag;
});

function zone(id: string) {
  const element = document.createElement('div'); element.id = id; document.body.append(element); return element;
}

it('loads one provider script while honoring provider mode and stored opt-outs', () => {
  expect(fuseAllowed(false)).toBe(false);
  localStorage.setItem('cookie-consent', JSON.stringify({ advertising: false }));
  expect(fuseAllowed(true)).toBe(false);
  localStorage.clear(); history.replaceState(null, '', '/database?ads_enabled=off');
  expect(fuseAllowed(true)).toBe(false);
  history.replaceState(null, '', '/database'); expect(fuseAllowed(true)).toBe(false);
  localStorage.setItem('umamoe-fuse-enabled-v1', '0'); expect(fuseAllowed(true)).toBe(false);
  localStorage.clear(); expect(fuseAllowed(true)).toBe(true);
  const script = insertFuseScript(fuseScriptUrl);
  expect(insertFuseScript(fuseScriptUrl)).toBe(script);
  expect(document.querySelectorAll('#publift-fuse-js')).toHaveLength(1);
  expect(document.head.firstElementChild).toBe(script);
  expect(script.async).toBe(true);
  expect(script.fetchPriority).toBe('low');
  history.replaceState(null, '', '/ui'); expect(fuseAllowed(true)).toBe(false);
});

it('does not repeatedly retry blocked ad scripts', async () => {
  const { loadFuse } = await import('./fuse-ads');
  const task = loadFuse();
  await vi.advanceTimersByTimeAsync(50);
  const script = document.getElementById('publift-fuse-js')!;
  script.dispatchEvent(new Event('error'));
  expect(await task).toBe(false);
  expect(await loadFuse()).toBe(false);
  expect(document.querySelectorAll('#publift-fuse-js')).toHaveLength(1);
});

it('waits for a slow provider to drain its ready queue', async () => {
  const { loadFuse } = await import('./fuse-ads');
  const task = loadFuse();
  expect(loadFuse()).toBe(task);
  await vi.advanceTimersByTimeAsync(5000);
  Object.assign(window.fusetag!, { pageInit: vi.fn(), registerZone: vi.fn() });
  window.fusetag!.que!.forEach(ready => ready());
  expect(await task).toBe(true);
});

it('settles stalled loads without retrying and registers mounted zones if the provider recovers late', async () => {
  const { loadFuse, registerFuseZone } = await import('./fuse-ads');
  zone('late-zone'); registerFuseZone('late-zone', 'late-slot');
  const task = loadFuse();
  await vi.advanceTimersByTimeAsync(15_050);
  expect(await task).toBe(false);
  expect(await loadFuse()).toBe(false);
  expect(document.querySelectorAll('#publift-fuse-js')).toHaveLength(1);
  const registerZone = vi.fn();
  const pageInit = vi.fn();
  Object.assign(window.fusetag!, { pageInit, registerZone });
  window.fusetag!.que!.forEach(ready => ready());
  await vi.advanceTimersByTimeAsync(40);
  expect(registerZone).toHaveBeenCalledExactlyOnceWith('late-zone');
  expect(pageInit).toHaveBeenCalledOnce();
  expect(await loadFuse()).toBe(true);
});

it('recognizes an existing script error without restarting the provider', async () => {
  const script = insertFuseScript(fuseScriptUrl);
  script.dispatchEvent(new Event('error'));
  const { loadFuse } = await import('./fuse-ads');
  const task = loadFuse();
  await vi.advanceTimersByTimeAsync(50);
  expect(await task).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps ads behind critical page requests and paint, and rechecks consent before loading', async () => {
  const { withPageRequest } = await import('@/services/http/page-request');
  let release!: () => void;
  const data = withPageRequest(() => new Promise<void>(resolve => release = resolve));
  const { loadFuse } = await import('./fuse-ads');
  const task = loadFuse();
  expect(loadFuse()).toBe(task);
  await vi.advanceTimersByTimeAsync(1000);
  expect(document.getElementById('publift-fuse-js')).toBeNull();
  localStorage.setItem('cookie-consent', JSON.stringify({ advertising: false }));
  release(); await data;
  await vi.advanceTimersByTimeAsync(50);
  expect(await task).toBe(false);
  expect(document.getElementById('publift-fuse-js')).toBeNull();
  localStorage.removeItem('cookie-consent');
  const resumed = loadFuse();
  await vi.advanceTimersByTimeAsync(50);
  document.getElementById('publift-fuse-js')!.dispatchEvent(new Event('error'));
  expect(await resumed).toBe(false);
});

it('initializes once per document, destroys removed route slots, and preserves provider widgets on navigation and resize', async () => {
  const calls: string[] = [];
  window.fusetag = { pageInit: () => calls.push('page'), registerZone: id => calls.push(`register:${id}`), destroyZone: id => calls.push(`destroy:${id}`) };
  const { registerFuseZone, syncFusePage } = await import('./fuse-ads');
  zone('inline-1'); zone('inline-2');
  const removeFirst = registerFuseZone('inline-1', 'slot-1');
  const removeSecond = registerFuseZone('inline-2', 'slot-2');
  await vi.advanceTimersByTimeAsync(40);
  expect(calls).toEqual(['page', 'register:inline-1', 'register:inline-2']);
  removeFirst(); removeSecond();
  const removeResized = registerFuseZone('inline-1', 'slot-1');
  await vi.advanceTimersByTimeAsync(40);
  expect(calls.filter(call => call === 'page')).toHaveLength(1);
  expect(calls).toContain('destroy:inline-1'); expect(calls).toContain('destroy:inline-2');
  removeResized(); document.body.innerHTML = '';
  history.replaceState(null, '', '/circles'); syncFusePage(); zone('club-1'); registerFuseZone('club-1', 'slot-1');
  await vi.advanceTimersByTimeAsync(40);
  expect(calls.at(-1)).toBe('register:club-1');
  expect(calls.filter(call => call === 'page')).toHaveLength(1);
});

it('prevents two active zones sharing a publisher slot and skips unmounted pending zones', async () => {
  const registerZone = vi.fn();
  window.fusetag = { pageInit: vi.fn(), registerZone, destroyZone: vi.fn() };
  const { registerFuseZone } = await import('./fuse-ads');
  zone('first'); zone('duplicate'); zone('unmounted');
  const removeFirst = registerFuseZone('first', 'one-slot');
  registerFuseZone('duplicate', 'one-slot');
  registerFuseZone('unmounted', 'other-slot')();
  await vi.advanceTimersByTimeAsync(40);
  expect(registerZone.mock.calls).toEqual([['first']]);
  expect(document.getElementById('duplicate')!.dataset.fuse).toBeUndefined();
  removeFirst(); await vi.advanceTimersByTimeAsync(40);
  expect(document.getElementById('first')!.dataset.fuse).toBeUndefined();
  expect(registerZone.mock.calls).toEqual([['first'], ['duplicate']]);
});
