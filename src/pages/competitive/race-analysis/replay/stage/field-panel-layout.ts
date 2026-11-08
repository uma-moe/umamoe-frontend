import type { Box } from './canvas/canvas-paint';

export interface PanelFont {
  size: number;
  weight: number;
}

/** Where the race field overlay and the parts of its rows sit, measured once from the page. */
export interface FieldPanelLayout {
  /** The list's visible area on the stage. */
  list: Box;
  scrollTop: number;
  rowWidth: number;
  rowHeight: number;
  /** From one row's top to the next. */
  rowStep: number;
  place: Box;
  art: Box;
  artRadius: number;
  /** The name column's left edge and width, and the middles of its two lines. */
  name: { x: number; width: number; titleY: number; metaY: number };
  hp: { right: number; valueY: number; unitY: number };
  gap: { right: number; valueY: number; detailY: number };
  visibility: Box;
  visibilityRadius: number;
  visibilityIcon: number;
  visibilityColor: string;
  fonts: { place: PanelFont; title: PanelFont; meta: PanelFont; value: PanelFont };
}

function font(element: Element): PanelFont {
  const style = getComputedStyle(element);
  return { size: Number.parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400 };
}

/** Measures the floating race field, relative to the stage box; absent when it is not shown. */
export function measureFieldPanel(
  panel: HTMLElement,
  stage: DOMRect
): FieldPanelLayout | undefined {
  const list = panel.querySelector<HTMLElement>('.field-runners');
  const [first, second] = list?.querySelectorAll<HTMLElement>('.field-runner') ?? [];
  if (!list || !first) return undefined;

  const row = first.getBoundingClientRect();
  const part = (selector: string) => first.querySelector(selector) ?? undefined;
  const box = (element: Element | undefined): Box => {
    const rect = element?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, width: 0, height: 0 };

    return { x: rect.x - row.x, y: rect.y - row.y, width: rect.width, height: rect.height };
  };
  const middle = (element: Element | undefined) => {
    const measured = box(element);
    return measured.y + measured.height / 2;
  };

  const listBox = list.getBoundingClientRect();
  const nameBox = box(part('.field-name'));
  const hpBox = box(part('.field-hp'));
  const gapBox = box(part('.field-gap'));
  const detail = part('.field-gap small');
  const detailBox = box(detail);
  const visibilityButton = part('.icon-button');
  const placeElement = part('.field-place');
  const titleElement = part('.field-identity strong');
  const metaElement = part('.field-meta');
  const art = part('.art');

  if (!visibilityButton || !placeElement || !titleElement || !metaElement || !art) return undefined;

  return {
    list: {
      x: listBox.x - stage.x,
      y: listBox.y - stage.y,
      width: listBox.width,
      height: listBox.height
    },
    scrollTop: list.scrollTop,
    rowWidth: row.width,
    rowHeight: row.height,
    rowStep: second ? second.getBoundingClientRect().y - row.y : row.height,
    place: box(placeElement),
    art: box(art),
    artRadius: Number.parseFloat(getComputedStyle(art).borderTopLeftRadius) || 0,
    name: {
      x: nameBox.x,
      width: nameBox.width,
      titleY: middle(titleElement),
      metaY: middle(metaElement)
    },
    hp: {
      right: hpBox.x + hpBox.width,
      valueY: middle(part('.field-hp strong')),
      unitY: middle(part('.field-hp small'))
    },
    // The value is the gap column's first line, above its detail line.
    gap: {
      right: gapBox.x + gapBox.width,
      valueY: gapBox.y + (detailBox.y - gapBox.y) / 2,
      detailY: middle(detail)
    },
    visibility: box(visibilityButton),
    visibilityRadius:
      Number.parseFloat(getComputedStyle(visibilityButton).borderTopLeftRadius) || 0,
    visibilityIcon: box(visibilityButton.querySelector('svg') ?? undefined).width,
    visibilityColor: getComputedStyle(visibilityButton).color,
    fonts: {
      place: font(placeElement),
      title: font(titleElement),
      meta: font(metaElement),
      value: font(part('.field-hp strong') ?? titleElement)
    }
  };
}
