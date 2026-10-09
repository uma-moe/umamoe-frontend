import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderSeoPage } from './seo-pages';
import { applyRouteMetadata, canonicalUrl, seoPages } from '../src/services/seo';
import features from '../contracts/features.json';
import pageGuides from '../src/config/page-guides.json';
import type { SeoPage } from '../src/services/seo';

const shell = readFileSync('index.html', 'utf8');
const sitemap = readFileSync('public/sitemap.xml', 'utf8');

describe('crawlable route HTML', () => {
  for (const [path, page] of Object.entries(seoPages)) {
    it(`${path} has unique metadata and content before JavaScript`, () => {
      const document = new DOMParser().parseFromString(renderSeoPage(shell, path, page), 'text/html');
      expect(document.title).toBe(page.title);
      expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(page.description);
      expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonicalUrl(path));
      expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(page.title);
      expect(document.querySelector('meta[name="twitter:description"]')?.getAttribute('content')).toBe(page.description);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(page.index === false ? /^noindex/ : /^index/);
      expect(document.querySelector('#seo-content h1')?.textContent).toBe(page.heading ?? page.title.split('|')[0]!.trim());
      expect(document.querySelector('#seo-content')?.textContent).toContain(page.description);
      for (const section of (pageGuides as Record<string, SeoPage['guide']>)[path] ?? []) expect(document.querySelector('#seo-content')?.textContent).toContain(section.text);
      expect(document.querySelector('#seo-content a[href="/database"]')).not.toBeNull();
      expect(document.querySelector('#app-error')).toBeNull();
      expect(document.querySelector<HTMLTemplateElement>('#app-error-template')?.content.querySelector('#app-error[data-nosnippet]')).not.toBeNull();
      const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')];
      expect(schemas).toHaveLength(page.index === false ? 0 : 1);
      if (schemas[0]) expect(JSON.parse(schemas[0].textContent!)['@graph'][0].url).toBe(canonicalUrl(path));
    });
  }

  it('covers every public feature and keeps private routes out of the sitemap', () => {
    for (const feature of features.features.filter(feature => feature.indexable)) {
      expect(seoPages[feature.path]).toBeDefined();
      expect(seoPages[feature.path]?.index).not.toBe(false);
      expect(sitemap).toContain(`<loc>${canonicalUrl(feature.path)}</loc>`);
    }
    for (const [path, page] of Object.entries(seoPages)) {
      expect(sitemap.includes(`<loc>${canonicalUrl(path)}</loc>`)).toBe(page.index !== false);
    }
  });

  it('updates the same metadata after client navigation without stale noindex or duplicate tags', () => {
    document.head.innerHTML = new DOMParser().parseFromString(renderSeoPage(shell, '/settings', seoPages['/settings']!), 'text/html').head.innerHTML;
    for (const path of ['/database/', '/', '/timeline', '/settings', '/database']) {
      const normalized = path.replace(/\/+$/, '') || '/';
      const page = seoPages[normalized]!;
      applyRouteMetadata(path);
      expect(document.title).toBe(page.title);
      expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(page.description);
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonicalUrl(normalized));
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(page.index === false ? /^noindex/ : /^index/);
      expect(document.querySelectorAll('#page-structured-data')).toHaveLength(page.index === false ? 0 : 1);
    }
  });

  it('preserves noindex on account-owned and unfinished profile pages', () => {
    for (const path of ['/profile/123/cm', '/profile/123/achievements', '/profile/123/titles', '/veterans/123', '/activity/123']) {
      applyRouteMetadata(path);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
      expect(document.querySelector('#page-structured-data')).toBeNull();
    }
  });

  it('keeps beta pages out of search before and after JavaScript', () => {
    const page = seoPages['/timeline']!;
    const html = new DOMParser().parseFromString(renderSeoPage(shell, '/timeline', { ...page, index: false }), 'text/html');
    expect(html.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(html.querySelector('script[type="application/ld+json"]')).toBeNull();
    vi.stubGlobal('location', { hostname: 'beta.uma.moe' });
    try {
      applyRouteMetadata('/timeline');
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
      expect(document.querySelector('#page-structured-data')).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
