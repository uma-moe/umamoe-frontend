import { describe, expect, it } from 'vitest';
import { bucketAssetLink, isGameArtPath, type BucketLookups } from './bucket-assets';

const lookups: BucketLookups = {
  timelineBanners: new Map([
    ['assets/images/campaign/100.webp', '/art/timeline/campaign/100.webp'],
    [
      'assets/timeline-images/events/campaign/1091.webp',
      '/art/timeline/events/campaign/1091.webp'
    ]
  ]),
  timelineOverlays: new Map([
    [
      'assets/timeline-images/en/events/campaign/1091.webp',
      'assets/timeline-images/events/campaign/1091.webp'
    ]
  ])
};

describe('bucketAssetLink', () => {
  it('serves a timeline banner by its image path', () => {
    expect(bucketAssetLink('/assets/images/campaign/100.webp', lookups)).toBe(
      '/art/timeline/campaign/100.webp'
    );
  });

  it('serves a synced overlay as the banner it stands for', () => {
    const link = bucketAssetLink('/assets/timeline-images/en/events/campaign/1091.webp', lookups);

    expect(link).toBe('/art/timeline/events/campaign/1091.webp');
  });

  it.each([
    ['/game-assets/character_thumbs/chara_stand_1001_100103.webp', '/art/umas/100103/stand.webp'],
    ['/assets/images/character_stand/chara_stand_100101.png', '/art/umas/100101/stand.webp'],
    ['/game-assets/umamusume_icons/chr_icon_1001.webp', '/art/characters/1001/icon.webp'],
    ['/game-assets/umamusume_cards/tex_support_card_10001.webp', '/art/support-cards/10001/card.webp'],
    [
      '/assets/images/support_card/half/support_card_s_30028.webp',
      '/art/support-cards/30028/half.webp'
    ],
    ['/assets/images/skills/utx_ico_skill_10011.webp', '/art/skills/icons/10011.webp'],
    ['/game-assets/skill_icons/utx_ico_skill_20013.webp', '/art/skills/icons/20013.webp'],
    ['/src/assets/images/item/item_icon_00041.webp', '/art/items/00041.webp'],
    ['/game-assets/textures/race_banners/thum_race_rt_000_1001_00.webp', '/art/races/banners/1001.webp'],
    ['/src/assets/images/race-thumbnails/thum_race_rt_000_2001_00.webp', '/art/races/banners/2001.webp'],
    ['/assets/images/icon/ranks/utx_txt_rank_05.webp', '/art/ui/ranks/05.webp'],
    ['/game-assets/textures/uma_ranks/utx_ico_statusrank_05.webp', '/art/ui/status-ranks/05.webp'],
    ['/assets/images/icon/circle_rank/utx_ico_circle_rank_03.webp', '/art/ui/circle-ranks/03.webp'],
    ['/assets/images/icon/stats/wit.webp', '/art/ui/stats/wit.webp'],
    ['/game-assets/textures/great.webp', '/art/ui/moods/great.webp'],
    ['/game-assets/textures/front.webp', '/art/ui/running-styles/labels/front.webp'],
    ['/game-assets/textures/utx_ico_runstyle_03.webp', '/art/ui/running-styles/icons/end.webp'],
    ['/game-assets/textures/utx_ico_weather_02.png', '/art/ui/weather/rainy.webp'],
    ['/game-assets/textures/utx_ico_timezone_01.png', '/art/ui/times-of-day/01.webp'],
    ['/game-assets/track_details/Firm.webp', '/art/ui/ground-conditions/firm.webp'],
    ['/game-assets/support-rarity/ssr.png', '/art/ui/support-rarities/ssr.webp']
  ])('maps %s', (path, link) => {
    expect(bucketAssetLink(path, lookups)).toBe(link);
  });

  it('leaves game art without a bucket counterpart unmapped', () => {
    expect(bucketAssetLink('/game-assets/textures/hint.webp', lookups)).toBeUndefined();
    expect(bucketAssetLink('/game-assets/textures/utx_ico_weather_04.png', lookups)).toBeUndefined();
    expect(bucketAssetLink('/game-assets/track_details/constructor.webp', lookups)).toBeUndefined();
    expect(bucketAssetLink('/assets/images/scenario/scenario_logo_002.webp', lookups)).toBeUndefined();
  });
});

describe('isGameArtPath', () => {
  it('covers game art and leaves the site files and data alone', () => {
    expect(isGameArtPath('/game-assets/textures/hint.webp')).toBe(true);
    expect(isGameArtPath('/src/assets/images/scenario/scenario_logo_002.webp')).toBe(true);
    expect(isGameArtPath('/assets/images/placeholder-card.webp')).toBe(false);
    expect(isGameArtPath('/src/assets/images/simulator/time-morning.svg')).toBe(false);
    expect(isGameArtPath('/assets/data/skills.json')).toBe(false);
  });
});
