/**
 * ECharts inside zoom with the hand-drawn charts' gestures: Ctrl or ⌘ with the wheel zooms (the wheel
 * alone keeps scrolling the page), a drag pans and two fingers pinch.
 */
export function insideZoom(xAxisIndex: number | number[] | 'all' = 'all') {
  return [
    {
      type: 'inside',
      xAxisIndex,
      filterMode: 'none',
      zoomOnMouseWheel: 'ctrl',
      moveOnMouseMove: true,
      moveOnMouseWheel: false
    }
  ];
}
