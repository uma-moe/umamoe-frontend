export function popoverPosition(
  panel: HTMLElement,
  left: number,
  top: number
): { left: number; top: number } {
  // Polyfilled popovers stay inside containing blocks (including container queries).
  // Convert viewport coordinates to that block instead of assuming a native top layer.
  if (panel.classList.contains(':popover-open')) {
    const bounds = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    left -= bounds.left - (parseFloat(style.left) || 0);
    top -= bounds.top - (parseFloat(style.top) || 0);
  }

  return { left, top };
}
