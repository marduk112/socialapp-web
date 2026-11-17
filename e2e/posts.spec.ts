import { test, expect } from '@playwright/test';
import { registerUser, createPost, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

test.describe('posts', () => {
  test('create, edit and delete own post', async ({ page, context }) => {
    const user = await registerUser();
    await loginViaStorage(context, user);
    const content = `post ${uniqueSuffix()}`;
    const edited = `${content} edited`;

    await page.goto('/feed');
    await page.getByLabel(/What's on your mind/).fill(content);
    await page.getByRole('button', { name: /Post$/ }).click();
    const card = page.locator('ui-post-card').filter({ hasText: content });
    await expect(card).toHaveCount(1);

    await card.getByTestId('post-menu').click();
    await page.getByRole('menuitem', { name: /Edit/ }).click();
    // while editing the content is inside a textarea, so `card` (matched by text) no longer resolves
    await page.getByLabel('Edit post').fill(edited);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('ui-post-card').filter({ hasText: edited })).toHaveCount(1);
    await expect(page.getByText('(edited)').first()).toBeVisible();

    const editedCard = page.locator('ui-post-card').filter({ hasText: edited });
    await editedCard.getByTestId('post-menu').click();
    await page.getByRole('menuitem', { name: /Delete/ }).click();
    await expect(page.locator('ui-post-card').filter({ hasText: edited })).toHaveCount(0);

    await page.reload();
    await expect(page.locator('ui-post-card').filter({ hasText: edited })).toHaveCount(0);
  });

  test("another user's post has no edit/delete controls", async ({ page, context }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const content = `foreign ${uniqueSuffix()}`;
    await createPost(author.token, content);
    await loginViaStorage(context, viewer);

    await page.goto('/feed');
    const card = page.locator('ui-post-card').filter({ hasText: content });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('post-menu')).toHaveCount(0);
  });
});
