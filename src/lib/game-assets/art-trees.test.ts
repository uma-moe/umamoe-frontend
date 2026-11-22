import { describe, expect, it } from 'vitest';
import { runtimeConfig } from '@/services/runtime-config';
import { skillIcon, supportCardHalf, timelineBanner, umaPortrait } from './art-links';
import { jpArtLink } from './art-trees';

const jpArt = (key: string) => `${runtimeConfig.assetOrigin}/jp/art/${key}`;

describe('JP art links', () => {
  it('finds a Global game-art file under the same key in the JP tree', () => {
    expect(jpArtLink(umaPortrait(105401))).toBe(jpArt('umas/105401/portrait.webp'));
    expect(jpArtLink(supportCardHalf(30300))).toBe(jpArt('support-cards/30300/half.webp'));
    expect(jpArtLink(skillIcon('utx_ico_skill_20013') ?? '')).toBe(
      jpArt('skills/icons/20013.webp')
    );
  });

  it('has no JP file for timeline banners, JP links or pictures from elsewhere', () => {
    const banner = timelineBanner('assets/images/character/banner/2022_30124.webp') ?? '';
    const jpPortrait = jpArt('umas/105401/portrait.webp');
    const placeholder = '/assets/images/placeholder-card.webp';

    const jpLinks = [banner, jpPortrait, placeholder].map(jpArtLink);

    expect(jpLinks).toEqual([undefined, undefined, undefined]);
  });
});
