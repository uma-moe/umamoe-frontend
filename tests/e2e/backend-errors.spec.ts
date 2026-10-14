import { expect, test } from './fixtures/test';

test('club and profile failures display the backend explanation and HTTP status', async ({ page }) => {
  const error = 'circle month cannot be in the future';
  await page.route('**/api/v4/circles?*', route => route.fulfill({ status: 400, json: { error, status: 400 } }));
  await page.goto('/circles/7?year=2099&month=12');
  await expect(page.getByText(new RegExp('400.*' + error))).toBeVisible();
  await page.route('**/api/v4/user/profile/123456789012', route => route.fulfill({ status: 400, json: { error, status: 400 } }));
  await page.goto('/profile/123456789012');
  await expect(page.getByText(new RegExp('Failed to load profile.*400.*' + error))).toBeVisible();
});
