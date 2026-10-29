import { describe, expect, it } from 'vitest';
import {
  buildCareerBuckets,
  buildEvidenceGroups,
  formatDuration,
  scoreBand,
  scoreTone,
  verdictLabel
} from './activity';
import type { ActivityScore } from './activity-types';

describe('activity parity logic', () => {
  it('retains Angular score bands and duration formatting', () => {
    expect([39, 40, 60, 75, 90].map(scoreBand)).toEqual([
      'Low',
      'Watch',
      'Elevated',
      'High',
      'Critical'
    ]);
    expect([39, 40, 59, 60, 74, 75, 89, 90].map(scoreTone)).toEqual([
      'low',
      'watch',
      'watch',
      'elevated',
      'elevated',
      'high',
      'high',
      'critical'
    ]);
    expect(
      [
        'strong_automation_signal',
        'very_high_suspicion',
        'schedule_suspicion',
        'below_threshold',
        'unknown'
      ].map(verdictLabel)
    ).toEqual([
      'Automation-like pattern',
      'Rate anomaly',
      'Schedule pattern',
      'Below threshold',
      'Activity pattern'
    ]);
    expect(formatDuration(90061)).toBe('1d 1h');
  });

  it('groups evidence and five-minute career buckets consistently', () => {
    const score = {
      career_length_buckets: [2, 3, 4, 5],
      short_fan_gain_score_buckets: [1, 2, 3, 0]
    } as ActivityScore;

    expect(
      buildCareerBuckets(score)
        .slice(0, 3)
        .map((row) => row.count)
    ).toEqual([2, 3, 4]);
    expect(
      buildEvidenceGroups([
        {
          key: 'short_high_fan_careers',
          label: '',
          severity: '',
          confidence: '',
          message: '',
          display_value: ''
        },
        {
          key: 'heatmap_coverage',
          label: '',
          severity: '',
          confidence: '',
          message: '',
          display_value: ''
        }
      ]).map((group) => group.key)
    ).toEqual(['automation', 'schedule']);
  });
});
