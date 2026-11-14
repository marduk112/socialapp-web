import { test, expect } from '@playwright/test';
import { STORAGE_KEY } from './support/auth';

test.describe('guard', () => {
  test('/feed without a session redirects to /login', async ({ page }) => {
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/login$/);
  });

  for (const path of ['/settings', '/users/00000000-0000-0000-0000-000000000001']) {
    test(`${path} without a session redirects to /login without calling the API`, async ({ page }) => {
      const apiCalls: string[] = [];
      page.on('request', req => { if (req.url().includes('localhost:8080')) apiCalls.push(req.url()); });
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      expect(apiCalls).toEqual([]);
    });
  }

  test('malformed token -> 401 -> logged out on /login with session cleared', async ({ page, context }) => {
    await context.addInitScript(([key]) => {
      window.localStorage.setItem(key, JSON.stringify({
        id: '00000000-0000-0000-0000-000000000000', username: 'ghost', email: 'ghost@example.com',
        token: 'not.a.jwt',
      }));
    }, [STORAGE_KEY] as const);

    await page.goto('/feed');
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => page.evaluate(k => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
  });
});
