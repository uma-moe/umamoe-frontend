import type { Plugin, ViteDevServer } from 'vite';
import { statSync } from 'node:fs';
import path from 'node:path';
import { canonicalUrl, metaTagsForPage, seoPages, structuredDataForPage, type SeoPage } from '../src/services/seo';
import features from '../contracts/features.json';
import pageGuides from '../src/config/page-guides.json';

const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderSeoPage(baseHtml: string, path: string, page: SeoPage): string {
  let html = baseHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  const tags = metaTagsForPage(path, page);
  for (const [attribute, key] of tags) html = html.replace(new RegExp(`<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*>`, 'gi'), '');
  html = html.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  const graph = structuredDataForPage(path, page);
  html = html.replace('</head>', `${tags.map(([attribute, key, content]) => `<meta ${attribute}="${key}" content="${escapeHtml(content!)}">`).join('\n')}
    <link rel="canonical" href="${escapeHtml(canonicalUrl(path))}">
    ${graph.length ? `<script id="page-structured-data" type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script>` : ''}
  </head>`);
  const guide = (page.guide ?? (pageGuides as Record<string, SeoPage['guide']>)[path] ?? []).map(section => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.text)}</p>${section.href ? `<a href="${escapeHtml(section.href)}">${escapeHtml(section.label!)}</a>` : ''}</section>`).join('\n');
  const links = features.features.filter(feature => feature.indexable).map(feature => `<li><a href="${feature.path}">${escapeHtml(seoPages[feature.path]?.heading ?? feature.title)}</a></li>`).join('\n');
  // This is the same public introduction for every visitor, available before JS or API requests.
  return html.replace('<div id="app"></div>', `<div id="app"><main id="seo-content" style="max-width:960px;margin:32px auto;padding:24px;font:16px/1.6 system-ui,sans-serif">
    <h1>${escapeHtml(page.heading ?? page.title.split('|')[0]!.trim())}</h1>
    <p>${escapeHtml(page.description)}</p>${guide}
    <nav aria-label="Explore uma.moe"><ul>${links}</ul></nav>
  </main></div>`);
}

export function seoPagesPlugin(): Plugin {
  let beta = false;
  let publicDirectory = '';
  // Mirror the production Nginx discovery behavior during development and preview.
  const discoveryMiddleware = (server: Pick<ViteDevServer, 'middlewares'>) => {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      response.setHeader('Content-Signal', 'search=yes, ai-input=yes, ai-train=no');
      response.setHeader('Link', '</.well-known/api-catalog>; rel="api-catalog", </api/docs>; rel="service-doc", </auth.md>; rel="describedby"');
      if (pathname.startsWith('/.well-known/')) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        if (pathname.includes('..') || !statSync(path.join(publicDirectory, pathname.slice(1)), { throwIfNoEntry: false })?.isFile()) {
          response.statusCode = 404;
          response.end();
          return;
        }
        if (pathname === '/.well-known/api-catalog') response.setHeader('Content-Type', 'application/linkset+json');
      }
      if (pathname.endsWith('.md') && (pathname === '/auth.md' || pathname.startsWith('/.well-known/agent-skills/'))) response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      next();
    });
  };
  return {
    name: 'static-seo-pages',
    configResolved(config) { beta = config.mode === 'beta'; publicDirectory = config.isPreview ? path.resolve(config.root, config.build.outDir) : config.publicDir; },
    configureServer: discoveryMiddleware,
    configurePreviewServer: discoveryMiddleware,
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (!index || index.type !== 'asset') return; // Non-HTML test/library builds.
        const baseHtml = String(index.source);
        if (!baseHtml.includes('<div id="app"></div>')) throw new Error('SEO build: missing application mount point');
        for (const feature of features.features.filter(feature => feature.indexable)) {
          if (!seoPages[feature.path] || seoPages[feature.path]!.index === false) throw new Error(`SEO build: missing public metadata for ${feature.path}`);
        }
        for (const [path, page] of Object.entries(seoPages)) {
          const source = renderSeoPage(baseHtml, path, beta ? { ...page, index: false } : page);
          if (path === '/') index.source = source;
          else this.emitFile({ type: 'asset', fileName: `${path.slice(1)}.html`, source });
        }
      }
    }
  };
}
