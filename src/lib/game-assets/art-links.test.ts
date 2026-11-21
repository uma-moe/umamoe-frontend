import { describe, expect, it } from 'vitest';
import { runtimeConfig } from '@/services/runtime-config';
import {
  SKILL_POINTS_ICON,
  circleRankIcon,
  itemIcon,
  jpArtLink,
  moodIcon,
  rankTextIcon,
  raceBanner,
  runningStyleBadge,
  scenarioLogo,
  seasonIcon,
  skillIcon,
  statIcon,
  statIconByName,
  statusRankIcon,
  supportCardFull,
  supportCardHalf,
  supportRarityIcon,
  timeOfDayIcon,
  timelineBanner,
  umaPortrait,
  weatherIcon
} from './art-links';

const art = (key: string) => `${runtimeConfig.assetOrigin}/en/art/${key}`;

describe('game art links', () => {
  it('names each family by its key in the bucket art tree', () => {
    const links = [
      umaPortrait(100101),
      supportCardHalf(30001),
      supportCardFull('30001'),
      itemIcon(43),
      statusRankIcon(7),
      rankTextIcon(12),
      statIcon('Speed'),
      moodIcon('Great'),
      runningStyleBadge('pace'),
      weatherIcon('snowy'),
      timeOfDayIcon('evening'),
      seasonIcon('fall'),
      raceBanner(1001),
      supportRarityIcon('SSR'),
      scenarioLogo(4),
      SKILL_POINTS_ICON
    ];

    expect(links).toEqual([
      art('umas/100101/portrait.webp'),
      art('support-cards/30001/half.webp'),
      art('support-cards/30001/card.webp'),
      art('items/00043.webp'),
      art('ui/status-ranks/07.webp'),
      art('ui/ranks/12.webp'),
      art('ui/stats/speed.webp'),
      art('ui/moods/great.webp'),
      art('ui/running-styles/labels/pace.webp'),
      art('ui/weather/snowy.webp'),
      art('ui/times-of-day/01.webp'),
      art('ui/seasons/fall.webp'),
      art('races/banners/1001.webp'),
      art('ui/support-rarities/ssr.webp'),
      art('scenarios/4/logo.webp'),
      art('ui/skill-points.webp')
    ]);
  });

  it('reads the skill icon id from the game icon name', () => {
    expect(skillIcon('utx_ico_skill_20013')).toBe(art('skills/icons/20013.webp'));
    expect(skillIcon('utx_ico_skill_20013.webp')).toBe(art('skills/icons/20013.webp'));
    expect(skillIcon('chara_stand_100101')).toBeUndefined();
    expect(skillIcon(undefined)).toBeUndefined();
  });

  it('has club emblems only for ranks 1 to 11', () => {
    expect(circleRankIcon(1)).toBe(art('ui/circle-ranks/01.webp'));
    expect(circleRankIcon(11)).toBe(art('ui/circle-ranks/11.webp'));
    expect([0, 12, 1.5, undefined].map(circleRankIcon)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined
    ]);
  });

  it('reads stat icons from the names data uses for wit', () => {
    const witIcons = ['wit', 'Wiz', 'wisdom', 'Intelligence'].map(statIconByName);

    expect(witIcons).toEqual(Array(4).fill(art('ui/stats/wit.webp')));
    expect(statIconByName('Friend')).toBe(art('ui/stats/friend.webp'));
    expect(statIconByName('charm')).toBeUndefined();
  });

  it('keeps the timeline image path below the timeline tree', () => {
    expect(timelineBanner('assets/images/character/banner/2022_30124.webp')).toBe(
      art('timeline/character/banner/2022_30124.webp')
    );
    expect(timelineBanner('/assets/timeline-images/events/campaign/1037.webp')).toBe(
      art('timeline/events/campaign/1037.webp')
    );
    expect(timelineBanner('https://example.com/banner.webp')).toBeUndefined();
    expect(timelineBanner('/game-assets/banner.webp')).toBeUndefined();
  });

  it('finds a Global game-art file under the same key in the JP tree', () => {
    const jpArt = (key: string) => `${runtimeConfig.assetOrigin}/jp/art/${key}`;

    expect(jpArtLink(umaPortrait(105401))).toBe(jpArt('umas/105401/portrait.webp'));
    expect(jpArtLink(supportCardHalf(30300))).toBe(jpArt('support-cards/30300/half.webp'));
    expect(jpArtLink(skillIcon('utx_ico_skill_20013') ?? '')).toBe(
      jpArt('skills/icons/20013.webp')
    );
  });

  it('has no JP file for timeline banners, JP links or pictures from elsewhere', () => {
    const banner = timelineBanner('assets/images/character/banner/2022_30124.webp') ?? '';
    const jpPortrait = `${runtimeConfig.assetOrigin}/jp/art/umas/105401/portrait.webp`;
    const placeholder = '/assets/images/placeholder-card.webp';

    const jpLinks = [banner, jpPortrait, placeholder].map(jpArtLink);

    expect(jpLinks).toEqual([undefined, undefined, undefined]);
  });
});
