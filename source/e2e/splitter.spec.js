'use strict';

// The seam between the panels: BOARD-3.

const { test, expect } = require('@playwright/test');
const { newRoom, openBoard } = require('./board');

async function itemsWidth(page) {
  return page.locator('.panel-items').evaluate((panel) => panel.getBoundingClientRect().width);
}

test.describe('the seam between the panels', () => {
  test('drags, keeps its width across a reload, and resets on double-click', async ({ page }) => {
    const room = newRoom('seam');
    await openBoard(page, room);
    const before = await itemsWidth(page);

    const seam = page.locator('#splitter');
    const box = await seam.boundingBox();
    const x = box.x + box.width / 2;
    // The seam runs the height of the page, so its midpoint can be below the
    // viewport; a point near the top is always on screen.
    const y = box.y + 40;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 150, y, { steps: 5 });
    await page.mouse.up();

    const dragged = await itemsWidth(page);
    expect(dragged).toBeLessThan(before - 100);
    await expect(page.locator('body')).not.toHaveClass(/is-resizing/);

    await openBoard(page, room);
    expect(await itemsWidth(page)).toBe(dragged);

    await seam.dblclick();
    expect(await itemsWidth(page)).toBe(before);
    await openBoard(page, room);
    expect(await itemsWidth(page)).toBe(before);
  });

  test('can be nudged from the keyboard and put back', async ({ page }) => {
    await openBoard(page, newRoom('seam'));
    const before = await itemsWidth(page);

    await page.locator('#splitter').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await itemsWidth(page)).toBe(Math.round(before) - 32);

    await page.keyboard.press('Backspace');
    expect(await itemsWidth(page)).toBe(before);
  });

  test('will not push either panel below what its tiles need', async ({ page }) => {
    await openBoard(page, newRoom('seam'));

    const seam = page.locator('#splitter');
    const box = await seam.boundingBox();
    // The seam runs the height of the page, so its midpoint can be below the
    // viewport; a point near the top is always on screen.
    const y = box.y + 40;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(0, y, { steps: 5 });
    await page.mouse.up();
    expect(await itemsWidth(page)).toBe(300);

    await page.mouse.move((await seam.boundingBox()).x + 6, y);
    await page.mouse.down();
    await page.mouse.move(5000, y, { steps: 5 });
    await page.mouse.up();
    const checks = await page.locator('.panel-checks').evaluate((panel) => panel.getBoundingClientRect().width);
    expect(checks).toBeGreaterThanOrEqual(360);
  });
});
