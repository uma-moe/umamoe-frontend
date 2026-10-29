import { expect, test, type Page } from './fixtures/test';
import { mockPlannerControls, plannerControlsPlan } from './fixtures/planner-controls';
import {
  compactPlannerCollectionForCloud,
  expandPlannerCollectionFromCloud
} from '../../src/lib/carat-planner/persistence/planner-cloud-codec';
import type { CaratPlanCollection } from '../../src/lib/carat-planner/carat-planner';

function accountCollection(): CaratPlanCollection {
  const plan = plannerControlsPlan();
  plan.targets = [];
  plan.disabledEventIds = [];
  plan.createdAt = plan.updatedAt = '2026-08-29T12:00:00.000Z';
  return { version: 1, activePlanId: plan.id, plans: [plan] };
}

async function account(page: Page, collection = accountCollection()) {
  await mockPlannerControls(page);
  await page.addInitScript((collection) => {
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('carat-planner-plans-v1', JSON.stringify(collection));
    localStorage.setItem(
      'carat-planner-cloud-meta-v1',
      JSON.stringify({ userId: 'cloud-parity', revision: 7, updatedAt: null })
    );
  }, collection);

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'cloud-parity',
        display_name: 'Planner Tester',
        created_at: '2026-01-01T00:00:00Z'
      }
    })
  );

  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: [] }));
}

const stored = (page: Page): Promise<CaratPlanCollection> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!));

const nameField = (page: Page) => page.getByRole('textbox', { name: 'Plan name', exact: true });
const synced = (page: Page) =>
  page.getByRole('status', { name: 'Saved to your account', exact: true });

async function share(page: Page) {
  await page.getByRole('button', { name: 'More plan actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Share plan', exact: true }).click();
}

test('Planner names remain drafts until blur, normalize once and retain the original persistence keys', async ({
  page
}) => {
  const initial = accountCollection();
  await account(page, initial);
  let remote = compactPlannerCollectionForCloud(initial),
    revision = 7;

  const saves: CaratPlanCollection[] = [];
  await page.route('**/api/carat-planner/state', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      expect(body.base_revision).toBe(revision++);
      remote = body.collection;
      saves.push(expandPlannerCollectionFromCloud(remote)!);
    }

    return route.fulfill({
      json: { revision, collection: remote, updated_at: initial.plans[0]!.updatedAt }
    });
  });

  await page.goto('/timeline?tab=carat-planner');
  await expect(synced(page)).toBeVisible();
  const name = nameField(page),
    before = await stored(page),
    savedCount = saves.length;

  await expect(name).toHaveAttribute('maxlength', '80');
  await expect(name).toHaveAttribute('autocomplete', 'off');
  await name.fill('  My new name  ');
  await expect(page.getByRole('button', { name: 'Selected plan', exact: true })).toHaveText(
    'My new name'
  );

  expect(await stored(page)).toEqual(before);
  expect(saves).toHaveLength(savedCount);
  await name.press('Tab');
  await expect(name).toHaveValue('My new name');
  await expect.poll(() => saves.length).toBe(savedCount + 1);
  await expect(synced(page)).toBeVisible();
  expect((await stored(page)).plans[0]!.name).toBe('My new name');
  await name.fill('');
  expect((await stored(page)).plans[0]!.name).toBe('My new name');
  await name.blur();
  await expect(name).toHaveValue('Untitled plan');
  await expect.poll(() => saves.length).toBe(savedCount + 2);
  expect(saves.at(-1)!.plans[0]!.name).toBe('Untitled plan');
  await name.fill('Plan kept when leaving');
  await page
    .getByRole('navigation', { name: 'Timeline tools' })
    .getByRole('link', { name: 'Timeline', exact: true })
    .click();

  await page
    .getByRole('navigation', { name: 'Timeline tools' })
    .getByRole('link', { name: /^Carat Planner/ })
    .click();

  await expect(name).toHaveValue('Plan kept when leaving');
  expect((await stored(page)).plans[0]!.name).toBe('Plan kept when leaving');
  await expect.poll(() => saves.at(-1)?.plans[0]!.name).toBe('Plan kept when leaving');
});

test('Planner saves and retries across route navigation and syncs Timeline selections through the same account session', async ({
  page
}) => {
  await account(page);
  await page.clock.install();
  const remote = compactPlannerCollectionForCloud(accountCollection());
  let loads = 0,
    writes = 0,
    revision = 7;

  const saves: CaratPlanCollection[] = [];
  let failSave!: () => void;
  const failure = new Promise<void>((resolve) => (failSave = resolve));
  await page.route('**/api/carat-planner/state', async (route) => {
    if (route.request().method() === 'GET') {
      loads++;
      return route.fulfill({ json: { revision, collection: remote, updated_at: null } });
    }

    const body = route.request().postDataJSON();
    expect(body.base_revision).toBe(revision);
    if (++writes === 1) {
      await failure;
      return route.fulfill({ status: 503, json: { error: 'Temporary failure' } });
    }

    saves.push(expandPlannerCollectionFromCloud(body.collection)!);
    return route.fulfill({
      json: { revision: ++revision, collection: body.collection, updated_at: null }
    });
  });

  const navigate = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) {
      await menu.click();
      const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
      const direct = nav.getByRole('link', { name, exact: true });
      if (await direct.isVisible()) await direct.click();
      else {
        await nav
          .getByRole('button', { name: 'Open ' + name + ' subsections', exact: true })
          .click();

        await nav.locator('.subsection-parent').click();
      }
    } else {
      const rail = page.getByRole('navigation', { name: 'Main navigation' });
      const direct = rail.getByRole('link', { name, exact: true });
      if (await direct.isVisible()) await direct.click();
      else {
        await rail.getByRole('button', { name: 'Open ' + name + ' subsections' }).click();
        await rail.locator('.subsection-parent').click();
      }
    }
  };

  await page.goto('/timeline?tab=carat-planner');
  await expect(synced(page)).toBeVisible();
  await nameField(page).fill('Saved after navigation');
  await nameField(page).blur();
  await expect.poll(() => writes).toBe(1);
  await navigate('Tools');
  await expect(page).toHaveURL(/\/tools$/);
  failSave();
  await expect.poll(() => writes, { timeout: 12_000 }).toBeGreaterThan(1);
  await expect.poll(() => saves.at(-1)?.plans[0]!.name).toBe('Saved after navigation');
  await navigate('Timeline');
  await expect(page).toHaveURL(/\/timeline$/);
  await page
    .getByRole('navigation', { name: 'Timeline tools' })
    .getByRole('link', { name: /^Carat Planner/ })
    .click();

  await expect(nameField(page)).toHaveValue('Saved after navigation');
  expect(loads).toBe(1);
  await page
    .getByRole('navigation', { name: 'Timeline tools' })
    .getByRole('link', { name: 'Timeline', exact: true })
    .click();

  await page
    .locator('#timeline-event-first')
    .getByRole('button', { name: /to Carat Planner$/ })
    .click();

  await expect
    .poll(() => saves.at(-1)?.plans[0]!.targets.some((target) => target.eventId === 'first'))
    .toBe(true);
  expect(loads).toBe(1);
});

test('Planner creates reference shares and retries snapshots only for older-server contract errors', async ({
  page
}) => {
  const initial = accountCollection();
  await account(page, initial);
  await page.route('**/api/carat-planner/state', (route) =>
    route.fulfill({
      json: {
        revision: 7,
        collection: compactPlannerCollectionForCloud(initial),
        updated_at: initial.plans[0]!.updatedAt
      }
    })
  );

  let failure = 0;
  const posts: Record<string, unknown>[] = [];
  await page.route('**/api/carat-planner/shares', (route) => {
    const body = route.request().postDataJSON();
    posts.push(body);
    if (failure && !body.plan)
      return route.fulfill({ status: failure, json: { error: 'Reference unavailable' } });
    return route.fulfill({
      json: {
        share_id: 'ABCD1234',
        plan_id: initial.activePlanId,
        plan_name: initial.plans[0]!.name,
        updated_at: initial.plans[0]!.updatedAt,
        ...(body.plan ? { plan: body.plan } : {})
      }
    });
  });

  await page.goto('/timeline?tab=carat-planner');
  await expect(synced(page)).toBeVisible();
  const notice = page.locator('.share-notice'),
    reference = { plan_id: initial.activePlanId, plan_name: initial.plans[0]!.name };

  await share(page);
  await expect(notice).toContainText('It always opens the latest saved version of this plan.');
  expect(posts).toEqual([reference]);
  await expect(notice.getByRole('link', { name: 'Open link' })).toHaveAttribute(
    'href',
    /\?tab=carat-planner&share=ABCD1234$/
  );

  for (const status of [400, 422]) {
    failure = status;
    posts.length = 0;
    await share(page);
    await expect(notice).toContainText('It always opens the latest saved version of this plan.');
    expect(posts).toHaveLength(2);
    expect(posts[0]).toEqual(reference);
    expect(posts[1]).toMatchObject({
      plan: { v: 2, id: initial.activePlanId, name: initial.plans[0]!.name }
    });
  }

  failure = 500;
  posts.length = 0;
  await share(page);
  await expect(notice).toContainText('Self-contained plan link');
  expect(posts).toEqual([reference]);
  await expect(notice.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', /#p=/);
});

test('Planner opens the referenced plan from a compact collection and preserves local data for expired or invalid responses', async ({
  page
}) => {
  await mockPlannerControls(page);
  const published = accountCollection();
  published.plans[0]!.id = 'unrelated';
  published.plans[0]!.name = 'Not shared';
  published.plans.push({
    ...published.plans[0]!,
    id: 'referenced',
    name: 'Referenced plan',
    balances: { ...published.plans[0]!.balances, freeJewels: 22222 }
  });

  published.activePlanId = 'unrelated';
  let failure = 0;
  await page.route('**/api/carat-planner/shared/ABCD1234', (route) =>
    route.fulfill(
      failure
        ? { status: failure, json: { error: 'Expired share' } }
        : {
            json: {
              share_id: 'ABCD1234',
              plan_id: 'referenced',
              plan_name: 'Referenced plan',
              collection: compactPlannerCollectionForCloud(published),
              updated_at: published.plans[1]!.updatedAt
            }
          }
    )
  );

  await page.goto('/timeline?tab=carat-planner&share=ABCD1234', { waitUntil: 'networkidle' });
  await expect(nameField(page)).toHaveValue('Referenced plan (shared)');
  const opened = await stored(page);
  expect(opened.plans).toHaveLength(2);
  expect(opened.plans.find((plan) => plan.id === opened.activePlanId)).toMatchObject({
    id: 'shared-ABCD1234',
    name: 'Referenced plan (shared)',
    balances: { freeJewels: 22222 }
  });

  expect(opened.plans.some((plan) => plan.name === 'Not shared')).toBe(false);
  for (const status of [404, 410]) {
    failure = status;
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.share-notice')).toHaveText(
      'Shared plan was not found or is no longer available.'
    );
    expect(await stored(page)).toEqual(opened);
    await expect(page.locator('.share-notice').getByRole('link')).toHaveCount(0);
  }

  await page.route('**/api/carat-planner/shared/ABCD1234', (route) =>
    route.fulfill({
      json: {
        share_id: 'ABCD1234',
        plan_id: 'referenced',
        plan_name: 'Missing data',
        updated_at: published.plans[0]!.updatedAt
      }
    })
  );

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.share-notice')).toHaveText(
    'Shared plan was not found or is no longer available.'
  );
  expect(await stored(page)).toEqual(opened);
});

test('Planner exposes account conflicts on mobile, discards stale drafts and saves against the new revision', async ({
  page
}) => {
  const initial = accountCollection();
  await account(page, initial);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const revisions: number[] = [];
  let conflictDelivered = false;
  const remote = accountCollection();
  remote.plans[0]!.name = 'Newer account plan';
  remote.plans[0]!.balances.freeJewels = 42000;
  await page.route('**/api/carat-planner/state', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: {
          revision: 7,
          collection: compactPlannerCollectionForCloud(initial),
          updated_at: initial.plans[0]!.updatedAt
        }
      });
    const body = route.request().postDataJSON();
    revisions.push(body.base_revision);
    if (revisions.length === 1) {
      await gate;
      await route.fulfill({
        status: 409,
        json: {
          revision: 12,
          collection: compactPlannerCollectionForCloud(remote),
          updated_at: remote.plans[0]!.updatedAt
        }
      });

      conflictDelivered = true;
      return;
    }

    return route.fulfill({
      json: { revision: 13, collection: body.collection, updated_at: remote.plans[0]!.updatedAt }
    });
  });

  try {
    await page.goto('/timeline?tab=carat-planner');
    await expect(synced(page)).toBeVisible();
    const name = nameField(page);
    await name.fill('Submitted edit');
    await name.blur();
    await expect.poll(() => revisions.length).toBe(1);
    await name.fill('Draft based on stale data');
    release();
    await expect.poll(() => conflictDelivered).toBe(true);
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText(
      'Changes were reverted because your account changed elsewhere. Your local plans are now current.'
    );
    await expect(name).toHaveValue('Newer account plan');
    expect((await stored(page)).plans[0]).toMatchObject({
      name: 'Newer account plan',
      balances: { freeJewels: 42000 }
    });

    if (page.viewportSize()!.width < 600) await page.setViewportSize({ width: 320, height: 844 });
    await alert.scrollIntoViewIfNeeded();
    await expect(alert).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width
    );
    await name.fill('Edit after conflict');
    await name.blur();
    await expect(synced(page)).toBeVisible();
    await expect(alert).toHaveCount(0);
    expect(revisions).toEqual([7, 12]);
    expect((await stored(page)).plans[0]!.name).toBe('Edit after conflict');
  } finally {
    release();
  }
});

test('Planner never writes an unverified revision while a known-account startup request is pending', async ({
  page
}) => {
  const initial = accountCollection();
  await account(page, initial);
  await page.clock.install({ time: new Date('2026-09-01T00:00:00Z') });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let loading = false;
  const writes: unknown[] = [];
  const remote = accountCollection();
  remote.plans[0]!.name = 'Current account plan';
  await page.route('**/api/carat-planner/state', async (route) => {
    if (route.request().method() === 'PUT') {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: 500, json: { error: 'Unexpected save' } });
    }

    loading = true;
    await gate;
    return route.fulfill({
      json: {
        revision: 12,
        collection: compactPlannerCollectionForCloud(remote),
        updated_at: remote.plans[0]!.updatedAt
      }
    });
  });

  try {
    await page.goto('/timeline?tab=carat-planner');
    await expect.poll(() => loading).toBe(true);
    await expect(page.locator('.sync .spinner')).toBeVisible();
    const name = nameField(page);
    await name.fill('Edit over stale cache');
    await name.blur();
    await page.clock.runFor(1000);
    expect(writes).toEqual([]);
    release();
    await expect(name).toHaveValue('Current account plan');
    await expect(page.getByRole('alert')).toHaveText(
      'Changes were reverted because this device copy was out of date. Your account plans are now current.'
    );
    await page.clock.runFor(1000);
    expect(writes).toEqual([]);
    expect((await stored(page)).plans[0]!.name).toBe('Current account plan');
  } finally {
    release();
  }
});
