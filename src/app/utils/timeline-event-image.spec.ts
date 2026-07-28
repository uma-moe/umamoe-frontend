import {
  resolveBundledTimelineEventImagePath,
  timelineEventMasterId,
} from './timeline-event-image';

describe('timeline event image fallbacks', () => {
  it('resolves locally bundled event artwork by type and master id', () => {
    expect(resolveBundledTimelineEventImagePath('campaign', 887))
      .toBe('assets/timeline-images/en/events/campaign/887.webp');
    expect(resolveBundledTimelineEventImagePath('legend_race', 1021))
      .toBe('assets/timeline-images/jp/events/legend-race/1021.webp');
  });

  it('extracts the final numeric master id without guessing absent artwork', () => {
    expect(timelineEventMasterId('global-legend-race-1021')).toBe(1021);
    expect(timelineEventMasterId('campaign-without-id')).toBeUndefined();
    expect(resolveBundledTimelineEventImagePath('legend_race', 999999)).toBeUndefined();
  });
});
