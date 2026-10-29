/** Resource descriptions are HTML, not trusted application markup. */
export function contentUrl(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed, location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return /^(?:https?:)?\/\//i.test(trimmed) ? url.href : '/' + trimmed.replace(/^\/+/, '');
  } catch {
    return undefined;
  }
}

export function sanitizeContentHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(
    'a p div section span strong b em i u s h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr th td blockquote pre code img br hr figure figcaption sup sub'.split(
      ' '
    )
  );

  document
    .querySelectorAll('script,style,iframe,object,embed,svg,math,template,form,base,link,meta')
    .forEach((element) => element.remove());
  for (const element of document.body.querySelectorAll('*')) {
    const tag = element.localName;
    if (!allowed.has(tag)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    const url = contentUrl(element.getAttribute(tag === 'a' ? 'href' : 'src'));
    const alt = element.getAttribute('alt');
    const title = element.getAttribute('title');
    const span = element.getAttribute('colspan');
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (title) element.setAttribute('title', title);
    if (tag === 'a' && url) {
      element.setAttribute('href', url);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }

    if (tag === 'img') {
      if (!url) {
        element.remove();
        continue;
      }

      element.setAttribute('src', url);
      element.setAttribute('alt', alt ?? '');
      element.setAttribute('loading', 'lazy');
      element.setAttribute('decoding', 'async');
    }

    if (['th', 'td'].includes(tag) && span && /^[1-9]\d?$/.test(span))
      element.setAttribute('colspan', span);
  }

  return document.body.innerHTML;
}
