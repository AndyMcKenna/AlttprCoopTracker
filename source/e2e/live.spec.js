'use strict';

// Two players on one room, and a room that outlives the page.

const { test, expect } = require('@playwright/test');
const { newRoom, openBoard, item, check, checkBody, checkDead } = require('./board');

test.describe('live updates', () => {
  test('a change on one board shows up on another in the same room', async ({ browser }) => {
    const room = newRoom('live');
    const first = await browser.newContext();
    const second = await browser.newContext();
    const a = await first.newPage();
    const b = await second.newPage();
    await openBoard(a, room);
    await openBoard(b, room);

    // Both boards count both sockets.
    await expect(a.locator('#players')).toHaveText('2 players');
    await expect(b.locator('#players')).toHaveText('2 players');

    await item(a, 'hookshot').click();
    await checkBody(a, 'lw/links-house').click();
    await expect(check(a, 'lw/links-house')).toHaveClass(/is-used/);
    await expect(check(b, 'lw/links-house').locator('.check-holder')).toHaveText('Hookshot');
    await expect(item(b, 'hookshot').locator('.loc-name')).toHaveText("Link's House");

    await checkDead(b, 'dw/catfish').click();
    await expect(check(a, 'dw/catfish')).toHaveClass(/is-dead/);

    // Leaving is noticed too.
    await second.close();
    await expect(a.locator('#players')).toHaveText('1 player');
    await first.close();
  });

  test('a board that reloads picks the room up where it was', async ({ page }) => {
    const room = newRoom('keep');
    await openBoard(page, room);
    await item(page, 'lamp').click();
    await checkBody(page, 'lw/links-house').click();
    await expect(check(page, 'lw/links-house')).toHaveClass(/is-used/);
    await checkDead(page, 'dw/catfish').click();
    await expect(page.locator('#checks-summary')).toHaveText('1 of 216 recorded, 1 dead');

    await openBoard(page, room);

    await expect(item(page, 'lamp').locator('.loc-name')).toHaveText("Link's House");
    await expect(check(page, 'dw/catfish')).toHaveClass(/is-dead/);
    await expect(page.locator('#checks-summary')).toHaveText('1 of 216 recorded, 1 dead');
  });

  test('a code that was never written to is an empty board', async ({ page, request }) => {
    const room = newRoom('empty');
    await openBoard(page, room);
    await expect(page.locator('#checks-summary')).toHaveText('0 of 216 recorded');

    const state = await (await request.get('/api/rooms/' + room)).json();
    expect(state.id).toBe(room);
    expect(state.assignments).toEqual({});
    expect(state.dead).toEqual([]);
  });
});
