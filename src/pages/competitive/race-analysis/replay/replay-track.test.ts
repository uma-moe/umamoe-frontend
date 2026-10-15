import { expect, it } from 'vitest';
import {
  replayTrack,
  trackPointAtDistance,
  fitTrackCamera,
  followTrackCamera,
  placeTrackLabels,
  placeTrackCaption,
  trackBasis,
  trackUnitsPerMetre
} from './replay-track';

it('maps capture distances onto the course without wrapping the finish', () => {
  const track = replayTrack({
    distance: 100,
    points: [
      [0, 0],
      [40, 20],
      [80, 0]
    ]
  });

  const midpoint = trackPointAtDistance(track, 25);
  expect(midpoint.x).toBeCloseTo((track[0]!.x + track[1]!.x) / 2);
  expect(midpoint.y).toBeCloseTo((track[0]!.y + track[1]!.y) / 2);
  expect(trackPointAtDistance(track, -10)).toEqual(track[0]);
  expect(trackPointAtDistance(track, 150)).toEqual(track[2]);
  expect(
    replayTrack({
      distance: 100,
      points: [
        [NaN, 0],
        [1, 1]
      ]
    })
  ).toEqual([]);
});

it('keeps the entire inspected bend visible while easing or seeking, clear of portrait labels', () => {
  const bend = [
    { x: 400, y: 170, distance: 0 },
    { x: 520, y: 40, distance: 40 },
    { x: 640, y: 170, distance: 80 }
  ];

  for (const width of [300, 1100]) {
    const height = 228,
      top = 96;

    const target = fitTrackCamera(bend, width, height, top);
    for (const camera of [
      target,
      fitTrackCamera(bend, width, height, top, { x: -400, y: 1000, scale: 64, angle: 0 })
    ]) {
      for (const p of bend) {
        const x = (p.x - camera.x) * camera.scale + width / 2;
        const y = (p.y - camera.y) * camera.scale + (height + top) / 2;
        expect(x).toBeGreaterThanOrEqual(24 - 1e-6);
        expect(x).toBeLessThanOrEqual(width - 24 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(top + 20 - 1e-6);
        expect(y).toBeLessThanOrEqual(height - 20 + 1e-6);
      }
    }
  }

  expect(fitTrackCamera([{ x: 20, y: 20, distance: 0 }], 300, 186, 54).scale).toBeGreaterThan(0);
});

it('continues runner positions beyond the finish and centers endpoint follow windows', () => {
  const points = [
    { x: 0, y: 0, distance: 0 },
    { x: 100, y: -100, distance: 100 }
  ];

  expect(trackBasis(points, 120)).toMatchObject({ x: 120, y: -120, distance: 120 });
  expect(trackBasis(points, -20)).toMatchObject({ x: -20, y: 20, distance: -20 });
  for (const distance of [0, 100]) {
    const camera = followTrackCamera(
      points,
      { min: distance - 40, max: distance + 40 },
      1000,
      400,
      1.25,
      Math.PI / 4
    );

    const p = trackBasis(points, distance);
    expect(
      ((p.x - camera.x) * Math.cos(camera.angle) - (p.y - camera.y) * Math.sin(camera.angle)) *
        camera.scale +
        500
    ).toBeCloseTo(500);
    expect(camera.scale).toBeCloseTo(
      followTrackCamera(points, { min: 10, max: 90 }, 1000, 400, 1.25, Math.PI / 4).scale
    );
  }
});

it('fits follow zoom to available width on straights and height on bends', () => {
  const points = [
    { x: 0, y: 0, distance: 0 },
    { x: 80, y: 0, distance: 80 },
    { x: 80, y: 80, distance: 160 }
  ];

  const straight = followTrackCamera(points, { min: 0, max: 80 }, 1100, 400, 1.25);
  const bend = followTrackCamera(points, { min: 40, max: 120 }, 1100, 400, 1.25);
  expect(straight.scale * 80).toBeCloseTo(1100 - 48);
  expect(bend.scale * 40).toBeCloseTo(400 - 40);
  expect(followTrackCamera(points, { min: 0, max: 80 }, 400, 400, 1.25).scale).toBeLessThan(
    straight.scale
  );

  expect(followTrackCamera(points, { min: 0, max: 80 }, 1100, 400, 1).scale).toBeLessThan(
    straight.scale
  );
});

it('fits a rotated bend horizontally while retaining all inspected points', () => {
  const bend = [
    { x: 400, y: 50, distance: 0 },
    { x: 420, y: 100, distance: 40 },
    { x: 400, y: 150, distance: 80 }
  ];

  const camera = followTrackCamera(bend, { min: 0, max: 80 }, 1000, 400, 1.25, -Math.PI / 2);
  const project = (p: (typeof bend)[number]) => ({
    x: (p.x - camera.x) * Math.cos(camera.angle) - (p.y - camera.y) * Math.sin(camera.angle),
    y: (p.x - camera.x) * Math.sin(camera.angle) + (p.y - camera.y) * Math.cos(camera.angle)
  });

  expect(project(bend[2]!).y).toBeCloseTo(project(bend[0]!).y);
  expect(project(bend[2]!).x).toBeGreaterThan(project(bend[0]!).x);
  for (const p of bend) {
    expect(Math.abs(project(p).x * camera.scale)).toBeLessThanOrEqual(500 - 24 + 1e-6);
    expect(Math.abs(project(p).y * camera.scale)).toBeLessThanOrEqual(200 - 20 + 1e-6);
  }
});

it('places separated portraits toward the track interior on either course direction', () => {
  for (const ny of [-1, 1]) {
    const anchors = [160, 300, 440].map((x, index) => ({
      index,
      x,
      y: 200,
      nx: 0,
      ny,
      tx: 1,
      ty: 0,
      progress: x
    }));

    const labels = placeTrackLabels(
      anchors,
      36,
      { left: 0, top: 0, right: 600, bottom: 400 },
      [],
      true
    );

    expect(labels.map((p) => p.dx)).toEqual([0, 0, 0]);
    expect(labels.map((p) => p.dy)).toEqual([28 * ny, 28 * ny, 28 * ny]);
  }
});

it('keeps packed portraits nearby, visible, and clear of the runner dots', () => {
  for (const x of [25, 180, 315]) {
    const anchors = Array.from({ length: 9 }, (_, index) => ({
      index,
      x: x + (index % 3) * 3,
      y: 180 + Math.floor(index / 3) * 12,
      nx: 0,
      ny: -1,
      tx: 1,
      ty: 0,
      progress: index
    }));

    const bounds = { left: 6, top: 24, right: 334, bottom: 350 },
      size = 28;

    const labels = placeTrackLabels(anchors, size, bounds, [], true);
    const positions = labels.map((p, i) => ({ x: anchors[i]!.x + p.dx, y: anchors[i]!.y + p.dy }));
    positions.forEach((p, i) => {
      expect(Math.hypot(labels[i]!.dx, labels[i]!.dy)).toBeLessThanOrEqual(96 + 1e-6);
      expect(p.x - size / 2).toBeGreaterThanOrEqual(bounds.left);
      expect(p.x + size / 2).toBeLessThanOrEqual(bounds.right);
      expect(p.y - size / 2).toBeGreaterThanOrEqual(bounds.top);
      expect(p.y + size / 2).toBeLessThanOrEqual(bounds.bottom);
      for (const dot of anchors)
        expect(Math.hypot(p.x - dot.x, p.y - dot.y)).toBeGreaterThanOrEqual(size / 2 + 8);
      for (const other of positions.slice(i + 1))
        expect(Math.hypot(p.x - other.x, p.y - other.y)).toBeGreaterThanOrEqual(size + 8);
    });
  }
});

it('keeps a spread field on its points with only small offsets inside crowded pairs', () => {
  const anchors = [
    [553, 345],
    [417, 355],
    [415, 310],
    [408, 275],
    [389, 374],
    [255, 378],
    [229, 345],
    [217, 380],
    [205, 314]
  ].map(([x, y], index) => ({
    index,
    x: x!,
    y: y!,
    nx: 0,
    ny: -1,
    tx: 1,
    ty: 0,
    progress: -index
  }));

  const labels = placeTrackLabels(
    anchors,
    36,
    { left: 6, top: 24, right: 729, bottom: 418 },
    [],
    true
  );

  expect(labels[0]).toEqual({ index: 0, dx: 0, dy: -28 });
  // Crowded pairs may need a little more offset to leave the neighbouring dots clear.
  for (const label of labels) expect(Math.hypot(label.dx, label.dy)).toBeLessThanOrEqual(60);
});

it('keeps the portrait links uncrossed in the packed field from the reported screenshot', () => {
  const anchors = [
    [259, 288],
    [178, 284],
    [128, 251],
    [161, 229],
    [175, 181],
    [242, 194],
    [175, 132],
    [439, 305],
    [464, 269]
  ].map(([x, y], index) => ({
    index,
    x: x!,
    y: y!,
    nx: 0,
    ny: -1,
    tx: 1,
    ty: 0,
    progress: -index
  }));

  const labels = placeTrackLabels(
    anchors,
    36,
    { left: 6, top: 24, right: 551, bottom: 333 },
    [],
    true
  );

  const links = labels.map((p, i) => {
    const a = anchors[i]!,
      scale = 1 - 21 / Math.hypot(p.dx, p.dy);

    return { a, b: { x: a.x + p.dx * scale, y: a.y + p.dy * scale } };
  });

  const side = (p: { x: number; y: number }, q: typeof p, r: typeof p) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

  for (let i = 0; i < links.length; i++)
    for (const other of links.slice(i + 1)) {
      const { a, b } = links[i]!,
        { a: c, b: d } = other;

      expect(side(a, b, c) * side(a, b, d) < -1e-6 && side(c, d, a) * side(c, d, b) < -1e-6).toBe(
        false
      );
    }

  expect(Math.hypot(labels[0]!.dx, labels[0]!.dy)).toBeLessThanOrEqual(36);
});

it('follows subpixel track motion without changing a clear portrait offset', () => {
  const anchors = [150, 320].map((x, index) => ({
    index,
    x,
    y: 180,
    nx: 0,
    ny: -1,
    tx: 1,
    ty: 0,
    progress: x
  }));

  const bounds = { left: 0, top: 24, right: 600, bottom: 400 };

  const original = placeTrackLabels(anchors, 36, bounds, [], true);
  let previous = original;
  for (let frame = 0; frame < 60; frame++) {
    const field = anchors.map((a) => ({
      ...a,
      x: a.x + Math.sin(frame * 0.2 + a.index) * 0.5,
      y: a.y + Math.sin(frame * 0.2 + a.index) * 25
    }));

    const next = placeTrackLabels(field, 36, bounds, previous, true);
    expect(next).toEqual(original);
    previous = next;
  }
});

it('keeps each portrait attached to the same runner during nearly tied overtakes', () => {
  const anchors = Array.from({ length: 9 }, (_, index) => ({
    index,
    x: 300 + (index % 3) * 3,
    y: 180 + Math.floor(index / 3) * 12,
    tx: 1,
    ty: 0,
    nx: 0,
    ny: -1,
    progress: 100 + index * 0.01
  }));

  const bounds = { left: 0, top: 24, right: 800, bottom: 450 };

  let previous = placeTrackLabels(anchors, 36, bounds, [], true);
  for (let frame = 0; frame < 60; frame++) {
    const field = anchors.map((a) => ({
      ...a,
      x: a.x + Math.sin(frame * 0.2 + a.index) * 0.1,
      progress: 100 + Math.sin(frame * 0.2 + a.index)
    }));

    const next = placeTrackLabels(field, 36, bounds, previous, true);
    next.forEach((p, i) => {
      expect(p.index).toBe(previous[i]!.index);
      expect(Math.hypot(p.dx - previous[i]!.dx, p.dy - previous[i]!.dy)).toBeLessThanOrEqual(
        3 + 1e-6
      );
      expect(Math.hypot(p.dx, p.dy)).toBeLessThanOrEqual(96 + 1e-6);
    });

    previous = next;
  }
});

it('retains follow-view portrait offsets as the course normal turns', () => {
  const anchors = [200, 380, 540].map((x, index) => ({
    index,
    x,
    y: 200,
    progress: x,
    tx: 0.9,
    ty: 0.43589,
    nx: 0.43589,
    ny: -0.9
  }));

  const bounds = { left: 0, top: 0, right: 800, bottom: 500 };

  const labels = placeTrackLabels(anchors, 36, bounds, [], true);
  const bent = anchors.map((a) => ({ ...a, tx: 0.8, ty: 0.6, nx: 0.6, ny: -0.8 }));
  expect(placeTrackLabels(bent, 36, bounds, labels, true)).toEqual(labels);
});

it('corrects local portrait collisions without cell swaps as the field closes up', () => {
  const anchors = Array.from({ length: 9 }, (_, index) => ({
    index,
    x: 240 + index * 24,
    y: 220 + (index % 3) * 6,
    tx: 1,
    ty: 0,
    nx: 0,
    ny: -1,
    progress: index * 24
  }));

  const bounds = { left: 0, top: 24, right: 900, bottom: 450 };

  let previous = placeTrackLabels(anchors, 36, bounds, [], true);
  for (let frame = 1; frame <= 90; frame++) {
    const field = anchors.map((a) => ({ ...a, x: a.x + ((340 - a.x) * frame) / 90 }));
    const next = placeTrackLabels(field, 36, bounds, previous, true);
    next.forEach((p, i) =>
      expect(Math.hypot(p.dx - previous[i]!.dx, p.dy - previous[i]!.dy)).toBeLessThanOrEqual(
        3 + 1e-6
      )
    );
    previous = next;
  }
});

it('brings separated portraits close to their exposed points without offset jumps', () => {
  const anchors = [200, 500].map((x, index) => ({
    index,
    x,
    y: 200,
    progress: x,
    nx: 0,
    ny: -1,
    tx: 1,
    ty: 0
  }));

  const original = anchors.map((a) => ({ index: a.index, dx: 45, dy: -60 }));
  let previous = original;
  for (let frame = 0; frame < 40; frame++) {
    const next = placeTrackLabels(
      anchors,
      36,
      { left: 0, top: 24, right: 800, bottom: 450 },
      previous,
      true
    );

    next.forEach((p, i) =>
      expect(Math.hypot(p.dx - previous[i]!.dx, p.dy - previous[i]!.dy)).toBeLessThanOrEqual(
        3 + 1e-6
      )
    );
    previous = next;
  }

  expect(previous.every((p) => Math.hypot(p.dx, p.dy + 28) < 1)).toBe(true);
});

it('releases a portrait trapped beside an old pack once its nearby position has a clear route', () => {
  const points = [
    [227, 267],
    [313, 272],
    [208, 211],
    [171, 225],
    [222, 163],
    [300, 180],
    [221, 114],
    [501, 282],
    [533, 258]
  ];

  const images = [
    [221, 233],
    [313, 297],
    [242, 189],
    [157, 201],
    [197, 176],
    [214, 138],
    [247, 104],
    [497, 254],
    [560, 242]
  ];

  const anchors = points.map(([x, y], index) => ({
    index,
    x: x!,
    y: y!,
    nx: 0,
    ny: -1,
    tx: 1,
    ty: 0,
    progress: -index
  }));

  let previous = anchors.map((a, i) => ({
    index: a.index,
    dx: images[i]![0]! - a.x,
    dy: images[i]![1]! - a.y
  }));

  for (let frame = 0; frame < 90; frame++) {
    const next = placeTrackLabels(
      anchors,
      36,
      { left: 6, top: 24, right: 661, bottom: 324 },
      previous,
      true
    );

    next.forEach((p, i) =>
      expect(Math.hypot(p.dx - previous[i]!.dx, p.dy - previous[i]!.dy)).toBeLessThanOrEqual(3)
    );
    previous = next;
  }

  expect(previous[5]).toEqual({ index: 5, dx: 0, dy: -28 });
  expect(previous[6]).toEqual({ index: 6, dx: 0, dy: -28 });
});

it('opens space around a portrait squeezed between neighbouring runners and their dots', () => {
  const points = [
    [73, 123],
    [91, 142],
    [88, 56],
    [96, 99],
    [132, 147],
    [275, 130],
    [293, 147]
  ];

  const images = [
    [65, 150],
    [154, 135],
    [64, 56],
    [122, 100],
    [131, 176],
    [275, 100],
    [296, 173]
  ];

  const anchors = points.map(([x, y], index) => ({
    index,
    x: x! + 200,
    y: y! + 100,
    nx: 0,
    ny: -1,
    tx: 1,
    ty: 0,
    progress: -index
  }));

  let previous = anchors.map((a, i) => ({
    index: a.index,
    dx: images[i]![0]! + 200 - a.x,
    dy: images[i]![1]! + 100 - a.y
  }));

  for (let frame = 0; frame < 90; frame++) {
    const next = placeTrackLabels(
      anchors,
      36,
      { left: 6, top: 24, right: 800, bottom: 500 },
      previous,
      true
    );

    next.forEach((p, i) =>
      expect(Math.hypot(p.dx - previous[i]!.dx, p.dy - previous[i]!.dy)).toBeLessThanOrEqual(3)
    );
    previous = next;
  }

  const positions = previous.map((p, i) => ({ x: anchors[i]!.x + p.dx, y: anchors[i]!.y + p.dy }));
  const nature = positions[1]!;
  anchors.forEach((dot, i) => {
    if (i !== 1) expect(Math.hypot(nature.x - dot.x, nature.y - dot.y)).toBeGreaterThanOrEqual(30);
  });

  positions.forEach((other, i) => {
    if (i !== 1)
      expect(Math.hypot(nature.x - other.x, nature.y - other.y)).toBeGreaterThanOrEqual(48);
  });
});

it('recovers race order when portraits are stranded in an old crowded arrangement', () => {
  const points = [
    [100, 127],
    [129, 137],
    [102, 77],
    [132, 96],
    [156, 137]
  ];

  const images = [
    [83, 102],
    [160, 106],
    [102, 51],
    [48, 64],
    [210, 110]
  ];

  const anchors = points.map(([x, y], index) => ({
    index,
    x: x! + 200,
    y: y! + 100,
    nx: 0,
    ny: -1,
    tx: 1,
    ty: 0,
    progress: -index
  }));

  let previous = anchors.map((a, i) => ({
    index: a.index,
    dx: images[i]![0]! + 200 - a.x,
    dy: images[i]![1]! + 100 - a.y
  }));

  for (let frame = 0; frame < 180; frame++) {
    const next = placeTrackLabels(
      anchors,
      36,
      { left: 6, top: 24, right: 800, bottom: 500 },
      previous,
      true
    );

    next.forEach((p, i) => {
      expect(Math.hypot(p.dx - previous[i]!.dx, p.dy - previous[i]!.dy)).toBeLessThanOrEqual(3);
      expect(Math.hypot(p.dx, p.dy)).toBeGreaterThanOrEqual(25);
    });

    previous = next;
  }

  for (const p of previous) expect(Math.abs(p.dx)).toBeLessThanOrEqual(36);
  const positions = previous.map((p, i) => ({ x: anchors[i]!.x + p.dx, y: anchors[i]!.y + p.dy }));
  for (let i = 0; i < positions.length; i++)
    for (const other of positions.slice(i + 1))
      expect(
        Math.hypot(positions[i]!.x - other.x, positions[i]!.y - other.y)
      ).toBeGreaterThanOrEqual(48);
  expect(positions[3]!.x).toBeGreaterThan(positions[0]!.x);
  expect(positions[4]!.x).toBeGreaterThan(positions[3]!.x);
});

it('keeps position dots exposed when speed and acceleration are enabled', () => {
  const anchors = [180, 420].map((x, index) => ({
    index,
    x,
    y: 180,
    progress: x,
    nx: 0,
    ny: -1,
    tx: 1,
    ty: 0
  }));

  const labels = placeTrackLabels(
    anchors,
    36,
    { left: 0, top: 24, right: 600, bottom: 400 },
    [],
    true,
    { width: 36, height: 0, offset: 28 }
  );

  labels.forEach((p) => {
    expect(p.dx).toBe(0);
    expect(p.dy).toBe(-28);
  });
});

it('offsets captured lanes outward from the inner rail on left and right courses', () => {
  const points = [
    { x: 0, y: 0, distance: 0 },
    { x: 100, y: 0, distance: 100 }
  ];

  expect(trackUnitsPerMetre(points)).toBe(1);
  expect(trackBasis(points, 50, 1)).toMatchObject({ x: 50, y: 0, nx: 0, ny: -1 });
  expect(trackBasis(points, 50, 2)).toMatchObject({ x: 50, y: 0, ny: 1 });
  const p = trackBasis(points, 50, 1);
  expect(p.y + p.ny * 4 * trackUnitsPerMetre(points)).toBe(-4);
});

it('moves telemetry text beside a packed portrait instead of covering a position dot', () => {
  const bounds = { width: 500, height: 300 };

  const candidates = [
    { x: 150, y: 175 },
    { x: 215, y: 130 },
    { x: 85, y: 130 }
  ];

  const obstacles = [
    { x: 150, y: 155, radius: 18 },
    { x: 150, y: 188, radius: 8 },
    { x: 90, y: 135, radius: 18 }
  ];

  expect(placeTrackCaption(candidates, 58, 28, obstacles, bounds)).toEqual(candidates[1]);
});

it('keeps the speed block separate from the runner name and inside the map', () => {
  const candidates = [
    { x: 50, y: 100 },
    { x: 180, y: 100 },
    { x: 250, y: 100 }
  ];

  const obstacles = [{ x: 50, y: 107, radius: 0, width: 100, height: 14 }];
  expect(placeTrackCaption(candidates, 58, 28, obstacles, { width: 300, height: 200 })).toEqual(
    candidates[1]
  );

  expect(placeTrackCaption([{ x: 0, y: 200 }], 58, 28, [], { width: 300, height: 200 })).toEqual({
    x: 33,
    y: 168
  });
});
