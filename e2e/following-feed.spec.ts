import { test, expect, Page } from '@playwright/test';
import { createPost, follow, getFeedPage, registerUser, unfollow, uniqueSuffix, TestUser } from './support/api';
import { loginViaStorage } from './support/auth';

// The follow edge reaches the Feed projection asynchronously via Kafka.
const PROJECTION = { timeout: 15_000, intervals: [250, 500, 1_000] };

const card = (page: Page, text: string) => page.locator('ui-post-card').filter({ hasText: text });
const forYouTab = (page: Page) => page.getByTestId('feed-tab-for-you');
const followingTab = (page: Page) => page.getByTestId('feed-tab-following');

/**
 * Switches tab and waits until the SSE stream for the new scope has been opened (the server registers the
 * subscription before it answers). Waiting for the "Live updates active" text is NOT enough: right after the
 * click it can still show the old stream's state, so a post created next would be missed by the new stream.
 */
async function selectScope(page: Page, scope: 'all' | 'following') {
  const stream = page.waitForResponse(r => r.url().includes('/feed/stream') && r.url().includes(`scope=${scope}`));
  await (scope === 'following' ? followingTab(page) : forYouTab(page)).click();
  await stream;
  await expect(page.getByTestId(scope === 'following' ? 'feed-tab-following' : 'feed-tab-for-you'))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Live updates active')).toBeVisible();
}

async function followingContains(viewer: TestUser, content: string): Promise<boolean> {
  const page = await getFeedPage(viewer.token, 'following');
  return page.items.some(p => p.content === content);
}

/** Waits until the follow is visible to the Feed projection by watching a post of the followee. */
async function waitForFollowProjected(viewer: TestUser, followee: TestUser): Promise<void> {
  const probe = `probe ${uniqueSuffix()}`;
  await createPost(followee.token, probe);
  await expect.poll(() => followingContains(viewer, probe), PROJECTION).toBe(true);
}

async function open(page: Page, ctxUser: TestUser, browserCtx: import('@playwright/test').BrowserContext) {
  await loginViaStorage(browserCtx, ctxUser);
  await page.goto('/feed');
  await expect(page.getByText('Live updates active')).toBeVisible();
}

test.describe('Following timeline', () => {
  // The "For you" tab is the global feed (page size 20). Serial mode keeps the 25-post seeding of the
  // Load more test from pushing other tests' posts off the first page while they run in parallel.
  test.describe.configure({ mode: 'serial' });

  test('Following shows own + followed posts but not a stranger; For you shows all', async ({ browser }) => {
    const viewer = await registerUser();
    const friend = await registerUser();
    const stranger = await registerUser();
    await follow(viewer.token, friend.id);
    await waitForFollowProjected(viewer, friend);

    const own = `own ${uniqueSuffix()}`;
    const friendText = `friend ${uniqueSuffix()}`;
    const strangerText = `stranger ${uniqueSuffix()}`;
    await createPost(viewer.token, own);
    await createPost(friend.token, friendText);
    await createPost(stranger.token, strangerText);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await open(page, viewer, ctx);

      // default tab is For you
      await expect(forYouTab(page)).toHaveAttribute('aria-selected', 'true');
      for (const t of [own, friendText, strangerText]) await expect(card(page, t)).toHaveCount(1);

      await followingTab(page).click();
      await expect(followingTab(page)).toHaveAttribute('aria-selected', 'true');
      await expect(card(page, own)).toHaveCount(1);
      await expect(card(page, friendText)).toHaveCount(1);
      await expect(card(page, strangerText)).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('Following tab shows an empty state when nothing is followed and nothing posted', async ({ browser }) => {
    const viewer = await registerUser();
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await open(page, viewer, ctx);
      await followingTab(page).click();
      await expect(page.getByText('Nothing here yet — follow people to see their posts.')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('after unfollow, new posts of that user no longer appear in Following', async ({ browser }) => {
    const viewer = await registerUser();
    const friend = await registerUser();
    await follow(viewer.token, friend.id);
    await waitForFollowProjected(viewer, friend);
    await unfollow(viewer.token, friend.id);

    // keep posting until the unfollow has reached the projection (a post stops showing up)
    let lastFriendPost = '';
    await expect.poll(async () => {
      lastFriendPost = `after-unfollow ${uniqueSuffix()}`;
      await createPost(friend.token, lastFriendPost);
      return followingContains(viewer, lastFriendPost);
    }, PROJECTION).toBe(false);

    const own = `own ${uniqueSuffix()}`;
    await createPost(viewer.token, own);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await open(page, viewer, ctx);
      await followingTab(page).click();
      await expect(card(page, own)).toHaveCount(1);          // list has loaded
      await expect(card(page, lastFriendPost)).toHaveCount(0);
      await expect(card(page, 'after-unfollow')).toHaveCount(0);

      await forYouTab(page).click();
      await expect(card(page, lastFriendPost)).toHaveCount(1); // still public in For you
    } finally {
      await ctx.close();
    }
  });

  test('live SSE in Following scope: followed post appears, stranger post does not', async ({ browser }) => {
    const viewer = await registerUser();
    const friend = await registerUser();
    const stranger = await registerUser();
    await follow(viewer.token, friend.id);
    await waitForFollowProjected(viewer, friend);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await open(page, viewer, ctx);
      await selectScope(page, 'following');

      const strangerText = `stranger-live ${uniqueSuffix()}`;
      const friendText = `friend-live ${uniqueSuffix()}`;
      await createPost(stranger.token, strangerText);
      await createPost(friend.token, friendText);
      await expect(card(page, friendText)).toHaveCount(1);

      // only now is absence meaningful (SSE preserves order: stranger was created first)
      await expect(card(page, strangerText)).toHaveCount(0);
      await expect(card(page, friendText)).toHaveCount(1);
    } finally {
      await ctx.close();
    }
  });

  test('Load more appends pages without duplicates until the cursor is exhausted', async ({ browser }) => {
    // The author views their own "Following" timeline (own posts only), so the list is exactly the
    // 25 seeded posts: 2 pages, independent of how many posts other test runs left in the database.
    const author = await registerUser();
    const tag = uniqueSuffix();
    const seeded: string[] = [];
    for (let i = 0; i < 25; i++) {
      const content = `seed-${tag}-${String(i).padStart(2, '0')}`;
      await createPost(author.token, content);
      seeded.push(content);
    }

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await open(page, author, ctx);
      // Wait for the Following page itself, not for the button: until it answers, the button that is still
      // on screen belongs to the "For you" list (the tab switch re-renders the list asynchronously).
      const firstPage = page.waitForResponse(r => /\/feed\?/.test(r.url()) && r.url().includes('scope=following') && r.ok());
      await page.getByTestId('feed-tab-following').click();
      await firstPage;

      const seededCards = page.locator('ui-post-card').filter({ hasText: `seed-${tag}-` });
      const loadMore = page.getByTestId('load-more');

      // 25 own posts, page size 20: first page has 20 and a cursor...
      await expect(seededCards).toHaveCount(20);
      await expect(loadMore).toBeVisible();

      // ...one "Load more" fetches the remaining 5 and exhausts the cursor.
      // dispatchEvent instead of click(): the button disappears as a result of this click, and Playwright's
      // click() would keep retrying on the vanished element ("element was detached from the DOM").
      const secondPage = page.waitForResponse(r => /\/feed\?/.test(r.url()) && r.url().includes('cursor=') && r.ok());
      await loadMore.dispatchEvent('click');
      await secondPage;
      await expect(seededCards).toHaveCount(25);
      await expect(loadMore).toHaveCount(0);

      for (const content of seeded) await expect(card(page, content)).toHaveCount(1);
      // no duplicate cards anywhere in the list
      const texts = await page.locator('ui-post-card').allInnerTexts();
      const seededTexts = texts.filter(t => t.includes(`seed-${tag}-`));
      expect(seededTexts).toHaveLength(seeded.length);
    } finally {
      await ctx.close();
    }
  });

  test('switching tabs back and forth keeps each list correct without duplicates', async ({ browser }) => {
    const viewer = await registerUser();
    const friend = await registerUser();
    const stranger = await registerUser();
    await follow(viewer.token, friend.id);
    await waitForFollowProjected(viewer, friend);

    const friendText = `friend ${uniqueSuffix()}`;
    const strangerText = `stranger ${uniqueSuffix()}`;
    await createPost(friend.token, friendText);
    await createPost(stranger.token, strangerText);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await open(page, viewer, ctx);

      for (let round = 0; round < 3; round++) {
        await followingTab(page).click();
        await expect(card(page, friendText)).toHaveCount(1);
        await expect(card(page, strangerText)).toHaveCount(0);

        await forYouTab(page).click();
        await expect(card(page, friendText)).toHaveCount(1);
        await expect(card(page, strangerText)).toHaveCount(1);
      }

      // a live post received after switching shows exactly once in the matching tab
      await selectScope(page, 'following');
      const liveText = `live-after-switch ${uniqueSuffix()}`;
      await createPost(friend.token, liveText);
      await expect(card(page, liveText)).toHaveCount(1);
      await forYouTab(page).click();
      await expect(card(page, liveText)).toHaveCount(1);
    } finally {
      await ctx.close();
    }
  });
});
