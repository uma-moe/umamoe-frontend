/** Observe a keyed list sentinel once; the next batch mounts a fresh sentinel. */
export function loadWhenVisible(node: HTMLElement, load: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    load();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    },
    { rootMargin: '240px 0px' }
  );

  observer.observe(node);
  return { destroy: () => observer.disconnect() };
}
