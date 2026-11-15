import { test, expect } from '@playwright/test';
import {
  createComment, createPost, follow, getNotifications, like, markAllRead, quote, registerUser, registerUsers,
  repost, unreadCount, uniqueSuffix,
} from './support/api';
import { loginViaStorage } from './support/auth';

test.describe.configure({ mode: 'serial' });

/** Notifications are produced asynchronously (outbox -> Kafka -> consumer): always poll, never sleep. */
async function waitForUnread(token: string, expected: number): Promise<void> {
  await expect.poll(() => unreadCount(token), { timeout: 20_000 }).toBe(expected);
}

test.describe('notifications', () => {
  test('a follow shows live in the bell, opens the actor profile and clears the badge', async ({ browser }) => {
    const viewer = await registerUser();
    const follower = await registerUser();
    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, viewer);
      const page = await ctx.newPage();
      // subscribed to the notifications stream before the action happens
      const streamOpen = page.waitForResponse(r => /notifications\/stream/.test(r.url()));
      await page.goto('/feed');
      await streamOpen;

      await follow(follower.token, viewer.id);

      const badge = page.getByTestId('notif-badge');
      await expect(badge).toHaveText('1');   // arrived over SSE, no reload

      await page.getByTestId('notif-bell').click();
      const item = page.getByTestId('notif-menu').getByTestId('notif-item');
      await expect(item).toHaveCount(1);
      await expect(item).toContainText(`${follower.username} started following you`);
      await expect(item).toHaveAttribute('data-unread', 'true');

      const marked = page.waitForResponse(r => /notifications\/read/.test(r.url()) && r.request().method() === 'POST');
      await item.click();
      await marked;
      await expect(page).toHaveURL(new RegExp(`/users/${follower.id}$`));
      await expect(badge).toHaveCount(0);

      await page.reload();
      await expect(page.getByTestId('notif-bell')).toBeVisible();
      await expect(badge).toHaveCount(0);
      expect(await unreadCount(viewer.token)).toBe(0);
    } finally {
      await ctx.close();
    }
  });

  test('like, comment, reply, repost, quote and mention each notify once with the right sentence', async ({ browser }) => {
    const viewer = await registerUser();
    const other = await registerUser();
    const third = await registerUser();

    const post = await createPost(viewer.token, `my post ${uniqueSuffix()}`);
    const thirdPost = await createPost(third.token, `third post ${uniqueSuffix()}`);
    const myComment = await createComment(viewer.token, thirdPost.id, `my comment ${uniqueSuffix()}`);

    await like(other.token, post.id);
    await createComment(other.token, post.id, `nice post ${uniqueSuffix()}`);
    await createComment(other.token, thirdPost.id, `replying ${uniqueSuffix()}`, myComment.id);
    await repost(other.token, post.id);
    await quote(other.token, post.id, `quoting ${uniqueSuffix()}`);
    await createPost(other.token, `hello @${viewer.username} ${uniqueSuffix()}`);

    await waitForUnread(viewer.token, 6);

    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, viewer);
      const page = await ctx.newPage();
      await page.goto('/notifications');
      const items = page.getByTestId('notifications-page').getByTestId('notif-item');
      await expect(items).toHaveCount(6);
      for (const sentence of [
        'liked your post', 'commented on your post', 'replied to your comment',
        'reposted your post', 'quoted your post', 'mentioned you in a post',
      ]) {
        await expect(items.filter({ hasText: `${other.username} ${sentence}` })).toHaveCount(1);
      }
      await expect(page.getByTestId('notif-badge')).toHaveText('6');
    } finally {
      await ctx.close();
    }
  });

  test('self actions never notify', async () => {
    const viewer = await registerUser();
    const other = await registerUser();
    const post = await createPost(viewer.token, `solo post ${uniqueSuffix()}`);
    await like(viewer.token, post.id);
    await createComment(viewer.token, post.id, `talking to myself ${uniqueSuffix()}`);

    // barrier: once this foreign like is visible, the earlier self actions have had their chance
    await like(other.token, post.id);
    await waitForUnread(viewer.token, 1);
    const page = await getNotifications(viewer.token);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].actorId).toBe(other.id);
    expect(page.items[0].type).toBe('LIKE');
  });

  test('"Mark all as read" in the UI clears the badge and the unread style', async ({ browser }) => {
    const viewer = await registerUser();
    const [f1, f2] = await registerUsers(2);
    await follow(f1.token, viewer.id);
    await follow(f2.token, viewer.id);
    await waitForUnread(viewer.token, 2);

    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, viewer);
      const page = await ctx.newPage();
      await page.goto('/notifications');
      const items = page.getByTestId('notifications-page').getByTestId('notif-item');
      await expect(items).toHaveCount(2);
      await expect(items.and(page.locator('[data-unread="true"]'))).toHaveCount(2);
      await expect(page.getByTestId('notif-badge')).toHaveText('2');

      const marked = page.waitForResponse(r => /notifications\/read/.test(r.url()) && r.request().method() === 'POST');
      await page.getByTestId('notifications-page').getByTestId('notif-mark-all').click();
      await marked;

      await expect(page.getByTestId('notif-badge')).toHaveCount(0);
      await expect(items.and(page.locator('[data-unread="false"]'))).toHaveCount(2);
      expect(await unreadCount(viewer.token)).toBe(0);

      await page.reload();
      await expect(items).toHaveCount(2);
      await expect(items.and(page.locator('[data-unread="false"]'))).toHaveCount(2);
    } finally {
      await ctx.close();
    }
  });

  test('Load more pages through 25 notifications', async ({ browser }) => {
    test.setTimeout(120_000);
    const viewer = await registerUser();
    const followers = await registerUsers(25);
    for (let i = 0; i < followers.length; i += 5) {
      await Promise.all(followers.slice(i, i + 5).map(f => follow(f.token, viewer.id)));
    }
    await waitForUnread(viewer.token, 25);

    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, viewer);
      const page = await ctx.newPage();
      await page.goto('/notifications');
      const items = page.getByTestId('notifications-page').getByTestId('notif-item');
      await expect(items).toHaveCount(20);
      await expect(page.getByTestId('notif-badge')).toHaveText('25');

      const loadMore = page.getByTestId('notif-load-more');
      await expect(loadMore).toBeVisible();
      // the button disappears with the last page: dispatchEvent instead of click()
      const nextPage = page.waitForResponse(r => /\/notifications\?/.test(r.url()) && r.url().includes('cursor='));
      await loadMore.dispatchEvent('click');
      await nextPage;

      await expect(items).toHaveCount(25);
      await expect(loadMore).toHaveCount(0);
      // each follower exactly once
      for (const f of followers.slice(0, 3)) {
        await expect(items.filter({ hasText: `${f.username} started following you` })).toHaveCount(1);
      }
    } finally {
      await ctx.close();
    }
  });

  test('a comment notification opens /posts/:id with the post and its comment; unknown id shows not found', async ({ browser }) => {
    const viewer = await registerUser();
    const other = await registerUser();
    const content = `detail post ${uniqueSuffix()}`;
    const post = await createPost(viewer.token, content);
    const commentText = `detail comment ${uniqueSuffix()}`;
    await createComment(other.token, post.id, commentText);
    await waitForUnread(viewer.token, 1);

    const ctx = await browser.newContext();
    try {
      await loginViaStorage(ctx, viewer);
      const page = await ctx.newPage();
      await page.goto('/notifications');
      await page.getByTestId('notifications-page').getByTestId('notif-item')
        .filter({ hasText: `${other.username} commented on your post` }).click();

      await expect(page).toHaveURL(new RegExp(`/posts/${post.id}$`));
      const detail = page.getByTestId('post-detail');
      await expect(detail.locator('ui-post-card')).toHaveCount(1);
      await expect(detail.locator('ui-post-card')).toContainText(content);
      await expect(detail.locator('.comment').filter({ hasText: commentText })).toHaveCount(1);
      await expect(page.getByTestId('notif-badge')).toHaveCount(0);

      await page.goto('/posts/00000000-0000-0000-0000-000000000000');
      await expect(page.getByTestId('post-not-found')).toHaveText('Post not found.');
    } finally {
      await ctx.close();
    }
  });

  test("user B never sees user A's notifications", async () => {
    const a = await registerUser();
    const b = await registerUser();
    const actor = await registerUser();
    await follow(actor.token, a.id);
    await waitForUnread(a.token, 1);

    expect((await getNotifications(b.token)).items).toHaveLength(0);
    expect(await unreadCount(b.token)).toBe(0);
    await markAllRead(b.token);
    expect(await unreadCount(a.token)).toBe(1);
    expect((await getNotifications(a.token)).items.map(n => n.actorId)).toEqual([actor.id]);
  });
});
