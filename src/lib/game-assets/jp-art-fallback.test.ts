import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtimeConfig } from '@/services/runtime-config';
import { fallBackToJpArt } from './jp-art-fallback';

const globalPortrait = `${runtimeConfig.assetOrigin}/en/art/umas/105401/portrait.webp`;
const jpPortrait = `${runtimeConfig.assetOrigin}/jp/art/umas/105401/portrait.webp`;

/** An image on the page with its own error handler, as components render them. */
function pageImage(src: string) {
  const image = document.createElement('img');
  const showPlaceholder = vi.fn();
  image.src = src;
  image.addEventListener('error', showPlaceholder);
  document.body.append(image);

  return { image, showPlaceholder };
}

function failToLoad(image: HTMLImageElement): void {
  image.dispatchEvent(new Event('error'));
}

describe('JP art fallback', () => {
  let stopFallingBack: () => void;

  beforeEach(() => {
    stopFallingBack = fallBackToJpArt();
  });

  afterEach(() => {
    stopFallingBack();
    document.body.replaceChildren();
  });

  it('loads a picture Global lacks from the JP tree instead of showing the placeholder', () => {
    const { image, showPlaceholder } = pageImage(globalPortrait);

    failToLoad(image);

    expect(image.getAttribute('src')).toBe(jpPortrait);
    expect(showPlaceholder).not.toHaveBeenCalled();
  });

  it('leaves a picture neither tree has to the image itself', () => {
    const { image, showPlaceholder } = pageImage(globalPortrait);

    failToLoad(image);
    failToLoad(image);

    expect(image.getAttribute('src')).toBe(jpPortrait);
    expect(showPlaceholder).toHaveBeenCalledOnce();
  });

  it('does not touch images from anywhere else', () => {
    const avatar = 'https://example.com/avatar.webp';
    const { image, showPlaceholder } = pageImage(avatar);

    failToLoad(image);

    expect(image.getAttribute('src')).toBe(avatar);
    expect(showPlaceholder).toHaveBeenCalledOnce();
  });

  it('stops once it is turned off', () => {
    const { image, showPlaceholder } = pageImage(globalPortrait);
    stopFallingBack();

    failToLoad(image);

    expect(image.getAttribute('src')).toBe(globalPortrait);
    expect(showPlaceholder).toHaveBeenCalledOnce();
  });
});
