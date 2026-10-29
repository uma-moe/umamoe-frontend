import { expect, test } from './fixtures/test';
import { cardTypes, mockTimelineCards } from './fixtures/timeline-cards';
import { loadVisibleTimelineEvents } from './fixtures/timeline-details';

test('Timeline cards use readable typography, fluid media, event colors and unclipped competitive previews in both themes', async ({
  page,
  isMobile
}) => {
  await mockTimelineCards(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['dark', 'light']) {
    await page.goto('/timeline');
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('#timeline-event-detail-banner')).toBeVisible();
    if (!isMobile) await loadVisibleTimelineEvents(page);
    const accents = [
      theme === 'dark' ? '100, 181, 246' : '37, 99, 235',
      '186, 104, 200',
      '255, 183, 77',
      '255, 183, 77',
      '186, 104, 200',
      '233, 30, 99',
      '77, 182, 172',
      '77, 182, 172',
      '149, 117, 205',
      theme === 'dark' ? '100, 181, 246' : '37, 99, 235',
      '77, 208, 225',
      '229, 115, 115',
      '255, 183, 77',
      '129, 199, 132'
    ];

    for (const [index, type] of cardTypes.entries()) {
      const card = page.locator(`[data-event-id="card-${type}"]`);
      await expect(card).toBeAttached();
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('.metadata')).toHaveCSS('color', `rgb(${accents[index]})`);
      await expect(card.locator('.metadata')).toHaveCSS('font-size', isMobile ? '9px' : '10.5px');
      await expect(card.locator('.metadata svg')).toHaveCount(1);
      await expect(card.locator('h3')).toHaveCSS('font-size', '14px');
      await expect(card.locator('h3')).toHaveCSS('line-height', '14px');
      await expect(card.locator('h3')).toHaveCSS('-webkit-line-clamp', '2');
      await expect(card.locator('.schedule time')).toHaveCSS('font-size', '11px');
      const media = (await card.locator('.event-media').boundingBox())!;
      expect(media.width / media.height).toBeCloseTo(512 / 125, 1);
      expect(await card.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    }

    const banner = page.locator('[data-event-id="detail-banner"]');
    await expect(banner.locator('.metadata-item').first()).toHaveText('Guaranteed');
    await expect(banner.locator('.metadata-item').first()).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgb(55, 65, 81)'
    );
    await expect(banner.locator('.rerun')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(255, 183, 77)' : 'rgb(180, 83, 9)'
    );
    await expect(banner.locator('.predicted')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgb(75, 85, 99)'
    );
    await expect(banner.locator('.reward-item.free-pulls')).toContainText('10×');
    await expect(banner.locator('.context')).toHaveCount(0);
    const cm = page.locator('[data-event-id="detail-cm"]');
    await expect(cm.locator('h3')).toHaveText('Champions Meeting: Mile Champions Meeting');
    await expect(cm.locator('.race-lines span')).toHaveText([
      'Tokyo · Turf',
      '1600m · Mile · Counterclockwise',
      'Firm · Spring · Sunny'
    ]);
    await expect(cm.locator('.rewards')).toContainText('Finals');
    await expect(cm.locator('.rewards')).toContainText('500–2,500');
    for (const id of [
      'detail-cm',
      'cm-media',
      'detail-legend',
      'legend-media',
      'legend-no-pickups'
    ]) {
      const legend = page.locator(`[data-event-id="${id}"]`);
      if (id.includes('legend'))
        await expect(legend.locator('.rewards')).toContainText('All clears');
      const geometry = await legend.evaluate((node) => {
        const card = node.getBoundingClientRect(),
          reward = node.querySelector('.rewards')!.getBoundingClientRect();

        return { rewardTop: reward.top - card.top, rewardBottom: reward.bottom - card.bottom };
      });

      expect(geometry.rewardTop).toBeGreaterThan(0);
      expect(geometry.rewardBottom).toBeLessThanOrEqual(0);
    }

    const missingBanner = page.locator('[data-event-id="broken-media"]');
    await missingBanner.scrollIntoViewIfNeeded();
    await expect(missingBanner.getByRole('img', { name: 'Artwork unavailable' })).toBeVisible();
    await expect(missingBanner.locator('.event-media img')).toHaveCount(0);
    const sourceBanner = page.locator('[data-event-id="news-event-campaign-994"]');
    await sourceBanner.scrollIntoViewIfNeeded();
    await expect(sourceBanner.locator('.event-media img')).toHaveAttribute(
      'src',
      'https://example.test/source-banner.webp'
    );
    await expect
      .poll(() =>
        sourceBanner
          .locator('.event-media img')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
      )
      .toBe(true);
    await sourceBanner
      .getByRole('button', { name: 'Open details for Umayuru Celebration' })
      .click();

    const details = page.getByRole('dialog', { name: 'Umayuru Celebration', exact: true });
    await expect
      .poll(() =>
        details
          .locator('.banner')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
      )
      .toBe(true);
    await details.getByRole('button', { name: 'Close dialog' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
});

test('Timeline card keyboard actions stay independent, retain focus and use the source footer-hiding behavior', async ({
  page,
  isMobile
}) => {
  await mockTimelineCards(page);
  await page.goto('/timeline');
  const banner = page.locator('[data-event-id="detail-banner"]');
  const plan = banner.getByRole('button', {
    name: 'Add Mejiro McQueen + 1 more to Carat Planner',
    exact: true
  });

  await plan.focus();
  await plan.press('Enter');
  await expect(banner.locator('.plan')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (isMobile)
    expect((await banner.locator('.plan').boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expect(banner.locator('.plan')).toHaveCSS('color', 'rgb(229, 115, 115)');
  const open = banner.getByRole('button', {
    name: 'Open details for Mejiro McQueen + 1 more',
    exact: true
  });

  await open.focus();
  await expect(banner.locator('.plan')).toHaveCSS('color', 'rgb(129, 199, 132)');
  await open.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await page.reload();
  await expect(banner.locator('.plan')).toHaveAttribute('aria-pressed', 'true');
  await banner.locator('.plan').focus();
  await banner.locator('.plan').press('Enter');
  await expect(banner.locator('.plan')).toHaveAttribute('aria-pressed', 'false');
  if (isMobile) {
    const toolbar = page.locator('.mobile-bottom-toolbar');
    await page.locator('.site-footer').scrollIntoViewIfNeeded();
    await expect(toolbar).toBeHidden();
    await expect(toolbar).toHaveAttribute('inert');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole('button', { name: 'Search & filters', exact: true }).click();
    await expect(page.locator('.mobile-filter-sheet')).toBeVisible();
  }
});
