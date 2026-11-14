import { test, expect, Locator } from '@playwright/test';
import { registerUser, createPost, createComment, getFeed, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

const likes = (scope: Locator) => scope.getByTestId('like-count');
const dislikes = (scope: Locator) => scope.getByTestId('dislike-count');

test.describe('reactions', () => {
  test('like / dislike a post, counters update and toggling works', async ({ page, context }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const content = `react ${uniqueSuffix()}`;
    await createPost(author.token, content);
    await loginViaStorage(context, viewer);

    await page.goto('/feed');
    const card = page.locator('ui-post-card').filter({ hasText: content });
    await expect(card).toHaveCount(1);
    await expect(likes(card)).toHaveText('0');

    await card.getByTestId('like-btn').click();
    await expect(likes(card)).toHaveText('1');
    await expect(card.locator('.active-like')).toHaveCount(1);

    // switching to dislike removes the like
    await card.getByTestId('dislike-btn').click();
    await expect(dislikes(card)).toHaveText('1');
    await expect(likes(card)).toHaveText('0');

    // toggling off
    await card.getByTestId('dislike-btn').click();
    await expect(dislikes(card)).toHaveText('0');
    await expect(card.locator('.active-dislike')).toHaveCount(0);
  });

  test('like / dislike a comment', async ({ page, context }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const content = `creact ${uniqueSuffix()}`;
    const post = await createPost(author.token, content);
    const commentText = `comment ${uniqueSuffix()}`;
    await createComment(author.token, post.id, commentText);
    await loginViaStorage(context, viewer);

    await page.goto('/feed');
    const card = page.locator('ui-post-card').filter({ hasText: content });
    await card.getByTestId('post-comment-toggle').click();
    const comment = page.locator('.comment').filter({ hasText: commentText });
    await expect(comment).toHaveCount(1);

    await comment.getByTestId('like-btn').click();
    await expect(likes(comment)).toHaveText('1');
    await comment.getByTestId('dislike-btn').click();
    await expect(dislikes(comment)).toHaveText('1');
    await expect(likes(comment)).toHaveText('0');
    await comment.getByTestId('dislike-btn').click();
    await expect(dislikes(comment)).toHaveText('0');
  });

  test('double-click on like ends consistent, no error toast', async ({ page, context }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const content = `dbl ${uniqueSuffix()}`;
    await createPost(author.token, content);
    await loginViaStorage(context, viewer);

    await page.goto('/feed');
    const card = page.locator('ui-post-card').filter({ hasText: content });
    await expect(card).toHaveCount(1);

    // count the reaction requests so we assert only after both responses have been handled
    const responses: number[] = [];
    page.on('response', r => {
      if (/\/posts\/[^/]+\/like$/.test(new URL(r.url()).pathname)) responses.push(r.status());
    });

    await card.getByTestId('like-btn').dblclick();
    await expect.poll(() => responses.length).toBe(2);
    expect(responses.every(s => s < 500), `reaction responses: ${responses}`).toBe(true);
    await expect(page.getByText('Reaction failed')).toHaveCount(0);

    // UI must agree with the server (source of truth) and with its own highlighted state
    const serverLikes = async () =>
      (await getFeed(viewer.token)).find(p => p.content === content)!.likesCount;
    await expect.poll(async () => Number(await likes(card).innerText())).toBe(await serverLikes());
    const n = Number(await likes(card).innerText());
    expect([0, 1]).toContain(n);
    expect(await card.locator('.active-like').count()).toBe(n);

    await page.reload();
    await expect(likes(page.locator('ui-post-card').filter({ hasText: content }))).toHaveText(String(n));
  });
});
