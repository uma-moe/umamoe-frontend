/** Draws one layer of a clip frame in stage pixels, on a context already cropped and scaled. */
export type ClipLayerDraw = (context: CanvasRenderingContext2D) => void;

/** A view that draws its own clip frames, instead of being copied from the page. */
export interface CanvasClipLayer {
  /** Loads what the layer draws and measures where it sits on the stage, before the first frame. */
  prepareClip(stage: DOMRect): Promise<ClipLayerDraw | undefined>;
}
