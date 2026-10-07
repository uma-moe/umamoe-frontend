import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const output = path.resolve(process.env.BROWSER_OUTPUT_PATH || 'dist');
const beta = process.argv.includes('--beta');
const pages = JSON.parse(await readFile('src/config/seo-pages.json', 'utf8'));
const features = JSON.parse(await readFile('contracts/features.json', 'utf8')).features;
const sitemap = await readFile(path.join(output, 'sitemap.xml'), 'utf8');
const robots = await readFile(path.join(output, 'robots.txt'), 'utf8');
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const publicRobots = robots.split(/\r?\n(?=User-agent:)/).find(block => /^User-agent:\s*\*$/m.test(block));
assert(publicRobots && !/^Disallow:\s*\/\s*$/m.test(publicRobots), 'robots.txt blocks public search crawlers');
assert(robots.includes('Sitemap: https://uma.moe/sitemap.xml'), 'robots.txt must advertise the sitemap');
assert(/^Content-Signal: search=yes, ai-input=yes, ai-train=no$/m.test(robots), 'Incorrect AI content usage policy');
assert(robots.includes('Agentmap: https://uma.moe/.well-known/ai-catalog.json'), 'robots.txt must advertise the AI catalog');

const catalog = JSON.parse(await readFile(path.join(output, '.well-known/api-catalog'), 'utf8'));
assert(catalog.linkset.some(entry => entry.anchor === 'https://uma.moe/api/' && entry['service-desc']?.some(link => link.href === 'https://uma.moe/api/docs/openapi.yaml')), 'API catalog must describe the real API');
const aiCatalog = JSON.parse(await readFile(path.join(output, '.well-known/ai-catalog.json'), 'utf8'));
assert.equal(aiCatalog.host.identifier, 'https://uma.moe/');
assert(aiCatalog.specVersion && aiCatalog.entries.length);
for (const entry of aiCatalog.entries) {
  assert(/^urn:air:uma\.moe:/.test(entry.identifier));
  assert(entry.type && entry.displayName);
  assert.equal(Number('url' in entry) + Number('data' in entry), 1);
  assert(entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5);
  if (entry.type === 'text/html') assert(pages[new URL(entry.url).pathname]?.index !== false && pages[new URL(entry.url).pathname], 'AI catalog advertises a private or missing page');
}
const skills = JSON.parse(await readFile(path.join(output, '.well-known/agent-skills/index.json'), 'utf8'));
assert.equal(skills.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
for (const skill of skills.skills) {
  const bytes = await readFile(path.join(output, new URL(skill.url).pathname.slice(1)));
  assert.equal(skill.digest, `sha256:${createHash('sha256').update(bytes).digest('hex')}`, 'Published skill digest does not match its bytes');
  assert(bytes.toString().includes(`name: ${skill.name}`));
  assert(bytes.toString().includes(`description: ${skill.description}`));
}
assert(/^# .*auth\.md$/m.test(await readFile(path.join(output, 'auth.md'), 'utf8')), 'Authentication instructions need an auth.md heading');

for (const feature of features.filter(feature => feature.indexable)) {
  assert(pages[feature.path] && pages[feature.path].index !== false, `Missing public SEO page: ${feature.path}`);
}
for (const [route, page] of Object.entries(pages)) {
  const html = await readFile(path.join(output, route === '/' ? 'index.html' : `${route.slice(1)}.html`), 'utf8');
  const canonical = `https://uma.moe${route}`;
  assert(html.includes(`<title>${escapeHtml(page.title)}</title>`), `${route}: missing route title`);
  assert.equal((html.match(/<meta\s+name="description"/g) || []).length, 1, `${route}: duplicate description`);
  assert(html.includes(`<meta name="description" content="${escapeHtml(page.description)}">`), `${route}: missing description`);
  assert.equal((html.match(/<link\s+rel="canonical"/g) || []).length, 1, `${route}: duplicate canonical`);
  assert(html.includes(`<link rel="canonical" href="${canonical}">`), `${route}: incorrect canonical`);
  assert(html.includes('rel="api-catalog"') && html.includes('rel="ai-catalog"'), `${route}: missing discovery links`);
  assert(html.includes('<main id="seo-content"') && html.includes(`<h1>${escapeHtml(page.heading || page.title.split('|')[0].trim())}</h1>`), `${route}: missing crawlable content`);
  assert(/<template id="app-error-template"><section id="app-error" data-nosnippet/.test(html), `${route}: error text can leak into snippets`);
  assert.equal(html.includes('content="noindex, nofollow"'), beta || page.index === false, `${route}: incorrect indexing policy`);
  assert.equal(html.includes('id="page-structured-data"'), !beta && page.index !== false, `${route}: incorrect structured data policy`);
  assert.equal(sitemap.includes(`<loc>${canonical}</loc>`), page.index !== false, `${route}: sitemap disagrees with indexing policy`);
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/app\/[^"?#]+\.(?:js|css))"/g)) await access(path.join(output, asset.slice(1)));
}
console.log(`SEO and AI discovery verified: ${Object.keys(pages).length} route documents, catalogs, skill digests, content policy, sitemap and bundled assets.`);
