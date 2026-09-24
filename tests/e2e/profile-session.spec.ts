import { expect, test, type Page } from './fixtures/test';
import { accountId, mockOwnerProfile, mockVeteranProfile, profile } from './fixtures/api';

const otherId = '987654321012';
const visible = { profile_hidden: false, hidden_sections: [] as string[] };
const otherProfile = {
  trainer: { account_id: otherId, name: 'Other Trainer', follower_num: 0, own_follow_num: 0, best_team_class: null, team_class: null, team_evaluation_point: null, rank_score: null, comment: null },
  circle: null, circle_history: [], fan_history: { monthly: [], rolling: null, alltime: null }, inheritance: null, support_card: null, team_stadium: [], veterans: []
};
async function follow(page: Page, path: string) {
  await page.evaluate(path => { const a = document.createElement('a'); a.href = path; document.body.append(a); a.click(); a.remove(); }, path);
  await expect(page).toHaveURL(new URL(path, page.url()).href);
}
async function twoAccounts(page: Page) {
  await mockOwnerProfile(page, []);
  await page.route(`**/api/v4/user/profile/${otherId}`, route => route.fulfill({ json: otherProfile }));
  await page.route(`**/api/v4/user/profile/${otherId}/visibility`, route => route.fulfill({ json: visible }));
  await page.route('**/api/auth/accounts', route => route.fulfill({ json: [accountId, otherId].map(account_id => ({ account_id, verification_status: 'verified' })) }));
}

test('every owner visibility pill reflects its saved state and can be restored without hiding its section', async ({ page, isMobile }) => {
  await mockOwnerProfile(page, []);
  let settings = { ...visible }; const saved: typeof settings[] = [];
  await page.route(`**/api/v4/user/profile/${accountId}/visibility`, route => {
    if (route.request().method() === 'PUT') { settings = route.request().postDataJSON(); saved.push(settings); }
    return route.fulfill({ json: settings });
  });
  await page.goto(`/profile/${accountId}`);
  for (const [heading, section] of [['Fan activity','fan_history'],['Rolling Gains','rolling_alltime'],['Current Circle','circle'],['Circle History','circle_history'],['Current borrow','inheritance'],['Veterans','veterans'],['Team Stadium','team_stadium']]) {
    const header = heading === 'Fan activity' ? page.getByRole('figure', { name:heading }) : page.getByRole('heading', { name: heading, exact: true }).locator('..');
    const button = header.getByRole('button', { name: 'Public', exact: true });
    await expect(button.locator('svg')).toHaveCSS('color',await button.evaluate(element=>getComputedStyle(element).color));
    await button.focus(); await button.press('Enter');
    await expect(header.getByRole('button', { name: 'Hidden', exact: true })).toBeVisible();
    const hiddenButton=header.getByRole('button',{name:'Hidden',exact:true});
    await expect(hiddenButton.locator('svg')).toHaveCSS('color',await hiddenButton.evaluate(element=>getComputedStyle(element).color));
    await expect.poll(() => settings.hidden_sections).toEqual([section]);
    if(section==='fan_history')await header.locator('..').screenshot({path:test.info().outputPath('owner-hidden-section.png')});
    if (isMobile) expect((await header.getByRole('button', { name: 'Hidden', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(28);
    await header.getByRole('button', { name: 'Hidden', exact: true }).click();
    await expect(button).toBeVisible(); await expect.poll(() => settings.hidden_sections).toEqual([]);
  }
  expect(saved).toHaveLength(14);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const response of ['profile', 'hidden'] as const) test(`late ${response} responses cannot overwrite the next profile`, async ({ page }) => {
  await twoAccounts(page);
  let release!: () => void; const delayed = new Promise<void>(resolve => release = resolve);
  let requested = false;
  await page.route(`**/api/v4/user/profile/${accountId}`, async route => {
    requested = true; await delayed;
    if (response === 'hidden') await route.fulfill({ status: 403, json: { error: 'hidden' } });
    else await route.fallback();
  });
  try {
    await page.goto(`/profile/${accountId}`); await expect.poll(() => requested).toBe(true);
    await follow(page, `/profile/${otherId}`);
    await expect(page.getByRole('heading', { name: 'Other Trainer', exact: true })).toBeVisible();
  } finally { release(); }
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Other Trainer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This profile is hidden' })).toHaveCount(0);
  await expect(page.locator('.profile-header code').first()).toHaveText(otherId.replace(/(\d{3})(?=\d)/g, '$1 '));
});

test('late visibility reads and writes stay attached to their requested account', async ({ page }) => {
  await twoAccounts(page);
  let releaseRead!: () => void, releaseWrite!: () => void;
  const reading = new Promise<void>(resolve => releaseRead = resolve), writing = new Promise<void>(resolve => releaseWrite = resolve);
  let reads = 0, writes = 0;
  await page.route(`**/api/v4/user/profile/${accountId}/visibility`, async route => {
    if (route.request().method() === 'PUT') { writes++; await writing; return route.fulfill({ json: { profile_hidden: false, hidden_sections: ['fan_history'] } }); }
    reads++; if (reads === 1) await reading;
    return route.fulfill({ json: { profile_hidden: true, hidden_sections: [] } });
  });
  try {
    await page.goto(`/profile/${accountId}`); await expect.poll(() => reads).toBe(1);
    await follow(page, `/profile/${otherId}`);
    await expect(page.getByRole('button', { name: 'Profile Visible', exact: true })).toBeVisible();
    releaseRead(); await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Profile Visible', exact: true })).toBeVisible();
    await follow(page, `/profile/${accountId}`);
    await page.getByRole('button', { name: 'Entire Profile Hidden', exact: true }).click();
    await expect.poll(() => writes).toBe(1);
    await follow(page, `/profile/${otherId}`);
    await expect(page.getByRole('button', { name: 'Profile Visible', exact: true })).toBeVisible();
  } finally { releaseRead(); releaseWrite(); }
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Profile Visible', exact: true })).toBeVisible();
  // Re-entering the first account must retrieve its own visibility, not retain the second account's state.
  await follow(page, `/profile/${accountId}`);
  await expect(page.getByRole('button', { name: 'Entire Profile Hidden', exact: true })).toBeVisible();
});

test('visibility changes save in order and a failed final save restores the last confirmed settings', async ({ page }) => {
  await mockOwnerProfile(page, []);
  const bodies: Array<typeof visible> = []; let release!: () => void;
  const delayed = new Promise<void>(resolve => release = resolve);
  await page.route(`**/api/v4/user/profile/${accountId}/visibility`, async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: visible });
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) { await delayed; return route.fulfill({ json: bodies[0] }); }
    return route.fulfill({ status: 400, json: { error: 'Not saved' } });
  });
  try {
    await page.goto(`/profile/${accountId}`);
    await page.getByRole('button', { name: 'Profile Visible', exact: true }).click();
    await expect.poll(() => bodies.length).toBe(1);
    await page.getByRole('figure', { name: 'Fan activity' }).getByRole('button', { name: 'Public', exact: true }).click();
    await expect(page.getByRole('figure', { name: 'Fan activity' }).getByRole('button', { name: 'Hidden', exact: true })).toBeVisible();
    expect(bodies).toHaveLength(1);
  } finally { release(); }
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual({ profile_hidden: true, hidden_sections: ['fan_history'] });
  await expect(page.getByText('Visibility changes could not be saved. Your last saved settings have been restored.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entire Profile Hidden', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Fan activity' }).getByRole('button', { name: 'Public', exact: true })).toBeVisible();
});

test('a Veteran upload remains bound to the account selected before the file was read', async ({ page }) => {
  await twoAccounts(page); await mockVeteranProfile(page);
  const uploaded: string[] = [];
  await page.route(`**/api/v4/user/profile/${accountId}`, route => route.fulfill({ json: { ...profile, veterans: uploaded.length ? [{ trained_chara_id: 991, card_id: 100101 }] : [] } }));
  await page.route('**/ingest/veteran?*', route => { uploaded.push(new URL(route.request().url()).searchParams.get('account_id')!); return route.fulfill({ json: { inserted: 1, updated: 0, deleted: 0, total: 1 } }); });
  await page.goto(`/veterans/${accountId}`);

  await expect(page.locator('.collection-controls input[type=file]')).toBeAttached();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = async function () {
      await new Promise<void>(resolve => { (window as Window & { releaseProfileFile?: () => void }).releaseProfileFile = resolve; });
      return original.call(this);
    };
  });
  try {
    await page.locator('.collection-controls input[type=file]').setInputFiles({ name: 'data.json', mimeType: 'application/json', buffer: Buffer.from('[{"trained_chara_id":991,"card_id":100101}]') });
    await expect(page.getByText('Saving veterans…', { exact: true })).toBeVisible();
    await follow(page, `/veterans/${otherId}`);
    await expect(page.getByRole('heading', { name: 'Other Trainer', exact: true })).toBeVisible();
  } finally { await page.evaluate(() => (window as Window & { releaseProfileFile?: () => void }).releaseProfileFile?.()); }
  await expect.poll(() => uploaded.length).toBe(1);
  expect(uploaded).toEqual([accountId]);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Other Trainer', exact: true })).toBeVisible();
  await expect(page.locator('.feedback')).toContainText('synced to');
});

test('unknown visibility cannot be overwritten with guessed defaults and can be retried',async({page})=>{
  await mockOwnerProfile(page,[]);
  let failed=true;const saved:unknown[]=[];
  await page.route(`**/api/v4/user/profile/${accountId}/visibility`,route=>{
    if(route.request().method()==='PUT'){saved.push(route.request().postDataJSON());return route.fulfill({json:saved.at(-1)});}
    return route.fulfill(failed?{status:500,json:{error:'Unavailable'}}:{json:{profile_hidden:true,hidden_sections:['fan_history']}});
  });
  await page.goto(`/profile/${accountId}`);
  await expect(page.getByText('Visibility settings could not be loaded. Retry before changing them.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Profile Visible',exact:true})).toBeDisabled();
  expect(saved).toEqual([]);
  failed=false;await page.getByRole('button',{name:'Retry visibility',exact:true}).click();
  await expect(page.getByRole('button',{name:'Entire Profile Hidden',exact:true})).toBeEnabled();
  const header=page.getByRole('figure',{name:'Fan activity',exact:true});
  await expect(header.getByRole('button',{name:'Hidden',exact:true})).toBeVisible();
  await header.getByRole('button',{name:'Hidden',exact:true}).click();
  await expect.poll(()=>saved).toEqual([{profile_hidden:true,hidden_sections:[]}]);
});

test('re-entering a profile rechecks access instead of showing a cached private profile',async({page})=>{
  await mockOwnerProfile(page,[]);
  await page.goto(`/profile/${accountId}`);
  await expect(page.getByRole('heading',{name:'Parity Trainer',exact:true})).toBeVisible();
  await follow(page,'/tools');
  await page.route('**/api/auth/accounts',route=>route.fulfill({json:[]}));
  await page.route(`**/api/v4/user/profile/${accountId}`,route=>route.fulfill({status:403,json:{error:'hidden'}}));
  await follow(page,`/profile/${accountId}`);
  await expect(page.getByRole('heading',{name:'This profile is hidden',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Parity Trainer',exact:true})).toHaveCount(0);
  await expect(page.locator('.owner-controls')).toHaveCount(0);
});
