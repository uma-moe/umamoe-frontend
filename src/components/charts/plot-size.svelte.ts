import type { Attachment } from 'svelte/attachments';

/**
 * The measured size of a hand-drawn SVG plot, so its viewBox matches the space it fills. Width and
 * height are read together a frame after layout: changing a viewBox inside the resize observer
 * loops in WebKit, and measuring each side separately can drop one of them.
 */
export class PlotSize {
  width = $state(0);
  height = $state(0);

  constructor(fallback: { width: number; height: number }) {
    this.width = fallback.width;
    this.height = fallback.height;
  }

  readonly observe: Attachment<HTMLElement> = (element) => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // A hidden tab measures 0; keep the last size until it is shown again.
        if (element.clientWidth > 0) this.width = element.clientWidth;
        if (element.clientHeight > 0) this.height = element.clientHeight;
      });
    });

    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  };
}
