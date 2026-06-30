import { environment } from '../../../environments/environment';

const FALLBACK_PREVIEW_KEY = 'umamoe-ad-fallback-preview-v1';

export function isAdFallbackPreviewEnabled(document: Document): boolean {
  const view = document.defaultView;
  try {
    const value = view
      ? new URLSearchParams(view.location.search).get('ad_fallbacks')
      : null;

    if (value === '1') {
      return true;
    }

    if (value === '0') {
      view?.localStorage.removeItem(FALLBACK_PREVIEW_KEY);
      return false;
    }
  } catch {
    // Continue to the configured defaults below.
  }

  if (environment.fuse.alwaysShowFallbacks) {
    return true;
  }

  return false;
}
