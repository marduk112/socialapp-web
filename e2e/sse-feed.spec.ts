import { test, expect } from '@playwright/test';
import { createPost, quote, registerUser, uniqueSuffix } from './support/api';
import { loginViaStorage } from './support/auth';

test.describe('SSE live feed', () => {
  test('a live quote shows the quote text and the embedded original, exactly once', async ({ browser }) => {
    const author = await registerUser();
    const sharer = await registerUser();
    const viewer = await registerUser();

    const originalText = `original ${uniqueSuffix()}`;
    const original = await createPost(author.token, originalText);

    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, viewer);
      const page = await ctx.newPage();
      await page.goto('/feed');
      // the viewer must be subscribed before the share happens
      await expect(page.getByText('Live updates active')).toBeVisible();

      const comment = `my take ${uniqueSuffix()}`;
      await quote(sharer.token, original.id, comment);

      // Arrives over SSE (no reload): the quote text, the quoter and the embedded original (text + author) are rendered.
      const shareCard = page.locator('ui-post-card').filter({ hasText: comment });
      await expect(shareCard).toHaveCount(1);
      await expect(shareCard.getByText(sharer.username, { exact: true })).toBeVisible();
      const embed = shareCard.getByTestId('quote-embed');
      await expect(embed.getByText(originalText)).toBeVisible();
      await expect(embed.getByText(author.username, { exact: true })).toBeVisible();

      // After a reload the persisted copy looks the same and is still shown once.
      await page.reload();
      const persisted = page.locator('ui-post-card').filter({ hasText: comment });
      await expect(persisted).toHaveCount(1);
      await expect(persisted.getByText(sharer.username, { exact: true })).toBeVisible();
      await expect(persisted.getByTestId('quote-embed').getByText(originalText)).toBeVisible();
      await expect(persisted.getByTestId('quote-embed').getByText(author.username, { exact: true })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("A's post appears in B's feed live, exactly once", async ({ browser }) => {
    const a = await registerUser();
    const b = await registerUser();

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      await loginViaStorage(ctxA, a);
      await loginViaStorage(ctxB, b);
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await pageA.goto('/feed');
      await pageB.goto('/feed');
      // B must be subscribed before A posts
      await expect(pageB.getByText('Live updates active')).toBeVisible();
      await expect(pageA.getByText('Live updates active')).toBeVisible();

      const content = `live ${uniqueSuffix()}`;
      await pageA.getByLabel(/What's on your mind/).fill(content);
      await pageA.getByRole('button', { name: /Post$/ }).click();

      const inB = pageB.locator('ui-post-card').filter({ hasText: content });
      await expect(inB).toHaveCount(1);          // arrived without reload
      const inA = pageA.locator('ui-post-card').filter({ hasText: content });
      await expect(inA).toHaveCount(1);          // author sees REST + SSE copy deduped

      // a second post must not duplicate the first one
      const second = `live2 ${uniqueSuffix()}`;
      await pageA.getByLabel(/What's on your mind/).fill(second);
      await pageA.getByRole('button', { name: /Post$/ }).click();
      await expect(pageB.locator('ui-post-card').filter({ hasText: second })).toHaveCount(1);
      await expect(inB).toHaveCount(1);

      // after reload the persisted feed + (empty) live list still show each post once
      await pageB.reload();
      await expect(pageB.locator('ui-post-card').filter({ hasText: content })).toHaveCount(1);
      await expect(pageB.locator('ui-post-card').filter({ hasText: second })).toHaveCount(1);
      await expect(pageB.getByText('Live updates active')).toBeVisible();
      await expect(pageB.locator('ui-post-card').filter({ hasText: content })).toHaveCount(1);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
