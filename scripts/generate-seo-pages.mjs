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

function renderStaticShell(pagePath, page) {
  const heading = page.heading || page.title.split('|', 1)[0].trim();
  const links = [
    ['/', 'Home'],
    ['/database', 'Trainer & Parent Search'],
    ['/tools/lineage-planner', 'Affinity Calculator'],
    ['/timeline', 'Global Timeline'],
    ['/tierlist', 'Support Card Tier List'],
    ['/rankings', 'Trainer Rankings'],
    ['/circles', 'Club Search'],
    ['/tools', 'Tools'],
  ]
    .filter(([href]) => href !== pagePath)
    .map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`)
    .join('');

  return [
    '<main class="seo-static-shell">',
    '  <header>',
    '    <a class="seo-static-brand" href="/">uma.moe</a>',
    `    <h1>${escapeHtml(heading)}</h1>`,
    `    <p>${escapeHtml(page.description)}</p>`,
    '  </header>',
    `  <nav aria-label="Main pages">${links}</nav>`,
    '</main>',
  ].join('\n');
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
    '<style id="seo-static-style">.seo-static-shell{max-width:72rem;margin:5rem auto;padding:2rem;font:16px/1.6 system-ui,sans-serif;color:#eee}.seo-static-shell h1{font-size:2rem;line-height:1.2}.seo-static-shell p{max-width:52rem;color:#bbb}.seo-static-shell nav{display:flex;flex-wrap:wrap;gap:1rem;margin-top:2rem}.seo-static-shell a{color:#64b5f6}.seo-static-brand{font-weight:700;text-decoration:none}</style>',
  ];

  if (structuredData.length) {
    tags.push(`<script id="page-structured-data" type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': structuredData,
    }).replaceAll('<', '\\u003c')}</script>`);
  }

  html = addHeadTags(html, tags);
  return html.replace('<app-root></app-root>', `<app-root>\n${renderStaticShell(pagePath, page)}\n</app-root>`);
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
