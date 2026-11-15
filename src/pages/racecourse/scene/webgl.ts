/** Whether this browser can create the WebGL2 context the racecourse scene needs. */
export function hasWebGL2(
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')
): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const context = createCanvas().getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
