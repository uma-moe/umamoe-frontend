/** An icon on screen and the width of the name it would carry, in pixels. */
export interface LabelledIcon {
  id: number;
  x: number;
  y: number;
  labelWidth: number;
}

/** A name placed beside its icon: `x` is the label's left edge, `y` its vertical centre. */
export interface PlacedLabel {
  id: number;
  x: number;
  y: number;
  side: 'right' | 'left';
}

export interface LabelLayoutOptions {
  width: number;
  height: number;
  iconSize: number;
  labelHeight: number;
  /** Space between an icon and its label, and kept around every box. */
  gap: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Names for as many icons as fit, in the order given (the most valuable first): each to the right of its icon, else to
 * its left, never over another icon, another name or the plot's edge. Zoomed in, icons spread and more names fit.
 */
export function placeLabels(icons: LabelledIcon[], options: LabelLayoutOptions): PlacedLabel[] {
  const { width, height, iconSize, labelHeight, gap } = options;
  const half = iconSize / 2;
  const iconBoxes = icons.map((icon): Box => ({
    left: icon.x - half - gap,
    top: icon.y - half - gap,
    right: icon.x + half + gap,
    bottom: icon.y + half + gap
  }));
  const taken: Box[] = [];
  const placed: PlacedLabel[] = [];

  icons.forEach((icon, index) => {
    const top = icon.y - labelHeight / 2;
    const sides = [
      { side: 'right' as const, left: icon.x + half + gap },
      { side: 'left' as const, left: icon.x - half - gap - icon.labelWidth }
    ];
    for (const { side, left } of sides) {
      const box = { left, top, right: left + icon.labelWidth, bottom: top + labelHeight };
      const inside = box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height;
      if (!inside) continue;

      const blocked =
        iconBoxes.some((other, otherIndex) => otherIndex !== index && overlap(box, other)) ||
        taken.some((other) => overlap(box, other));
      if (blocked) continue;

      taken.push({ ...box, left: box.left - gap, right: box.right + gap });
      placed.push({ id: icon.id, x: left, y: icon.y, side });
      return;
    }
  });

  return placed;
}
