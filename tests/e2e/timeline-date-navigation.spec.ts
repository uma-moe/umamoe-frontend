import { test, expect } from './fixtures/test';
import { mockTimeline } from './fixtures/api';

test('date navigation reaches distant and nearby releases without changing filters', async ({ page, isMobile }) => {
  await mockTimeline(page);
  const events = Array.from({ length: 200 }, (_, index) => ({
    id: `date-${index}`, title: `Release ${index}`, type: 'story_event', is_confirmed: true,
    global_release_date: new Date(Date.UTC(2025, 5, 26 + index * 7, 22)).toISOString()
  }));
  events.push({ id: 'previous-day', title: 'Previous day release', type: 'story_event', is_confirmed: true, global_release_date: '2028-03-01T22:00:00Z' });
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  await page.goto('/timeline');
  const dateButton = page.getByRole('button', { name: 'Go to date', exact: true });
  await expect(dateButton).toBeEnabled();
  const board = page.locator('.timeline-board');
  for (const view of isMobile ? ['mobile'] : ['horizontal', 'vertical']) {
    if (view === 'vertical') await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
    for (const date of ['2028-03-02', '2025-08-22']) {
      await dateButton.click();
      const dialog = page.getByRole('dialog', { name: 'Go to date', exact: true });
      const input = dialog.getByLabel('Date', { exact: true });
      await input.fill('');
      await expect(dialog.getByRole('button', { name: 'Go', exact: true })).toBeDisabled();
      await input.fill(date);
      await dialog.getByRole('button', { name: 'Go', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const key = date === '2025-08-22' ? '2025-08-21' : date;
      await page.evaluate(async () => { for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame); });
      await expect(board.locator(`[data-lane-key="${key}"]`)).toBeInViewport();
      if (!isMobile) await expect(page.locator('.timeline-count')).toHaveText('201 / 201');
    }
  }
  await dateButton.click();
  await page.keyboard.press('Escape');
  await expect(dateButton).toBeFocused();
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 720 });
    expect(await page.locator('.mobile-bottom-toolbar button').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
    await page.getByRole('button', { name: 'Search & filters', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Story events', exact: true })).toBeChecked();
  }
});
