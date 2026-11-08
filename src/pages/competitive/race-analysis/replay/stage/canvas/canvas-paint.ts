import { iconPaths } from '@/components/icon-paths';
import type { IconName } from '@/components/icon-types';

export type Paint2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextShadow {
  color: string;
  offsetY: number;
  blur: number;
}

export function setFont(context: Paint2D, weight: number, size: number, family: string) {
  context.font = `${weight} ${size}px ${family}`;
}

const widths = new Map<string, number>();
const MAX_CACHED_WIDTHS = 4000;

/** Text widths repeat from frame to frame, and measuring is the costly part of drawing text. */
export function textWidth(context: Paint2D, text: string) {
  const key = context.font + '\u0000' + text;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;

  if (widths.size > MAX_CACHED_WIDTHS) widths.clear();
  const width = context.measureText(text).width;
  widths.set(key, width);

  return width;
}

/** Shortens text with an ellipsis to fit a width, as `text-overflow: ellipsis` does. */
export function fitText(context: Paint2D, text: string, width: number) {
  if (textWidth(context, text) <= width) return text;

  let fitted = text;
  while (fitted.length > 1 && textWidth(context, fitted + '…') > width)
    fitted = fitted.slice(0, -1);

  return fitted + '…';
}

/** Shadows ignore the canvas transform, so their offsets and blur follow its scale here. */
export function applyShadow(context: Paint2D, shadow: TextShadow) {
  const scale = context.getTransform().a;
  context.shadowColor = shadow.color;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = shadow.offsetY * scale;
  context.shadowBlur = shadow.blur * scale;
}

export function clearShadow(context: Paint2D) {
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
}

export function fillRoundedRect(
  context: Paint2D,
  box: Box,
  radius: number,
  color: string | CanvasGradient
) {
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(box.x, box.y, box.width, box.height, radius);
  context.fill();
}

/** A 1px border drawn inside the box, as a CSS border is. */
export function strokeRoundedRect(context: Paint2D, box: Box, radius: number, color: string) {
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1, radius - 0.5);
  context.stroke();
}

const iconShapes = new Map<IconName, Path2D[]>();

/** One of the app's stroke icons, drawn as the Icon component draws it. */
export function drawIcon(
  context: Paint2D,
  name: IconName,
  { x, y, size, color }: { x: number; y: number; size: number; color: string }
) {
  let shapes = iconShapes.get(name);
  if (!shapes) {
    shapes = iconPaths[name].map((path) => new Path2D(path));
    iconShapes.set(name, shapes);
  }

  const scale = size / 24;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.strokeStyle = color;
  context.lineWidth = 1.8;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const shape of shapes) context.stroke(shape);
  context.restore();
}

/** Scales a colour's channels, as `filter: brightness()` does; colours it cannot read pass through. */
export function brighten(color: string, factor: number) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(
    color
  );
  const scale = (channel: number) => Math.round(Math.min(255, channel * factor));

  if (hex?.[1]) {
    const value = Number.parseInt(hex[1], 16);
    return `rgb(${scale(value >> 16)}, ${scale((value >> 8) & 255)}, ${scale(value & 255)})`;
  }

  if (rgba) {
    const alpha = rgba[4] ?? '1';
    return `rgba(${scale(Number(rgba[1]))}, ${scale(Number(rgba[2]))}, ${scale(Number(rgba[3]))}, ${alpha})`;
  }

  return color;
}
