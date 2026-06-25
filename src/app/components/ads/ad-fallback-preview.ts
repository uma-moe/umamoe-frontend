import { environment } from '../../../environments/environment';

const FALLBACK_PREVIEW_KEY = 'umamoe-ad-fallback-preview-v1';

export function isAdFallbackPreviewEnabled(document: Document): boolean {
  if (environment.fuse.alwaysShowFallbacks) {
    return true;
  }

  if (environment.production) {
    return false;
  }

  const view = document.defaultView;
  if (!view) {
    return false;
  }

  try {
    const value = new URLSearchParams(view.location.search).get('ad_fallbacks');

    if (value === '1') {
      view.localStorage.setItem(FALLBACK_PREVIEW_KEY, '1');
      return true;
    }

    if (value === '0') {
      view.localStorage.removeItem(FALLBACK_PREVIEW_KEY);
      return false;
    }

    return view.localStorage.getItem(FALLBACK_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}
