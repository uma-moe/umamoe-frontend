import type { FieldPanelLayout, PanelFont } from '../field-panel-layout';
import type { FieldRow } from '../field-rows';
import {
  applyShadow,
  clearShadow,
  drawIcon,
  fillRoundedRect,
  setFont,
  strokeRoundedRect,
  fitText,
  textWidth,
  type Paint2D
} from './canvas-paint';
import type { StageImages } from './stage-images';
import type { StagePalette } from './stage-palette';

const ROW_RADIUS = 6;
const PACEMAKER_LABEL = 'Pacemaker';
// Dimmed and hidden runners fade their details, as the list does, but keep their visibility button.
const PICK_OPACITY = [1, 0.5, 0.35];

function useFont(context: Paint2D, font: PanelFont, family: string, weight = font.weight) {
  setFont(context, weight, font.size, family);
}

function pacemakerBadgeWidth(context: Paint2D, family: string) {
  setFont(context, 400, 9, family);
  return 3 + 12 + 3 + textWidth(context, PACEMAKER_LABEL) + 3;
}

/** The pacemaker badge beside the name: a flag and its label on the surface colour. */
function drawPacemakerBadge(context: Paint2D, x: number, middle: number, palette: StagePalette) {
  const width = pacemakerBadgeWidth(context, palette.fontFamily);
  fillRoundedRect(context, { x, y: middle - 7, width, height: 14 }, 3, palette.surface1);
  drawIcon(context, 'flag', { x: x + 3, y: middle - 6, size: 12, color: palette.accentPrimary });
  context.fillStyle = palette.accentPrimary;
  context.textAlign = 'left';
  context.fillText(PACEMAKER_LABEL, x + 18, middle);
}

function placeColor(row: FieldRow, palette: StagePalette) {
  if (row.blocked) return palette.accentError;
  if (row.place !== undefined && row.place <= 3) return palette.accentWarning;

  return palette.textSecondary;
}

function drawRunnerDetails(
  context: Paint2D,
  row: FieldRow,
  layout: FieldPanelLayout,
  { palette, images }: { palette: StagePalette; images: StageImages }
) {
  const family = palette.fontFamily;
  const { place, art, name, hp, gap, fonts } = layout;

  fillRoundedRect(context, place, 4, palette.surface2);
  useFont(context, fonts.place, family, row.blocked ? 700 : fonts.place.weight);
  context.fillStyle = placeColor(row, palette);
  context.textAlign = 'center';
  context.fillText(String(row.place ?? '—'), place.x + place.width / 2, place.y + place.height / 2);

  images.drawPortrait(context, row.portrait, {
    x: art.x,
    y: art.y,
    size: art.width,
    shape: 'rounded',
    radius: layout.artRadius,
    palette
  });

  context.textAlign = 'left';
  const badgeWidth = row.pacemaker ? pacemakerBadgeWidth(context, family) + 4 : 0;
  useFont(context, fonts.title, family);
  const title = fitText(context, row.runner.name, name.width - badgeWidth);
  context.fillStyle = palette.textPrimary;
  context.fillText(title, name.x, name.titleY);
  if (row.pacemaker) {
    const badgeX = name.x + textWidth(context, title) + 4;
    drawPacemakerBadge(context, badgeX, name.titleY, palette);
  }

  useFont(context, fonts.meta, family);
  const gateText = 'Gate ' + (row.runner.index + 1);
  context.fillStyle = palette.textSecondary;
  context.fillText(gateText, name.x, name.metaY);
  context.fillStyle = row.styleColor ?? palette.textSecondary;
  context.fillText(row.styleName, name.x + textWidth(context, gateText) + 6, name.metaY);

  context.textAlign = 'right';
  useFont(context, fonts.value, family);
  context.fillStyle = row.hpColor ?? palette.textSecondary;
  context.fillText(row.hpText, hp.right, hp.valueY);
  context.fillStyle = palette.textPrimary;
  context.fillText(row.gapText, gap.right, gap.valueY);

  useFont(context, fonts.meta, family, 400);
  context.fillStyle = palette.textSecondary;
  context.fillText('HP', hp.right, hp.unitY);
  context.fillStyle = row.finished ? palette.accentSuccess : palette.textSecondary;
  context.fillText(row.detail, gap.right, gap.detailY);
  if (row.finished) {
    const iconRight = gap.right - textWidth(context, row.detail) - 3;
    drawIcon(context, 'check', {
      x: iconRight - 10,
      y: gap.detailY - 5,
      size: 10,
      color: palette.accentSuccess
    });
  }
}

function drawVisibilityButton(
  context: Paint2D,
  row: FieldRow,
  layout: FieldPanelLayout,
  palette: StagePalette
) {
  const button = layout.visibility;
  fillRoundedRect(context, button, layout.visibilityRadius, palette.fieldControlBackground);
  strokeRoundedRect(context, button, layout.visibilityRadius, palette.fieldControlBorder);

  const size = layout.visibilityIcon;
  drawIcon(context, row.visibility === 2 ? 'eye-off' : 'eye', {
    x: button.x + (button.width - size) / 2,
    y: button.y + (button.height - size) / 2,
    size,
    color: layout.visibilityColor
  });
}

/** The race field floating over the stage's corner, as a clip frame shows it. */
export function drawFieldPanel(
  context: Paint2D,
  rows: FieldRow[],
  layout: FieldPanelLayout,
  paint: { palette: StagePalette; images: StageImages }
) {
  const { palette } = paint;
  const { list } = layout;

  context.save();
  context.beginPath();
  context.rect(list.x - 4, list.y, list.width + 8, list.height + 4);
  context.clip();
  context.textBaseline = 'middle';

  rows.forEach((row, order) => {
    const top = list.y + order * layout.rowStep - layout.scrollTop;
    if (top > list.y + list.height || top + layout.rowHeight < list.y) return;

    const box = { x: list.x, y: top, width: layout.rowWidth, height: layout.rowHeight };
    applyShadow(context, { color: 'rgba(0, 0, 0, 0.25)', offsetY: 1, blur: 3 });
    fillRoundedRect(
      context,
      box,
      ROW_RADIUS,
      row.chosen ? palette.fieldRowChosenBackground : palette.fieldRowBackground
    );
    clearShadow(context);
    strokeRoundedRect(
      context,
      box,
      ROW_RADIUS,
      row.chosen ? palette.fieldRowChosenBorder : palette.borderSubtle
    );

    context.save();
    context.translate(box.x, box.y);
    context.globalAlpha = PICK_OPACITY[row.visibility] ?? 1;
    drawRunnerDetails(context, row, layout, paint);
    context.globalAlpha = 1;
    drawVisibilityButton(context, row, layout, palette);
    context.restore();
  });

  context.restore();
}
