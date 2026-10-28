import { describe, expect, it } from 'vitest';
import { countGate, describeRequirements } from './skill-requirements';

const trackName = (id: number) => (id === 10007 ? 'Chukyo' : `track ${id}`);

describe('describeRequirements', () => {
  it('reads one alternative term by term', () => {
    const requirements = describeRequirements(
      'running_style==2&is_finalcorner_random==1&order_rate<=50',
      trackName
    );

    expect(requirements).toEqual([
      ['Pace chaser', 'Random point of the final corner', 'In the front 50% of the field']
    ]);
  });

  it('folds two remaining-distance bounds into one point', () => {
    const requirements = describeRequirements(
      'remain_distance<=201&remain_distance>=199&distance_diff_top<=5&order>=2',
      trackName
    );

    expect(requirements).toEqual([
      ['Close behind the leader', 'Not leading', '200 m from the finish']
    ]);
  });

  it('keeps alternatives apart and folds those that read the same', () => {
    const lanes = describeRequirements(
      'running_style==2&is_move_lane==1@running_style==2&is_move_lane==2',
      trackName
    );
    const either = describeRequirements(
      'distance_type==1&phase>=2@distance_type==2&phase>=2',
      trackName
    );

    expect(lanes).toEqual([['Pace chaser', 'Changing lanes']]);
    expect(either).toEqual([
      ['Sprint', 'From the late leg on'],
      ['Mile', 'From the late leg on']
    ]);
  });

  it('names a racecourse and leaves out a term that says nothing', () => {
    expect(describeRequirements('track_id==10007&always==1', trackName)).toEqual([['At Chukyo']]);
  });

  it('still reads a term it has no words for', () => {
    expect(describeRequirements('mystery_flag>=2', trackName)).toEqual([['mystery flag ≥ 2']]);
  });
});

describe('countGate', () => {
  it('finds how many skills must fire first, and where', () => {
    expect(countGate('activate_count_middle>=3')).toEqual({
      count: 3,
      sections: [4, 16],
      where: 'in the middle leg'
    });
    expect(countGate('phase==1&corner==0')).toBeUndefined();
  });
});
