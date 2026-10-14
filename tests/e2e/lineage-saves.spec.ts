import { expect, test, type Page } from './fixtures/test';
import { mockAffinity } from './fixtures/api';

const savesKey = 'lineage-planner-saves-v1';
const stateKey = 'lineage-planner-state-v1';
const payload = (id: number) => [{ position: 'target', characterId: id, sparks: [], manualWinSaddleIds: [] }];
const manager = (page: Page) => page.getByRole('dialog', { name: 'Lineage Trees', exact: true });
async function openManager(page: Page) {
  await page.getByRole('button', { name: 'Save / Load', exact: true }).click();
  await expect(manager(page)).toBeVisible();
  return manager(page);
}

test('Lineage named trees support Enter, confirmed overwrite/delete, cancellation and click-to-load after reload', async ({ page, isMobile }) => {
  await mockAffinity(page);
  await page.goto('/tools/lineage-planner?cards=100101,101301,0,0,0');
  const dialog = await openManager(page);
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(['Save current tree', 'Saved trees (0)', 'Share & transfer']);
  const name = dialog.getByRole('textbox', { name: 'Tree name' });
  await expect(name).toHaveAttribute('maxlength', '60');
  await name.fill('  First tree  '); await name.press('Enter');
  await expect(dialog).not.toBeVisible();
  const original = await page.evaluate(key => localStorage.getItem(key), savesKey);
  expect(JSON.parse(original!)['First tree']).toHaveLength(2);
  await page.getByRole('button', { name: 'Clear Parent 1', exact: true }).click();
  await openManager(page); await name.fill('First tree');
  await expect(dialog.getByText('A save with this name already exists. It will be overwritten.')).toBeVisible();
  await name.press('Enter');
  const overwrite = page.getByRole('dialog', { name: 'Overwrite save?', exact: true });
  await expect(overwrite).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), savesKey)).toBe(original);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await name.fill('First tree'); await name.press('Enter');
  await overwrite.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), savesKey)).toBe(original);
  await name.fill('First tree'); await name.press('Enter');
  await overwrite.getByRole('button', { name: 'Overwrite', exact: true }).click();
  await expect(overwrite).not.toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!)['First tree'].length, savesKey)).toBe(1);
  await page.reload(); await page.getByRole('button', { name: 'Clear All', exact: true }).click();
  await openManager(page);
  await dialog.getByRole('button', { name: 'Load First tree', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change Target: Special Week', exact: true })).toBeVisible();
  await openManager(page);
  if (isMobile) {
    for (const control of await dialog.locator('button,input:not([type=file])').all()) {
      const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(32);
    }
  }
  await page.screenshot({ path: test.info().outputPath('lineage-saves.png') });
  await dialog.getByRole('button', { name: 'Delete First tree', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete saved tree?', exact: true });
  await expect(deletion.getByText('“First tree” will be permanently removed from your browser.')).toBeVisible();
  await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Load First tree', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete First tree', exact: true }).click();
  await deletion.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText('No saved trees yet.', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), savesKey)).toBe('{}');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Change Target: Special Week', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('Lineage empty trees disable saving and exporting but keep both imports available', async ({ page }) => {
  await mockAffinity(page); await page.goto('/tools/lineage-planner');
  const dialog = await openManager(page);
  await dialog.getByRole('textbox').fill('Empty'); await dialog.getByRole('textbox').press('Enter');
  await expect(dialog.getByText('Tree is empty - nothing to save yet.')).toBeVisible();
  for (const name of ['Save', 'Copy share string Send via chat or notes', 'Download .json Save as a file']) await expect(dialog.getByRole('button', { name, exact: true })).toBeDisabled();
  for (const name of ['Paste share string Replaces current tree', 'Import .json Load a file']) await expect(dialog.getByRole('button', { name, exact: true })).toBeEnabled();
  expect(await page.evaluate(key => localStorage.getItem(key), savesKey)).toBeNull();
});

test('Lineage save/read/delete storage failures retain saved data and never claim success', async ({ page }) => {
  await mockAffinity(page);
  await page.addInitScript(({ key, saved }) => {
    localStorage.setItem(key, saved);
    const originalGet = Storage.prototype.getItem, originalSet = Storage.prototype.setItem;
    Object.assign(window, { failTreeRead: false, failTreeWrite: false });
    Storage.prototype.getItem = function (name) {
      if (name === key && (window as unknown as { failTreeRead: boolean }).failTreeRead) throw new DOMException('Blocked', 'SecurityError');
      return originalGet.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key && (window as unknown as { failTreeWrite: boolean }).failTreeWrite) throw new DOMException('Full', 'QuotaExceededError');
      originalSet.call(this, name, value);
    };
  }, { key: savesKey, saved: JSON.stringify({ Existing: payload(100601) }) });
  await page.goto('/tools/lineage-planner?cards=100101,0,0,0,0');
  const dialog = await openManager(page);
  await page.evaluate(() => Object.assign(window, { failTreeWrite: true }));
  await dialog.getByRole('textbox').fill('New tree'); await dialog.getByRole('textbox').press('Enter');
  await expect(dialog.getByText(/Changes could not be saved/)).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveValue('New tree');
  await expect(page.getByText('Saved “New tree”', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => Object.keys(JSON.parse(localStorage.getItem(key)!)), savesKey)).toEqual(['Existing']);
  await page.evaluate(() => Object.assign(window, { failTreeWrite: false }));
  await dialog.getByRole('button', { name: 'Retry saved trees', exact: true }).click();
  await dialog.getByRole('textbox').press('Enter'); await expect(dialog).not.toBeVisible();
  await openManager(page); await page.evaluate(() => Object.assign(window, { failTreeWrite: true }));
  await dialog.getByRole('button', { name: 'Delete Existing', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete saved tree?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText(/Changes could not be saved/)).toBeVisible();
  await expect(page.getByText('Deleted “Existing”', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).Existing, savesKey)).toEqual(payload(100601));
  await page.evaluate(() => Object.assign(window, { failTreeWrite: false, failTreeRead: true }));
  await dialog.getByRole('button', { name: 'Retry saved trees', exact: true }).click();
  await expect(dialog.getByText(/Saved trees could not be read/)).toBeVisible();
  await expect(dialog.getByText('No saved trees yet.')).toHaveCount(0);
  await page.evaluate(() => Object.assign(window, { failTreeRead: false }));
  await dialog.getByRole('button', { name: 'Retry saved trees', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Load Existing', exact: true })).toBeVisible();
  await page.evaluate(key => localStorage.setItem(key, '{broken'), savesKey);
  await page.keyboard.press('Escape'); await openManager(page);
  await expect(dialog.getByText(/Saved trees could not be read/)).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), savesKey)).toBe('{broken');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Change Target: Special Week', exact: true })).toBeVisible();
});

test('Lineage clipboard and file transfers preserve Angular envelopes and recover from denied or unreadable imports', async ({ page }) => {
  await mockAffinity(page);
  await page.addInitScript(() => {
    Object.assign(window, { treeClipboard: '', clipboardDenied: false, fileReadFailed: false });
    const state = window as unknown as { treeClipboard: string; clipboardDenied: boolean; fileReadFailed: boolean };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { if (state.clipboardDenied) throw new Error('Denied'); state.treeClipboard = value; },
      readText: async () => { if (state.clipboardDenied) throw new Error('Denied'); return state.treeClipboard; }
    } });
    const originalRead = File.prototype.text;
    File.prototype.text = function () { return state.fileReadFailed ? Promise.reject(new Error('Read failed')) : originalRead.call(this); };
  });
  await page.goto('/tools/lineage-planner?cards=100101,0,0,0,0');
  let dialog = await openManager(page);
  await dialog.getByRole('button', { name: 'Copy share string Send via chat or notes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const exported = await page.evaluate(() => JSON.parse((window as unknown as { treeClipboard: string }).treeClipboard));
  expect(exported).toMatchObject({ type: 'lineage-planner', version: 1, payload: payload(100101) });
  expect(Number.isFinite(Date.parse(exported.exportedAt))).toBe(true);
  dialog = await openManager(page);
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download .json Save as a file', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^lineage-tree-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
  const chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString())).toMatchObject({ type: 'lineage-planner', version: 1, payload: payload(100101) });
  await page.evaluate(() => Object.assign(window, { clipboardDenied: true }));
  await openManager(page); await dialog.getByRole('button', { name: 'Paste share string Replaces current tree', exact: true }).click();
  await expect(page.getByText('Use “Import .json” instead.', { exact: true })).toBeVisible();
  await page.evaluate(() => Object.assign(window, { clipboardDenied: false, treeClipboard: '[{"position":"unknown"}]' }));
  const before = await page.evaluate(key => localStorage.getItem(key), stateKey);
  await openManager(page); await dialog.getByRole('button', { name: 'Paste share string Replaces current tree', exact: true }).click();
  await expect(page.getByText('Invalid tree data', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), stateKey)).toBe(before);
  await page.evaluate(value => Object.assign(window, { treeClipboard: value }), JSON.stringify(payload(100601)));
  await openManager(page); await dialog.getByRole('button', { name: 'Paste share string Replaces current tree', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change Target: Oguri Cap', exact: true })).toBeVisible();
  await page.evaluate(() => Object.assign(window, { fileReadFailed: true }));
  const file = { name: 'tree.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) };
  await openManager(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import .json Load a file', exact: true }).click();
  await (await chooserPromise).setFiles(file);
  await expect(page.getByText('Failed to read file', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change Target: Oguri Cap', exact: true })).toBeVisible();
  await page.evaluate(() => Object.assign(window, { fileReadFailed: false }));
  await openManager(page); await dialog.getByLabel('Import lineage tree').setInputFiles({ ...file, buffer: Buffer.from('[{"position":"wrong"}]') });
  await expect(page.getByRole('button', { name: 'Change Target: Oguri Cap', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!)[0].characterId, stateKey)).toBe(100601);
  await openManager(page); await dialog.getByLabel('Import lineage tree').setInputFiles(file);
  await expect(page.getByRole('button', { name: 'Change Target: Special Week', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Change Target: Special Week', exact: true })).toBeVisible();
});
