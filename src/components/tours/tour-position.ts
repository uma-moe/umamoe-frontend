import type { TourStep } from './page-tours';

export interface TourHole {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function tourHole(rect: DOMRect, innerWidth: number, innerHeight: number): TourHole {
  const left = Math.max(0, Math.min(innerWidth, rect.left - 8)),
    top = Math.max(0, Math.min(innerHeight, rect.top - 8));

  const right = Math.min(innerWidth, rect.right + 8),
    bottom = Math.min(innerHeight, rect.bottom + 8);

  return { left, top, right, bottom };
}

export function calloutPosition(
  { left, top, right, bottom }: TourHole,
  { width, height }: { width: number; height: number },
  step: TourStep,
  innerWidth: number,
  innerHeight: number
): { left: number; top: number } {
  const center = step.stepId === 'timeline-page' || step.stepId === 'timeline-track';
  let x = step.placement.xPosition === 'before' ? right - width : left;
  let y = step.placement.yPosition === 'above' ? top - height - 12 : bottom + 12;
  if (center) {
    x = (innerWidth - width) / 2;
    y = (innerHeight - height) / 2;
  }

  if (!center && y + height > innerHeight - 8) y = top - height - 12;
  if (!center && y < 8)
    y = bottom + height + 12 <= innerHeight ? bottom + 12 : innerHeight - height - 8;
  return {
    left: Math.max(8, Math.min(innerWidth - width - 8, x)),
    top: Math.max(8, Math.min(innerHeight - height - 8, y))
  };
}
