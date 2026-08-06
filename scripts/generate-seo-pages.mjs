import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.resolve(projectRoot, process.env['BROWSER_OUTPUT_PATH'] || 'dist/browser');
const pages = JSON.parse(await readFile(path.join(projectRoot, 'src/seo-pages.json'), 'utf8'));
const baseHtml = await readFile(path.join(outputDirectory, 'index.html'), 'utf8');
const siteUrl = 'https://uma.moe';

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

function removeMeta(html, attribute, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${escapedKey}["'][^>]*>\\s*`, 'gi');
  return html.replace(pattern, '');
}

function addHeadTags(html, tags) {
  return html.replace('</head>', `${tags.join('\n  ')}\n</head>`);
}

function buildStructuredData(pagePath, page, canonicalUrl) {
  if (page.index === false) return [];

  const graph = [
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: page.title,
      description: page.description,
      isPartOf: { '@id': `${siteUrl}/#website` },
    },
    ...(page.schema || []),
  ];

  if (pagePath !== '/') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'uma.moe',
          item: `${siteUrl}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: page.title.split('|', 1)[0].trim(),
          item: canonicalUrl,
        },
      ],
    });
  }

  return graph;
}

function renderPageHtml(pagePath, page) {
  const canonicalPath = pagePath === '/' ? '/' : pagePath;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const robots = page.index === false
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  let html = baseHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  for (const [attribute, key] of [
    ['name', 'description'],
    ['name', 'robots'],
    ['name', 'twitter:card'],
    ['name', 'twitter:title'],
    ['name', 'twitter:description'],
    ['name', 'twitter:image'],
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:type'],
    ['property', 'og:url'],
    ['property', 'og:site_name'],
    ['property', 'og:image'],
  ]) {
    html = removeMeta(html, attribute, key);
  }
  html = html.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>\s*/gi, '');
  html = html.replace(/<script\s+[^>]*id=["']page-structured-data["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');

  const structuredData = buildStructuredData(pagePath, page, canonicalUrl);

  const tags = [
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${canonicalUrl}">`,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${canonicalUrl}">`,
    '<meta property="og:site_name" content="uma.moe">',
    `<meta property="og:image" content="${siteUrl}/assets/logo.webp">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${escapeHtml(page.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}">`,
    `<meta name="twitter:image" content="${siteUrl}/assets/logo.webp">`,
  ];

  if (structuredData.length) {
    tags.push(`<script id="page-structured-data" type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': structuredData,
    }).replaceAll('<', '\\u003c')}</script>`);
  }

  html = addHeadTags(html, tags);
  return html;
}

for (const [pagePath, page] of Object.entries(pages)) {
  const rendered = renderPageHtml(pagePath, page);
  if (pagePath === '/') {
    await writeFile(path.join(outputDirectory, 'index.html'), rendered);
    continue;
  }

  const outputFile = path.join(outputDirectory, `${pagePath.slice(1)}.html`);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, rendered);
}

const sitemapEntries = Object.entries(pages)
  .filter(([, page]) => page.index !== false)
  .map(([pagePath, page]) => [
    '  <url>',
    `    <loc>${siteUrl}${pagePath === '/' ? '/' : pagePath}</loc>`,
    `    <changefreq>${page.changeFrequency || 'weekly'}</changefreq>`,
    `    <priority>${page.priority ?? 0.5}</priority>`,
    '  </url>',
  ].join('\n'))
  .join('\n');

await writeFile(
  path.join(outputDirectory, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`,
);

console.log(`Generated SEO metadata for ${Object.keys(pages).length} routes in ${outputDirectory}.`);
