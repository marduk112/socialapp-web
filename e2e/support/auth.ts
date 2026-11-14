import { BrowserContext, Page } from '@playwright/test';
import { TestUser } from './api';

export const STORAGE_KEY = 'socialapp_current_user';

/** Shape stored by CurrentUserService.setUser(). */
export function sessionOf(user: TestUser, overrides: Record<string, unknown> = {}) {
  return { id: user.id, username: user.username, email: user.email, token: user.token, ...overrides };
}

/** Fast path: injects the session into localStorage before any page script runs. */
export async function loginViaStorage(context: BrowserContext, user: TestUser): Promise<void> {
  const value = JSON.stringify(sessionOf(user));
  await context.addInitScript(([key, v]) => {
    // Only seed when empty so a later in-app logout / session clear is not undone on reload.
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, v);
  }, [STORAGE_KEY, value] as const);
}

/** Slow path: real login form. */
export async function loginViaUi(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username or Email').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
