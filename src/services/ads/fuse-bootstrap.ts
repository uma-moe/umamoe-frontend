export const fuseScriptUrl = 'https://cdn.fuseplatform.net/publift/tags/2/4302/fuse.js';

export function fuseAllowed(providersEnabled: boolean): boolean {
  if (!providersEnabled || typeof window === 'undefined' || /^\/ui(?:-lab)?\/?$/.test(location.pathname)) return false;
  try {
    const params = new URLSearchParams(location.search);
    for (const key of ['fuse', 'fuse_enabled', 'ads_enabled']) {
      const value = params.get(key)?.toLowerCase();
      if (value && ['true', '1', 'on', 'false', '0', 'off'].includes(value)) localStorage.setItem('umamoe-fuse-enabled-v1', String(['true', '1', 'on'].includes(value)));
    }
    return !['false', '0'].includes(localStorage.getItem('umamoe-fuse-enabled-v1') ?? '') && JSON.parse(localStorage.getItem('cookie-consent') ?? 'null')?.advertising !== false;
  } catch { return true; }
}

export function insertFuseScript(url: string): HTMLScriptElement {
  const existing = document.getElementById('publift-fuse-js') as HTMLScriptElement | null;
  if (existing) return existing;
  window.fusetag ??= { que: [] };
  const script = document.createElement('script');
  script.id = 'publift-fuse-js';
  script.async = true;
  script.fetchPriority = 'low';
  script.src = url;
  script.dataset.state = 'loading';
  script.addEventListener('load', () => { script.dataset.state = 'loaded'; }, { once: true });
  script.addEventListener('error', () => { script.dataset.state = 'error'; }, { once: true });
  document.head.prepend(script);
  return script;
}
