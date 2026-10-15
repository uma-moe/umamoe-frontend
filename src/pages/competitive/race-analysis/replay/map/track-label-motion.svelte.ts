import { Spring, prefersReducedMotion } from 'svelte/motion';
import { untrack } from 'svelte';
import { placeTrackLabels } from '../replay-track';

type Offset = { dx: number; dy: number };

interface LabelLayout {
  anchors: Parameters<typeof placeTrackLabels>[0];
  runners: number[];
  labelSize: number;
  overlayHeight: number;
  width: number;
  height: number;
  primary: boolean;
  following: boolean;
  time: number;
}

export class TrackLabelMotion {
  #slots = $state.raw<(Offset & { target?: Offset })[]>([]);
  #time = NaN;
  #view = '';

  // Smooth only collision offsets: the dot and its portrait still follow the
  // same captured position. Damping 1 prevents overshoot and elastic bouncing.
  motion = new Spring<Offset[]>([], {
    stiffness: 0.22,
    damping: 1,
    precision: 0.01
  });

  place(layout: LabelLayout) {
    const { runners, labelSize, overlayHeight, width, height, following } = layout;
    const view = [width, height, layout.primary, following].join(':'),
      now = layout.time,
      jumped =
        !Number.isFinite(this.#time) || Math.abs(now - this.#time) > 0.5 || view !== this.#view;

    this.#time = now;
    this.#view = view;
    const current = untrack(() => this.#slots);
    let placed = placeTrackLabels(
      layout.anchors,
      labelSize,
      {
        left: overlayHeight ? 20 : 6,
        right: width - (overlayHeight ? 20 : 6),
        top: 24,
        bottom: height - 24 - overlayHeight
      },
      jumped
        ? []
        : runners.flatMap((index) => (current[index] ? [{ index, ...current[index]! }] : [])),
      following,
      { width: labelSize, height: 0, offset: overlayHeight }
    );

    if (prefersReducedMotion.current)
      placed = placed.map((p) => (p.target ? { index: p.index, ...p.target } : p));
    // Finish a gradual regrouping even if the user pauses the replay midway.
    else if (placed.some((p) => p.target)) this.motion.current;
    const next = runners.map((index) => {
      const p = placed.find((l) => l.index === index);
      return p ? { dx: p.dx, dy: p.dy, target: p.target } : (current[index] ?? { dx: 0, dy: 0 });
    });

    if (
      jumped ||
      next.some(
        (p, i) =>
          !current[i] ||
          p.dx !== current[i]!.dx ||
          p.dy !== current[i]!.dy ||
          Boolean(p.target) !== Boolean(current[i]!.target)
      )
    ) {
      this.#slots = next;
      void this.motion
        .set(
          next.map(({ dx, dy }) => ({ dx, dy })),
          { instant: jumped || prefersReducedMotion.current || current.length !== next.length }
        )
        .catch(() => {});
    }
  }
}
