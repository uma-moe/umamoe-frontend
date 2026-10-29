import { expect, it } from 'vitest';
import { renderResearchMarkdown, researchBlocks } from './research-markdown';

it('preserves math, attachments and disclosures while removing unsafe authored HTML', () => {
  const html = renderResearchMarkdown(
    'Math $x^2$\n\n![Replay](attachments/replay.png)\n\n[CM](/simdata)\n\n<script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)">'
  );

  expect(html).toContain('class="katex"');
  expect(html).toContain('/hakuraku/notes/attachments/replay.png');
  expect(html).toContain('/competitive/cm-data');
  expect(html).not.toMatch(/<script|onerror|javascript:/);
  const blocks = researchBlocks('Intro\n\n:::details Calculation\n\n$x^2$\n\n:::\n\nAfter');
  expect(blocks).toHaveLength(3);
  expect(blocks[1]?.title).toBe('Calculation');
  expect(blocks[1]?.html).toContain('class="katex"');
});

it('opens legacy tool links in uma.moe while keeping hosted replay evidence on Hakuraku', () => {
  const html = renderResearchMarkdown(
    '[Events](/hakuraku/#/racedata)\n\n[Veterans](/hakuraku/#/veterans)\n\n[Evidence](https://hakuraku.moe/racedata?kv=example)'
  );

  expect(html).toContain('href="/competitive/race-analysis"');
  expect(html).toContain('href="/veterans"');
  expect(html).toContain('href="https://hakuraku.moe/racedata?kv=example"');
});

it('opens Hakuraku master data query links in uma.moe with their query intact', () => {
  const query = '?q=SELECT+%22index%22+FROM+%22text_data%22+WHERE+category+%3D+111';

  const html = renderResearchMarkdown(
    `[Old site](https://ayaliz.github.io/hakuraku//#/masterdata${query})\n\n[Bare](/masterdata)`
  );

  expect(html).toContain(`href="/tools/master-data${query}"`);
  expect(html).toContain('href="/tools/master-data"');
});
