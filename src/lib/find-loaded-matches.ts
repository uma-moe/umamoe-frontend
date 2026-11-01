import { availableFindSources, type FindSource } from './find-loaded';

export interface FindMatch {
  source: FindSource;
  index: number;
}

const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();

function graphemes(text: string): Iterable<{ segment: string; index: number }> {
  if (typeof Intl.Segmenter === 'function')
    return new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
  // Firefox before 125 and Safari before 14.1 lack Intl.Segmenter; keep combining marks with their base.
  return Array.from(text.matchAll(/\P{M}\p{M}*|\p{M}+/gu), (match) => ({
    segment: match[0],
    index: match.index
  }));
}

export function findLoaded(sources: FindSource[], query: string): FindMatch[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  const matches: FindMatch[] = [];
  for (const source of availableFindSources(sources)) {
    for (let index = 0; index < source.count(); index++) {
      if (normalize(source.text(index)).includes(needle)) matches.push({ source, index });
    }
  }

  return matches;
}

export function findTextRanges(host: HTMLElement, query: string): Range[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  const nodes: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(
        'script, style, textarea, [contenteditable], [aria-hidden="true"]'
      )
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
  });

  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const start = text.length;
    text += node.textContent;
    if (text.length > start) nodes.push({ node: node as Text, start, end: text.length });
  }

  const canonical = text.normalize('NFKC'),
    folded = canonical.toLocaleLowerCase(),
    ranges: Range[] = [];

  if (!folded.includes(needle)) return ranges;
  let starts: number[] | undefined, ends: number[] | undefined;
  // Most labels keep their offsets. Only expanded/combined Unicode needs a map.
  if (canonical !== text || folded.length !== text.length) {
    starts = [];
    ends = [];
    for (const part of graphemes(text)) {
      for (let offset = 0; offset < normalize(part.segment).length; offset++) {
        starts.push(part.index);
        ends.push(part.index + part.segment.length);
      }
    }
  }

  let cursor = 0;
  for (
    let index = folded.indexOf(needle);
    index >= 0;
    index = folded.indexOf(needle, index + needle.length)
  ) {
    const start = starts?.[index] ?? index,
      end = ends?.[index + needle.length - 1] ?? index + needle.length;

    while (nodes[cursor]!.end <= start) cursor++;
    const first = nodes[cursor]!;
    let finish = cursor;
    while (nodes[finish]!.end < end) finish++;
    const last = nodes[finish]!,
      range = new Range();

    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    ranges.push(range);
  }

  return ranges;
}

/** Paint only the selected result; no DOM wrappers, document scans, or scroll work. */
export function highlightResultText(host: HTMLElement, query: string): () => void {
  if (!globalThis.CSS?.highlights || typeof Highlight === 'undefined') return () => {};

  const highlight = new Highlight();
  CSS.highlights.set('loaded-result-find', highlight);
  let frame = 0;
  function paint() {
    frame = 0;
    highlight.clear();
    if (host.isConnected) for (const range of findTextRanges(host, query)) highlight.add(range);
  }

  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(paint);
  });

  observer.observe(host, { childList: true, subtree: true, characterData: true });
  paint();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    highlight.clear();
    CSS.highlights.delete('loaded-result-find');
  };
}
