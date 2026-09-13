'use strict';

// What every board test needs: a room of its own, and the tiles by id.

const { expect } = require('@playwright/test');

/** A code nobody else's test is using. */
function newRoom(prefix) {
  return (prefix || 'e2e') + '-' + Math.random().toString(36).slice(2, 8);
}

/** Opens the board on a room and waits until it is drawn and connected. */
async function openBoard(page, room) {
  await page.goto('/board.html?room=' + encodeURIComponent(room));
  await expect(page.locator('#status')).toHaveText('Connected');
  await expect(page.locator('#items .item')).toHaveCount(30);
}

function item(page, id) {
  return page.locator('[data-item="' + id + '"]');
}

function check(page, id) {
  return page.locator('[data-check="' + id + '"]');
}

/** The part of a check tile that pairs it with an item. */
function checkBody(page, id) {
  return check(page, id).locator('.check-main');
}

/** The small ∅ at the edge of a check tile. */
function checkDead(page, id) {
  return check(page, id).locator('.check-dead');
}

module.exports = { newRoom, openBoard, item, check, checkBody, checkDead };
