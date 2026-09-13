'use strict';

// The board, one player at a time: what it draws and what a click does.
// Each test is one or two statements from docs/specs/board.md.

const { test, expect } = require('@playwright/test');
const { newRoom, openBoard, item, check, checkBody, checkDead } = require('./board');

test.describe('the board', () => {
  test('draws the items, the region chips, and the two overworlds open', async ({ page }) => {
    await openBoard(page, newRoom());

    await expect(page.locator('#items .item')).toHaveCount(30);
    await expect(page.locator('#items-summary')).toHaveText('0 of 30 located');
    await expect(page.locator('#checks-summary')).toHaveText('0 of 216 recorded');

    // Fifteen regions and All.
    await expect(page.locator('.region-chip')).toHaveCount(16);

    // Light World and Dark World start open; the dungeons start folded.
    await expect(page.locator('.check')).toHaveCount(68 + 25);
    await expect(page.locator('.region-title').first()).toContainText('Light World (68)');
    await expect(page.locator('.region-title[aria-expanded="false"]')).toHaveCount(13);

    // Nothing to type: the filter box is gone.
    await expect(page.locator('#search')).toHaveCount(0);
  });

  test('records an item at a check, item first', async ({ page }) => {
    await openBoard(page, newRoom());

    await item(page, 'hookshot').click();
    await expect(item(page, 'hookshot')).toHaveClass(/is-armed/);
    await expect(page.locator('#assign-bar')).toContainText('Click the check where Hookshot was found');

    await checkBody(page, 'lw/links-house').click();

    await expect(item(page, 'hookshot').locator('.loc-name')).toHaveText("Link's House");
    await expect(check(page, 'lw/links-house')).toHaveClass(/is-used/);
    await expect(check(page, 'lw/links-house').locator('.check-holder')).toHaveText('Hookshot');
    await expect(page.locator('#items-summary')).toHaveText('1 of 30 located');
    await expect(page.locator('#checks-summary')).toHaveText('1 of 216 recorded');
    await expect(page.locator('#assign-bar')).toBeHidden();
  });

  test('records a check first, then the item', async ({ page }) => {
    await openBoard(page, newRoom());

    await checkBody(page, 'lw/links-uncle').click();
    await expect(check(page, 'lw/links-uncle')).toHaveClass(/is-armed/);
    await expect(page.locator('#assign-bar')).toContainText("Click the item found at Light World - Link's Uncle");

    await item(page, 'lamp').click();

    await expect(item(page, 'lamp').locator('.loc-name')).toHaveText("Link's Uncle");
    await expect(check(page, 'lw/links-uncle').locator('.check-holder')).toHaveText('Lamp');
    await expect(page.locator('#assign-bar')).toBeHidden();
  });

  test('clicking the armed tile again puts it down, and so does Esc', async ({ page }) => {
    await openBoard(page, newRoom());

    await item(page, 'lamp').click();
    await item(page, 'lamp').click();
    await expect(item(page, 'lamp')).not.toHaveClass(/is-armed/);
    await expect(page.locator('#assign-bar')).toBeHidden();

    await checkBody(page, 'lw/library').click();
    await expect(check(page, 'lw/library')).toHaveClass(/is-armed/);
    await page.keyboard.press('Escape');
    await expect(check(page, 'lw/library')).not.toHaveClass(/is-armed/);
    await expect(page.locator('#assign-bar')).toBeHidden();
  });

  test('a check holds one item, and the refusal names the holder', async ({ page }) => {
    await openBoard(page, newRoom());
    await item(page, 'lamp').click();
    await checkBody(page, 'lw/links-house').click();
    await expect(check(page, 'lw/links-house').locator('.check-holder')).toHaveText('Lamp');

    // With an item armed the service refuses the pairing.
    await item(page, 'hookshot').click();
    await checkBody(page, 'lw/links-house').click();
    await expect(page.locator('#hint')).toHaveText("Light World - Link's House is already recorded as Lamp");
    await expect(item(page, 'hookshot').locator('.item-location')).toHaveCount(0);

    // With nothing armed the board explains before sending anything.
    await checkBody(page, 'lw/links-house').click();
    await expect(page.locator('#hint')).toContainText('already holds Lamp');
    await expect(check(page, 'lw/links-house')).not.toHaveClass(/is-armed/);
  });

  test('a single-slot item moves; a progressive one fills up', async ({ page }) => {
    await openBoard(page, newRoom());

    await item(page, 'lamp').click();
    await checkBody(page, 'lw/links-house').click();
    await expect(item(page, 'lamp').locator('.loc-name')).toHaveText("Link's House");
    await item(page, 'lamp').click();
    await checkBody(page, 'lw/library').click();
    await expect(item(page, 'lamp').locator('.loc-name')).toHaveText('Library');
    await expect(check(page, 'lw/links-house')).not.toHaveClass(/is-used/);

    for (const id of ['lw/sick-kid', 'lw/hobo', 'lw/king-zora', 'dw/catfish']) {
      await item(page, 'bottle').click();
      await checkBody(page, id).click();
      await expect(check(page, id)).toHaveClass(/is-used/);
    }
    await expect(item(page, 'bottle').locator('.item-location')).toHaveCount(4);
    await expect(item(page, 'bottle').locator('.item-count')).toHaveText('4/4');
    await expect(item(page, 'bottle').locator('.item-count')).toHaveClass(/is-full/);

    await item(page, 'bottle').click();
    await checkBody(page, 'lw/mushroom').click();
    await expect(page.locator('#hint')).toHaveText('Bottle already has 4 locations');
  });

  test('the × clears one location without arming the tile', async ({ page }) => {
    await openBoard(page, newRoom());
    await item(page, 'bottle').click();
    await checkBody(page, 'lw/sick-kid').click();
    await expect(check(page, 'lw/sick-kid')).toHaveClass(/is-used/);
    await item(page, 'bottle').click();
    await checkBody(page, 'lw/hobo').click();
    await expect(check(page, 'lw/hobo')).toHaveClass(/is-used/);

    await item(page, 'bottle').locator('.item-location', { hasText: 'Sick Kid' }).locator('.loc-remove').click();

    await expect(item(page, 'bottle').locator('.loc-name')).toHaveText(['Hobo']);
    await expect(item(page, 'bottle')).not.toHaveClass(/is-armed/);
    await expect(check(page, 'lw/sick-kid')).not.toHaveClass(/is-used/);
  });

  test('a check can be marked dead, hidden, and brought back', async ({ page }) => {
    await openBoard(page, newRoom());
    const ledge = 'dw/bumper-cave-ledge';

    await checkDead(page, ledge).click();
    await expect(check(page, ledge)).toHaveClass(/is-dead/);
    await expect(check(page, ledge).locator('.check-holder')).toHaveText('nothing');
    await expect(page.locator('#checks-summary')).toHaveText('0 of 216 recorded, 1 dead');

    await page.locator('#hide-used').check();
    await expect(check(page, ledge)).toHaveCount(0);
    await expect(page.locator('.region-title', { hasText: 'Dark World' })).toContainText('(24)');
    await page.locator('#hide-used').uncheck();

    // Clicking a dead check with nothing armed brings it back.
    await checkBody(page, ledge).click();
    await expect(check(page, ledge)).not.toHaveClass(/is-dead/);
    await expect(page.locator('#checks-summary')).toHaveText('0 of 216 recorded');
  });

  test('recording an item at a dead check brings it back', async ({ page }) => {
    await openBoard(page, newRoom());

    await checkDead(page, 'dw/catfish').click();
    await expect(check(page, 'dw/catfish')).toHaveClass(/is-dead/);

    await item(page, 'hookshot').click();
    await checkBody(page, 'dw/catfish').click();

    await expect(check(page, 'dw/catfish')).not.toHaveClass(/is-dead/);
    await expect(check(page, 'dw/catfish').locator('.check-holder')).toHaveText('Hookshot');
    // A check with an item in it is not offered the ∅.
    await expect(checkDead(page, 'dw/catfish')).toHaveCount(0);
  });

  test('Items and Keys are tabs, and an armed item survives the switch', async ({ page }) => {
    await openBoard(page, newRoom());

    await item(page, 'lamp').click();
    await page.locator('#tab-keys').click();

    await expect(page.locator('#tab-keys')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.key-row')).toHaveCount(13);
    await expect(page.locator('#items-summary')).toHaveText('0 of 40 located');
    await expect(page.locator('#assign-bar')).toContainText('Lamp');

    // Keys follow the same rules as any item; PoD's box holds six.
    await page.keyboard.press('Escape');
    await item(page, 'sk-pod').click();
    await checkBody(page, 'lw/links-house').click();
    await expect(item(page, 'sk-pod').locator('.item-count')).toHaveText('1/6');
    await expect(page.locator('#items-summary')).toHaveText('1 of 40 located');

    await page.locator('#tab-items').click();
    await expect(page.locator('#items .item')).toHaveCount(30);
    await expect(page.locator('#items-summary')).toHaveText('0 of 30 located');
  });

  test('region chips filter the list and open the region', async ({ page }) => {
    await openBoard(page, newRoom());

    await page.locator('.region-chip', { hasText: 'HC 8' }).click();
    await expect(page.locator('.region-block')).toHaveCount(1);
    await expect(page.locator('.region-title')).toContainText('Hyrule Castle (8)');
    await expect(page.locator('.region-title')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.check')).toHaveCount(8);

    await page.locator('.region-chip', { hasText: 'All' }).click();
    await expect(page.locator('.check')).toHaveCount(93);
  });

  test('Reset asks first, then clears the room', async ({ page }) => {
    await openBoard(page, newRoom());
    await item(page, 'lamp').click();
    await checkBody(page, 'lw/links-house').click();
    await expect(check(page, 'lw/links-house')).toHaveClass(/is-used/);
    await checkDead(page, 'dw/catfish').click();
    await expect(page.locator('#checks-summary')).toHaveText('1 of 216 recorded, 1 dead');

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Clear every recorded location');
      dialog.accept();
    });
    await page.locator('#reset').click();

    await expect(page.locator('#items-summary')).toHaveText('0 of 30 located');
    await expect(page.locator('#checks-summary')).toHaveText('0 of 216 recorded');
    await expect(check(page, 'dw/catfish')).not.toHaveClass(/is-dead/);
  });
});
