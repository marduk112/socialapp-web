import { test, expect, Page } from '@playwright/test';
import { createPost, registerUser, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

const composer = (page: Page) => page.getByLabel(/What's on your mind/);
const postButton = (page: Page) => page.getByRole('button', { name: /Post$/ });
const counter = (page: Page) => page.getByTestId('compose-counter');
const card = (page: Page, text: string) => page.locator('ui-post-card').filter({ hasText: text });

test.describe('hashtags and mentions', () => {
  // Seeds 25 posts in one test; keep everything serial like the Following-feed spec.
  test.describe.configure({ mode: 'serial' });

  test('composer counter: updates, 500 ok, 501 error + disabled, emoji counts as one', async ({ page, context }) => {
    const user = await registerUser();
    await loginViaStorage(context, user);
    await page.goto('/feed');

    await expect(counter(page)).toHaveText('0/500');
    await expect(postButton(page)).toBeDisabled();

    await composer(page).fill('hello');
    await expect(counter(page)).toHaveText('5/500');
    await expect(postButton(page)).toBeEnabled();

    await composer(page).fill('a'.repeat(500));
    await expect(counter(page)).toHaveText('500/500');
    await expect(counter(page)).toHaveAttribute('data-state', 'warn');
    await expect(postButton(page)).toBeEnabled();

    await composer(page).fill('a'.repeat(501));
    await expect(counter(page)).toHaveText('501/500');
    await expect(counter(page)).toHaveAttribute('data-state', 'error');
    await expect(postButton(page)).toBeDisabled();

    // 499 chars + 1 emoji (2 UTF-16 units, 1 code point) = 500 -> still ok
    await composer(page).fill('a'.repeat(499) + '\u{1F600}');
    await expect(counter(page)).toHaveText('500/500');
    await expect(counter(page)).toHaveAttribute('data-state', 'warn');
    await expect(postButton(page)).toBeEnabled();
  });

  test('hashtag and mention render as links and navigate; post is listed once on the tag page', async ({ page, context }) => {
    const author = await registerUser();
    const mentioned = await registerUser();
    await loginViaStorage(context, author);
    await page.goto('/feed');

    const tag = `Angular${uniqueSuffix()}`;
    const text = `hi #${tag} and @${mentioned.username} ${uniqueSuffix()}`;
    await composer(page).fill(text);
    await postButton(page).click();

    const mine = card(page, 'hi #');
    await expect(mine).toHaveCount(1);
    const hashtagLink = mine.getByTestId('hashtag-link');
    const mentionLink = mine.getByTestId('mention-link');
    await expect(hashtagLink).toHaveText(`#${tag}`);
    await expect(mentionLink).toHaveText(`@${mentioned.username}`);

    await hashtagLink.click();
    await expect(page).toHaveURL(new RegExp(`/tags/${tag.toLowerCase()}$`));
    await expect(page.getByTestId('tag-title')).toHaveText(`#${tag.toLowerCase()}`);
    await expect(card(page, text)).toHaveCount(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/feed$/);
    await card(page, text).getByTestId('mention-link').click();
    await expect(page).toHaveURL(new RegExp(`/users/${mentioned.id}$`));
  });

  test('an unknown @mention stays plain text', async ({ page, context }) => {
    const user = await registerUser();
    await loginViaStorage(context, user);
    await page.goto('/feed');

    const text = `ping @unknown_user_xyz ${uniqueSuffix()}`;
    await composer(page).fill(text);
    await postButton(page).click();
    const mine = card(page, text);
    await expect(mine).toHaveCount(1);
    await expect(mine.getByTestId('mention-link')).toHaveCount(0);
  });

  test('live SSE post with a hashtag arrives already rendered as a link', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, viewer);
      const page = await ctx.newPage();
      await page.goto('/feed');
      await expect(page.getByText('Live updates active')).toBeVisible();

      const tag = `live${uniqueSuffix()}`;
      await createPost(author.token, `breaking #${tag}`);
      const live = card(page, 'breaking #');
      await expect(live).toHaveCount(1);
      await expect(live.getByTestId('hashtag-link')).toHaveText(`#${tag}`);
    } finally {
      await ctx.close();
    }
  });

  test('tag page Load more appends the rest without duplicates', async ({ browser }) => {
    const author = await registerUser();
    const tag = `t${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      await createPost(author.token, `tagseed-${String(i).padStart(2, '0')} #${tag}`);
    }

    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, author);
      const page = await ctx.newPage();
      const firstPage = page.waitForResponse(r => r.url().includes('/hashtags/') && !r.url().includes('cursor=') && r.ok());
      await page.goto(`/tags/${tag}`);
      await firstPage;

      const cards = page.locator('ui-post-card').filter({ hasText: 'tagseed-' });
      const loadMore = page.getByTestId('load-more');
      await expect(cards).toHaveCount(20);
      await expect(loadMore).toBeVisible();

      // dispatchEvent: the button disappears because of this click (see CLAUDE.md E2E pitfalls)
      const secondPage = page.waitForResponse(r => r.url().includes('/hashtags/') && r.url().includes('cursor=') && r.ok());
      await loadMore.dispatchEvent('click');
      await secondPage;
      await expect(cards).toHaveCount(25);
      await expect(loadMore).toHaveCount(0);

      const texts = await cards.allInnerTexts();
      expect(new Set(texts.map(t => t.match(/tagseed-\d+/)?.[0])).size).toBe(25);
    } finally {
      await ctx.close();
    }
  });

  test('tag page shows the empty state for an unused tag', async ({ page, context }) => {
    const user = await registerUser();
    await loginViaStorage(context, user);
    const tag = `empty${uniqueSuffix()}`;
    await page.goto(`/tags/${tag}`);
    await expect(page.getByText(`No posts with #${tag} yet.`)).toBeVisible();
  });
});
