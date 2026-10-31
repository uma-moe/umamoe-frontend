import { expect, it } from 'vitest';
import { phoneTabIconsFit } from './phone-tab-strip';

const phone = { width: 335, gap: 4, fontSize: 12 };

it('keeps the icons when every tab fits beside its icon', () => {
  const periods = [
    { label: 'Monthly', icon: 'calendar' },
    { label: 'All-Time', icon: 'trophy' },
    { label: 'Gains', icon: 'trending-up' }
  ];

  expect(phoneTabIconsFit(periods, phone)).toBe(true);
});

it('drops the icons when they would push a tab out of view', () => {
  const modes = [
    { label: 'Race sim', icon: 'stopwatch' },
    { label: 'HP calculator', icon: 'battery' },
    { label: 'Build optimizer', icon: 'tune' }
  ];

  expect(phoneTabIconsFit(modes, phone)).toBe(false);
});

it('counts badges with the icons', () => {
  const space = { ...phone, width: 200 };
  const lists = [
    { label: 'Planned', icon: 'calendar' },
    { label: 'Done', icon: 'check' }
  ];

  const countedLists = lists.map((list, index) => ({ ...list, badge: String(index + 3) }));

  expect(phoneTabIconsFit(lists, space)).toBe(true);
  expect(phoneTabIconsFit(countedLists, space)).toBe(false);
});

it('measures the labels in the rendered font when it can', () => {
  const modes = [
    { label: 'Race sim', icon: 'stopwatch' },
    { label: 'HP calculator', icon: 'battery' },
    { label: 'Build optimizer', icon: 'tune' }
  ];

  const narrowFont = (text: string, fontSize: number) => text.length * fontSize * 0.4;

  expect(phoneTabIconsFit(modes, { ...phone, measureText: narrowFont })).toBe(true);
});

it('keeps the icons before the group is measured', () => {
  expect(phoneTabIconsFit([{ label: 'Timeline', icon: 'calendar' }], { ...phone, width: 0 })).toBe(
    true
  );
});
