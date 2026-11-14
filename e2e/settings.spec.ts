import { test, expect } from '@playwright/test';
import { registerUser, getUser, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

test.describe('settings', () => {
  test('edit bio and see it persisted after reload', async ({ page, context }) => {
    const user = await registerUser();
    await loginViaStorage(context, user);
    const bio = `bio ${uniqueSuffix()}`;

    await page.goto('/settings');
    await page.getByLabel('Bio').fill(bio);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Bio')).toHaveValue(bio);
    // and it really is on the server, not only in localStorage
    expect((await getUser(user.token, user.id)).bio).toBe(bio);

    await page.goto(`/users/${user.id}`);
    await expect(page.getByText(bio)).toBeVisible();
  });
});
