import { test, expect } from '@playwright/test';
import { registerUser, createPost, getTrends, getStatus, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

test.describe('trending hashtags', () => {
  test('API: a fresh post is counted and the list honours the documented order', async () => {
    const [a, b] = [await registerUser(), await registerUser()];
    const tag = `contract${uniqueSuffix()}`;
    await createPost(a.token, `one #${tag}`);
    await createPost(b.token, `two #${tag} and #${tag} again`);

    // Which tags make the top 20 depends on every other run in this shared database, so only properties that hold for
    // any content are asserted here. The exact ranking is pinned on an isolated database by TrendsPostgresTest.
    const trends = await getTrends(a.token, 1, 20);
    expect(trends.length).toBeGreaterThan(0);
    expect(trends.length).toBeLessThanOrEqual(20);
    for (const t of trends) {
      expect(t.tag).toMatch(/^[^#\s]+$/);
      expect(t.tag).toBe(t.tag.toLowerCase());
      expect(t.posts).toBeGreaterThanOrEqual(1);
      expect(t.authors).toBeGreaterThanOrEqual(1);
      expect(t.authors).toBeLessThanOrEqual(t.posts);
    }
    // most used first: distinct authors, then posts, then tag
    for (let i = 1; i < trends.length; i++) {
      const [p, q] = [trends[i - 1], trends[i]];
      // <= 0 when p correctly precedes q: more authors, else more posts, else the smaller tag
      const order = (q.authors - p.authors) || (q.posts - p.posts) || (p.tag < q.tag ? -1 : p.tag > q.tag ? 1 : 0);
      expect(order, `${p.tag} before ${q.tag}`).toBeLessThanOrEqual(0);
    }
    // if the tag made the list, its counts are per post (#tag twice in one post counts that post once)
    const mine = trends.find(t => t.tag === tag);
    if (mine) expect(mine).toEqual({ tag, posts: 2, authors: 2 });
  });

  test('API: window and limit are clamped, auth is required', async () => {
    const me = await registerUser();
    expect((await getTrends(me.token, 100_000, 1000)).length).toBeLessThanOrEqual(20);
    expect((await getTrends(me.token, 0, 0)).length).toBeLessThanOrEqual(1);
    expect(await getStatus('/trends/hashtags')).toBe(401);
  });

  test('feed card lists trending tags and a tag opens its page', async ({ page, context }) => {
    const me = await registerUser();
    const other = await registerUser();
    const tag = `uitrend${uniqueSuffix()}`;
    await createPost(me.token, `hello #${tag}`);
    await createPost(other.token, `hello again #${tag}`);
    await loginViaStorage(context, me);

    await page.goto('/feed');
    const card = page.getByTestId('trending');
    await expect(card).toBeVisible();
    await card.getByTestId('trend').first().click();
    await expect(page).toHaveURL(/\/tags\/[^/]+$/);
    await expect(page.getByTestId('tag-title')).toBeVisible();
  });

  test('feed card renders what the API returns (singular/plural, link target)', async ({ page, context }) => {
    const me = await registerUser();
    await loginViaStorage(context, me);
    await page.route('**/trends/hashtags*', route => route.fulfill({
      json: [{ tag: 'angular', posts: 12, authors: 5 }, { tag: 'kafka', posts: 1, authors: 1 }],
    }));

    await page.goto('/feed');
    const trends = page.getByTestId('trend');
    await expect(trends).toHaveCount(2);
    await expect(trends.nth(0)).toContainText('#angular');
    await expect(trends.nth(0)).toContainText('12 posts');
    await expect(trends.nth(1)).toContainText('1 post');
    await expect(trends.nth(1)).not.toContainText('1 posts');
    await expect(trends.nth(0)).toHaveAttribute('href', '/tags/angular');
  });

  test('feed card is hidden when nothing trends', async ({ page, context }) => {
    const me = await registerUser();
    await loginViaStorage(context, me);
    await page.route('**/trends/hashtags*', route => route.fulfill({ json: [] }));

    await page.goto('/feed');
    await expect(page.getByTestId('compose-card')).toBeVisible();
    await expect(page.getByTestId('trending')).toHaveCount(0);
  });
});
