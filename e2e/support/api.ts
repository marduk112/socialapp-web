import { APIRequestContext, request as pwRequest } from '@playwright/test';

/** Backend is addressed directly (not via the dev-server proxy). */
export const API = 'http://localhost:8080/api/v1';

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
  token: string;
}

export function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function uniqueCredentials(): { username: string; email: string; password: string } {
  const username = `u${uniqueSuffix()}`;
  return { username, email: `${username}@example.com`.toLowerCase(), password: 'password123' };
}

async function withApi<T>(fn: (ctx: APIRequestContext) => Promise<T>): Promise<T> {
  const ctx = await pwRequest.newContext();
  try {
    return await fn(ctx);
  } finally {
    await ctx.dispose();
  }
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function ok<T>(res: { ok(): boolean; status(): number; text(): Promise<string>; json(): Promise<T> }, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Registers a user with unique credentials via the API. */
export async function registerUser(): Promise<TestUser> {
  const creds = uniqueCredentials();
  return withApi(async ctx => {
    const body = await ok<{ id: string; token: string }>(
      await ctx.post(`${API}/users`, { data: creds }), 'registerUser');
    return { ...creds, id: body.id, token: body.token };
  });
}

export interface ApiPost {
  id: string; content: string; authorId: string; likesCount: number;
  type?: 'POST' | 'REPOST' | 'QUOTE';
  repostsCount?: number;
  quotesCount?: number;
  viewerReposted?: boolean;
  bookmarked?: boolean;
  original?: ApiPost | null;
  media?: ApiMedia[];
}
export interface ApiMedia { id: string; url: string; width: number | null; height: number | null; }
export interface ApiComment { id: string; content: string; }

export async function createPost(token: string, content: string, mediaIds?: string[]): Promise<ApiPost> {
  return withApi(async ctx =>
    ok<ApiPost>(await ctx.post(`${API}/posts`,
      { data: mediaIds ? { content, mediaIds } : { content }, headers: auth(token) }), 'createPost'));
}

/** Raw POST /posts (no assertion on the status): for negative tests. */
export async function createPostRaw(token: string, content: string, mediaIds: string[]): Promise<number> {
  return withApi(async ctx =>
    (await ctx.post(`${API}/posts`, { data: { content, mediaIds }, headers: auth(token) })).status());
}

/** Uploads an image via multipart (field `file`); throws unless the backend answers 201. */
export async function uploadImage(token: string, name: string, bytes: Buffer, mimeType = 'image/png'): Promise<ApiMedia> {
  return withApi(async ctx =>
    ok<ApiMedia>(await ctx.post(`${API}/media`, {
      multipart: { file: { name, mimeType, buffer: bytes } }, headers: auth(token),
    }), 'uploadImage'));
}

export async function getPost(token: string, id: string): Promise<ApiPost> {
  return withApi(async ctx => ok<ApiPost>(await ctx.get(`${API}/posts/${id}`, { headers: auth(token) }), 'getPost'));
}

/** Tiny valid images (1x1) for upload tests. */
export const IMAGES = {
  png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  gif: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
  jpeg: Buffer.from('/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+mKKKK/Kz/QA/9k=', 'base64'),
  webp: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'),
};

export async function deletePost(token: string, postId: string): Promise<void> {
  await withApi(async ctx => {
    const res = await ctx.delete(`${API}/posts/${postId}`, { headers: auth(token) });
    if (!res.ok()) throw new Error(`deletePost failed: ${res.status()}`);
  });
}

/** Reposts `postId` (an already-reposted post answers 200 with the existing item). */
export async function repost(token: string, postId: string): Promise<ApiPost> {
  return withApi(async ctx =>
    ok<ApiPost>(await ctx.post(`${API}/posts/${postId}/repost`, { headers: auth(token) }), 'repost'));
}

/** `postId` = the ORIGINAL post id. */
export async function undoRepost(token: string, postId: string): Promise<void> {
  await withApi(async ctx => {
    const res = await ctx.delete(`${API}/posts/${postId}/repost`, { headers: auth(token) });
    if (!res.ok()) throw new Error(`undoRepost failed: ${res.status()}`);
  });
}

export async function quote(token: string, postId: string, comment: string, mediaIds?: string[]): Promise<ApiPost> {
  return withApi(async ctx =>
    ok<ApiPost>(await ctx.post(`${API}/posts/${postId}/quote`,
      { data: mediaIds ? { comment, mediaIds } : { comment }, headers: auth(token) }), 'quote'));
}

export async function createComment(token: string, postId: string, content: string, parentCommentId?: string): Promise<ApiComment> {
  return withApi(async ctx =>
    ok<ApiComment>(await ctx.post(`${API}/posts/${postId}/comments`,
      { data: { content, parentCommentId }, headers: auth(token) }), 'createComment'));
}

export async function follow(token: string, followeeId: string): Promise<void> {
  await withApi(async ctx => {
    // Right after registration the user nodes reach Neo4j asynchronously (Kafka), so a follow can
    // legitimately answer 404 for a moment. Retry on 404 only; any other failure is real.
    const deadline = Date.now() + 15_000;
    for (;;) {
      const res = await ctx.post(`${API}/social/follow`, { data: { followeeId }, headers: auth(token) });
      if (res.ok()) return;
      if (res.status() !== 404 || Date.now() > deadline) {
        throw new Error(`follow failed: ${res.status()}`);
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  });
}

export async function getFollowers(token: string, userId: string): Promise<{ userId: string }[]> {
  return withApi(async ctx =>
    ok(await ctx.get(`${API}/social/${userId}/followers`, { headers: auth(token) }), 'getFollowers'));
}

export async function unfollow(token: string, followeeId: string): Promise<void> {
  await withApi(async ctx => {
    const res = await ctx.delete(`${API}/social/follow`, { data: { followeeId }, headers: auth(token) });
    if (!res.ok()) throw new Error(`unfollow failed: ${res.status()}`);
  });
}

export interface ApiFeedPage { items: ApiPost[]; nextCursor: string | null; }
export type FeedScope = 'all' | 'following';

export async function getFeedPage(token: string, scope: FeedScope = 'all', cursor?: string | null, size = 20): Promise<ApiFeedPage> {
  const params: Record<string, string | number> = { scope, size };
  if (cursor) params['cursor'] = cursor;
  return withApi(async ctx =>
    ok(await ctx.get(`${API}/feed`, { params, headers: auth(token) }), 'getFeed'));
}

/** First page items only (default scope = all). */
export async function getFeed(token: string, size = 20, scope: FeedScope = 'all'): Promise<ApiPost[]> {
  return (await getFeedPage(token, scope, undefined, size)).items;
}

export async function getUser(token: string, id: string): Promise<{ bio?: string | null }> {
  return withApi(async ctx =>
    ok(await ctx.get(`${API}/users/${id}`, { headers: auth(token) }), 'getUser'));
}

export async function getHashtagPage(token: string, tag: string, cursor?: string | null, size = 20): Promise<ApiFeedPage> {
  const params: Record<string, string | number> = { size };
  if (cursor) params['cursor'] = cursor;
  return withApi(async ctx =>
    ok(await ctx.get(`${API}/hashtags/${encodeURIComponent(tag)}/posts`, { params, headers: auth(token) }), 'getHashtagPage'));
}

export interface ApiNotification {
  id: string;
  type: 'FOLLOW' | 'LIKE' | 'COMMENT' | 'REPLY' | 'MENTION' | 'REPOST' | 'QUOTE';
  actorId: string;
  actorUsername: string;
  postId: string | null;
  commentId: string | null;
  snippet: string | null;
  read: boolean;
}
export interface ApiNotificationPage { items: ApiNotification[]; nextCursor: string | null; }

/** First page of the caller's notifications (newest first). */
export async function getNotifications(token: string, size = 20, cursor?: string | null): Promise<ApiNotificationPage> {
  const params: Record<string, string | number> = { size };
  if (cursor) params['cursor'] = cursor;
  return withApi(async ctx =>
    ok(await ctx.get(`${API}/notifications`, { params, headers: auth(token) }), 'getNotifications'));
}

export async function unreadCount(token: string): Promise<number> {
  return withApi(async ctx =>
    (await ok<{ count: number }>(await ctx.get(`${API}/notifications/unread-count`, { headers: auth(token) }), 'unreadCount')).count);
}

export async function markAllRead(token: string): Promise<void> {
  await withApi(async ctx => {
    const res = await ctx.post(`${API}/notifications/read`, { data: {}, headers: auth(token) });
    if (!res.ok()) throw new Error(`markAllRead failed: ${res.status()}`);
  });
}

export async function like(token: string, postId: string): Promise<void> {
  await withApi(async ctx => {
    const res = await ctx.post(`${API}/posts/${postId}/like`, { headers: auth(token) });
    if (!res.ok()) throw new Error(`like failed: ${res.status()}`);
  });
}

/** Registers `count` users in parallel chunks. */
export async function registerUsers(count: number, chunk = 5): Promise<TestUser[]> {
  const users: TestUser[] = [];
  for (let i = 0; i < count; i += chunk) {
    users.push(...await Promise.all(Array.from({ length: Math.min(chunk, count - i) }, () => registerUser())));
  }
  return users;
}

/** Idempotent (204). */
export async function bookmark(token: string, postId: string): Promise<void> {
  await withApi(async ctx => {
    const res = await ctx.put(`${API}/posts/${postId}/bookmark`, { headers: auth(token) });
    if (!res.ok()) throw new Error(`bookmark failed: ${res.status()}`);
  });
}

export async function unbookmark(token: string, postId: string): Promise<void> {
  await withApi(async ctx => {
    const res = await ctx.delete(`${API}/posts/${postId}/bookmark`, { headers: auth(token) });
    if (!res.ok()) throw new Error(`unbookmark failed: ${res.status()}`);
  });
}

/** One page of the caller's bookmarks (newest bookmarked first). */
export async function getBookmarkPage(token: string, cursor?: string | null, size = 20): Promise<ApiFeedPage> {
  const params: Record<string, string | number> = { size };
  if (cursor) params['cursor'] = cursor;
  return withApi(async ctx =>
    ok(await ctx.get(`${API}/bookmarks`, { params, headers: auth(token) }), 'getBookmarks'));
}

/** First page items only. */
export async function getBookmarks(token: string, size = 20): Promise<ApiPost[]> {
  return (await getBookmarkPage(token, undefined, size)).items;
}
