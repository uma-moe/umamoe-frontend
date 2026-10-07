import pages from '../config/seo-pages.json';
import { routeDefinitionForPath } from '../routes/route-manifest';

export interface SeoPage {
  title: string; description: string; heading?: string; index?: boolean; schema?: Record<string, unknown>[];
  guide?: { heading: string; text: string; href?: string; label?: string }[];
}
export const seoPages: Record<string, SeoPage> = pages;
export const canonicalUrl = (path: string) => `https://uma.moe${path.replace(/\/+$/, '') || '/'}`;

export function metadataForPath(path: string): SeoPage {
  const route = routeDefinitionForPath(path);
  return seoPages[path] ?? {
    title: `${route?.title ?? 'uma.moe'} | uma.moe`,
    description: path.startsWith('/profile/') ? 'View an Uma Musume Global trainer profile, inheritance characters, rankings, and fan history.' : path.startsWith('/circles/') ? 'View an Uma Musume Global club profile, member roster, fan progression, and activity.' : 'Uma Musume Global database and planning tools.',
    index: !/^\/(signin|settings|login|veterans|ui|ui-lab|activity)(\/|$)/.test(path) && !/^\/profile\/[^/]+\/(achievements|titles|cm)$/.test(path) && Boolean(route)
  };
}

export function metaTagsForPage(path: string, page: SeoPage, title = page.title): string[][] {
  return [
    ['name', 'description', page.description], ['name', 'robots', page.index === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'],
    ['property', 'og:title', title], ['property', 'og:description', page.description], ['property', 'og:type', 'website'], ['property', 'og:url', canonicalUrl(path)], ['property', 'og:site_name', 'uma.moe'], ['property', 'og:image', 'https://uma.moe/logo.webp'],
    ['name', 'twitter:card', 'summary'], ['name', 'twitter:title', title], ['name', 'twitter:description', page.description], ['name', 'twitter:image', 'https://uma.moe/logo.webp']
  ];
}

export function structuredDataForPage(path: string, page: SeoPage, title = page.title): Record<string, unknown>[] {
  if (page.index === false) return [];
  const canonical = canonicalUrl(path);
  const graph: Record<string, unknown>[] = [{ '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: title, description: page.description, isPartOf: { '@id': 'https://uma.moe/#website' } }, ...(page.schema ?? [])];
  if (path !== '/') graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'uma.moe', item: 'https://uma.moe/' }, { '@type': 'ListItem', position: 2, name: page.heading ?? title.split('|')[0]!.trim(), item: canonical }] });
  return graph;
}

export function applyRouteMetadata(pathname: string): void {
  const path = pathname.replace(/\/+$/, '') || '/';
  const metadata = metadataForPath(path);
  const page = __APP_ENVIRONMENT__ === 'beta' || location.hostname === 'beta.uma.moe' ? { ...metadata, index: false } : metadata;
  const title = seoPages[path] ? page.title : document.title || page.title;
  document.title = title;
  const upsert = (selector: string, create: () => HTMLElement) => {
    const elements = [...document.head.querySelectorAll<HTMLElement>(selector)];
    const element = elements.shift() ?? document.head.appendChild(create());
    elements.forEach(duplicate => duplicate.remove());
    return element;
  };
  for (const [attribute, key, content] of metaTagsForPage(path, page, title)) {
    const element = upsert(`meta[${attribute}="${key}"]`, () => document.createElement('meta'));
    element.setAttribute(attribute!, key!); element.setAttribute('content', content!);
  }
  const link = upsert('link[rel="canonical"]', () => document.createElement('link'));
  link.setAttribute('rel', 'canonical'); link.setAttribute('href', canonicalUrl(path));
  document.getElementById('page-structured-data')?.remove();
  if (page.index === false) return;
  const graph = structuredDataForPage(path, page, title);
  const schema = document.createElement('script'); schema.id = 'page-structured-data'; schema.type = 'application/ld+json'; schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }); document.head.append(schema);
}
