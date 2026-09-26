import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'contracts', 'features.json'), 'utf8'));
const publicDir = path.join(root, 'public');
const metaDir = path.join(publicDir, 'meta');
await mkdir(metaDir, { recursive: true });

const publicFeatures = manifest.features.filter((feature) => feature.indexable);
const groupOrder = ['main', 'community', 'competitive', 'tools', 'research', 'system'];
const groupTitles = { main: 'Main', community: 'Community', competitive: 'Competitive', tools: 'Tools', research: 'Research', system: 'System' };
const navigationGroups = groupOrder
  .map((group) => ({
    id: group,
    title: groupTitles[group],
    items: publicFeatures
      .filter((feature) => feature.group === group)
      .map(({ id, title, description, path: routePath, adSurface }) => ({ id, title, description, path: routePath, adSurface }))
  }))
  .filter((group) => group.items.length);
const lines = [
  '# uma.moe',
  '',
  '> Mobile-first Umamusume database, Veteran workspace, race analysis, timeline, community data, and planning tools for the global version.',
  '',
  '## Site navigation',
  '',
  ...navigationGroups.flatMap((group) => [
    `### ${group.title}`,
    '',
    ...group.items.map((feature) => `- [${feature.title}](https://uma.moe${feature.path}): ${feature.description}`),
    ''
  ]),
  '## Machine-readable navigation',
  '',
  '- [Feature metadata](https://uma.moe/meta/features.json)',
  '- [Route navigation graph](https://uma.moe/meta/navigation.json)',
  '- [Schema.org navigation](https://uma.moe/meta/navigation.jsonld)',
  '',
  '## Data and privacy',
  '',
  'Public metadata never contains private account, Veteran, race, or standalone-client payloads. Authentication is required before account-owned data is requested.',
  ''
];

await writeFile(path.join(publicDir, 'llms.txt'), lines.join('\n'));
await writeFile(path.join(metaDir, 'features.json'), `${JSON.stringify({ ...manifest, features: publicFeatures }, null, 2)}\n`);
await writeFile(path.join(metaDir, 'navigation.json'), `${JSON.stringify({ version: manifest.version, groups: navigationGroups }, null, 2)}\n`);
await writeFile(path.join(metaDir, 'navigation.jsonld'), `${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'uma.moe site navigation',
  itemListElement: publicFeatures.map((feature, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: feature.title,
    url: `https://uma.moe${feature.path}`
  }))
}, null, 2)}\n`);
await writeFile(
  path.join(publicDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicFeatures.map((feature) => `  <url><loc>https://uma.moe${feature.path}</loc></url>`).join('\n')}\n</urlset>\n`
);
