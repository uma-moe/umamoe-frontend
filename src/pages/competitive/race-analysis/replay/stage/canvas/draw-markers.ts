import type { MarkerCallout, StageMarker } from '../stage-markers';
import {
  applyShadow,
  clearShadow,
  drawIcon,
  fillRoundedRect,
  setFont,
  strokeRoundedRect,
  fitText,
  textWidth,
  type Box,
  type Paint2D
} from './canvas-paint';
import { skillChipColors, UNIQUE_BORDER_STOPS, type SkillChipColors } from './skill-chip-colors';
import type { StageImages } from './stage-images';
import type { StagePalette } from './stage-palette';
import { towardWhite } from '../../team-colors';

// A marker's parts, relative to the runner's point, as the marker's stylesheet places them.
const PORTRAIT_CENTRE_Y = 2;
const PORTRAIT_RADIUS = 22;
const ART_SIZE = 40;
const HP_TOP = 24;
const TELEMETRY_TOP = 33;
const CALLOUTS_BOTTOM = -24;
const NAME_BOTTOM = -28;
const CALLOUT_GAP = 2;
const MODE_HEIGHT = 20;
const SKILL_HEIGHT = 18;
const DIM_OPACITY = 0.25;
const GATE_TEXT = '#141923';

/** Which runner the pointer is over and which holds keyboard focus, both raised above the others. */
export interface MarkerFocus {
  hovered?: number;
  focused?: number;
}

export interface MarkerPaint {
  palette: StagePalette;
  images: StageImages;
  /** Phone widths shorten the name shown on hover. */
  compact: boolean;
}

function calloutWidth(context: Paint2D, callout: MarkerCallout, font: string) {
  setFont(context, 600, 10, font);
  if (callout.kind === 'mode') return textWidth(context, callout.text) + 12;

  const name = textWidth(context, callout.name);
  if (callout.timer === undefined) return name + 14;

  setFont(context, 700, 8.8, font);
  return name + 14 + 9 + textWidth(context, callout.timer);
}

function chipBackground(context: Paint2D, colors: SkillChipColors, box: Box) {
  if (typeof colors.background === 'string') return colors.background;

  const gradient = context.createLinearGradient(
    box.x,
    box.y,
    box.x + box.width,
    box.y + box.height
  );
  gradient.addColorStop(0, colors.background[0]);
  gradient.addColorStop(1, colors.background[1]);

  return gradient;
}

function drawModeCallout(
  context: Paint2D,
  text: string,
  x: number,
  top: number,
  paint: MarkerPaint
) {
  const { palette } = paint;
  setFont(context, 600, 10, palette.fontFamily);
  const box = { x, y: top, width: textWidth(context, text) + 12, height: MODE_HEIGHT };

  fillRoundedRect(context, box, 4, palette.modeCalloutBackground);
  strokeRoundedRect(context, box, 4, palette.modeCalloutBorder);
  context.fillStyle = palette.textPrimary;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(text, x + 6, top + MODE_HEIGHT / 2);
}

function drawSkillCallout(
  context: Paint2D,
  callout: Extract<MarkerCallout, { kind: 'skill' }>,
  { x, top, width }: { x: number; top: number; width: number },
  paint: MarkerPaint
) {
  const { palette } = paint;
  const colors = skillChipColors(callout.rarity, palette.dark);
  const box = { x, y: top, width, height: SKILL_HEIGHT };

  // An opaque backing keeps the course from showing through the translucent rarity colours.
  fillRoundedRect(context, box, 6, palette.surface1);
  if (callout.rarity === 'unique-main') {
    const border = context.createLinearGradient(x, top, x + width, top + SKILL_HEIGHT);
    for (const [offset, color] of UNIQUE_BORDER_STOPS) border.addColorStop(offset, color);
    fillRoundedRect(context, box, 6, border);

    const inner = { x: x + 1, y: top + 1, width: width - 2, height: SKILL_HEIGHT - 2 };
    fillRoundedRect(context, inner, 5, palette.surface1);
    fillRoundedRect(context, inner, 5, chipBackground(context, colors, inner));
  } else {
    fillRoundedRect(context, box, 6, chipBackground(context, colors, box));
    strokeRoundedRect(context, box, 6, colors.border);
  }

  const baseline = top + 12;
  context.fillStyle = colors.text;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  setFont(context, 600, 10, palette.fontFamily);
  context.fillText(callout.name, x + 7, baseline);

  if (callout.timer === undefined) return;

  // The timer and its divider are muted, the divider further still.
  const divider = x + 7 + textWidth(context, callout.name) + 4;
  context.save();
  context.globalAlpha *= 0.78;
  context.save();
  context.globalAlpha *= 0.24;
  context.fillRect(divider, top + 3.5, 1, 11);
  context.restore();
  setFont(context, 700, 8.8, palette.fontFamily);
  context.fillText(callout.timer, divider + 5, baseline);
  context.restore();
}

function drawCallouts(context: Paint2D, callouts: MarkerCallout[], paint: MarkerPaint) {
  const font = paint.palette.fontFamily;
  const heights = callouts.map((callout) => (callout.kind === 'mode' ? MODE_HEIGHT : SKILL_HEIGHT));
  const total =
    heights.reduce((sum, height) => sum + height, 0) + CALLOUT_GAP * (callouts.length - 1);

  let top = CALLOUTS_BOTTOM - total;
  callouts.forEach((callout, index) => {
    const width = calloutWidth(context, callout, font);
    if (callout.kind === 'mode') drawModeCallout(context, callout.text, -width / 2, top, paint);
    else drawSkillCallout(context, callout, { x: -width / 2, top, width }, paint);

    top += (heights[index] ?? 0) + CALLOUT_GAP;
  });
}

function drawPortrait(context: Paint2D, marker: StageMarker, paint: MarkerPaint) {
  const { palette, images } = paint;
  const { readout } = marker;
  const centreY = PORTRAIT_CENTRE_Y;
  const ring = (radius: number, width: number, color: string) => {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.arc(0, centreY, radius, 0, Math.PI * 2);
    context.stroke();
  };

  applyShadow(context, { color: 'rgba(0, 0, 0, 0.45)', offsetY: 1, blur: 3 });
  context.fillStyle = marker.color;
  context.beginPath();
  context.arc(0, centreY, PORTRAIT_RADIUS, 0, Math.PI * 2);
  context.fill();
  clearShadow(context);

  // A skill going off outshines the selection ring, as in the marker's stylesheet.
  if (readout.triggered) ring(PORTRAIT_RADIUS + 1.5, 3, palette.triggeredGlow);
  else if (readout.selected) {
    ring(PORTRAIT_RADIUS + 4, 2, marker.color);
    ring(PORTRAIT_RADIUS + 1.5, 3, palette.surface1);
  }

  images.drawPortrait(context, marker.portrait, {
    x: -ART_SIZE / 2,
    y: centreY - ART_SIZE / 2,
    size: ART_SIZE,
    shape: 'circle',
    palette
  });

  if (readout.blocked) ring(PORTRAIT_RADIUS + 4, 2, palette.accentError);
}

function drawBadges(context: Paint2D, marker: StageMarker, palette: StagePalette) {
  const font = palette.fontFamily;
  const label = String(marker.gate);

  setFont(context, 700, 10, font);
  const width = textWidth(context, label) + 8;
  fillRoundedRect(context, { x: 23 - width, y: 12, width, height: 12 }, 4, marker.color);
  context.fillStyle = GATE_TEXT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 23 - width / 2, 18);

  if (marker.readout.pacemaker) {
    context.fillStyle = palette.surface1;
    context.beginPath();
    context.arc(-18, -16, 9, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = palette.accentPrimary;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(-18, -16, 8.5, 0, Math.PI * 2);
    context.stroke();
    drawIcon(context, 'flag', { x: -24, y: -22, size: 12, color: palette.accentPrimary });
  }

  if (marker.readout.blocked) {
    setFont(context, 800, 18, font);
    applyShadow(context, { color: palette.surface1, offsetY: 1, blur: 2 });
    context.fillStyle = palette.accentError;
    context.textAlign = 'right';
    context.fillText('!', 33, -17);
    clearShadow(context);
  }
}

function drawHpBar(
  context: Paint2D,
  percent: number | undefined,
  color: string,
  palette: StagePalette
) {
  const box = { x: -20, y: HP_TOP, width: 40, height: 6 };
  fillRoundedRect(context, box, 3, palette.surface3);

  const filled = (Math.min(100, Math.max(0, percent ?? 0)) / 100) * 38;
  if (filled > 0) {
    context.save();
    context.beginPath();
    context.roundRect(-19, HP_TOP + 1, 38, 4, 2);
    context.clip();
    context.fillStyle = color;
    context.fillRect(-19, HP_TOP + 1, filled, 4);
    context.restore();
  }

  strokeRoundedRect(context, box, 3, 'rgba(0, 0, 0, 0.45)');
}

function drawTelemetry(context: Paint2D, values: string[], palette: StagePalette) {
  setFont(context, 400, 10, palette.fontFamily);
  const widths = values.map((value) => textWidth(context, value));
  const contentWidth = widths.reduce((sum, width) => sum + width, 0) + 13 * (values.length - 1);
  const box = {
    x: -(contentWidth + 14) / 2,
    y: TELEMETRY_TOP,
    width: contentWidth + 14,
    height: 17
  };

  fillRoundedRect(context, box, 4, palette.telemetryBackground);
  context.textAlign = 'left';
  context.textBaseline = 'middle';

  let x = box.x + 7;
  values.forEach((value, index) => {
    if (index > 0) {
      context.fillStyle = palette.borderPrimary;
      context.fillRect(x + 6, box.y + 2, 1, 13);
      x += 13;
    }

    context.fillStyle = index === 0 ? palette.textPrimary : palette.textSecondary;
    context.fillText(value, x, box.y + 8.5);
    x += widths[index] ?? 0;
  });
}

function drawNameTag(context: Paint2D, name: string, paint: MarkerPaint) {
  const { palette, compact } = paint;
  const size = compact ? 9 : 10;
  setFont(context, 600, size, palette.fontFamily);

  const text = compact ? fitText(context, name, 80) : name;
  const height = Math.round(size * 1.2) + 4;
  const width = textWidth(context, text) + 10;
  fillRoundedRect(
    context,
    { x: -width / 2, y: NAME_BOTTOM - height, width, height },
    3,
    palette.surface1
  );

  context.fillStyle = palette.textPrimary;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 0, NAME_BOTTOM - height / 2);
}

function drawMarkerParts(
  context: Paint2D,
  marker: StageMarker,
  { hovered, focused }: { hovered: boolean; focused: boolean },
  paint: MarkerPaint
) {
  const { readout } = marker;
  const telemetry = [readout.speed, readout.acceleration].filter(
    (value): value is string => value !== undefined
  );
  const telemetryShown = !marker.crowded || readout.selected || hovered || focused;
  const hasCallouts = marker.callouts.length > 0;
  const nameShown = (hovered || focused) && !(hovered && hasCallouts);

  drawPortrait(context, marker, paint);
  drawBadges(context, marker, paint.palette);
  if (readout.hp) drawHpBar(context, readout.hp.percent, readout.hp.color, paint.palette);
  if (nameShown) drawNameTag(context, marker.name, paint);
  if (hasCallouts) drawCallouts(context, marker.callouts, paint);
  if (telemetry.length && telemetryShown) drawTelemetry(context, telemetry, paint.palette);
}

let dimLayer: OffscreenCanvas | undefined;

// Dimming fades the marker as one picture, so its overlapping parts do not show through each other.
function drawDimmed(context: Paint2D, draw: (layer: Paint2D) => void) {
  const transform = context.getTransform();
  const scale = transform.a;
  const reach = { left: 160, right: 160, top: 220, bottom: 60 };
  const width = Math.ceil((reach.left + reach.right) * scale);
  const height = Math.ceil((reach.top + reach.bottom) * scale);

  dimLayer ??= new OffscreenCanvas(width, height);
  if (dimLayer.width < width || dimLayer.height < height) {
    dimLayer.width = Math.max(dimLayer.width, width);
    dimLayer.height = Math.max(dimLayer.height, height);
  }

  const layer = dimLayer.getContext('2d');
  if (!layer) return;

  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.clearRect(0, 0, width, height);
  layer.setTransform(scale, 0, 0, scale, reach.left * scale, reach.top * scale);
  draw(layer);

  context.save();
  context.setTransform(1, 0, 0, 1, transform.e, transform.f);
  context.globalAlpha = DIM_OPACITY;
  context.drawImage(
    dimLayer,
    0,
    0,
    width,
    height,
    -reach.left * scale,
    -reach.top * scale,
    width,
    height
  );
  context.restore();
}

/** Selected and focused runners sit above the field, and the hovered one above everything. */
function stackingOrder(marker: StageMarker, focus: MarkerFocus) {
  if (marker.index === focus.hovered) return 2;
  if (marker.readout.selected || marker.index === focus.focused) return 1;

  return 0;
}

/**
 * Speed Up check ranges, below the portraits as on Hakuraku: a dotted line across the track at the
 * rear end of each range, and a solid line from there to the runner with a short tick at the runner.
 */
export function drawSpeedUpChecks(
  context: Paint2D,
  markers: StageMarker[],
  { top, bottom }: { top: number; bottom: number }
) {
  for (const marker of markers) {
    if (marker.speedUpRearX === undefined) continue;

    const rearX = marker.speedUpRearX;
    const opacity = marker.dim ? DIM_OPACITY : 1;
    context.save();
    context.globalAlpha = opacity * 0.95;
    context.setLineDash([1, 7]);
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(rearX, top);
    context.lineTo(rearX, bottom);
    context.strokeStyle = '#07101b';
    context.lineWidth = 5;
    context.stroke();
    context.strokeStyle = towardWhite(marker.color, 0.45);
    context.lineWidth = 2.5;
    context.stroke();

    context.setLineDash([]);
    context.lineCap = 'butt';
    context.globalAlpha = opacity;
    context.beginPath();
    context.moveTo(rearX, marker.y);
    context.lineTo(marker.x, marker.y);
    context.moveTo(marker.x, marker.y - 6);
    context.lineTo(marker.x, marker.y + 6);
    context.strokeStyle = '#0b111b';
    context.lineWidth = 5;
    context.stroke();
    context.strokeStyle = marker.color;
    context.lineWidth = 2;
    context.stroke();
    context.restore();
  }
}

export function drawMarkers(
  context: Paint2D,
  markers: StageMarker[],
  focus: MarkerFocus,
  paint: MarkerPaint
) {
  const ordered = markers
    .map((marker) => ({ marker, order: stackingOrder(marker, focus) }))
    .sort((a, b) => a.order - b.order);

  for (const { marker } of ordered) {
    const state = {
      hovered: marker.index === focus.hovered,
      focused: marker.index === focus.focused
    };
    context.save();
    context.translate(marker.x, marker.y);
    if (marker.dim) drawDimmed(context, (layer) => drawMarkerParts(layer, marker, state, paint));
    else drawMarkerParts(context, marker, state, paint);
    context.restore();
  }
}
