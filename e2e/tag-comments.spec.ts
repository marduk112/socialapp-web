import { test, expect } from '@playwright/test';
import { registerUser, createPost, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

test.describe('tag page comments', () => {
  test('comments can be opened and added on /tags/:tag; the count updates', async ({ page, context }) => {
    const user = await registerUser();
    const tag = `tc${uniqueSuffix()}`;
    const content = `tag-comment #${tag} ${uniqueSuffix()}`;
    await createPost(user.token, content);
    await loginViaStorage(context, user);

    await page.goto(`/tags/${tag}`);
    const card = page.locator('ui-post-card').filter({ hasText: content });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('comment-count')).toHaveText('0');

    await card.getByTestId('post-comment-toggle').click();
    const section = page.locator('ui-comment-section');
    await expect(section).toHaveCount(1);

    const commentText = `on tag page ${uniqueSuffix()}`;
    const created = page.waitForResponse(r =>
      r.url().endsWith('/comments') && r.request().method() === 'POST' && r.ok());
    await section.getByLabel('Write a comment…').fill(commentText);
    await section.getByLabel('Write a comment…').press('Enter');
    await created;

    await expect(section.locator('.comment').filter({ hasText: commentText })).toHaveCount(1);
    await expect(card.getByTestId('comment-count')).toHaveText('1');

    // persisted: reopen after reload
    await page.reload();
    await page.locator('ui-post-card').filter({ hasText: content }).getByTestId('post-comment-toggle').click();
    await expect(page.locator('.comment').filter({ hasText: commentText })).toHaveCount(1);
  });
});
