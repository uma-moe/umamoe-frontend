import { describe, expect, it } from 'vitest';
import { timelineBanner } from './art-links';
import { savedTimelineImage, timelineImage } from './timeline-artwork';

const characterBanner = 'assets/images/character/banner/2022_30124.webp';
const sourceImage = 'https://example.com/news-banner.png';

describe('timeline artwork', () => {
  it('links an event with its own picture to the bucket banner', () => {
    expect(timelineImage(characterBanner, undefined, '', sourceImage)).toBe(
      timelineBanner(characterBanner)
    );
    expect(timelineImage('https://example.com/banner.webp', undefined, '')).toBe(
      'https://example.com/banner.webp'
    );
  });

  it('falls back to the type banner for the master id, then to the source picture', () => {
    const campaignBanner = timelineImage('assets/images/campaign/', 'campaign', 'campaign-1037');

    expect(campaignBanner).toBe(timelineBanner('assets/timeline-images/events/campaign/1037.webp'));
    expect(timelineImage(undefined, 'character_banner', 'banner-1', sourceImage)).toBe(sourceImage);
    expect(timelineImage(undefined, 'campaign', 'no-master-id', sourceImage)).toBe(sourceImage);
    expect(timelineImage(undefined, 'campaign', 'no-master-id')).toBeUndefined();
  });

  it('translates banners saved as the site files to their bucket links', () => {
    const savedImages = [
      '/assets/timeline-images/en/images/character/banner/2022_30124.webp',
      'assets/timeline-images/jp/events/champions-meeting/1271.webp',
      '/assets/images/character/banner/2022_30124.webp'
    ].map(savedTimelineImage);

    expect(savedImages).toEqual([
      timelineBanner(characterBanner),
      timelineBanner('assets/timeline-images/events/champions-meeting/1271.webp'),
      timelineBanner(characterBanner)
    ]);
  });

  it('keeps saved images that are not site files', () => {
    const bucketLink = timelineBanner(characterBanner) ?? '';

    expect(savedTimelineImage(bucketLink)).toBe(bucketLink);
    expect(savedTimelineImage('https://example.com/banner.webp')).toBe(
      'https://example.com/banner.webp'
    );
  });
});
