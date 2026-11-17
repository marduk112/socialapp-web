import { test, expect } from '@playwright/test';
import { registerUser, uniqueCredentials } from './support/api';
import { STORAGE_KEY, loginViaUi } from './support/auth';

test.describe('auth', () => {
  test('register via UI lands on /feed', async ({ page }) => {
    const creds = uniqueCredentials();
    await page.goto('/create-profile');
    await page.getByLabel('Username').fill(creds.username);
    await page.getByLabel('Email').fill(creds.email);
    await page.getByLabel('Password').fill(creds.password);
    await page.getByRole('button', { name: 'Create Profile' }).click();

    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByText(`What's on your mind, ${creds.username}?`)).toBeVisible();
    const stored = await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY);
    expect(JSON.parse(stored!).token).toBeTruthy();
  });

  test('login by username', async ({ page }) => {
    const user = await registerUser();
    await loginViaUi(page, user.username, user.password);
    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByText(`What's on your mind, ${user.username}?`)).toBeVisible();
  });

  test('login by email', async ({ page }) => {
    const user = await registerUser();
    await loginViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByText(`What's on your mind, ${user.username}?`)).toBeVisible();
  });

  test('wrong password shows an error and stays on /login', async ({ page }) => {
    const user = await registerUser();
    await loginViaUi(page, user.username, 'definitely-wrong');
    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
  });

  test('invalid registration (password too short) does not log in', async ({ page }) => {
    const creds = uniqueCredentials();
    await page.goto('/create-profile');
    await page.getByLabel('Username').fill(creds.username);
    await page.getByLabel('Email').fill(creds.email);

    // Client-side rule matches the backend (min 8): 7 chars keep the submit button disabled.
    await page.getByLabel('Password').fill('1234567');
    await expect(page.getByRole('button', { name: 'Create Profile' })).toBeDisabled();

    await page.getByLabel('Password').fill('12345678');
    await expect(page.getByRole('button', { name: 'Create Profile' })).toBeEnabled();
  });

  test('registration with a taken e-mail (other letter case) shows the 409 message and does not log in', async ({ page }) => {
    const existing = await registerUser();
    const other = uniqueCredentials();
    await page.goto('/create-profile');
    await page.getByLabel('Username').fill(other.username);
    await page.getByLabel('Email').fill(existing.email.toUpperCase());
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Create Profile' }).click();
    await expect(page.getByText('Username or email is already taken.')).toBeVisible();
    await expect(page).toHaveURL(/\/create-profile$/);
    expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
  });
});
