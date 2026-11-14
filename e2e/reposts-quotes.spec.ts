import { test, expect, Page } from '@playwright/test';
import {
  createPost, deletePost, follow, getFeedPage, quote, registerUser, repost, uniqueSuffix, TestUser,
} from './support/api';
import { loginViaStorage } from './support/auth';

// The follow edge reaches the Feed projection asynchronously via Kafka.
const PROJECTION = { timeout: 15_000, intervals: [250, 500, 1_000] };

const card = (page: Page, text: string) => page.locator('ui-post-card').filter({ hasText: text });
/** The original (plain) card of a post: neither a repost item nor a quote embedding it. */
const plainCard = (page: Page, text: string) => card(page, text)
  .filter({ hasNot: page.getByTestId('repost-banner') })
  .filter({ hasNot: page.getByTestId('quote-embed') });

const isRepostCall = (id: string, method: string) => (r: import('@playwright/test').Response) =>
  r.url().endsWith(`/posts/${id}/repost`) && r.request().method() === method && r.ok();

async function openFeed(page: Page, ctx: import('@playwright/test').BrowserContext, user: TestUser) {
  await loginViaStorage(ctx, user);
  await page.goto('/feed');
  await expect(page.getByText('Live updates active')).toBeVisible();
}

async function selectFollowing(page: Page) {
  const stream = page.waitForResponse(r => r.url().includes('/feed/stream') && r.url().includes('scope=following'));
  await page.getByTestId('feed-tab-following').click();
  await stream;
  await expect(page.getByTestId('feed-tab-following')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Live updates active')).toBeVisible();
}

async function waitForFollowProjected(viewer: TestUser, followee: TestUser): Promise<void> {
  const probe = `probe ${uniqueSuffix()}`;
  await createPost(followee.token, probe);
  await expect.poll(async () =>
    (await getFeedPage(viewer.token, 'following')).items.some(p => p.content === probe), PROJECTION).toBe(true);
}

async function myReposts(user: TestUser, originalId: string) {
  const items = (await getFeedPage(user.token, 'following', undefined, 50)).items;
  return items.filter(p => p.type === 'REPOST' && p.original?.id === originalId);
}

test.describe('reposts and quotes', () => {
  // Assertions on the global "For you" feed (page size 20) are only safe when specs do not interleave.
  test.describe.configure({ mode: 'serial' });

  test('UI repost: banner + original, count 1, Undo; undo removes it; double click makes one repost', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const text = `to-repost ${uniqueSuffix()}`;
    const original = await createPost(author.token, text);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);

      const origCard = plainCard(page, text);
      await expect(origCard).toHaveCount(1);
      await expect(origCard.getByTestId('repost-count')).toHaveText('0');

      await origCard.getByTestId('repost-btn').click();
      const done = page.waitForResponse(isRepostCall(original.id, 'POST'));
      // two synchronous clicks = a fast double click; the second one must be ignored
      await page.getByTestId('repost-action').evaluate(el => { (el as HTMLElement).click(); (el as HTMLElement).click(); });
      await done;

      const banner = page.getByTestId('repost-banner').filter({ hasText: `${viewer.username} reposted` });
      await expect(banner).toHaveCount(1);
      await expect(card(page, text)).toHaveCount(2); // the original + the repost item showing it
      await expect(card(page, text).getByTestId('repost-count')).toHaveText(['1', '1']);

      // the button now offers Undo
      await origCard.getByTestId('repost-btn').click();
      await expect(page.getByTestId('undo-repost-action')).toBeVisible();
      await expect(page.getByTestId('repost-action')).toHaveCount(0);
      await page.keyboard.press('Escape');
      // wait until the closing menu panel is gone: otherwise reopening it briefly yields two matching menu items
      await expect(page.getByTestId('undo-repost-action')).toHaveCount(0);

      await expect.poll(async () => (await myReposts(viewer, original.id)).length, PROJECTION).toBe(1);

      // undo
      await origCard.getByTestId('repost-btn').click();
      const undone = page.waitForResponse(isRepostCall(original.id, 'DELETE'));
      await page.getByTestId('undo-repost-action').click();
      await undone;

      // Without a reload: both the locally inserted repost item and the copy the SSE stream delivered are gone.
      await expect(page.getByTestId('repost-banner').filter({ hasText: `${viewer.username} reposted` })).toHaveCount(0);
      await expect(card(page, text)).toHaveCount(1);
      await expect(card(page, text).getByTestId('repost-count')).toHaveText('0');

      await page.reload();
      await expect(card(page, text)).toHaveCount(1);
      await expect(page.getByTestId('repost-banner').filter({ hasText: `${viewer.username} reposted` })).toHaveCount(0);
      await expect(card(page, text).getByTestId('repost-count')).toHaveText('0');
      expect(await myReposts(viewer, original.id)).toHaveLength(0);
    } finally {
      await ctx.close();
    }
  });

  test('Following: a followed user reposting a stranger\'s post shows banner + original, live and after reload', async ({ browser }) => {
    const viewer = await registerUser();
    const friend = await registerUser();
    const stranger = await registerUser();
    await follow(viewer.token, friend.id);
    await waitForFollowProjected(viewer, friend);

    const text = `stranger-orig ${uniqueSuffix()}`;
    const original = await createPost(stranger.token, text);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);
      await selectFollowing(page);
      await expect(card(page, text)).toHaveCount(0);

      await repost(friend.token, original.id);

      // live over SSE, no reload
      const live = card(page, text);
      await expect(live).toHaveCount(1);
      await expect(live.getByTestId('repost-banner')).toHaveText(new RegExp(`${friend.username} reposted`));
      await expect(live.getByText(stranger.username, { exact: true })).toBeVisible();

      // persisted copy after reload
      await page.reload();
      await selectFollowing(page);
      await expect(card(page, text)).toHaveCount(1);
      await expect(card(page, text).getByTestId('repost-banner')).toHaveText(new RegExp(`${friend.username} reposted`));
    } finally {
      await ctx.close();
    }
  });

  test('UI quote: text required, embed shown, hashtag links and quote is on the tag page', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const text = `to-quote ${uniqueSuffix()}`;
    await createPost(author.token, text);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);

      const origCard = plainCard(page, text);
      await expect(origCard).toHaveCount(1);
      await origCard.getByTestId('repost-btn').click();
      await page.getByTestId('quote-action').click();

      const input = origCard.getByTestId('quote-input');
      const submit = origCard.getByTestId('quote-submit');
      await expect(input).toBeVisible();
      await expect(submit).toBeDisabled();
      await input.fill('   ');
      await expect(submit).toBeDisabled();
      await input.fill('a'.repeat(501));
      await expect(submit).toBeDisabled();
      await input.fill('a'.repeat(500));
      await expect(submit).toBeEnabled();

      const tag = `qt${uniqueSuffix()}`;
      const comment = `my take #${tag}`;
      await input.fill(comment);
      await expect(submit).toBeEnabled();
      const created = page.waitForResponse(r =>
        r.url().endsWith(`/quote`) && r.request().method() === 'POST' && r.status() === 201);
      await submit.click();
      await created;

      const quoteCard = card(page, comment);
      await expect(quoteCard).toHaveCount(1);
      await expect(quoteCard.getByTestId('quote-embed')).toContainText(text);
      await expect(origCard.getByTestId('quote-count')).toHaveText('1');
      const link = quoteCard.getByTestId('hashtag-link');
      await expect(link).toHaveText(`#${tag}`);

      await link.click();
      await expect(page).toHaveURL(new RegExp(`/tags/${tag}$`));
      const onTag = card(page, comment);
      await expect(onTag).toHaveCount(1);
      await expect(onTag.getByTestId('quote-embed')).toContainText(text);
    } finally {
      await ctx.close();
    }
  });

  test('quote failure keeps the composer open with the text; a retry succeeds and closes it', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const text = `quote-fail ${uniqueSuffix()}`;
    await createPost(author.token, text);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);

      const origCard = plainCard(page, text);
      await expect(origCard).toHaveCount(1);
      await origCard.getByTestId('repost-btn').click();
      await page.getByTestId('quote-action').click();

      const input = origCard.getByTestId('quote-input');
      const submit = origCard.getByTestId('quote-submit');
      const comment = `retry me ${uniqueSuffix()}`;
      await input.fill(comment);

      const quoteUrl = '**/posts/*/quote';
      await page.route(quoteUrl, route => route.request().method() === 'OPTIONS'
        ? route.fallback()
        : route.fulfill({
            status: 500, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ message: 'boom' }),
          }));
      const failed = page.waitForResponse(r => r.url().endsWith('/quote') && r.request().method() === 'POST' && r.status() === 500);
      await submit.click();
      await failed;

      await expect(page.locator('mat-snack-bar-container').filter({ hasText: 'Failed to quote post' })).toBeVisible();
      await expect(input).toBeVisible();
      await expect(input).toHaveValue(comment);
      await expect(submit).toBeEnabled(); // not stuck disabled after the error

      await page.unroute(quoteUrl);
      const created = page.waitForResponse(r =>
        r.url().endsWith('/quote') && r.request().method() === 'POST' && r.status() === 201);
      await submit.click();
      await created;

      await expect(card(page, comment).getByTestId('quote-embed')).toContainText(text);
      await expect(origCard.getByTestId('quote-input')).toHaveCount(0);
      await expect(origCard.getByTestId('quote-count')).toHaveText('1');
    } finally {
      await ctx.close();
    }
  });

  test('a repost of a repost is flattened to the real original', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const c = await registerUser();
    const original = await createPost(a.token, `flat ${uniqueSuffix()}`);

    const first = await repost(b.token, original.id);
    expect(first.type).toBe('REPOST');
    expect(first.original?.id).toBe(original.id);

    const second = await repost(c.token, first.id);
    expect(second.type).toBe('REPOST');
    expect(second.original?.id).toBe(original.id);
  });

  test('a quote of a deleted post says "Original post unavailable"; reposts of it are gone', async ({ browser }) => {
    const author = await registerUser();
    const quoter = await registerUser();
    const reposter = await registerUser();
    const viewer = await registerUser();
    const text = `doomed ${uniqueSuffix()}`;
    const original = await createPost(author.token, text);
    const comment = `quoting the doomed ${uniqueSuffix()}`;
    await quote(quoter.token, original.id, comment);
    await repost(reposter.token, original.id);
    await deletePost(author.token, original.id);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);

      const quoteCard = card(page, comment);
      await expect(quoteCard).toHaveCount(1);
      await expect(quoteCard.getByTestId('quote-unavailable')).toHaveText('Original post unavailable');
      // neither the original nor any repost showing it is left
      await expect(card(page, text)).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('counters show on the original after others repost and quote it', async ({ browser }) => {
    const author = await registerUser();
    const r1 = await registerUser();
    const q1 = await registerUser();
    const text = `counted ${uniqueSuffix()}`;
    const original = await createPost(author.token, text);
    await repost(r1.token, original.id);
    await quote(q1.token, original.id, `quoting ${uniqueSuffix()}`);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, author);
      const mine = plainCard(page, text);
      await expect(mine).toHaveCount(1);
      await expect(mine.getByTestId('repost-count')).toHaveText('1');
      await expect(mine.getByTestId('quote-count')).toHaveText('1');
    } finally {
      await ctx.close();
    }
  });
});
