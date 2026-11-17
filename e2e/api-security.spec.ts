import { test, expect, request as pwRequest } from '@playwright/test';
import { API, registerUser, createPost, uniqueCredentials, uniqueSuffix } from './support/api';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('api security smoke', () => {
  test("another user's profile does not expose the e-mail; your own does", async () => {
    const me = await registerUser();
    const other = await registerUser();
    const ctx = await pwRequest.newContext();
    try {
      const theirs = await (await ctx.get(`${API}/users/${other.id}`, { headers: bearer(me.token) })).json();
      expect(theirs.username).toBe(other.username);
      expect(theirs).not.toHaveProperty('email');
      const byName = await (await ctx.get(`${API}/users`, { params: { username: other.username }, headers: bearer(me.token) })).json();
      expect(byName).not.toHaveProperty('email');
      const mine = await (await ctx.get(`${API}/users/${me.id}`, { headers: bearer(me.token) })).json();
      expect(mine.email).toBe(me.email);
    } finally {
      await ctx.dispose();
    }
  });

  test('no token -> 401 on /feed', async () => {
    const ctx = await pwRequest.newContext();
    expect((await ctx.get(`${API}/feed`)).status()).toBe(401);
    await ctx.dispose();
  });

  test("deleting another user's post -> 403", async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    const post = await createPost(owner.token, `secure ${uniqueSuffix()}`);
    const ctx = await pwRequest.newContext();
    const res = await ctx.delete(`${API}/posts/${post.id}`, { headers: bearer(intruder.token) });
    expect(res.status()).toBe(403);
    // still deletable by the owner
    expect((await ctx.delete(`${API}/posts/${post.id}`, { headers: bearer(owner.token) })).ok()).toBe(true);
    await ctx.dispose();
  });

  test('self-follow -> 400', async () => {
    const user = await registerUser();
    const ctx = await pwRequest.newContext();
    const res = await ctx.post(`${API}/social/follow`, { data: { followeeId: user.id }, headers: bearer(user.token) });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test('duplicate email in a different case -> 409', async () => {
    const user = await registerUser();
    const other = uniqueCredentials();
    const ctx = await pwRequest.newContext();
    const res = await ctx.post(`${API}/users`, {
      data: { username: other.username, email: user.email.toUpperCase(), password: 'password123' },
    });
    expect(res.status()).toBe(409);
    await ctx.dispose();
  });

  test('bad email -> 400', async () => {
    const creds = uniqueCredentials();
    const ctx = await pwRequest.newContext();
    const res = await ctx.post(`${API}/users`, { data: { ...creds, email: 'not-an-email' } });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });
});
