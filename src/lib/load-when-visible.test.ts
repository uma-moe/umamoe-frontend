import { afterEach, expect, it, vi } from 'vitest';
import { loadWhenVisible } from './load-when-visible';

afterEach(() => vi.unstubAllGlobals());

it('waits for visibility, disconnects before loading, and cleans up on removal', () => {
  let notify: (entries: Partial<IntersectionObserverEntry>[]) => void = () => {};

  const observe = vi.fn(),
    disconnect = vi.fn(),
    load = vi.fn();

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof notify) {
        notify = callback;
      }

      observe = observe;
      disconnect = disconnect;
    }
  );

  const node = document.createElement('div');
  const action = loadWhenVisible(node, load);
  expect(observe).toHaveBeenCalledWith(node);
  notify([{ isIntersecting: false }]);
  expect(load).not.toHaveBeenCalled();
  notify([{ isIntersecting: true }]);
  expect(load).toHaveBeenCalledOnce();
  expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]!);
  action?.destroy();
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it('keeps all results reachable without IntersectionObserver', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const load = vi.fn();
  loadWhenVisible(document.createElement('div'), load);
  expect(load).toHaveBeenCalledOnce();
});
