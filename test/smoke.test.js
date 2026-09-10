'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { CHECKS, REGIONS } = require('../src/checks');
const { ITEMS, ITEMS_BY_ID, KEY_PANEL } = require('../src/items');
const { PALETTE, ITEM_SPRITES, ICON_SPRITES, kindForCheck } = require('../src/sprites');

test('the game has exactly 216 checks with unique ids', () => {
  assert.strictEqual(CHECKS.length, 216);
  assert.strictEqual(new Set(CHECKS.map((check) => check.id)).size, 216);
  const regionTotal = REGIONS.reduce((sum, region) => sum + region.checks.length, 0);
  assert.strictEqual(regionTotal, 216);
});

test('every sprite is a 12x12 grid drawn from the palette', () => {
  for (const [name, grid] of Object.entries({ ...ITEM_SPRITES, ...ICON_SPRITES })) {
    assert.strictEqual(grid.length, 12, name + ' should have 12 rows');
    grid.forEach((row, y) => {
      assert.strictEqual(row.length, 12, name + ' row ' + y + ' should be 12 wide');
      for (const ch of row) {
        assert.ok(ch === '.' || ch in PALETTE, name + ' row ' + y + ' has unknown colour ' + ch);
      }
    });
  }
});

test('every item points at a sprite that exists', () => {
  for (const item of ITEMS) {
    assert.ok(ITEM_SPRITES[item.sprite], 'missing sprite for ' + item.id);
    assert.ok(item.slots >= 1, item.id + ' needs at least one slot');
  }
});

test('the key panel matches the game: 11 big keys, 29 small keys', () => {
  const keyItems = ITEMS.filter((item) => item.panel === 'keys');
  const bigKeys = keyItems.filter((item) => item.sprite === 'bigkey');
  const smallKeys = keyItems.filter((item) => item.sprite === 'smallkey');

  assert.strictEqual(bigKeys.length, 11);
  assert.strictEqual(
    smallKeys.reduce((sum, item) => sum + item.slots, 0),
    29
  );

  // One small-key box per dungeon that has any, never one box per key.
  assert.strictEqual(smallKeys.length, 12);
  assert.strictEqual(smallKeys.find((item) => item.id === 'sk-pod').slots, 6);

  // Every key row points at real items, and no dungeon is missing both.
  for (const dungeon of KEY_PANEL) {
    assert.ok(dungeon.bigKey || dungeon.smallKey, dungeon.name + ' has no keys at all');
    for (const id of [dungeon.bigKey, dungeon.smallKey].filter(Boolean)) {
      assert.ok(ITEMS_BY_ID.get(id), 'missing key item ' + id);
    }
  }

  // Hyrule Castle and Castle Tower are the only big-key-less dungeons.
  const noBigKey = KEY_PANEL.filter((d) => !d.bigKey).map((d) => d.id);
  assert.deepStrictEqual(noBigKey, ['hc', 'ct']);
  assert.deepStrictEqual(
    KEY_PANEL.filter((d) => !d.smallKey).map((d) => d.id),
    ['ep']
  );
});

test('every check resolves to a known tile icon', () => {
  for (const check of CHECKS) {
    assert.ok(ICON_SPRITES[kindForCheck(check)], 'no icon for ' + check.fullName);
  }
});
