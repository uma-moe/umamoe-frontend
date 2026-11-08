import type { MinimapScene } from '../minimap-scene';
import {
  applyShadow,
  clearShadow,
  fillRoundedRect,
  strokeRoundedRect,
  type Paint2D
} from './canvas-paint';
import type { StagePalette } from './stage-palette';

const FRAME = 5;

function tracePolyline(
  context: Paint2D,
  points: { x: number; y: number }[],
  toStage: (x: number, y: number) => [number, number]
) {
  context.beginPath();
  points.forEach((point, index) => {
    const [x, y] = toStage(point.x, point.y);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
}

/** Strokes keep their width whatever the course's scale, as the overview's SVG drew them. */
export function drawMinimap(context: Paint2D, scene: MinimapScene, palette: StagePalette) {
  const { box, bounds } = scene;
  const scale = (box.width - FRAME * 2) / bounds.width;
  const toStage = (x: number, y: number): [number, number] => [
    box.x + FRAME + (x - bounds.x) * scale,
    box.y + FRAME + (y - bounds.y) * scale
  ];

  applyShadow(context, { color: 'rgba(0, 0, 0, 0.25)', offsetY: 2, blur: 8 });
  fillRoundedRect(context, box, 6, palette.minimapBackground);
  clearShadow(context);
  strokeRoundedRect(context, box, 6, palette.borderSubtle);

  context.lineJoin = 'round';
  context.lineCap = 'butt';
  context.strokeStyle = palette.borderPrimary;
  context.lineWidth = 3;
  tracePolyline(context, scene.course, toStage);
  context.stroke();

  context.lineCap = 'round';
  context.strokeStyle = palette.accentPrimary;
  context.lineWidth = 6;
  tracePolyline(context, scene.inView, toStage);
  context.stroke();
  context.lineCap = 'butt';

  for (const dot of scene.dots) {
    const [x, y] = toStage(dot.x, dot.y);
    context.fillStyle = dot.color;
    context.beginPath();
    context.arc(x, y, (dot.selected ? 9 : 6) * scale, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = dot.selected ? palette.textPrimary : palette.surface1;
    context.lineWidth = dot.selected ? 2 : 1;
    context.stroke();
  }
}
