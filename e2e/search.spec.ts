import { test, expect } from '@playwright/test';
import { registerUser, createPost, searchPosts, searchUsers, getStatus, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

/** A lower-case alphanumeric word nobody else's test data contains. */
const word = () => `zq${uniqueSuffix()}`;

test.describe('search API', () => {
  test('posts: matches words case-insensitively, newest first, keyset-paginated', async () => {
    const me = await registerUser();
    const w = word();
    const first = await createPost(me.token, `Learning ${w} the hard way`);
    const second = await createPost(me.token, `${w.toUpperCase()} is fun`);
    await createPost(me.token, 'unrelated text');

    const all = await searchPosts(me.token, w);
    expect(all.items.map(p => p.id)).toEqual([second.id, first.id]);
    expect(all.nextCursor).toBeNull();

    const page1 = await searchPosts(me.token, w, null, 1);
    expect(page1.items.map(p => p.id)).toEqual([second.id]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await searchPosts(me.token, w, page1.nextCursor, 1);
    expect(page2.items.map(p => p.id)).toEqual([first.id]);
    expect(page2.nextCursor).toBeNull();

    expect((await searchPosts(me.token, `${w} unrelated`)).items).toHaveLength(0); // words are ANDed
    expect((await searchPosts(me.token, `${w}nomatch`)).items).toHaveLength(0);
  });

  test('posts: hostile input never errors; blank, missing or overlong q is a 400; auth is required', async () => {
    const me = await registerUser();
    for (const q of ['!!!', '"', '(((', "'", '&|:*']) {
      expect((await searchPosts(me.token, q)).items, q).toEqual([]);
    }
    expect(await getStatus('/search/posts?q=%20%20', me.token)).toBe(400);
    expect(await getStatus('/search/posts', me.token)).toBe(400);
    expect(await getStatus(`/search/posts?q=${'x'.repeat(101)}`, me.token)).toBe(400);
    expect(await getStatus('/search/posts?q=abc&size=0', me.token)).toBe(400);
    expect(await getStatus('/search/posts?q=abc')).toBe(401);
  });

  test('users: substring match on username, public fields only', async () => {
    const me = await registerUser();
    const other = await registerUser();
    const term = other.username.slice(1); // unique: u<timestamp+random>
    const hits = await searchUsers(me.token, term.toUpperCase());

    expect(hits.map(h => h.id)).toEqual([other.id]);
    expect(hits[0]).toEqual({ id: other.id, username: other.username, bio: null, avatarUrl: null });
    expect(hits[0]).not.toHaveProperty('email');
    expect(await searchUsers(me.token, `${term}nomatch`)).toEqual([]);
    expect(await searchUsers(me.token, '%')).toEqual([]); // LIKE wildcards are literal
  });

  test('users: blank/overlong q is a 400 and limit is clamped; auth is required', async () => {
    const me = await registerUser();
    expect(await getStatus('/search/users?q=%20', me.token)).toBe(400);
    expect(await getStatus(`/search/users?q=${'x'.repeat(51)}`, me.token)).toBe(400);
    expect((await searchUsers(me.token, 'u', 1000)).length).toBeLessThanOrEqual(20);
    expect(await getStatus('/search/users?q=abc')).toBe(401);
  });
});

test.describe('search UI', () => {
  test('toolbar search shows matching posts and people', async ({ page, context }) => {
    const me = await registerUser();
    const author = await registerUser();
    const w = word();
    const post = await createPost(author.token, `Thoughts about ${w} today`);
    await loginViaStorage(context, me);

    await page.goto('/feed');
    await page.getByTestId('search-input').fill(w);
    await page.getByTestId('search-input').press('Enter');

    await expect(page).toHaveURL(new RegExp(`/search\\?q=${w}`));
    await expect(page.getByTestId('search-title')).toContainText(w);
    await expect(page.locator('ui-post-card').filter({ hasText: post.content })).toBeVisible();

    // people tab: search for the author's username
    await page.getByTestId('search-input').fill(author.username.slice(1));
    await page.getByTestId('search-input').press('Enter');
    await page.getByTestId('search-tab-people').click();
    const person = page.getByTestId('person').filter({ hasText: author.username });
    await expect(person).toBeVisible();
    await person.click();
    await expect(page).toHaveURL(new RegExp(`/users/${author.id}$`));
  });

  test('empty results show empty states; a #tag goes to the tag page', async ({ page, context }) => {
    const me = await registerUser();
    await loginViaStorage(context, me);
    const w = word();

    await page.goto(`/search?q=${w}nomatch`);
    await expect(page.getByTestId('search-posts-empty')).toBeVisible();
    await page.getByTestId('search-tab-people').click();
    await expect(page.getByTestId('search-people-empty')).toBeVisible();

    await page.getByTestId('search-input').fill('#Kafka');
    await page.getByTestId('search-input').press('Enter');
    await expect(page).toHaveURL(/\/tags\/kafka$/);
  });

  test('a blank query shows a hint instead of calling the API', async ({ page, context }) => {
    const me = await registerUser();
    await loginViaStorage(context, me);
    await page.goto('/search');
    await expect(page.getByTestId('search-blank')).toBeVisible();
  });
});
