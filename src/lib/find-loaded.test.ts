import { describe, expect, it } from 'vitest';
import { findTextRanges, highlightResultText } from './find-loaded';

describe('Find text ranges', () => {
  it('matches literal text across inline elements without changing DOM', () => {
    const host = document.createElement('article');
    host.innerHTML = '<p>Uma <strong>Stan</strong> · UMA STAN</p><p>A+B [test]</p>';
    const original = host.innerHTML;
    expect(findTextRanges(host, 'uma stan').map(range => range.toString())).toEqual(['Uma Stan', 'UMA STAN']);
    expect(findTextRanges(host, 'a+b [test]').map(range => range.toString())).toEqual(['A+B [test]']);
    expect(findTextRanges(host, '   ')).toEqual([]);
    expect(host.innerHTML).toBe(original);
  });

  it('maps normalized Unicode back to the original text offsets', () => {
    const host = document.createElement('article');
    host.textContent = 'ﬀe\u0301';
    expect(findTextRanges(host, 'ffé').map(range => range.toString())).toEqual(['ﬀe\u0301']);
    host.textContent += ' Ｕｍａ 👑 Ｓｔａｎ İ';
    expect(findTextRanges(host, 'uma 👑 stan').map(range => range.toString())).toEqual(['Ｕｍａ 👑 Ｓｔａｎ']);
    expect(findTextRanges(host, 'i\u0307').map(range => range.toString())).toEqual(['İ']);
    host.innerHTML = '<b>ﬀ</b>\u0301';
    expect(findTextRanges(host, 'f').map(range => range.toString())).toEqual(['ﬀ\u0301', 'ﬀ\u0301']);
  });

  it('ignores editable fields, scripts, and decorative text', () => {
    const host = document.createElement('article');
    host.innerHTML = '<p>Needle</p><textarea>Needle</textarea><span contenteditable>Needle</span><span aria-hidden="true">Needle</span><script>Needle</script>';
    expect(findTextRanges(host, 'needle').map(range => range.toString())).toEqual(['Needle']);
  });

  it('keeps Find usable when the browser has no Highlight API', () => {
    const host = document.createElement('article'); host.textContent = 'Needle';
    expect(typeof globalThis.Highlight).toBe('undefined');
    const cleanup = highlightResultText(host, 'needle');
    expect(() => cleanup()).not.toThrow();
    expect(host.innerHTML).toBe('Needle');
  });
});
