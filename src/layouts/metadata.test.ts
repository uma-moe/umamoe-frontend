import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

const readJson = (filePath: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), filePath), 'utf8'));

const manifest = readJson('contracts/features.json');
const schema = readJson('contracts/feature-manifest.schema.json');

describe('public route metadata', () => {
  it('validates route indexing and ad-surface metadata against JSON Schema', () => {
    const validate = new Ajv2020({ strict: false }).compile(schema);
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(new Set(manifest.features.map((feature: { id: string }) => feature.id)).size).toBe(
      manifest.features.length
    );
  });

  it('publishes every indexable route to human and machine navigation', () => {
    const llms = readFileSync(path.join(process.cwd(), 'public', 'llms.txt'), 'utf8');
    const sitemap = readFileSync(path.join(process.cwd(), 'public', 'sitemap.xml'), 'utf8');
    const navigation = readJson('public/meta/navigation.json');
    const publishedIds = new Set(
      navigation.groups.flatMap((group: { items: { id: string }[] }) =>
        group.items.map((item) => item.id)
      )
    );

    for (const feature of manifest.features.filter(
      (entry: { indexable: boolean }) => entry.indexable
    )) {
      expect(llms).toContain(`https://uma.moe${feature.path}`);
      expect(sitemap).toContain(`<loc>https://uma.moe${feature.path}</loc>`);
      expect(publishedIds).toContain(feature.id);
    }
  });
});
