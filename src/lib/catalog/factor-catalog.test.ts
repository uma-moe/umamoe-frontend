import { setupCatalogFixtures } from '../../../tests/fixtures/catalog-setup';
setupCatalogFixtures();
import { expect, it } from 'vitest';
import { factorImage, factorOptions, loadFactorArtwork } from './factor-catalog';
import { loadRaceFactorImages, normalizeRaceName } from './race-catalog';
import { scenarios } from './scenario-catalog';

it('uses race-title and scenario artwork before generic skill icons, sharing the lazy race catalog', async () => {
  const loading = loadFactorArtwork();
  expect(loadFactorArtwork()).toBe(loading);
  await loading;
  for (const factor of factorOptions().filter((entry) => entry.type === 2)) {
    expect(factorImage(Number(factor.id)), factor.text).toMatch(/^\/game-assets\/textures\/race_banners\/thum_race_rt_000_\d{4}_00\.webp$/);
  }
  const images = await loadRaceFactorImages();
  expect(images.get('jdderby')).toBe(images.get('japandirtderby'));
  expect(images.get('jbclclassic')).toBe(images.get('jbcladiesclassic'));
  expect(images.get('kawasakikinen')).toContain('_1107_');
  expect(normalizeRaceName('M.C. Nambu Hai')).toBe('mcnambuhai');
  for (const [factorId, scenarioId] of [[300010, 1], [300020, 2], [300030, 4]]) {
    expect(factorImage(factorId!)).toBe(scenarios.find((scenario) => scenario.id === scenarioId)!.image);
  }
  expect(factorImage(200010)).toBe('/assets/images/skills/utx_ico_skill_10011.webp');
  expect(factorImage(-1)).toBeUndefined();
});
