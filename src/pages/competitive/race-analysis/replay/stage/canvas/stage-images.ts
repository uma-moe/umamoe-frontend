import { drawIcon, type Paint2D } from './canvas-paint';
import type { StagePalette } from './stage-palette';

export type PortraitShape = 'circle' | 'rounded';

type LoadedImage = HTMLImageElement | 'failed';

/** A tile holds the device pixels it covers on screen, so copying it never rescales the portrait. */
function tileDensity(context: Paint2D) {
  return Math.max(0.25, Math.round(context.getTransform().a * 100) / 100);
}

/**
 * Portraits for canvas drawing. Each is drawn once into a small tile at the size and pixel density it
 * appears at, so a frame copies a few dozen pixels per runner instead of scaling the full image.
 */
export class StageImages {
  #images = new Map<string, LoadedImage>();
  #tiles = new Map<string, OffscreenCanvas>();
  #onload: () => void;

  /** `onload` runs as each image arrives, so the views waiting on it redraw. */
  constructor(onload: () => void) {
    this.#onload = onload;
  }

  /** The decoded image, which starts loading on first use and is absent until it arrives. */
  image(url: string): HTMLImageElement | undefined {
    const known = this.#images.get(url);
    if (known !== undefined) return known === 'failed' ? undefined : known;

    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    this.#images.set(url, image);
    image
      .decode()
      .then(() => this.#onload())
      .catch(() => {
        this.#images.set(url, 'failed');
        this.#onload();
      });

    return undefined;
  }

  #ready(url: string) {
    const image = this.#images.get(url);
    if (image === undefined) this.image(url);

    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      ? image
      : undefined;
  }

  /** Every image the views will need, decoded before a recording draws its first frame. */
  async preload(urls: Iterable<string>) {
    await Promise.all(
      [...urls].map(async (url) => {
        this.image(url);
        const image = this.#images.get(url);
        if (image instanceof HTMLImageElement) await image.decode().catch(() => {});
      })
    );
  }

  /** Forgets the drawn tiles, whose colours follow the theme. */
  clearTiles() {
    this.#tiles.clear();
  }

  /**
   * Draws a portrait as the Artwork component shows it: the image covering the frame from the top,
   * on a surface behind a 1px border, or a person icon while it is missing.
   */
  drawPortrait(
    context: Paint2D,
    url: string | undefined,
    {
      x,
      y,
      size,
      shape,
      radius = 0,
      palette
    }: {
      x: number;
      y: number;
      size: number;
      shape: PortraitShape;
      radius?: number;
      palette: StagePalette;
    }
  ) {
    const density = tileDensity(context);
    const image = url === undefined ? undefined : this.#ready(url);
    const key = [url ?? '', image ? 'image' : 'empty', shape, size, radius, density].join('|');

    let tile = this.#tiles.get(key);
    if (!tile) {
      tile = this.#drawTile({ image, size, shape, radius, density, palette });
      this.#tiles.set(key, tile);
    }

    context.drawImage(tile, x, y, tile.width / density, tile.height / density);
  }

  #drawTile({
    image,
    size,
    shape,
    radius,
    density,
    palette
  }: {
    image: HTMLImageElement | undefined;
    size: number;
    shape: PortraitShape;
    radius: number;
    density: number;
    palette: StagePalette;
  }) {
    const pixels = Math.ceil(size * density);
    const tile = new OffscreenCanvas(pixels, pixels);
    const context = tile.getContext('2d');
    if (!context) return tile;

    context.scale(density, density);
    const outline = (inset: number) => {
      context.beginPath();
      if (shape === 'circle') context.arc(size / 2, size / 2, size / 2 - inset, 0, Math.PI * 2);
      else context.roundRect(inset, inset, size - inset * 2, size - inset * 2, radius - inset);
    };

    outline(0);
    context.fillStyle = palette.artBorder;
    context.fill();
    outline(1);
    context.fillStyle = palette.surface2;
    context.fill();

    if (image) {
      context.save();
      outline(1);
      context.clip();
      const inner = size - 2;
      const scale = Math.max(inner / image.naturalWidth, inner / image.naturalHeight);
      const width = image.naturalWidth * scale;
      context.drawImage(image, 1 + (inner - width) / 2, 1, width, image.naturalHeight * scale);
      context.restore();
    } else {
      const icon = Math.min(24, size * 0.6);
      drawIcon(context, 'user', {
        x: (size - icon) / 2,
        y: (size - icon) / 2,
        size: icon,
        color: palette.textSecondary
      });
    }

    return tile;
  }
}
