import { test, expect } from '@playwright/test';
import { registerUser, getFollowers } from './support/api';
import { loginViaStorage } from './support/auth';

// Neo4j is fed asynchronously via Kafka (user-events), so the profile may briefly be unknown there.
const SETTLE = { timeout: 15_000 };

test.describe('follow', () => {
  test('follow and unfollow from a profile', async ({ page, context }) => {
    const me = await registerUser();
    const other = await registerUser();
    await loginViaStorage(context, me);

    await page.goto(`/users/${other.id}`);
    await expect(page.getByText(other.username)).toBeVisible();

    // The follow call can fail until the Kafka consumer has created the Neo4j nodes -> retry the click.
    await expect(async () => {
      const unfollow = page.getByRole('button', { name: 'Unfollow' });
      if (!(await unfollow.isVisible())) {
        await page.getByRole('button', { name: 'Follow', exact: true }).click();
      }
      await expect(unfollow).toBeVisible({ timeout: 2_000 });
    }).toPass(SETTLE);

    await expect.poll(async () =>
      (await getFollowers(other.token, other.id)).some(f => f.userId === me.id), SETTLE).toBe(true);

    // state survives a reload (is-following comes from Neo4j)
    await page.reload();
    await expect(page.getByRole('button', { name: 'Unfollow' })).toBeVisible(SETTLE);

    await page.getByRole('button', { name: 'Unfollow' }).click();
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible(SETTLE);
    await expect.poll(async () =>
      (await getFollowers(other.token, other.id)).some(f => f.userId === me.id), SETTLE).toBe(false);
  });

  test('profile followers counter reflects a new follower', async ({ page, context }) => {
    const me = await registerUser();
    const other = await registerUser();
    await loginViaStorage(context, me);
    await page.goto(`/users/${other.id}`);
    await expect(async () => {
      const unfollow = page.getByRole('button', { name: 'Unfollow' });
      if (!(await unfollow.isVisible())) {
        await page.getByRole('button', { name: 'Follow', exact: true }).click();
      }
      await expect(unfollow).toBeVisible({ timeout: 2_000 });
    }).toPass(SETTLE);
    await page.reload();
    await expect(page.getByText('followers').locator('strong')).toHaveText('1', SETTLE);
  });
});
