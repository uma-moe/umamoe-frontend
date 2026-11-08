import { applyShadow, clearShadow, setFont, type Paint2D } from './canvas-paint';
import type { StageImages } from './stage-images';
import type { StagePalette } from './stage-palette';

export const BRAND_LOGO_URL = '/logo.webp';
const BRAND_TEXT = 'uma.moe';
const BRAND_COLOR = '#f2f5f3';
// The logo fills this share of its square, as LogoMark's padded view box draws it.
const LOGO_FILL = 493 / 581.714;
const LOGO_ASPECT = 431 / 493;
// The stacked drop shadows of ReplayBrandMark: a tight edge, a halo and a wide soft fall-off.
const SHADOWS = [
  { color: 'rgba(0, 0, 0, 0.95)', offsetY: 1, blur: 1 },
  { color: 'rgba(0, 0, 0, 0.85)', offsetY: 0, blur: 3 },
  { color: 'rgba(0, 0, 0, 0.7)', offsetY: 2, blur: 10 }
];

function drawMark(
  context: Paint2D,
  { logo, compact, font }: { logo: HTMLImageElement | undefined; compact: boolean; font: string }
) {
  const box = compact ? 20 : 26;
  const gap = compact ? 5 : 7;
  const size = compact ? 14 : 18;

  if (logo) {
    const width = box * LOGO_FILL;
    const height = width * LOGO_ASPECT;
    context.drawImage(logo, (box - width) / 2, (box - height) / 2, width, height);
  }

  setFont(context, 700, size, font);
  context.fillStyle = BRAND_COLOR;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(BRAND_TEXT, box + gap, box / 2);
}

/** The uma.moe mark for clips, which cannot copy the page's ReplayBrandMark. */
export function drawBrandMark(
  context: Paint2D,
  {
    left,
    bottom,
    compact,
    palette,
    images
  }: {
    left: number;
    /** The mark's lower edge on the stage. */
    bottom: number;
    compact: boolean;
    palette: StagePalette;
    images: StageImages;
  }
) {
  const box = compact ? 20 : 26;
  const mark = { logo: images.image(BRAND_LOGO_URL), compact, font: palette.fontFamily };

  context.save();
  context.translate(left, bottom - box);
  for (const shadow of SHADOWS) {
    applyShadow(context, shadow);
    drawMark(context, mark);
  }

  clearShadow(context);
  drawMark(context, mark);
  context.restore();
}
