import { expect, test, type Page } from './fixtures/test';
import { mockDatabase, mockTimeline } from './fixtures/api';

async function mockFooter(page: Page) {
  await mockDatabase(page);
  await page.route('https://cdn.fuseplatform.net/**/fuse.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.adPages = 0;
      window.adDestroyed = [];
      window.footerRefreshes = 0;
      let refresh;
      const name = 'publift-widget-scrolling_sticky_footer';
      window.addEventListener('message', event => {
        const container = document.querySelector('.' + name + '-container');
        const frame = container?.querySelector('iframe');
        if (event.data !== 'fixture:close-footer' || event.source !== frame?.contentWindow) return;
        if (window.footerCloseMode === 'widget') container.querySelector('.' + name + '-button').click();
        else if (window.footerCloseMode === 'collapsed') frame.style.height = '0px';
        else frame.parentElement.style.display = 'none';
      });
      window.injectFooter = () => {
        clearInterval(refresh);
        document.querySelector('.' + name + '-container')?.remove();
        const container = document.createElement('div');
        container.className = name + '-container';
        container.style.cssText = 'display:block;position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:970px;height:126px;background:#efefef;z-index:997';
        container.innerHTML = '<div class="' + name + '-container-background" style="background:#efefef;position:absolute;inset:0"></div>' +
          '<div class="' + name + '-button" style="display:flex"><div></div><div></div></div>' +
          '<div class="' + name + '" style="width:970px;height:126px;display:flex;align-items:end;justify-content:center">' +
          '<div id="fuse-injected-scrolling_sticky_footer-1" data-fuse="scrolling_sticky_footer" class="fuse-slot-sticky"><div id="fuse-slot-scrolling_sticky_footer-1" class="fuse-slot"><div style="border:0;margin:auto;text-align:center"></div></div></div></div>';
        container.querySelector('.' + name + '-button').onclick = () => { container.classList.add('closed'); clearInterval(refresh); };
        document.body.append(container);
        // Publift's scrolling widget keeps a scroll handler which reads its wrapper.
        window.addEventListener('scroll', () => {
          const widget = document.querySelector('.' + name);
          const frame = widget.querySelector('iframe');
          const offset = Math.min(scrollY, Math.max(0, Number(frame?.height || 0) - 126));
          widget.querySelector('.fuse-slot-sticky').style.marginTop = -offset + 'px';
        });
        window.refreshFooter = (width, height) => {
          const frame = document.createElement('iframe');
          frame.title = 'Test advertisement';
          frame.width = width;
          frame.height = height;
          frame.style.cssText = 'border:0;vertical-align:bottom';
          frame.setAttribute('sandbox', 'allow-scripts');
          frame.srcdoc = '<body style="margin:0;background:#183342;color:white;display:grid;place-items:center;height:100vh;font:16px system-ui">Advertisement<button aria-label="Close creative" style="position:absolute;left:4px;top:4px;width:24px;height:24px" onclick="parent.postMessage(&quot;fixture:close-footer&quot;,&quot;*&quot;)">×</button></body>';
          container.querySelector('.fuse-slot > div').replaceChildren(frame);
          container.querySelector('.' + name).style.alignItems = height > 126 ? 'baseline' : 'end';
          container.style.display = 'block';
          window.footerRefreshes++;
        };
        window.refreshFooter(innerWidth < 768 ? 320 : 728, innerWidth < 768 ? 50 : 90);
        refresh = setInterval(() => window.refreshFooter(innerWidth < 768 ? 300 : 970, innerWidth < 768 ? 100 : 250), 30000);
      };
      window.fusetag = {
        pageInit() { window.adPages++; window.injectFooter(); },
        registerZone(id) { document.getElementById(id).textContent = 'Route advertisement'; },
        destroyZone(id) { window.adDestroyed.push(id); if (id.includes('scrolling_sticky_footer')) clearInterval(refresh); }
      };
    `
  }));
}

test('timeline ads, consent and tours work without checkVisibility on older Safari', async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(Element.prototype, 'checkVisibility'); });
  await page.setViewportSize({ width: 414, height: 736 });
  await mockFooter(page);
  await mockTimeline(page, false);
  await page.goto('/timeline');
  const footer = page.locator('.uma-footer-ad');
  await expect(page.getByRole('button', { name: 'Close footer ad', exact: true })).toBeVisible();
  expect(await page.evaluate(() => typeof Element.prototype.checkVisibility)).toBe('undefined');
  await expect(page.locator('#app-error')).toBeHidden();

  const help = page.getByRole('button', { name: 'Start guided tour', exact: true });
  await help.click();
  await expect(page.locator('.tour')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
  await expect(help).toBeFocused();

  await page.getByRole('button', { name: 'What’s new', exact: true }).click();
  const updates = page.getByRole('dialog', { name: 'What’s new', exact: true });
  await expect(updates).toBeVisible();
  await page.evaluate(() => {
    const container = document.createElement('div');
    container.id = 'qc-cmp2-container';
    container.innerHTML = '<div id="qc-cmp2-ui" style="position:fixed;inset:0">Privacy choices</div>';
    document.body.append(container);
  });
  await expect(updates).toBeHidden();
  const consent = page.locator('#qc-cmp2-container');
  await consent.evaluate(element => element.style.visibility = 'hidden');
  await expect(updates).toBeVisible();
  await consent.evaluate(element => element.style.visibility = 'visible');
  await expect(updates).toBeHidden();
  await consent.evaluate(element => element.style.display = 'none');
  await expect(updates).toBeVisible();
  await consent.evaluate(element => element.remove());
  await updates.getByRole('button', { name: 'Got it', exact: true }).click();

  await footer.locator('.fuse-slot').evaluate(element => element.style.visibility = 'hidden');
  await expect(footer).toBeHidden();
  expect(await page.evaluate(() => (window as any).adDestroyed)).toContain('fuse-injected-scrolling_sticky_footer-1');
  await expect(page.locator('#app-error')).toBeHidden();
});

test('database scroll shortcut stays above the footer ad as it resizes and closes', async ({ page }) => {
  await mockFooter(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/database');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.locator('[data-filter-group="inheritance"] .group-title').click();
  const shortcut = page.locator('.floating-scroll-btn');
  await expect(shortcut).toBeInViewport();
  for (const height of [50, 100, 250]) {
    await page.evaluate(height => (window as any).refreshFooter(320, height), height);
    await expect(shortcut).toHaveCSS('bottom', `${16 + Math.min(height, 126)}px`);
    await shortcut.click({ trial: true });
  }
  await page.getByRole('button', { name: 'Close footer ad', exact: true }).click();
  await expect(shortcut).toHaveCSS('bottom', '16px');
});

test('footer follows creative refreshes, survives navigation, and stays closed until a fresh load', async ({ page, isMobile, browserName }) => {
  await mockFooter(page);
  await page.clock.install();
  await page.goto('/database');
  const footer = page.locator('.uma-footer-ad');
  const close = page.getByRole('button', { name: 'Close footer ad', exact: true });
  const frame = footer.locator('iframe');
  const checkGeometry = async (width: number, height: number, offset = 0) => {
    await expect(frame).toHaveAttribute('width', String(width));
    await expect(footer).toHaveCSS('height', `${Math.min(height, 126)}px`);
    const ad = (await frame.boundingBox())!;
    const wrapper = (await footer.boundingBox())!;
    const button = (await close.boundingBox())!;
    expect(ad.width).toBe(width);
    expect(ad.height).toBe(height);
    expect(wrapper.width).toBe(width);
    expect(wrapper.height).toBe(Math.min(height, 126));
    expect(wrapper.y + wrapper.height).toBeCloseTo(page.viewportSize()!.height, 0);
    expect(ad.y).toBeCloseTo(wrapper.y - offset, 0);
    expect(ad.x + ad.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
    const inset = isMobile ? 2 : 4;
    expect(button.width).toBe(isMobile ? 28 : 32);
    expect(button.height).toBe(isMobile ? 28 : 32);
    expect(button.x + button.width).toBeCloseTo(ad.x + ad.width - inset, 0);
    expect(button.y).toBeCloseTo(wrapper.y + inset, 0);
    await close.click({ trial: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await expect(close).toBeVisible();
  await checkGeometry(isMobile ? 320 : 728, isMobile ? 50 : 90);
  // A refresh may remove the old iframe before the next creative arrives.
  await frame.evaluate(element => element.remove());
  await expect(close).toBeHidden();
  await page.clock.fastForward(1000);
  await page.evaluate(() => (window as any).refreshFooter(innerWidth < 768 ? 320 : 728, innerWidth < 768 ? 50 : 90));
  await checkGeometry(isMobile ? 320 : 728, isMobile ? 50 : 90);
  await expect(footer.locator('[class$="-container-background"]')).toBeHidden();
  await expect(footer.locator('[class$="-button"]')).toBeHidden();
  await footer.evaluate(element => element.setAttribute('data-original-instance', 'true'));
  // Use the real client-side router so a document reload cannot accidentally pass.
  await page.locator('.veterans-action').click();
  await expect(page).toHaveURL(/\/veterans/);
  await expect(footer).toHaveAttribute('data-original-instance', 'true');
  expect(await page.evaluate(() => (window as any).adPages)).toBe(1);
  await page.clock.fastForward(30_000);
  await checkGeometry(isMobile ? 300 : 970, isMobile ? 100 : 250);
  // A tall creative scrolls inside the fixed publisher window, with the X stationary.
  await page.evaluate(() => {
    document.body.style.minHeight = '300vh';
    (window as any).refreshFooter(innerWidth < 768 ? 320 : 970, 250);
    window.scrollTo(0, 70);
  });
  await expect(footer.locator('.fuse-slot-sticky')).toHaveCSS('margin-top', '-70px');
  await checkGeometry(isMobile ? 320 : 970, 250, 70);
  // Content above the window is clipped instead of obscuring the page.
  expect(await footer.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y - 1));
  })).toBe(false);
  // A refresh to a short banner must still fit even if the provider retains its scroll offset.
  await page.evaluate(() => (window as any).refreshFooter(innerWidth < 768 ? 320 : 728, 90));
  await checkGeometry(isMobile ? 320 : 728, 90);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(footer.locator('.fuse-slot-sticky')).toHaveCSS('margin-top', '0px');
  await page.evaluate(() => (window as any).refreshFooter(innerWidth < 768 ? 320 : 728, 90));
  await checkGeometry(isMobile ? 320 : 728, 90);
  const background = await close.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  expect(await close.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(background);
  expect(await close.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(await footer.evaluate(element => getComputedStyle(element).backgroundColor));
  await page.screenshot({ path: test.info().outputPath('footer-ad.png') });
  // A native button is operable from the keyboard as well as touch/pointer.
  await close.focus();
  await close.press('Enter');
  await expect(footer).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  expect(await page.evaluate(() => (window as any).adDestroyed)).toContain('fuse-injected-scrolling_sticky_footer-1');
  const refreshes = await page.evaluate(() => (window as any).footerRefreshes);
  await page.goBack();
  await expect(page).toHaveURL(/\/database/);
  await expect(page.locator('[data-ad-kind]:visible').first()).toContainText('Route advertisement');
  await page.clock.fastForward(30_000);
  expect(await page.evaluate(() => (window as any).footerRefreshes)).toBe(refreshes);
  // Late publisher injection must also stay dismissed for this document.
  await page.evaluate(() => (window as any).injectFooter());
  await expect(close).toBeHidden();
  await expect(page.locator('.publift-widget-scrolling_sticky_footer-container')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await page.reload();
  await expect(close).toBeVisible();
  expect(await page.evaluate(() => (window as any).adPages)).toBe(1);
  await mockTimeline(page, false);
  await page.goto('/timeline');
  await expect(close).toBeVisible();
  if (isMobile) {
    if (browserName === 'chromium') {
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 24 } });
    }
    const toolbar = page.getByRole('navigation', { name: 'Timeline actions' });
    await page.getByRole('button', { name: 'Search & filters', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    for (const width of [390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => scrollTo(0, 200));
      await expect(toolbar).toBeVisible();
      await expect.poll(async () => {
        const bar = (await toolbar.boundingBox())!;
        return Math.abs(bar.y + bar.height - page.viewportSize()!.height);
      }).toBeLessThan(1);
      await expect(toolbar).toHaveCSS('height', browserName === 'chromium' ? '82px' : '58px');
      await expect.poll(async () => {
        const ad = (await footer.boundingBox())!, bar = (await toolbar.boundingBox())!;
        return Math.abs(ad.y + ad.height - bar.y);
      }).toBeLessThan(1);
      await page.screenshot({ path: test.info().outputPath(`timeline-footer-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Close filters', exact: true }).click();
    await expect(toolbar).toBeVisible();
    await close.click({ trial: true });
    await page.screenshot({ path: test.info().outputPath('timeline-footer-closed-filters.png') });
  } else {
    const board = page.locator('.timeline-board.desktop');
    await expect(board).toBeVisible();
    await page.clock.runFor(200);
    await board.evaluate(node => node.scrollLeft = 0);
    await page.clock.runFor(64);
    await page.evaluate(() => (window as any).refreshFooter(970, 250));
    await board.evaluate(node => node.scrollLeft += 1);
    await page.clock.runFor(32);
    const before = await footer.locator('.fuse-slot-sticky').evaluate(node => parseFloat(getComputedStyle(node).marginTop));
    await board.evaluate(node => node.scrollLeft += 500);
    await expect.poll(async () => {
      await page.clock.runFor(32);
      return footer.locator('.fuse-slot-sticky').evaluate(node => parseFloat(getComputedStyle(node).marginTop));
    }).toBeLessThan(before);
    const after = await footer.locator('.fuse-slot-sticky').evaluate(node => parseFloat(getComputedStyle(node).marginTop));
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(-124);
    await expect(footer).toHaveCSS('height', '126px');
    await expect(close).toBeVisible();
  }
});

for (const mode of ['widget', 'hidden', 'collapsed']) {
  test(`publisher close (${mode}) dismisses the whole footer for this document`, async ({ page }) => {
    await mockFooter(page);
    await page.clock.install();
    await page.goto('/database');
    const footer = page.locator('.uma-footer-ad');
    await expect(page.getByRole('button', { name: 'Close footer ad', exact: true })).toBeVisible();
    await page.evaluate(mode => { (window as any).footerCloseMode = mode; }, mode);
    await footer.frameLocator('iframe').getByRole('button', { name: 'Close creative' }).click();
    await expect(footer).toBeHidden();
    expect(await page.evaluate(() => (window as any).adDestroyed)).toContain('fuse-injected-scrolling_sticky_footer-1');
    const refreshes = await page.evaluate(() => (window as any).footerRefreshes);
    await page.locator('.veterans-action').click();
    await expect(page).toHaveURL(/\/veterans/);
    await page.clock.fastForward(30_000);
    expect(await page.evaluate(() => (window as any).footerRefreshes)).toBe(refreshes);
    await expect(footer).toBeHidden();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Close footer ad', exact: true })).toBeVisible();
  });
}
