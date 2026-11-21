import { jpArtLink } from './art-links';

/**
 * Stopping the event keeps the image's own error handler from replacing it with a placeholder;
 * that handler still runs when JP has no such file either.
 */
function retryFromJpTree(event: Event): void {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;

  const jpLink = jpArtLink(image.getAttribute('src') ?? '');
  if (jpLink === undefined) return;

  event.stopPropagation();
  image.src = jpLink;
}

/**
 * Shows JP's art wherever Global's tree lacks a file, until the returned function is called.
 * Image errors do not bubble, so one capturing listener sees every image on the page.
 */
export function fallBackToJpArt(): () => void {
  window.addEventListener('error', retryFromJpTree, { capture: true });

  return () => window.removeEventListener('error', retryFromJpTree, { capture: true });
}
