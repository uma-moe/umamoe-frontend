/** An icon on screen and the width of the name it would carry, in pixels. */
export interface LabelledIcon {
  id: number;
  x: number;
  y: number;
  labelWidth: number;
  /** Search and comparison labels stay visible even in a crowded cluster. */
  priority?: boolean;
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
 * Fit names beside their icons in priority order. Ordinary labels avoid other icons and names; highlighted labels
 * remain visible even when neither side is free. Zooming spreads icons so more names fit.
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

    if (!icon.priority) return;

    const left = Math.max(0, Math.min(icon.x + half + gap, width - icon.labelWidth));
    const y = Math.max(labelHeight / 2, Math.min(icon.y, height - labelHeight / 2));
    placed.push({ id: icon.id, x: left, y, side: 'right' });
    taken.push({
      left,
      top: y - labelHeight / 2,
      right: left + icon.labelWidth,
      bottom: y + labelHeight / 2
    });
  });

  return placed;
}
