import { expect, it } from 'vitest';
import { contentUrl, sanitizeContentHtml } from './content-html';

it('preserves resource article structure without allowing executable content or URLs', () => {
  const clean = sanitizeContentHtml(
    '<h2>Race rules</h2><p>Tokyo <strong>Turf</strong></p><a href="https://example.com/news" onclick="alert(1)">Source</a><a href="java&#10;script:alert(1)">Unsafe</a><img src="/logo.webp" onerror="alert(1)"><svg><a href="javascript:alert(1)">x</a></svg><iframe srcdoc="bad"></iframe><script>alert(1)</script><div style="position:fixed">Info</div>'
  );

  const doc = new DOMParser().parseFromString(clean, 'text/html');
  expect(doc.querySelector('h2')?.textContent).toBe('Race rules');
  expect(doc.querySelector('strong')?.textContent).toBe('Turf');
  expect(doc.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(doc.querySelectorAll('a')[1]?.hasAttribute('href')).toBe(false);
  expect(doc.querySelectorAll('script,svg,iframe,[onclick],[onerror],[style]')).toHaveLength(0);
  expect(doc.querySelector('img')?.getAttribute('src')).toBe('/logo.webp');
  expect(contentUrl('data:text/html,test')).toBeUndefined();
  expect(contentUrl('javascript:alert(1)')).toBeUndefined();
});
