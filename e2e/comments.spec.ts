import { test, expect } from '@playwright/test';
import { registerUser, createPost, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

test.describe('comments', () => {
  test('add a comment and a reply', async ({ page, context }) => {
    const user = await registerUser();
    const content = `thread ${uniqueSuffix()}`;
    await createPost(user.token, content);
    await loginViaStorage(context, user);

    await page.goto('/feed');
    const card = page.locator('ui-post-card').filter({ hasText: content });
    await card.getByTestId('post-comment-toggle').click();

    const section = page.locator('ui-comment-section');
    const commentText = `first ${uniqueSuffix()}`;
    await section.getByLabel('Write a comment…').fill(commentText);
    await section.getByLabel('Write a comment…').press('Enter');
    const comment = section.locator('.comment').filter({ hasText: commentText });
    await expect(comment).toHaveCount(1);

    const replyText = `reply ${uniqueSuffix()}`;
    await comment.getByRole('button', { name: /Reply/ }).click();
    await section.getByLabel('Write a reply…').fill(replyText);
    await section.getByLabel('Write a reply…').press('Enter');
    await expect(section.locator('.comment-reply').filter({ hasText: replyText })).toHaveCount(1);

    // persisted: reopen after reload
    await page.reload();
    await page.locator('ui-post-card').filter({ hasText: content })
      .getByTestId('post-comment-toggle').click();
    await expect(page.locator('.comment').filter({ hasText: commentText })).toHaveCount(1);
    await expect(page.locator('.comment-reply').filter({ hasText: replyText })).toHaveCount(1);
  });
});
