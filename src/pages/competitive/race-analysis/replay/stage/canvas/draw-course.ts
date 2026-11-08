import { LABEL_ROW, SECTION_RIBBON, SLOPE_RIBBON } from '../../course-ribbons';
import { OPEN_DOOR_RADIANS } from '../../replay-gate';
import {
  BANDS_BOTTOM,
  START_LINE_INSET,
  type CourseScene,
  type StageGate,
  type StageGeometry
} from '../position-scene';
import {
  applyShadow,
  brighten,
  clearShadow,
  fillRoundedRect,
  setFont,
  textWidth,
  type Paint2D,
  type TextShadow
} from './canvas-paint';
import type { StagePalette } from './stage-palette';

const RIBBON_TEXT = '#10161d';
const FINISH_SQUARE = 5;
const FINISH_LIGHT = '#f5f5f5';
const FINISH_DARK = '#151515';
// Course colours are pale on the light theme's grass.
const LIGHT_START_LINE_BRIGHTNESS = 0.62;

export function labelShadow(palette: StagePalette): TextShadow {
  return palette.dark
    ? { color: 'rgba(0, 0, 0, 0.45)', offsetY: 1, blur: 2 }
    : { color: 'rgba(255, 255, 255, 0.5)', offsetY: 1, blur: 1 };
}

// Thin lines sit on half pixels so they render sharp instead of smeared across two.
const crisp = (value: number) => Math.round(value) + 0.5;

function verticalLine(context: Paint2D, x: number, top: number, bottom: number) {
  context.moveTo(x, top);
  context.lineTo(x, bottom);
}

function drawGround(
  context: Paint2D,
  scene: CourseScene,
  { size, railY }: StageGeometry,
  palette: StagePalette
) {
  context.fillStyle = palette.trackSurface;
  context.fillRect(0, 0, size.width, size.height);
  context.fillStyle = palette.trackInfield;
  context.fillRect(0, railY, size.width, size.height - railY);

  context.fillStyle = palette.trackStripe;
  for (const stripe of scene.stripes) context.fillRect(stripe.x, 0, stripe.width, railY);

  context.globalAlpha = 0.45;
  context.strokeStyle = palette.trackMarking;
  context.lineWidth = 1;
  context.beginPath();
  for (const y of scene.laneGuides) {
    context.moveTo(0, crisp(y));
    context.lineTo(size.width, crisp(y));
  }
  context.stroke();

  context.globalAlpha = 0.16;
  for (const zone of scene.keepZones) {
    context.fillStyle = zone.color;
    context.fillRect(zone.x, BANDS_BOTTOM, zone.width, railY - BANDS_BOTTOM);
  }

  context.globalAlpha = 0.9;
  for (const band of scene.sectionBands) {
    context.fillStyle = band.color;
    context.fillRect(band.x, 0, band.width, SECTION_RIBBON);
  }
  for (const band of scene.slopeBands) {
    context.fillStyle = band.color;
    context.fillRect(band.x, SECTION_RIBBON, band.width, SLOPE_RIBBON);
  }
  context.globalAlpha = 1;
}

function drawStartLines(
  context: Paint2D,
  scene: CourseScene,
  { railY }: StageGeometry,
  palette: StagePalette
) {
  context.save();
  context.lineWidth = 2.5;
  context.lineCap = 'round';
  context.setLineDash([0, 7]);
  context.globalAlpha = palette.dark ? 0.85 : 1;
  for (const line of scene.startLines) {
    const color = line.color ?? palette.trackInk;
    context.strokeStyle = palette.dark ? color : brighten(color, LIGHT_START_LINE_BRIGHTNESS);
    context.beginPath();
    verticalLine(
      context,
      Math.round(line.x),
      BANDS_BOTTOM + START_LINE_INSET,
      railY - START_LINE_INSET
    );
    context.stroke();
  }
  context.restore();
}

function drawRail(
  context: Paint2D,
  scene: CourseScene,
  { size, railY }: StageGeometry,
  palette: StagePalette
) {
  context.strokeStyle = palette.trackRail;

  context.globalAlpha = 0.6;
  context.lineWidth = 2;
  context.beginPath();
  for (const x of scene.boundaries) verticalLine(context, x, 0, railY);
  context.stroke();

  context.globalAlpha = 0.7;
  context.lineWidth = 1;
  context.beginPath();
  for (const x of scene.posts) verticalLine(context, crisp(x), railY - 6, railY);
  context.stroke();
  context.globalAlpha = 1;

  context.strokeStyle = palette.trackPole;
  context.lineWidth = 3;
  context.beginPath();
  for (const x of scene.poles) verticalLine(context, x, railY - 14, railY + 2);
  context.stroke();

  context.strokeStyle = palette.trackRail;
  context.beginPath();
  context.moveTo(0, Math.round(railY) + 0.5);
  context.lineTo(size.width, Math.round(railY) + 0.5);
  context.stroke();
}

const GATE_BEAM = 6;
const GATE_FRAME = 3;

// Each stall closes with two leaves hinged on its partitions, hidden under the front beam.
function drawGate(context: Paint2D, { stalls, front, depth, open }: StageGate, font: string) {
  const back = front - depth;
  const top = stalls[0]?.from ?? 0;
  const bottom = stalls.at(-1)?.to ?? 0;

  context.globalAlpha = 0.92;
  fillRoundedRect(
    context,
    {
      x: back - GATE_FRAME,
      y: top - GATE_FRAME,
      width: depth + GATE_FRAME * 2,
      height: bottom - top + GATE_FRAME * 2
    },
    4,
    '#262d33'
  );
  context.globalAlpha = 1;

  for (const stall of stalls) {
    fillRoundedRect(
      context,
      {
        x: back + GATE_BEAM / 2,
        y: stall.from + 1.5,
        width: depth - GATE_BEAM,
        height: Math.max(0, stall.to - stall.from - 3)
      },
      2,
      '#3a434b'
    );
  }

  context.strokeStyle = '#aeb8c1';
  context.lineWidth = 1.5;
  context.beginPath();
  for (const stall of stalls.slice(1)) {
    context.moveTo(back + GATE_BEAM / 2, stall.from);
    context.lineTo(front - GATE_BEAM / 2, stall.from);
  }
  context.stroke();

  if (open) {
    const hinge = front + GATE_BEAM / 2;
    context.strokeStyle = '#e4e9ed';
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.beginPath();
    for (const stall of stalls) {
      const length = (stall.to - stall.from) / 2 - 2;
      const reach = length * Math.sin(OPEN_DOOR_RADIANS);
      const drop = length * Math.cos(OPEN_DOOR_RADIANS);
      context.moveTo(hinge, stall.from + 2);
      context.lineTo(hinge + reach, stall.from + 2 + drop);
      context.moveTo(hinge, stall.to - 2);
      context.lineTo(hinge + reach, stall.to - 2 - drop);
    }
    context.stroke();
    context.lineCap = 'butt';
  }

  for (const beam of [back, front]) {
    const box = {
      x: beam - GATE_BEAM / 2,
      y: top - GATE_FRAME - 2,
      width: GATE_BEAM,
      height: bottom - top + (GATE_FRAME + 2) * 2
    };
    fillRoundedRect(context, box, GATE_BEAM / 2, '#e4e9ed');
    context.strokeStyle = '#1d2329';
    context.lineWidth = 1;
    context.stroke();
  }

  context.font = '700 8.5px ' + font;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  for (const stall of stalls) {
    fillRoundedRect(
      context,
      { x: back - 6, y: stall.centre - 6, width: 12, height: 12 },
      2,
      '#1d2329'
    );
    context.fillStyle = '#f2f4f6';
    context.fillText(String(stall.gate), back, stall.centre + 3);
  }
}

function drawFinishLine(context: Paint2D, x: number, railY: number) {
  const left = x - FINISH_SQUARE;
  context.save();
  context.beginPath();
  context.rect(left, 0, FINISH_SQUARE * 2, railY);
  context.clip();

  // The checks repeat a 10px tile: light at top right and bottom left, dark in the others.
  for (let top = 0, row = 0; top < railY; top += FINISH_SQUARE, row++) {
    context.fillStyle = row % 2 === 0 ? FINISH_DARK : FINISH_LIGHT;
    context.fillRect(left, top, FINISH_SQUARE, FINISH_SQUARE);
    context.fillStyle = row % 2 === 0 ? FINISH_LIGHT : FINISH_DARK;
    context.fillRect(left + FINISH_SQUARE, top, FINISH_SQUARE, FINISH_SQUARE);
  }
  context.restore();
}

function drawCourseLabels(context: Paint2D, scene: CourseScene, palette: StagePalette) {
  const font = palette.fontFamily;
  const middle = LABEL_ROW + 6;
  context.textAlign = 'left';
  context.textBaseline = 'middle';

  applyShadow(context, labelShadow(palette));
  for (const label of scene.labels) {
    if (label.kind === 'section') {
      clearShadow(context);
      context.fillStyle = label.color ?? palette.trackInk;
      context.fillRect(label.x, LABEL_ROW, 2, 12);
      applyShadow(context, labelShadow(palette));
    }

    setFont(context, label.kind === 'phase' ? 400 : 600, 10, font);
    context.fillStyle = label.kind === 'boundary' ? palette.trackRail : palette.trackInk;
    context.fillText(label.text, label.x + (label.kind === 'section' ? 6 : 4), middle);
  }
  clearShadow(context);

  setFont(context, 700, 9, font);
  for (const zone of scene.keepZones) {
    const width = textWidth(context, zone.label) + 8;
    fillRoundedRect(context, { x: zone.x + 2, y: zone.labelTop, width, height: 12 }, 3, zone.color);
    context.fillStyle = RIBBON_TEXT;
    context.fillText(zone.label, zone.x + 6, zone.labelTop + 6);
  }
}

function drawAxes(context: Paint2D, scene: CourseScene, palette: StagePalette) {
  const font = palette.fontFamily;

  setFont(context, 400, 10, font);
  context.fillStyle = palette.trackInk;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const label of scene.distanceLabels) context.fillText(label.text, label.x, label.y);

  setFont(context, 700, 9, font);
  context.fillStyle = RIBBON_TEXT;
  context.textAlign = 'left';
  for (const name of scene.stickyNames) {
    const middle = name.kind === 'section' ? 7 : SECTION_RIBBON + 6;
    context.fillText(name.text, name.x, middle);
  }

  // Each lane label rests on its guide line.
  setFont(context, 400, 9, font);
  context.fillStyle = palette.trackInk;
  context.globalAlpha = 0.8;
  context.textBaseline = 'bottom';
  applyShadow(context, labelShadow(palette));
  for (const label of scene.laneLabels) context.fillText(label.text, 6, label.y - 1);
  clearShadow(context);
  context.globalAlpha = 1;
}

/** The track, its markings and labels, beneath the runners. */
export function drawCourse(
  context: Paint2D,
  scene: CourseScene,
  geometry: StageGeometry,
  palette: StagePalette
) {
  drawGround(context, scene, geometry, palette);
  drawStartLines(context, scene, geometry, palette);
  drawRail(context, scene, geometry, palette);
  if (scene.gate) drawGate(context, scene.gate, palette.fontFamily);
  if (scene.finishX !== undefined) drawFinishLine(context, scene.finishX, geometry.railY);
  drawCourseLabels(context, scene, palette);
  drawAxes(context, scene, palette);
}
