'use strict';

// Keydrop: a room setting that puts the pot and enemy keys on the board.

const { test, expect } = require('@playwright/test');
const { newRoom, openBoard, item, check, checkBody } = require('./board');

test.describe('keydrop', () => {
  test('is off by default, and on shows the key drops and bigger key boxes for everyone', async ({ browser }) => {
    const room = newRoom('keydrop');
    const first = await browser.newContext();
    const second = await browser.newContext();
    const a = await first.newPage();
    const b = await second.newPage();
    await openBoard(a, room);
    await openBoard(b, room);

    await expect(a.locator('#keydrop')).not.toBeChecked();
    await expect(a.locator('#checks-summary')).toHaveText('0 of 216 recorded');
    await expect(check(a, 'hc/big-key-drop')).toHaveCount(0);
    await expect(a.locator('.region-chip', { hasText: 'HC 8' })).toHaveCount(1);

    await a.locator('#keydrop').check();

    // Both boards: the drops appear in their dungeons, the chips and the
    // summary count them, and the key boxes grow.
    for (const page of [a, b]) {
      await expect(page.locator('#keydrop')).toBeChecked();
      await expect(page.locator('#checks-summary')).toHaveText('0 of 249 recorded');
      await expect(page.locator('.region-chip', { hasText: 'HC 12' })).toHaveCount(1);
      await page.locator('.region-title', { hasText: 'Hyrule Castle' }).click();
      await expect(check(page, 'hc/big-key-drop')).toHaveCount(1);
      await expect(check(page, 'hc/map-guard-key-drop').locator('.check-icon')).toHaveClass(/sprite--checks-enemy/);
      await page.locator('.region-title', { hasText: 'Eastern Palace' }).click();
      await expect(check(page, 'ep/dark-square-pot-key').locator('.check-icon')).toHaveClass(/sprite--checks-pot/);

      await page.locator('#tab-keys').click();
      await expect(page.locator('#items-summary')).toHaveText('0 of 73 located');
      await expect(item(page, 'bk-hc')).toHaveCount(1);
      await expect(item(page, 'sk-hc').locator('.item-count')).toHaveText('0/4');
      await expect(item(page, 'sk-ep').locator('.item-count')).toHaveText('0/2');
      await page.locator('#tab-items').click();
    }

    await first.close();
    await second.close();
  });

  test('records against a key drop, and keeps it when keydrop is turned off', async ({ page }) => {
    const room = newRoom('keydrop');
    await openBoard(page, room);
    await page.locator('#keydrop').check();
    await expect(page.locator('#checks-summary')).toHaveText('0 of 249 recorded');

    await page.locator('.region-title', { hasText: 'Hyrule Castle' }).click();
    await page.locator('#tab-keys').click();
    await item(page, 'bk-hc').click();
    await checkBody(page, 'hc/big-key-drop').click();
    await expect(check(page, 'hc/big-key-drop').locator('.check-holder')).toHaveText('HC Big Key');
    await expect(item(page, 'bk-hc').locator('.loc-name')).toHaveText('Big Key Drop');

    await page.locator('#keydrop').uncheck();
    await expect(page.locator('#checks-summary')).toHaveText('0 of 216 recorded');
    await expect(item(page, 'bk-hc')).toHaveCount(0);
    await expect(check(page, 'hc/big-key-drop')).toHaveCount(0);

    await page.locator('#keydrop').check();
    await expect(page.locator('#checks-summary')).toHaveText('1 of 249 recorded');
    await expect(item(page, 'bk-hc').locator('.loc-name')).toHaveText('Big Key Drop');
  });

  test('a board that reloads keeps the setting', async ({ page }) => {
    const room = newRoom('keydrop');
    await openBoard(page, room);
    await page.locator('#keydrop').check();
    await expect(page.locator('#checks-summary')).toHaveText('0 of 249 recorded');

    await openBoard(page, room);
    await expect(page.locator('#keydrop')).toBeChecked();
    await expect(page.locator('#checks-summary')).toHaveText('0 of 249 recorded');
  });
});
