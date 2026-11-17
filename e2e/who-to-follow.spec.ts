import { test, expect } from '@playwright/test';
import { registerUser, follow, getSuggestions, getFollowers, unfollow } from './support/api';
import { loginViaStorage } from './support/auth';

// Neo4j is fed asynchronously via Kafka (user-events); follow() in support/api retries until the nodes exist.
const SETTLE = { timeout: 15_000 };

test.describe('who to follow', () => {
  test('API: friends of friends first, never self or already followed', async () => {
    const me = await registerUser();
    const friend = await registerUser();
    const fof = await registerUser();
    await follow(me.token, friend.id);
    await follow(friend.token, fof.id);
    await follow(friend.token, me.id); // follows me back: must not suggest me to myself

    const suggestions = await getSuggestions(me.token, 20);
    expect(suggestions[0]).toMatchObject({ userId: fof.id, username: fof.username, mutualFollowers: 1 });
    const ids = suggestions.map(s => s.userId);
    expect(ids).not.toContain(me.id);
    expect(ids).not.toContain(friend.id); // already followed
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('API: requires authentication and clamps the limit', async () => {
    const res = await fetch('http://localhost:8080/api/v1/social/suggestions');
    expect(res.status).toBe(401);

    const me = await registerUser();
    expect((await getSuggestions(me.token, 1000)).length).toBeLessThanOrEqual(20);
  });

  test('feed card suggests a friend of a friend and following from it works', async ({ page, context }) => {
    const me = await registerUser();
    const friend = await registerUser();
    const fof = await registerUser();
    await follow(me.token, friend.id);
    await follow(friend.token, fof.id);
    await loginViaStorage(context, me);

    await page.goto('/feed');
    const row = page.getByTestId('suggestion').filter({ hasText: fof.username });
    await expect(row).toBeVisible(SETTLE);
    await expect(row).toContainText('Followed by 1 person you follow');

    await row.getByRole('button', { name: 'Follow', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Unfollow' })).toBeVisible(SETTLE);
    await expect.poll(async () =>
      (await getFollowers(me.token, fof.id)).some(f => f.userId === me.id), SETTLE).toBe(true);

    // once followed the user is no longer suggested after a reload
    await page.reload();
    await expect(page.getByTestId('suggestion').filter({ hasText: fof.username })).toHaveCount(0, SETTLE);

    await unfollow(me.token, fof.id);
  });

  test('a suggestion links to the profile', async ({ page, context }) => {
    const me = await registerUser();
    const friend = await registerUser();
    const fof = await registerUser();
    await follow(me.token, friend.id);
    await follow(friend.token, fof.id);
    await loginViaStorage(context, me);

    await page.goto('/feed');
    await page.getByTestId('suggestion').filter({ hasText: fof.username })
      .getByRole('link', { name: fof.username }).click();
    await expect(page).toHaveURL(new RegExp(`/users/${fof.id}$`));
  });
});
