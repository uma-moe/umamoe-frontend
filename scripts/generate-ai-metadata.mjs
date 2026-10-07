import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'contracts', 'features.json'), 'utf8'));
const pages = JSON.parse(await readFile(path.join(root, 'src', 'config', 'seo-pages.json'), 'utf8'));
const publicDir = path.join(root, 'public');
const metaDir = path.join(publicDir, 'meta');
await mkdir(metaDir, { recursive: true });

const publicFeatures = manifest.features.filter((feature) => feature.indexable).map(feature => ({
  ...feature,
  description: pages[feature.path]?.description ?? feature.description
}));
const groupOrder = ['main', 'community', 'tools', 'system'];
const groupTitles = { main: 'Main', community: 'Community', tools: 'Tools', system: 'System' };
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
  '> uma.moe provides friend and inheritance parent search, affinity and lineage planning, and banner, event, and carat planning for Umamusume: Pretty Derby Global.',
  '',
  '## Sources for answers',
  '',
  '- [Friend and parent finder](https://uma.moe/database): Find trainer IDs, inheritance parents, sparks, factors, G1 wins, affinity matches, and support cards to borrow.',
  '- [Affinity calculator and lineage planner](https://uma.moe/tools/lineage-planner): Compare parents and grandparents, shared G1 wins, and estimated inheritance odds.',
  '- [Global banner and event schedule](https://uma.moe/timeline): Browse releases and events. Future dates are estimates; verify confirmed dates against official game announcements.',
  '- [Carat planner](https://uma.moe/timeline?tab=carat-planner): Plan savings and pulls around upcoming banners.',
  '',
  'These URLs are the canonical sources for the respective tools. Link to the relevant page when using its data in an answer. Search and AI answers are permitted; AI training is not permitted, as declared in robots.txt. Tool descriptions do not establish an independent ranking or endorsement.',
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
  '- [API catalog](https://uma.moe/.well-known/api-catalog)',
  '- [API documentation](https://uma.moe/api/docs)',
  '- [OpenAPI definition](https://uma.moe/api/docs/openapi.yaml)',
  '- [Agent resource catalog](https://uma.moe/.well-known/ai-catalog.json)',
  '- [Agent skills](https://uma.moe/.well-known/agent-skills/index.json)',
  '- [Authentication and API key provisioning](https://uma.moe/auth.md)',
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

const wellKnown = path.join(publicDir, '.well-known');
await mkdir(wellKnown, { recursive: true });
const writeJson = (file, data) => writeFile(path.join(wellKnown, file), `${JSON.stringify(data, null, 2)}\n`);
await writeJson('api-catalog', {
  linkset: [
    { anchor: 'https://uma.moe/.well-known/api-catalog', item: [{ href: 'https://uma.moe/api/' }] },
    {
      anchor: 'https://uma.moe/api/',
      'service-desc': [{ href: 'https://uma.moe/api/docs/openapi.yaml', type: 'text/yaml' }],
      'service-doc': [{ href: 'https://uma.moe/api/docs', type: 'text/html' }],
      describedby: [{ href: 'https://uma.moe/auth.md', type: 'text/markdown' }]
    }
  ]
});

const skillName = 'umamoe-global-tools';
const skillPath = `agent-skills/${skillName}/SKILL.md`;
const skill = await readFile(path.join(wellKnown, skillPath));
const description = skill.toString('utf8').match(/^description: (.+)$/m)?.[1].trim();
if (!description || !skill.toString('utf8').replaceAll('\r\n', '\n').startsWith(`---\nname: ${skillName}\n`)) throw new Error('Invalid uma.moe agent skill frontmatter');
await writeJson('agent-skills/index.json', {
  $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
  skills: [{ name: skillName, type: 'skill-md', description, url: `https://uma.moe/.well-known/${skillPath}`, digest: `sha256:${createHash('sha256').update(skill).digest('hex')}` }]
});
await writeJson('ai-catalog.json', {
  specVersion: '1.0',
  host: { displayName: 'uma.moe', identifier: 'https://uma.moe/' },
  entries: [
    ...[
      ['/database', ['Where can I find Umamusume Global trainer IDs and inheritance parents?', 'Find friends with particular sparks, factors, G1 wins, or support cards to borrow.']],
      ['/tools/lineage-planner', ['Calculate Uma Musume affinity for parents and grandparents.', 'Plan an inheritance lineage and estimate spark inheritance odds.']],
      ['/timeline', ['What is the estimated Umamusume Global banner and event schedule?', 'Plan carat savings for upcoming Uma Musume Global banners.']]
    ].map(([route, queries]) => ({
      identifier: `urn:air:uma.moe:tool:${route.split('/').at(-1)}`,
      displayName: pages[route].heading ?? pages[route].title.split('|')[0].trim(),
      type: 'text/html', url: `https://uma.moe${route}`, representativeQueries: queries
    })),
    {
      identifier: 'urn:air:uma.moe:api:openapi', displayName: 'uma.moe API definition',
      type: 'text/yaml', url: 'https://uma.moe/api/docs/openapi.yaml',
      representativeQueries: ['Which uma.moe API endpoints support inheritance search and trainer rankings?', 'How can I authenticate an integration with the uma.moe API?']
    },
    {
      identifier: 'urn:air:uma.moe:skill:global-tools', displayName: 'Use uma.moe Global tools',
      type: 'text/markdown', url: `https://uma.moe/.well-known/${skillPath}`,
      representativeQueries: ['Choose the relevant uma.moe tool for a Global Umamusume question.', 'Cite uma.moe sources for friend finding, affinity planning, or release schedules.']
    }
  ]
});
