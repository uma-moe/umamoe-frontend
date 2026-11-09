import type { PreparedScreenshot, ScreenshotImageRequest } from './screenshot-image-prep';

/** Prepares one screenshot in a worker of its own, which ends with it. */
export function prepareScreenshot(file: Blob): Promise<PreparedScreenshot> {
  const worker = new Worker(new URL('./screenshot-image.worker.ts', import.meta.url), {
    type: 'module'
  });

  return new Promise<PreparedScreenshot>((resolve, reject) => {
    worker.onmessage = (
      event: MessageEvent<{ prepared: PreparedScreenshot } | { error: string }>
    ) => {
      if ('error' in event.data) reject(new Error(event.data.error));
      else resolve(event.data.prepared);
    };
    worker.onerror = () =>
      reject(new Error('The screenshot couldn’t be prepared in this browser.'));
    worker.postMessage({ file } satisfies ScreenshotImageRequest);
  }).finally(() => worker.terminate());
}
