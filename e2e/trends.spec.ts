import { test, expect } from '@playwright/test';
import { registerUser, createPost, getTrends, getStatus, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

test.describe('trending hashtags', () => {
  test('API: ranks by distinct authors, then posts; counts are per post', async () => {
    const [a, b, c] = [await registerUser(), await registerUser(), await registerUser()];
    const popular = `popular${uniqueSuffix()}`;
    const spam = `spam${uniqueSuffix()}`;
    await createPost(a.token, `one #${popular}`);
    await createPost(b.token, `two #${popular} #${spam}`);
    await createPost(c.token, `three #${spam} and #${spam} again`);
    await createPost(c.token, `four #${spam}`);

    // narrow window + max limit: other specs' single-author tags rank below a 2-author tag
    const trends = await getTrends(a.token, 1, 20);
    const mine = trends.filter(t => t.tag === popular || t.tag === spam);

    expect(mine).toEqual([
      { tag: popular, posts: 2, authors: 2 },
      { tag: spam, posts: 3, authors: 2 }, // #spam twice in one post counts that post once
    ].sort((x, y) => (y.authors - x.authors) || (y.posts - x.posts) || x.tag.localeCompare(y.tag)));
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
