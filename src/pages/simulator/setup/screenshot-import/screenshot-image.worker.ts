import { prepareScreenshotImage, type ScreenshotImageRequest } from './screenshot-image-prep';

self.onmessage = async (event: MessageEvent<ScreenshotImageRequest>) => {
  try {
    const prepared = await prepareScreenshotImage(event.data.file);
    self.postMessage({ prepared }, { transfer: [prepared.pixels.data.buffer] });
  } catch (reason) {
    self.postMessage({ error: reason instanceof Error ? reason.message : String(reason) });
  }
};
