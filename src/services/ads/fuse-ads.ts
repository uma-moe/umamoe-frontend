import { runtimeConfig } from '@/services/runtime-config';
import { fuseAllowed, fuseScriptUrl, insertFuseScript } from './fuse-bootstrap';
import { afterPageReady } from '@/routes/after-page-paint';

interface FuseTag {
  que?: Array<() => void>;
  registerZone?: (elementId: string) => void;
  destroyZone?: (elementId: string) => void;
  pageInit?: (options?: { blockingFuseIds?: string[]; blockingTimeout?: number }) => void;
}

interface PrivacyRuntime extends Window {
  __tcfapi?: (command: string, version: number, callback: () => void) => void;
  __gpp?: (command: string) => void;
  __uspapi?: (command: string, version: number, callback: () => void) => void;
}

declare global {
  interface Window { fusetag?: FuseTag; }
}

const pending = new Map<string, { element: HTMLElement; fuseId: string }>();
const registered = new Map<string, HTMLElement>();
let startTask: Promise<boolean> | undefined;
let pageInitTimer: number | undefined;
let initialized = false;

export function fuseEnabled(): boolean {
  return fuseAllowed(runtimeConfig.providersEnabled);
}

function apiReady(): boolean {
  return typeof window.fusetag?.registerZone === 'function' && typeof window.fusetag?.pageInit === 'function';
}

export function loadFuse(): Promise<boolean> {
  if (!fuseEnabled()) return Promise.resolve(false);
  if (apiReady()) return Promise.resolve(true);
  if (startTask) return startTask;
  startTask = afterPageReady().then(() => {
    if (!fuseEnabled()) { startTask = undefined; return false; }
    const script = insertFuseScript(fuseScriptUrl);
    return new Promise<boolean>(resolve => {
      if (script.dataset.state === 'error') { resolve(false); return; }
      const finish = (loaded: boolean) => {
        window.clearTimeout(timeout);
        script.removeEventListener('load', ready);
        script.removeEventListener('error', failed);
        resolve(loaded);
      };
      // The provider queue can still register mounted zones after a slow CMP finishes.
      const ready = () => { if (apiReady()) { finish(true); scheduleZones(); } };
      const failed = () => finish(false);
      const timeout = window.setTimeout(() => finish(false), 15_000);
      window.fusetag?.que?.push(ready);
      script.addEventListener('load', ready, { once: true });
      script.addEventListener('error', failed, { once: true });
      ready();
    });
  });
  return startTask;
}

function scheduleZones(): void {
  if (!fuseEnabled()) return;
  if (pageInitTimer !== undefined) window.clearTimeout(pageInitTimer);
  pageInitTimer = window.setTimeout(() => {
    pageInitTimer = undefined;
    if (!fuseEnabled() || !apiReady()) return;
    const used = new Set<string>();
    const zones = [...pending].filter(([, { element, fuseId }]) => {
      if (!element.isConnected || used.has(fuseId)) return false;
      used.add(fuseId);
      return true;
    });
    // pageInit destroys provider-owned widgets, including the persistent footer.
    // Route slots have their own register/destroy lifecycle; initialize Fuse once per document.
    if (!initialized) {
      window.fusetag!.pageInit!({ blockingFuseIds: [...used], blockingTimeout: 2000 });
      initialized = true;
    }
    for (const [elementId, { element, fuseId }] of zones) {
      if (registered.get(elementId) === element) continue;
      element.dataset.fuse = fuseId;
      window.fusetag?.registerZone?.(elementId);
      registered.set(elementId, element);
    }
  }, 30);
}

export function syncFusePage(): void {
  void loadFuse().then(ready => { if (ready) scheduleZones(); });
}

export function registerFuseZone(elementId: string, fuseId: string): () => void {
  if (!fuseEnabled() || !elementId || !fuseId) return () => undefined;
  const element = document.getElementById(elementId);
  if (!element) return () => undefined;
  pending.set(elementId, { element, fuseId });
  syncFusePage();
  return () => {
    if (pending.get(elementId)?.element !== element) return;
    pending.delete(elementId);
    if (registered.get(elementId) === element) {
      window.fusetag?.destroyZone?.(elementId);
      registered.delete(elementId);
      delete element.dataset.fuse;
    }
    if (pending.size) scheduleZones();
  };
}

export function openFusePrivacyControls(): boolean {
  if (typeof window === 'undefined') return false;
  const runtime = window as PrivacyRuntime;
  if (runtime.__tcfapi) { runtime.__tcfapi('displayConsentUi', 2, () => undefined); return true; }
  if (runtime.__gpp) { runtime.__gpp('showConsentManager'); return true; }
  if (runtime.__uspapi) { runtime.__uspapi('showConsentUi', 1, () => undefined); return true; }
  return false;
}
