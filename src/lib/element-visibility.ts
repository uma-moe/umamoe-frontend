export function isElementVisible(element: Element, options: Pick<CheckVisibilityOptions, 'visibilityProperty'> = {}): boolean {
  if (typeof element.checkVisibility === 'function') return element.checkVisibility(options);
  // Safari before 17.4: layout boxes also handle fixed elements and display:none ancestors.
  return element.getClientRects().length > 0
    && (!options.visibilityProperty || getComputedStyle(element).visibility === 'visible');
}
