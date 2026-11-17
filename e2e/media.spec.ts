import { test, expect, Page, BrowserContext } from '@playwright/test';
import {
  IMAGES, bookmark, createPost, createPostRaw, getFeed, getPost, quote, registerUser, uniqueSuffix, uploadImage, TestUser,
} from './support/api';
import { loginViaStorage } from './support/auth';

const card = (page: Page, text: string) => page.locator('ui-post-card').filter({ hasText: text });
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: IMAGES.png });

async function openFeed(page: Page, ctx: BrowserContext, user: TestUser) {
  await loginViaStorage(ctx, user);
  await page.goto('/feed');
  await expect(page.getByText('Live updates active')).toBeVisible();
}

const composer = (page: Page) => page.getByTestId('compose-card');
const readyPreviews = (scope: ReturnType<typeof composer>) =>
  scope.locator('[data-testid="media-preview"][data-state="ready"]');

/** Own media of a card (not the ones inside a quote embed). */
const ownMedia = (c: ReturnType<typeof card>) => c.locator('mat-card-content > ui-post-media');

/** The image really decoded (not a broken link). */
async function expectLoaded(img: ReturnType<Page['locator']>) {
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
}

test.describe('post images', () => {
  test.describe.configure({ mode: 'serial' });

  test('two images in the composer: previews, post, grid on the feed and after reload', async ({ browser }) => {
    const user = await registerUser();
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, user);
      const compose = composer(page);

      await compose.getByTestId('media-input').setInputFiles([png('one.png'), png('two.png')]);
      await expect(compose.getByTestId('media-preview')).toHaveCount(2);
      await expect(readyPreviews(compose)).toHaveCount(2);

      const text = `with images ${uniqueSuffix()}`;
      await page.getByLabel(/What's on your mind/).fill(text);
      const created = page.waitForResponse(r => r.url().endsWith('/posts') && r.request().method() === 'POST' && r.status() === 201);
      await compose.getByRole('button', { name: /Post$/ }).click();
      await created;

      // previews are cleared on success
      await expect(compose.getByTestId('media-preview')).toHaveCount(0);

      const c = card(page, text);
      await expect(c).toHaveCount(1);
      await expect(ownMedia(c).getByTestId('post-media')).toHaveAttribute('data-count', '2');
      await expect(c.getByTestId('post-media-img')).toHaveCount(2);
      await expectLoaded(c.getByTestId('post-media-img').first());
      await expect(c.getByTestId('post-media-img').first()).toHaveAttribute('alt', `Image attached to ${user.username}'s post`);

      await page.reload();
      const persisted = card(page, text);
      await expect(persisted).toHaveCount(1);
      await expect(persisted.getByTestId('post-media-img')).toHaveCount(2);
      await expectLoaded(persisted.getByTestId('post-media-img').last());
    } finally {
      await ctx.close();
    }
  });

  test('at most 4 images: the 5th is rejected', async ({ browser }) => {
    const user = await registerUser();
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, user);
      const compose = composer(page);

      await compose.getByTestId('media-input').setInputFiles([1, 2, 3, 4, 5].map(i => png(`img${i}.png`)));
      await expect(compose.getByTestId('media-preview')).toHaveCount(4);
      await expect(compose.getByTestId('media-error')).toContainText('up to 4');
      await expect(readyPreviews(compose)).toHaveCount(4);
      await expect(compose.getByTestId('media-add-btn')).toBeDisabled();

      // removing one frees a slot
      await compose.getByTestId('media-remove').first().click();
      await expect(compose.getByTestId('media-preview')).toHaveCount(3);
      await expect(compose.getByTestId('media-add-btn')).toBeEnabled();
    } finally {
      await ctx.close();
    }
  });

  test('a non-image file shows an error and never becomes a ready preview; the post works without it', async ({ browser }) => {
    const user = await registerUser();
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, user);
      const compose = composer(page);
      const text = `no image ${uniqueSuffix()}`;
      await page.getByLabel(/What's on your mind/).fill(text);
      const post = compose.getByRole('button', { name: /Post$/ });

      // rejected by the client pre-check (wrong MIME type)
      await compose.getByTestId('media-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
      await expect(compose.getByTestId('media-error')).toBeVisible();
      await expect(compose.getByTestId('media-preview')).toHaveCount(0);
      await expect(post).toBeEnabled();

      // looks like a PNG to the browser but is text: the backend answers 415, the item fails and blocks submit until removed
      await compose.getByTestId('media-input').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
      const failed = compose.locator('[data-testid="media-preview"][data-state="failed"]');
      await expect(failed).toHaveCount(1);
      await expect(readyPreviews(compose)).toHaveCount(0);
      await expect(post).toBeDisabled();

      await failed.getByTestId('media-remove').click();
      await expect(compose.getByTestId('media-preview')).toHaveCount(0);
      await expect(post).toBeEnabled();
      await post.click();
      const c = card(page, text);
      await expect(c).toHaveCount(1);
      await expect(c.getByTestId('post-media')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('a preview can be removed before posting: the post has no images', async ({ browser }) => {
    const user = await registerUser();
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, user);
      const compose = composer(page);

      await compose.getByTestId('media-input').setInputFiles(png('gone.png'));
      await expect(readyPreviews(compose)).toHaveCount(1);
      await compose.getByTestId('media-remove').click();
      await expect(compose.getByTestId('media-preview')).toHaveCount(0);

      const text = `removed ${uniqueSuffix()}`;
      await page.getByLabel(/What's on your mind/).fill(text);
      await compose.getByRole('button', { name: /Post$/ }).click();
      const c = card(page, text);
      await expect(c).toHaveCount(1);
      await expect(c.getByTestId('post-media')).toHaveCount(0);
      expect((await getFeed(user.token)).find(p => p.content === text)?.media ?? []).toHaveLength(0);
    } finally {
      await ctx.close();
    }
  });

  test('lightbox opens on click and Escape closes it', async ({ browser }) => {
    const user = await registerUser();
    const text = `lightbox ${uniqueSuffix()}`;
    const m = await uploadImage(user.token, 'l.png', IMAGES.png);
    await createPost(user.token, text, [m.id]);
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, user);
      await card(page, text).getByTestId('post-media-img').click();
      await expect(page.getByTestId('media-lightbox')).toBeVisible();
      await expect(page.getByTestId('media-lightbox-img')).toHaveAttribute('src', m.url);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('media-lightbox')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('a live post with an image shows it once in another user\'s open feed', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, viewer);

      const text = `live image ${uniqueSuffix()}`;
      const m = await uploadImage(author.token, 'live.png', IMAGES.png);
      await createPost(author.token, text, [m.id]);

      const c = card(page, text);
      await expect(c).toHaveCount(1);
      await expect(c.getByTestId('post-media-img')).toHaveCount(1);
      await expect(c.getByTestId('post-media-img')).toHaveAttribute('src', m.url);
      await expectLoaded(c.getByTestId('post-media-img'));

      await page.reload();
      await expect(card(page, text)).toHaveCount(1);
      await expect(card(page, text).getByTestId('post-media-img')).toHaveCount(1);
    } finally {
      await ctx.close();
    }
  });

  test('a QUOTE with an image shows it in the quote and the original\'s image in the embed', async ({ browser }) => {
    const author = await registerUser();
    const quoter = await registerUser();
    const originalText = `quoted original ${uniqueSuffix()}`;
    const origMedia = await uploadImage(author.token, 'o.png', IMAGES.png);
    await createPost(author.token, originalText, [origMedia.id]);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await openFeed(page, ctx, quoter);

      const origCard = card(page, originalText).filter({ hasNot: page.getByTestId('quote-embed') });
      await expect(origCard).toHaveCount(1);
      await origCard.getByTestId('repost-btn').click();
      await page.getByTestId('quote-action').click();
      const form = origCard.getByTestId('quote-form');
      await form.getByTestId('media-input').setInputFiles(png('q.png'));
      await expect(readyPreviews(form)).toHaveCount(1);

      const comment = `my quote ${uniqueSuffix()}`;
      await form.getByTestId('quote-input').fill(comment);
      const done = page.waitForResponse(r => r.url().endsWith('/quote') && r.request().method() === 'POST' && r.status() === 201);
      await form.getByTestId('quote-submit').click();
      await done;
      await expect(origCard.getByTestId('quote-form')).toHaveCount(0);

      const qc = card(page, comment);
      await expect(qc).toHaveCount(1);
      await expect(ownMedia(qc).getByTestId('post-media-img')).toHaveCount(1);
      await expect(qc.getByTestId('quote-embed').getByTestId('post-media-img')).toHaveCount(1);

      await page.reload();
      const persisted = card(page, comment);
      await expect(persisted).toHaveCount(1);
      await expect(ownMedia(persisted).getByTestId('post-media-img')).toHaveCount(1);
      await expect(persisted.getByTestId('quote-embed').getByTestId('post-media-img')).toHaveCount(1);
    } finally {
      await ctx.close();
    }
  });

  test('media survives on /posts/:id and /bookmarks', async ({ browser }) => {
    const author = await registerUser();
    const viewer = await registerUser();
    const text = `persisted media ${uniqueSuffix()}`;
    const m = await uploadImage(author.token, 'p.png', IMAGES.png);
    const post = await createPost(author.token, text, [m.id, (await uploadImage(author.token, 'p2.jpg', IMAGES.jpeg, 'image/jpeg')).id]);
    expect((await getPost(viewer.token, post.id)).media).toHaveLength(2);
    await bookmark(viewer.token, post.id);

    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, viewer);
      const page = await ctx.newPage();
      await page.goto(`/posts/${post.id}`);
      await expect(page.getByTestId('post-detail')).toBeVisible();
      await expect(card(page, text).getByTestId('post-media-img')).toHaveCount(2);

      await page.goto('/bookmarks');
      await expect(page.getByTestId('bookmarks-page')).toBeVisible();
      await expect(card(page, text).getByTestId('post-media-img')).toHaveCount(2);
    } finally {
      await ctx.close();
    }
  });

  test('API: a foreign upload cannot be attached to a post or quote', async () => {
    const owner = await registerUser();
    const thief = await registerUser();
    const m = await uploadImage(owner.token, 'mine.png', IMAGES.png);

    const status = await createPostRaw(thief.token, `stolen ${uniqueSuffix()}`, [m.id]);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);

    // the owner can still use it
    const post = await createPost(owner.token, `mine ${uniqueSuffix()}`, [m.id]);
    expect(post.media?.map(x => x.id)).toEqual([m.id]);

    // quote with someone else's upload is rejected too
    const other = await uploadImage(owner.token, 'other.png', IMAGES.png);
    await expect(quote(thief.token, post.id, 'q', [other.id])).rejects.toThrow(/quote failed: 4\d\d/);
  });
});
