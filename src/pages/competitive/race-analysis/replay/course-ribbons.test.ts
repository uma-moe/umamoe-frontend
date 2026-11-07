import { expect, test } from 'vitest';
import { placeCourseLabels, stickyLabelX, type CourseLabel } from './course-ribbons';

test('course labels skip those out of view and give way to earlier overlapping labels', () => {
  const candidates: CourseLabel[] = [
    { distance: 0, text: 'Start', kind: 'boundary' },
    { distance: 100, text: 'Corner 1 start', kind: 'section' },
    { distance: 110, text: 'Mid race', kind: 'phase' },
    { distance: 400, text: 'Finish', kind: 'boundary' }
  ];

  const leftOf = (distance: number) => (distance > 300 ? undefined : distance * 2);
  const placed = placeCourseLabels(candidates, leftOf).map((label) => label.text);

  expect(placed).toEqual(['Start', 'Corner 1 start']);
});

test('a ribbon name stays on screen until the end of its stretch pushes it out', () => {
  const name = { text: 'Corner 2', width: 800 };

  const pinned = stickyLabelX({ ...name, left: -300, right: 400 });
  const pushed = stickyLabelX({ ...name, left: -300, right: 40 });
  const tooShort = stickyLabelX({ ...name, left: 100, right: 130 });

  expect(pinned).toBe(6);
  expect(pushed).toBeLessThan(0);
  expect(tooShort).toBeUndefined();
});
