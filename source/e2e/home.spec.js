'use strict';

// The home page: getting a room code, or bringing one along.

const { test, expect } = require('@playwright/test');

test.describe('the home page', () => {
  test('hands out a three-word room and opens the board on it', async ({ page }) => {
    await page.goto('/');
    await page.locator('#generate').click();

    await expect(page).toHaveURL(/board\.html\?room=[a-z]+-[a-z]+-[a-z]+$/);
    const room = new URL(page.url()).searchParams.get('room');
    await expect(page.locator('#room-input')).toHaveValue(room);
    await expect(page.locator('#status')).toHaveText('Connected');
  });

  test('a typed code is folded the way the service folds it', async ({ page }) => {
    await page.goto('/');
    await page.locator('#join-room').fill('  My Room!! ');
    await page.locator('#join-form button[type="submit"]').click();

    await expect(page).toHaveURL(/board\.html\?room=myroom$/);
    await expect(page.locator('#room-input')).toHaveValue('myroom');
  });

  test('the changelog is a page away and links back', async ({ page }) => {
    await page.goto('/changelog.html');
    await expect(page.locator('.release h2').first()).toContainText('Beta');
    await page.locator('.home-foot a', { hasText: 'Back to the tracker' }).click();
    await expect(page.locator('#generate')).toBeVisible();
  });
});
