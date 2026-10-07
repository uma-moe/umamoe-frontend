import { expect, test } from '@playwright/test';
import pages from '../../src/config/seo-pages.json' with { type: 'json' };
import { mockAdvertising, mockAffinity, mockDatabase, mockResources } from './fixtures/api';

const expectedRobots = process.env.SEO_BETA_CHECK === '1' ? /^noindex/ : /^index/;

test('agents receive typed catalogs, source links, and honest missing endpoints', async ({ request }) => {
  const homepage = await request.get('/');
  expect(homepage.headers().link).toContain('rel="api-catalog"');
  expect(homepage.headers()['content-signal']).toBe('search=yes, ai-input=yes, ai-train=no');
  const catalog = await request.get('/.well-known/api-catalog');
  expect(catalog.status()).toBe(200);
  expect(catalog.headers()['content-type']).toContain('application/linkset+json');
  expect((await catalog.json()).linkset[1]['service-desc'][0].href).toBe('https://uma.moe/api/docs/openapi.yaml');
  expect((await request.head('/.well-known/api-catalog')).headers().link).toContain('rel="api-catalog"');
  const aiCatalog = await request.get('/.well-known/ai-catalog.json');
  expect(aiCatalog.headers()['content-type']).toContain('application/json');
  expect(aiCatalog.headers()['access-control-allow-origin']).toBe('*');
  expect((await aiCatalog.json()).entries.some((entry: { url: string }) => entry.url === 'https://uma.moe/database')).toBe(true);
  const index = await request.get('/.well-known/agent-skills/index.json');
  const { skills } = await index.json();
  const skill = await request.get(new URL(skills[0].url).pathname);
  expect(skill.headers()['content-type']).toContain('text/markdown');
  expect(await skill.text()).toContain('https://uma.moe/database');
  const auth = await request.get('/auth.md');
  expect(auth.headers()['content-type']).toContain('text/markdown');
  expect(await auth.text()).toContain('X-API-Key');
  for (const path of ['/openid-configuration', '/oauth-authorization-server', '/oauth-protected-resource', '/mcp/server-card.json', '/not-a-real-catalog']) {
    expect((await request.get(`/.well-known${path}`)).status(), path).toBe(404);
  }
});

for (const contextOwner of ['document', 'navigator'] as const) {
  test(`browser agent tools return canonical sources and navigate safely via ${contextOwner}`, async ({ page, context }) => {
    await mockAdvertising(context);
    await mockResources(context);
    await context.addInitScript(owner => {
      localStorage.setItem('page-introduction-audience-v1', 'existing');
      const tools = new Map();
      Object.defineProperty(window, '__agentTools', { value: tools });
      Object.defineProperty(owner === 'document' ? document : navigator, 'modelContext', { value: {
        registerTool: async (tool: { name: string }, options: { signal: AbortSignal }) => {
          tools.set(tool.name, tool);
          options.signal.addEventListener('abort', () => tools.delete(tool.name), { once: true });
        }
      }, configurable: true });
    }, contextOwner);
    await page.goto('/');
    await expect(page.locator('[data-app-shell]')).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __agentTools: Map<string, unknown> }).__agentTools.size === 2);
    const result = await page.evaluate(async () => {
      const tools = (window as unknown as { __agentTools: Map<string, { execute: (input: unknown, options: { signal: AbortSignal }) => Promise<{ sources?: { url: string }[]; url?: string }> }> }).__agentTools;
      const controller = new AbortController();
      const sources = await tools.get('get_umamoe_tools')!.execute({}, { signal: controller.signal });
      let invalidRejected = false;
      try { await tools.get('open_umamoe_tool')!.execute({ tool: '__proto__' }, { signal: controller.signal }); } catch { invalidRejected = true; }
      controller.abort();
      let abortedRejected = false;
      try { await tools.get('open_umamoe_tool')!.execute({ tool: 'global-schedule' }, { signal: controller.signal }); } catch { abortedRejected = true; }
      return { sources: sources.sources, invalidRejected, abortedRejected, pathname: location.pathname };
    });
    expect(result.sources?.map(source => source.url)).toEqual(['https://uma.moe/database', 'https://uma.moe/tools/lineage-planner', 'https://uma.moe/timeline']);
    expect(result.invalidRejected && result.abortedRejected).toBe(true);
    expect(result.pathname).toBe('/');
    const opened = await page.evaluate(async () => {
      const tools = (window as unknown as { __agentTools: Map<string, { execute: (input: unknown, options: { signal: AbortSignal }) => Promise<{ url: string }> }> }).__agentTools;
      return tools.get('open_umamoe_tool')!.execute({ tool: 'global-schedule' }, { signal: new AbortController().signal });
    });
    expect(opened.url).toBe('https://uma.moe/timeline');
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(page).toHaveTitle(pages['/timeline'].title);
    await expect(page.locator('#app-error')).toHaveCount(0);
  });
}

test.describe('static crawler content', () => {
  test.use({ javaScriptEnabled: false });
  test('every indexable URL serves its own HTML without JavaScript', async ({ page }) => {
    for (const [path, metadata] of Object.entries(pages)) {
      if ('index' in metadata && metadata.index === false) continue;
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page).toHaveTitle(metadata.title);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', expectedRobots);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', metadata.description);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://uma.moe${path}`);
      await expect(page.locator('#seo-content h1')).toBeVisible();
      await expect(page.locator('#seo-content')).toContainText(metadata.description);
      await expect(page.locator('#seo-content nav a[href="/database"]')).toBeVisible();
      await expect(page.locator('#app-error')).toHaveCount(0);
    }
  });
});

test('friend-search content and metadata survive app startup and navigation', async ({ page, context }) => {
  await mockAdvertising(context);
  await mockResources(context);
  await mockAffinity(page);
  await mockDatabase(page);
  await context.addInitScript(() => {
    localStorage.setItem('page-introduction-audience-v1', 'existing');
    localStorage.setItem('lastSeenUpdateVersion', '17');
  });
  await page.goto('/');
  await expect(page.locator('[data-app-shell]')).toBeVisible();
  await expect(page.locator('#seo-content')).toHaveCount(0);
  await expect(page).toHaveTitle(pages['/'].title);
  await page.getByRole('link', { name: 'Search the Uma friend database', exact: true }).click();
  await expect(page).toHaveURL(/\/database$/);
  await expect(page.getByRole('heading', { name: 'How to find an Uma friend', exact: true })).toBeVisible();
  await expect(page).toHaveTitle(pages['/database'].title);
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', pages['/database'].description);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', pages['/database'].title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://uma.moe/database');
  await expect(page.locator('#app-error')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('friend-database.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('lazy public pages keep one consistent set of metadata', async ({ page, context }) => {
  await mockAdvertising(context);
  await mockResources(context);
  await context.addInitScript(() => {
    localStorage.setItem('page-introduction-audience-v1', 'existing');
    localStorage.setItem('lastSeenUpdateVersion', '17');
  });
  for (const path of ['/tools', '/privacy-policy', '/circles', '/tierlist', '/timeline'] as const) {
    await page.goto(path);
    await expect(page.locator('[data-app-shell]')).toBeVisible();
    await expect(page.locator('.pending-content')).toHaveCount(0);
    await expect(page).toHaveTitle(pages[path].title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', expectedRobots);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', pages[path].description);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://uma.moe${path}`);
    await expect(page.locator('#app-error')).toHaveCount(0);
  }
});

test('schedule guidance and metadata stay available after loading the timeline', async ({ page, context }) => {
  await mockAdvertising(context);
  await mockResources(context);
  await context.addInitScript(() => {
    localStorage.setItem('page-introduction-audience-v1', 'existing');
    localStorage.setItem('lastSeenUpdateVersion', '18');
  });
  await page.goto('/timeline');
  await expect(page.getByRole('heading', { name: 'Global event schedule', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Plan carats for your next banner', exact: true })).toHaveAttribute('href', '/timeline?tab=carat-planner');
  await page.getByRole('link', { name: 'Carat Planner', exact: true }).first().click();
  await expect(page).toHaveTitle(pages['/timeline'].title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://uma.moe/timeline');
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  await expect(page.locator('#app-error')).toHaveCount(0);
});
