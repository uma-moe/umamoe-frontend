import { cropPixels, layerPlacement, type ClipCrop, type PixelBox } from './clip-crop';
import type { ClipFrameSize } from './clip-plan';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

// A clip frame shows the replay state itself, never a transition midway to it.
const STILL_CSS = '*,*::before,*::after{animation:none!important;transition:none!important}';

const ELEMENT_PSEUDO =
  /::?(?:before|after|placeholder|marker|selection|backdrop|-webkit-[\w-]+|-moz-[\w-]+)(?:\([^)]*\))?/g;
const STATE_PSEUDO = /:(?:hover|focus-visible|focus-within|focus|active|visited)\b/g;

interface StyleEntry {
  selectorText?: string;
  cssText: string;
  used: boolean;
}

function sheetRules(sheet: CSSStyleSheet): CSSRuleList | [] {
  try {
    return sheet.cssRules;
  } catch {
    // A cross-origin sheet hides its rules.
    return [];
  }
}

/**
 * Flattens the page's stylesheets as they apply now: media and support conditions are resolved here,
 * because the clip's SVG image has neither the page's viewport nor its layout.
 */
function flattenRules(rules: CSSRuleList | [], entries: StyleEntry[]) {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      entries.push({ selectorText: rule.selectorText, cssText: rule.cssText, used: false });
    } else if (rule instanceof CSSMediaRule) {
      if (matchMedia(rule.media.mediaText).matches) flattenRules(rule.cssRules, entries);
    } else if (rule instanceof CSSSupportsRule) {
      if (CSS.supports(rule.conditionText)) flattenRules(rule.cssRules, entries);
    } else if (rule instanceof CSSLayerBlockRule) {
      flattenRules(rule.cssRules, entries);
    } else if (rule instanceof CSSImportRule) {
      const media = rule.media.mediaText;
      if (rule.styleSheet && (!media || matchMedia(media).matches))
        flattenRules(sheetRules(rule.styleSheet), entries);
    } else if (rule instanceof CSSPropertyRule) {
      entries.push({ cssText: rule.cssText, used: true });
    }
    // Keyframes are stilled, and container queries cannot resolve against the flattened ancestors.
  }
}

/** Whether a rule could style an element in any state, so a hover or ::before rule still counts. */
function selects(selectorText: string, element: Element) {
  const stripped = selectorText.replaceAll(ELEMENT_PSEUDO, '').replaceAll(STATE_PSEUDO, '');
  const selectors = stripped.split(',').map((part) => part.trim() || '*');

  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

/**
 * Embeds only the rules that match drawn elements, a few kilobytes of the page's styles.
 * A frame that shows a class or element not seen before checks the remaining rules again.
 */
class StyleCollector {
  #entries: StyleEntry[] = [];
  #seen = new Set<string>();
  #signatures = new Set<string>();
  #css = '';

  constructor() {
    for (const sheet of document.styleSheets) flattenRules(sheetRules(sheet), this.#entries);
  }

  /** The rules for the drawn elements, which `scope` lists afresh on each call. */
  css(scope: () => Iterable<Element>) {
    let unseen = false;
    for (const element of scope()) {
      if (this.#remember(element)) unseen = true;
    }
    if (!unseen && this.#css) return this.#css;

    const elements = [...scope()];
    let added = false;
    for (const entry of this.#entries) {
      if (entry.used || entry.selectorText === undefined) continue;

      const selectorText = entry.selectorText;
      if (elements.some((element) => selects(selectorText, element))) {
        entry.used = true;
        added = true;
      }
    }

    if (added || !this.#css) {
      const used = this.#entries.filter((entry) => entry.used).map((entry) => entry.cssText);
      this.#css = used.join('\n') + '\n' + STILL_CSS;
    }

    return this.#css;
  }

  /** Records the element's name and classes; true when any was new. */
  #remember(element: Element) {
    // Most elements repeat a name and class list already seen, which one lookup settles.
    const signature = element.localName + ' ' + (element.getAttribute('class') ?? '');
    if (this.#signatures.has(signature)) return false;
    this.#signatures.add(signature);

    let unseen = false;
    for (const key of [element.localName, ...element.classList]) {
      if (this.#seen.has(key)) continue;
      this.#seen.add(key);
      unseen = true;
    }

    return unseen;
  }
}

async function readDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Image request failed: ' + response.status);

  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read'));
    reader.readAsDataURL(blob);
  });
}

/** An SVG image loads nothing itself, so each picture is embedded once as a data URL. */
class ImageInliner {
  #urls = new Map<string, Promise<string | undefined>>();

  async inline(root: Element) {
    const images = [...root.querySelectorAll('img')];
    await Promise.all(images.map((image) => this.#inlineImage(image)));
  }

  async #inlineImage(image: HTMLImageElement) {
    const source = image.getAttribute('src');

    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.removeAttribute('loading');
    if (source === null || source.startsWith('data:')) return;

    const url = new URL(source, document.baseURI).href;
    let embedded = this.#urls.get(url);
    if (embedded === undefined) {
      embedded = readDataUrl(url).catch(() => undefined);
      this.#urls.set(url, embedded);
    }

    const dataUrl = await embedded;
    if (dataUrl === undefined) image.removeAttribute('src');
    else image.setAttribute('src', dataUrl);
  }
}

/**
 * One element drawn through an SVG foreignObject. Its ancestors are rebuilt as `display: contents`
 * copies, so their classes, attributes and custom properties still select and style it.
 */
class LayerRenderer {
  readonly element: HTMLElement;
  readonly ancestors: Element[] = [];
  #svg: SVGSVGElement;
  #object: SVGForeignObjectElement;
  #style: HTMLStyleElement;
  #slot: Element;

  constructor(element: HTMLElement, inert: Document) {
    this.element = element;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement)
      this.ancestors.unshift(ancestor);

    this.#svg = inert.createElementNS(SVG_NS, 'svg');
    for (const attribute of document.documentElement.attributes) {
      if (attribute.name !== 'style' && attribute.name !== 'xmlns')
        this.#svg.setAttribute(attribute.name, attribute.value);
    }
    this.#svg.setAttribute('preserveAspectRatio', 'none');

    this.#object = inert.createElementNS(SVG_NS, 'foreignObject');
    this.#svg.append(this.#object);

    let slot: Element = this.#object;
    for (const ancestor of this.ancestors) {
      const copy = inert.createElementNS(XHTML_NS, ancestor.localName);
      for (const attribute of ancestor.attributes)
        copy.setAttribute(attribute.name, attribute.value);
      copy.setAttribute(
        'style',
        (ancestor.getAttribute('style') ?? '') + ';display:contents !important'
      );
      slot.append(copy);
      slot = copy;
    }

    this.#style = inert.createElementNS(XHTML_NS, 'style') as HTMLStyleElement;
    (this.#object.firstElementChild ?? this.#object).prepend(this.#style);
    this.#slot = slot;
  }

  /** A copy of the element as it is now, fixed at its on-screen size. */
  clone(box: DOMRect) {
    const clone = this.#slot.ownerDocument.importNode(this.element, true);

    for (const excluded of clone.querySelectorAll('[data-clip-exclude]')) excluded.remove();
    clone.style.width = box.width + 'px';
    clone.style.height = box.height + 'px';
    clone.style.margin = '0';
    clone.style.borderRadius = '0';

    return clone;
  }

  /** Draws the `view` part of a copy as an image the size of its `target` in the video frame. */
  async render({
    clone,
    box,
    view,
    target,
    css,
    images,
    serializer
  }: {
    clone: HTMLElement;
    box: DOMRect;
    view: PixelBox;
    target: PixelBox;
    css: string;
    images: ImageInliner;
    serializer: XMLSerializer;
  }) {
    await images.inline(clone);

    // Frames of a batch share this SVG, so it is filled and serialized without yielding in between.
    this.#style.textContent = css;
    this.#svg.setAttribute('width', String(target.width));
    this.#svg.setAttribute('height', String(target.height));
    this.#svg.setAttribute('viewBox', [view.x, view.y, view.width, view.height].join(' '));
    this.#object.setAttribute('width', String(box.width));
    this.#object.setAttribute('height', String(box.height));
    this.#slot.replaceChildren(clone);
    const markup = serializer.serializeToString(this.#svg);
    this.#slot.replaceChildren();

    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    await image.decode();

    return image;
  }
}

export interface ClipLayers {
  /** The replay view the clip frames. */
  stage: HTMLElement;
  /** Panels floating over the stage, such as the race field, drawn where they sit on it. */
  overlays: HTMLElement[];
}

export interface PlacedLayer {
  layer: LayerRenderer;
  box: DOMRect;
  view: PixelBox;
  target: PixelBox;
}

interface LayerCapture extends PlacedLayer {
  clone: HTMLElement;
}

/** The stage copied at one moment, ready to render while the replay moves on. */
export interface FrameCapture {
  css: string;
  layers: LayerCapture[];
}

/** A rendered frame: each layer's image and where it goes on the canvas. */
export interface RenderedFrame {
  pieces: { image: HTMLImageElement; target: PixelBox }[];
}

/**
 * Draws the cropped replay stage, and anything floating over it, onto a canvas. Capturing copies
 * the stage at once; rendering the copies can then run for many frames together.
 */
export class StageRasterizer {
  readonly frame: ClipFrameSize;
  #crop: ClipCrop;
  #stage: LayerRenderer;
  #layers: LayerRenderer[];
  #styles = new StyleCollector();
  #images = new ImageInliner();
  #serializer = new XMLSerializer();
  #background: string;

  constructor({ stage, overlays }: ClipLayers, crop: ClipCrop, frame: ClipFrameSize) {
    // Clones made in a separate document stay inert: their images neither load nor run anything.
    const inert = document.implementation.createHTMLDocument('');

    this.frame = frame;
    this.#crop = crop;
    this.#stage = new LayerRenderer(stage, inert);
    this.#layers = [this.#stage, ...overlays.map((overlay) => new LayerRenderer(overlay, inert))];
    this.#background = getComputedStyle(stage).backgroundColor;
  }

  /**
   * Where each layer inside the crop sits on the frame. Reading it lays out the page, and the layers
   * hold still while the replay plays inside them, so a batch of frames shares one reading.
   */
  placeLayers(): PlacedLayer[] {
    const origin = this.#stage.element.getBoundingClientRect();
    const region = cropPixels(this.#crop, origin);
    const placed: PlacedLayer[] = [];

    for (const layer of this.#layers) {
      const box = layer.element.getBoundingClientRect();
      const placement = layerPlacement({
        layer: {
          x: box.left - origin.left,
          y: box.top - origin.top,
          width: box.width,
          height: box.height
        },
        region,
        frame: this.frame
      });
      if (placement === undefined) continue;

      placed.push({ layer, box, ...placement });
    }

    return placed;
  }

  /** Copies the placed layers as the page shows them now, without waiting on anything. */
  capture(placed: PlacedLayer[]): FrameCapture {
    const css = this.#styles.css(() => this.#scope());
    const layers = placed.map((place) => ({ ...place, clone: place.layer.clone(place.box) }));

    return { css, layers };
  }

  async render({ css, layers }: FrameCapture): Promise<RenderedFrame> {
    const pieces = await Promise.all(
      layers.map(async ({ layer, clone, box, view, target }) => {
        const image = await layer.render({
          clone,
          box,
          view,
          target,
          css,
          images: this.#images,
          serializer: this.#serializer
        });

        return { image, target };
      })
    );

    return { pieces };
  }

  draw(context: CanvasRenderingContext2D, { pieces }: RenderedFrame) {
    context.fillStyle = this.#background;
    context.fillRect(0, 0, this.frame.width, this.frame.height);
    for (const { image, target } of pieces)
      context.drawImage(image, target.x, target.y, target.width, target.height);
  }

  /** Every element whose styles a frame can need: the layers' subtrees and their ancestors. */
  *#scope() {
    for (const layer of this.#layers) {
      yield* layer.ancestors;
      yield layer.element;
      yield* layer.element.getElementsByTagName('*');
    }
  }
}
