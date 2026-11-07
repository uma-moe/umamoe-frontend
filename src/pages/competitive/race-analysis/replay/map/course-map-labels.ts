type Point = { x: number; y: number };

export function separatedCaptions<T extends { label: string; caption: Point }>(
  marks: T[],
  clear: (point: Point) => boolean
) {
  const accepted: T[] = [];
  // Keep every landmark interactive; only omit captions that would cover each other.
  for (const item of [...marks].sort(
    (a, b) => Number(b.label === 'Finish') - Number(a.label === 'Finish')
  )) {
    if (
      clear(item.caption) &&
      accepted.every(
        (p) =>
          Math.abs(p.caption.y - item.caption.y) > 14 ||
          Math.abs(p.caption.x - item.caption.x) > (p.label.length + item.label.length) * 2.6 + 12
      )
    )
      accepted.push(item);
  }

  return new Set(accepted);
}
