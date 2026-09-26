import { expect,it } from 'vitest';
import { renderResearchMarkdown,researchBlocks } from './research-markdown';

it('preserves math, attachments and disclosures while removing unsafe authored HTML',()=>{
  const html=renderResearchMarkdown('Math $x^2$\n\n![Replay](attachments/replay.png)\n\n[CM](/simdata)\n\n<script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)">');
  expect(html).toContain('class="katex"');
  expect(html).toContain('/hakuraku/notes/attachments/replay.png');
  expect(html).toContain('/competitive/cm-data');
  expect(html).not.toMatch(/<script|onerror|javascript:/);
  const blocks=researchBlocks('Intro\n\n:::details Calculation\n\n$x^2$\n\n:::\n\nAfter');
  expect(blocks).toHaveLength(3);
  expect(blocks[1]?.title).toBe('Calculation');
  expect(blocks[1]?.html).toContain('class="katex"');
});
