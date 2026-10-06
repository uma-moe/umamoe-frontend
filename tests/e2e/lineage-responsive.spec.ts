import { expect, test } from './fixtures/test';
import { mockAffinity } from './fixtures/api';

test('dense lineage stays compact and editable across layout breakpoints', async ({ page }) => {
  test.setTimeout(120_000);
  await mockAffinity(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('lineage-planner-state-v1')) return;
    const sparks = [
      { factorId: 10, name: 'Speed', type: 0, level: 3 },
      { factorId: 120, name: 'Medium', type: 1, level: 2 },
      { factorId: 99001, name: 'THE MOE AAAA Thanks for My Life', type: 5, level: 1 },
      ...['Shuka Sho', 'J.D. Derby', 'JBC Classic', 'Summer Runner ○', 'Front Runner Straightaways ○',
        'Fighting Spirit', 'Tenno Sho (Spring)', 'Victoria Mile', 'Tenno Sho (Autumn)', 'Japan C.',
        'Tokyo Daishoten', 'Shrewd Step', 'Groundwork', 'On the Way to Our Dreams'].map((name, index) =>
        ({ factorId: 99002 + index, name, type: 3, level: index % 3 + 1 }))
    ];
    const positions = ['target', 'p1', 'p2', 'p1-1', 'p1-2', 'p2-1', 'p2-2', 'p1-1-1', 'p1-1-2', 'p1-2-1', 'p1-2-2', 'p2-1-1', 'p2-1-2', 'p2-2-1', 'p2-2-2'];
    localStorage.setItem('lineage-planner-state-v1', JSON.stringify(positions.map((position, index) => ({
      position, characterId: [100101, 101301, 100601, 106701, 101101][index % 5],
      sparks: sparks.slice(0,[0,17,8,14,17,6,10][index] ?? 0), manualWinSaddleIds: [1, 16, 20]
    }))));
  });
  await page.goto('/tools/lineage-planner');
  const tree = page.locator('.tree-canvas');
  async function revealTree() {
    for (const branch of await tree.locator('.parent-branch').all()) {
      await branch.scrollIntoViewIfNeeded();
      await branch.locator('.grandparents').scrollIntoViewIfNeeded();
      await expect(branch.locator('.gp-branch')).toHaveCount(2);
    }
  }
  await expect(tree).toBeVisible();
  await revealTree();
  await expect(tree.locator('.spark')).toHaveCount(72);
  const ancestors = tree.getByRole('button', { name: 'Great-Grandparents', exact: true });
  await expect(ancestors).toHaveCount(4);
  for (const toggle of await ancestors.all()) { await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); }
  await expect(tree.locator('.greats .node:visible')).toHaveCount(8);
  const failures: string[] = [];
  for (const width of [320, 359, 360, 375, 390, 500, 628, 629, 640, 767, 768, 850, 1024, 1113, 1114, 1152, 1153, 1299, 1300, 1301, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
    await page.locator('.parent-branch').first().scrollIntoViewIfNeeded();
    if ([320, 375, 390, 500, 850, 1301, 1920].includes(width)) await page.screenshot({ path: test.info().outputPath(`dense-lineage-${width}.png`), scale: 'css' });
    if(width === 375) await tree.locator('.parent-branch').first().screenshot({path:test.info().outputPath('iphone-se-lineage.png'),scale:'css'});
    if ([320, 390, 850].includes(width)) await tree.locator('.gp-branch').first().screenshot({ path: test.info().outputPath(`dense-ancestors-${width}.png`), scale: 'css' });
    const issues = await tree.evaluate(element => {
      const issues: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth) issues.push('Page overflows');
      const parents=[...element.querySelectorAll('.parent-branch > .branch-node')].map(node=>node.getBoundingClientRect());
      if(parents.length === 2 && parents[0].x !== parents[1].x) {
        if(Math.abs(parents[0].top-parents[1].top)>1 || Math.abs(parents[0].bottom-parents[1].bottom)>1) issues.push('Parent cards misaligned');
        const headings=[...element.querySelectorAll('.branch-heading > div')].map(node=>node.getBoundingClientRect());
        if(Math.abs(headings[1].right-parents[1].right)>1) issues.push('P2 heading is not at the right edge');
        const grandparents=[...element.querySelectorAll('.gp-branch > .branch-node')].map(node=>node.getBoundingClientRect());
        for(const [left,right] of [[0,2],[1,3]]) if(Math.abs(grandparents[left].top-grandparents[right].top)>1 || Math.abs(grandparents[left].bottom-grandparents[right].bottom)>1) issues.push('Grandparent branches misaligned');
      }
      const grandparentRows=new Map<number,DOMRect[]>();
      for(const gp of element.querySelectorAll('.gp-branch > .branch-node')) {
        const box=gp.getBoundingClientRect(), y=Math.round(box.y);
        const row=grandparentRows.get(y)??[];row.push(box);grandparentRows.set(y,row);
      }
      for(const row of grandparentRows.values()) if(row.some(box=>Math.abs(box.bottom-row[0].bottom)>1)) issues.push('Grandparent cards have uneven bottoms');
      for (const node of element.querySelectorAll('.node')) {
        const box = node.getBoundingClientRect();
        if (node.scrollWidth > node.clientWidth) issues.push(`${node.getAttribute('aria-label')} overflows`);
        const identity=node.querySelector('.node-main')?.getBoundingClientRect(), actions=node.querySelector('.node-actions')?.getBoundingClientRect();
        if(identity && actions && actions.top>=identity.bottom) issues.push('Card actions wrapped below identity');
        const affinity=node.querySelector('.affinity-breakdown')?.getBoundingClientRect(), races=node.querySelector('.race-action')?.getBoundingClientRect();
        if(affinity && races && races.top>=affinity.bottom) issues.push('Race controls wrapped below affinity');
        for(const control of node.querySelectorAll('.race-action button')) if(getComputedStyle(control).borderTopStyle==='none') issues.push('Race control has no button border');
        for (const button of node.querySelectorAll('button')) {
          const rect = button.getBoundingClientRect();
          if (rect.width && (rect.left < box.left || rect.right > box.right)) issues.push('Node action outside card');
        }
      }
      for (const section of element.querySelectorAll('.node, .sparks, .grandparents, .greats')) {
        if (section.clientHeight && section.scrollHeight > section.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(section).overflowY)) issues.push('Nested vertical scroll');
      }
      for (const spark of element.querySelectorAll('.spark')) {
        const button = spark.querySelector('button');
        if (!button) { issues.push('Spark removal is outside chip'); break; }
        const box = spark.getBoundingClientRect(), action = button.getBoundingClientRect();
        const touch=matchMedia('(pointer:coarse)').matches;
        // Shared SparkItem removal buttons are 24px on both mouse and touch devices.
        if (box.height > 26) { issues.push('Spark row too tall'); break; }
        if (action.width < (touch ? 24 : 20) || action.height < (touch ? 24 : 20) || action.right > box.right || action.left < box.left) { issues.push('Spark removal hit area'); break; }
      }
      return issues;
    });
    failures.push(...issues.map(issue => `${width}px: ${issue}`));
  }
  expect(failures).toEqual([]);

  const odds = page.getByRole('region', { name: 'Spark Proc Odds', exact: true });
  for (const width of [320, 390, 768, 850, 1113, 1114, 1300, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Base Odds', 'Per Source', 'Combined', 'Skill Sparks']) {
      await odds.getByRole('tab', { name, exact: true }).click();
      await odds.scrollIntoViewIfNeeded();
      if ([320, 850, 1920].includes(width)) await page.screenshot({ path: test.info().outputPath(`dense-odds-${name.replaceAll(' ', '-')}-${width}.png`), scale: 'css' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name} at ${width}px`).toBe(width);
      const clipped = await odds.locator('.sum-sources').evaluateAll(sources => sources.some(source => source.scrollWidth > source.clientWidth));
      expect(clipped, `All combined sources visible at ${width}px`).toBe(false);
      if (name === 'Skill Sparks' && width <= 390) expect(await odds.locator('.skill-odds-scroll').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  }
  for (const width of [320, 768, 1300]) {
    await page.setViewportSize({ width, height: 900 });
    const sparks = page.getByRole('region', { name: 'Sparks for Grandparent 1', exact: true });
    await sparks.getByRole('button', { name: 'Add Spark', exact: true }).click();
    const input = sparks.getByRole('combobox', { name: 'Add spark to Grandparent 1', exact: true });
    await input.fill('Stamina');
    if (width === 320) await page.screenshot({ path: test.info().outputPath('dense-spark-editor-320.png'), scale: 'css' });
    await page.getByRole('option', { name: 'Stamina', exact: true }).click();
    const remove = sparks.getByRole('button', { name: 'Remove Stamina from Grandparent 1', exact: true });
    await expect(remove).toBeVisible();
    await remove.focus(); await remove.press('Enter');
    await expect(remove).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await page.locator('.gp-branch').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('dense-lineage-light-390.png'), scale: 'css' });
  await page.reload();
  await expect(tree).toBeVisible();
  await revealTree();
  await expect(page.locator('.spark')).toHaveCount(72);
});
