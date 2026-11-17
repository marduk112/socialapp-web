import { test, expect, Page, BrowserContext, Response } from '@playwright/test';
import {
  bookmark, createPost, getBookmarkPage, getBookmarks, quote, registerUser, registerUsers, repost, unbookmark,
  uniqueSuffix, ApiPost, TestUser,
} from './support/api';
import { loginViaStorage } from './support/auth';

const card = (page: Page, text: string) => page.locator('ui-post-card').filter({ hasText: text });
const isBookmarkCall = (id: string, method: 'PUT' | 'DELETE') => (r: Response) =>
  r.url().endsWith(`/posts/${id}/bookmark`) && r.request().method() === method && r.ok();
const isBookmarksList = (r: Response) => r.url().includes('/bookmarks') && r.request().method() === 'GET' && r.ok();

async function openFeed(page: Page, ctx: BrowserContext, user: TestUser) {
  await loginViaStorage(ctx, user);
  await page.goto('/feed');
  await expect(page.getByText('Live updates active')).toBeVisible();
}

async function openBookmarks(page: Page) {
  const list = page.waitForResponse(isBookmarksList);
  await page.goto('/bookmarks');
  await list;
  await expect(page.getByTestId('bookmarks-page')).toBeVisible();
}

/** Clicks the card's bookmark button and waits for the matching request. */
async function toggleBookmark(page: Page, cardLoc: ReturnType<typeof card>, id: string, method: 'PUT' | 'DELETE') {
  const done = page.waitForResponse(isBookmarkCall(id, method));
  await cardLoc.getByTestId('bookmark-btn').click();
  await done;
}

/** All bookmark items of a user, following the cursor. */
async function allBookmarks(user: TestUser): Promise<ApiPost[]> {
  const items: ApiPost[] = [];
  let cursor: string | null = null;
  do {
    const page = await getBookmarkPage(user.token, cursor, 50);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

test.describe('bookmarks', () => {
  test.describe.configure({ mode: 'serial' });

  test('empty state', async ({ browser }) => {
    const user = await registerUser();
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await loginViaStorage(ctx, user);
      await openBookmarks(page);
      await expect(page.getByTestId('bookmarks-empty')).toHaveText('No saved posts yet.');
      await expect(page.locator('ui-post-card')).toHaveCount(0);
      await expect(page.getByTestId('bookmarks-load-more')).toHaveCount(0);
    } finally { await ctx.close(); }
  });

  test('bookmark from feed -> on /bookmarks, survives reload, un-bookmark there removes it', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const text = `bm-basic ${uniqueSuffix()}`;
    const post = await createPost(author.token, text);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);
      const c = card(page, text);
      await expect(c).toHaveCount(1);
      await expect(c.getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'false');
      await expect(c.getByTestId('bookmark-btn')).toHaveAttribute('aria-label', 'Save post');

      await toggleBookmark(page, c, post.id, 'PUT');
      await expect(c.getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');
      await expect(c.getByTestId('bookmark-btn')).toHaveAttribute('aria-label', 'Remove bookmark');

      const list = page.waitForResponse(isBookmarksList);
      await page.getByTestId('nav-bookmarks').click();
      await list;
      await expect(page).toHaveURL(/\/bookmarks$/);
      await expect(card(page, text)).toHaveCount(1);
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');

      await page.reload();
      await expect(card(page, text)).toHaveCount(1);
      await expect(page.getByTestId('bookmarks-empty')).toHaveCount(0);

      await toggleBookmark(page, card(page, text), post.id, 'DELETE');
      await expect(card(page, text)).toHaveCount(0);
      await expect(page.getByTestId('bookmarks-empty')).toBeVisible();

      await page.reload();
      await expect(page.getByTestId('bookmarks-empty')).toBeVisible();
      expect((await getBookmarks(viewer.token)).length).toBe(0);
    } finally { await ctx.close(); }
  });

  test('state is consistent across feed, tag page, post detail and bookmarks', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const tag = `bm${uniqueSuffix()}`;
    const text = `bm-consistent #${tag}`;
    const post = await createPost(author.token, text);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);
      await toggleBookmark(page, card(page, text), post.id, 'PUT');
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');

      await page.goto(`/tags/${tag}`);
      await expect(card(page, text)).toHaveCount(1);
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');

      await page.goto(`/posts/${post.id}`);
      await expect(card(page, text)).toHaveCount(1);
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');

      // un-bookmark on the detail page, then every other view shows it as not saved
      await toggleBookmark(page, card(page, text), post.id, 'DELETE');
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'false');

      await page.goto(`/tags/${tag}`);
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'false');

      // bookmark again on the tag page
      await toggleBookmark(page, card(page, text), post.id, 'PUT');
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');
      await openBookmarks(page);
      await expect(card(page, text)).toHaveCount(1);
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');
    } finally { await ctx.close(); }
  });

  test('Load more with 25 bookmarks: exact counts, no duplicates', async ({ browser }) => {
    test.setTimeout(120_000);
    const author = await registerUser();
    const viewer = await registerUser();
    const run = uniqueSuffix();
    const posts: ApiPost[] = [];
    for (let i = 0; i < 25; i += 5) {
      posts.push(...await Promise.all(Array.from({ length: 5 }, (_, j) => createPost(author.token, `bm-many ${run} #${i + j}`))));
    }
    for (let i = 0; i < posts.length; i += 5) {
      await Promise.all(posts.slice(i, i + 5).map(p => bookmark(viewer.token, p.id)));
    }

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await loginViaStorage(ctx, viewer);
      await openBookmarks(page);
      await expect(page.locator('ui-post-card')).toHaveCount(20);
      await expect(page.getByTestId('bookmarks-load-more')).toBeVisible();

      // the button disappears with the last page: dispatchEvent + wait for the response (a click() would retry forever)
      const more = page.waitForResponse(r => isBookmarksList(r) && r.url().includes('cursor='));
      await page.getByTestId('bookmarks-load-more').dispatchEvent('click');
      await more;
      await expect(page.locator('ui-post-card')).toHaveCount(25);
      await expect(page.getByTestId('bookmarks-load-more')).toHaveCount(0);

      const texts = await page.locator('ui-post-card .post-content').allInnerTexts();
      expect(new Set(texts).size).toBe(25);
    } finally { await ctx.close(); }
  });

  test('isolation: another user never sees my bookmarks (UI and API)', async ({ browser }) => {
    const [a, b] = await registerUsers(2);
    const text = `bm-private ${uniqueSuffix()}`;
    const post = await createPost(a.token, text);
    await bookmark(a.token, post.id);

    expect((await getBookmarks(a.token)).map(p => p.id)).toContain(post.id);
    expect(await getBookmarks(b.token)).toHaveLength(0);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await loginViaStorage(ctx, b);
      await openBookmarks(page);
      await expect(page.getByTestId('bookmarks-empty')).toBeVisible();
      await expect(card(page, text)).toHaveCount(0);
      // B sees the post itself as not saved
      await page.goto(`/posts/${post.id}`);
      await expect(card(page, text).getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'false');
    } finally { await ctx.close(); }

    // B bookmarking the same post does not touch A's list and vice versa
    await bookmark(b.token, post.id);
    await unbookmark(b.token, post.id);
    expect((await getBookmarks(a.token)).map(p => p.id)).toContain(post.id);
  });

  test('double click ends consistent (one request, no error toast)', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const text = `bm-double ${uniqueSuffix()}`;
    const post = await createPost(author.token, text);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);
      const c = card(page, text);
      await expect(c).toHaveCount(1);

      const requests: string[] = [];
      page.on('request', r => { if (r.url().includes('/bookmark')) requests.push(r.method()); });
      const done = page.waitForResponse(isBookmarkCall(post.id, 'PUT'));
      // two synchronous clicks = a fast double click; the second one must be ignored
      await c.getByTestId('bookmark-btn').evaluate(el => { (el as HTMLElement).click(); (el as HTMLElement).click(); });
      await done;

      await expect(c.getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');
      await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);
      expect(requests).toEqual(['PUT']);
      expect((await getBookmarks(viewer.token)).map(p => p.id)).toEqual([post.id]);
    } finally { await ctx.close(); }
  });

  test('bookmarking a quote and a repost works and renders the embed', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const origText = `bm-orig ${uniqueSuffix()}`;
    const original = await createPost(author.token, origText);
    const other = await createPost(author.token, `bm-orig2 ${uniqueSuffix()}`);
    const quoteText = `bm-quote ${uniqueSuffix()}`;
    const q = await quote(viewer.token, original.id, quoteText);
    await repost(viewer.token, other.id);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);

      // QUOTE: the item itself is the target
      const qc = card(page, quoteText);
      await expect(qc).toHaveCount(1);
      await toggleBookmark(page, qc, q.id, 'PUT');
      await expect(qc.getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');

      // REPOST: the card shows the original and acts on it (same target as like)
      const rc = page.locator('ui-post-card').filter({ has: page.getByTestId('repost-banner') })
        .filter({ hasText: other.content });
      await expect(rc).toHaveCount(1);
      await toggleBookmark(page, rc, other.id, 'PUT');
      await expect(rc.getByTestId('bookmark-btn')).toHaveAttribute('data-bookmarked', 'true');

      await openBookmarks(page);
      const bq = card(page, quoteText);
      await expect(bq).toHaveCount(1);
      await expect(bq.getByTestId('quote-embed')).toContainText(origText);
      await expect(card(page, other.content).first()).toBeVisible();

      const items = await allBookmarks(viewer);
      expect(items.some(i => i.id === q.id)).toBe(true);
      expect(items.some(i => i.id === other.id || i.original?.id === other.id)).toBe(true);

      // un-bookmark the quote on the page: it leaves the list
      await toggleBookmark(page, bq, q.id, 'DELETE');
      await expect(card(page, quoteText)).toHaveCount(0);
    } finally { await ctx.close(); }
  });
});
