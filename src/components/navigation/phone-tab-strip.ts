interface TabContent {
  label: string;
  icon?: string;
  badge?: string;
}

export type MeasureText = (text: string, fontSize: number) => number;

interface StripSpace {
  /** Width inside the tab group, in pixels. */
  width: number;
  gap: number;
  fontSize: number;
  /** Rendered text width in the tabs' font; the estimate stands in until the font can be measured. */
  measureText?: MeasureText;
}

// Wide enough for the labels in Inter, SF, Roboto, Segoe UI and Arial at the phone tab weights.
const CHARACTER_EM = 0.56;
const BADGE_FONT_SIZE = 10;
// Inline padding and border of a phone tab; tabs that fit grow from there to fill the row.
const TAB_PADDING = 22;
const ICON_WIDTH = 16;
const CONTENT_GAP = 6;
const BADGE_MARGIN = 7;
const BADGE_MIN_WIDTH = 18;

const estimateText: MeasureText = (text, fontSize) => text.length * fontSize * CHARACTER_EM;

/** Measures text in an element's font family and weight, at any size. */
export function createTextMeasure(element: Element): MeasureText | undefined {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return undefined;

  const { fontFamily, fontWeight } = getComputedStyle(element);
  return (text, fontSize) => {
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  };
}

/**
 * Whether a phone's single row of tabs holds every tab with its icon. When it does not, the icons give way so
 * that the labels fit, or so that more of them show before the row scrolls.
 */
export function phoneTabIconsFit(items: TabContent[], space: StripSpace): boolean {
  if (items.length === 0 || space.width <= 0) return true;

  const textWidth = space.measureText ?? estimateText;
  const tabsWidth = items.reduce((total, item) => {
    const icon = item.icon === undefined ? 0 : ICON_WIDTH + CONTENT_GAP;
    const badge =
      item.badge === undefined
        ? 0
        : CONTENT_GAP +
          BADGE_MARGIN +
          Math.max(BADGE_MIN_WIDTH, textWidth(item.badge, BADGE_FONT_SIZE) + 8);

    return total + TAB_PADDING + textWidth(item.label, space.fontSize) + icon + badge;
  }, 0);

  return tabsWidth + (items.length - 1) * space.gap <= space.width;
}
