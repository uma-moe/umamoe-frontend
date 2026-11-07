import { expect, it } from 'vitest';
import { finishCentre, finishFocus } from './replay-finish-camera';

const finish = 2000,
  window = 80;

// A camera that keeps the leader ahead of centre, as the race positions view does.
const cameraAt = (leader: number) =>
  finishCentre(leader - window * 0.3, { leader, finish, window });

it('follows the leader until the approach and rests on the finish as the leader crosses', () => {
  expect(finishFocus(finish - 2 * window, finish, window)).toBe(0);
  expect(finishFocus(finish - window / 2, finish, window)).toBe(0.5);
  expect(finishFocus(finish + 50, finish, window)).toBe(1);

  expect(cameraAt(finish - 2 * window)).toBe(finish - 2.3 * window);
  expect(cameraAt(finish)).toBe(finish);
  expect(cameraAt(finish + 20)).toBe(finish);
});

it('speeds up past the leader, then eases out onto the finish line', () => {
  const step = 0.5;
  const leaders = Array.from(
    { length: Math.round((1.2 * window) / step) },
    (_, i) => finish - 1.2 * window + i * step
  );

  const speeds = leaders.map((leader) => (cameraAt(leader + step) - cameraAt(leader)) / step);
  const fastest = Math.max(...speeds);

  expect(speeds.every((speed) => speed >= 0)).toBe(true);
  expect(speeds[0]).toBeCloseTo(1, 5);
  expect(fastest).toBeGreaterThan(1.3);
  expect(fastest).toBeLessThan(2);
  expect(speeds.at(-1)).toBeLessThan(0.05);

  const settling = speeds.slice(-Math.round((0.3 * window) / step));
  expect(settling.every((speed, i) => speed <= (settling[i - 1] ?? speed))).toBe(true);
});

it('keeps the leader on screen while the camera runs ahead', () => {
  const leaders = Array.from({ length: 81 }, (_, i) => finish - window + i);
  const leftOfCentre = Math.max(...leaders.map((leader) => cameraAt(leader) - leader));

  expect(leftOfCentre).toBeGreaterThan(0);
  expect(leftOfCentre).toBeLessThan(0.15 * window);
});
