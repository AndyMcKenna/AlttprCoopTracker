'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

// Point the store at a scratch directory before it is required, so running
// the tests never touches a real session file.
process.env.TRACKER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'alttp-tracker-'));

const { CHECKS, REGIONS } = require('../src/checks');
const { ITEMS } = require('../src/items');
const { PALETTE, ITEM_SPRITES, ICON_SPRITES, kindForCheck } = require('../src/sprites');
const { Store } = require('../src/store');

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

test('every check resolves to a known tile icon', () => {
  for (const check of CHECKS) {
    assert.ok(ICON_SPRITES[kindForCheck(check)], 'no icon for ' + check.fullName);
  }
});

test('assigning, replacing and clearing locations', () => {
  const store = new Store();
  const room = 'test-room';

  store.apply(room, { type: 'assign', itemId: 'hookshot', checkId: 'ep/big-chest', by: 'Andy' });
  assert.strictEqual(store.getOrCreate(room).assignments.hookshot.length, 1);
  assert.strictEqual(store.getOrCreate(room).assignments.hookshot[0].by, 'Andy');

  // A single-slot item moves rather than erroring when re-assigned.
  store.apply(room, { type: 'assign', itemId: 'hookshot', checkId: 'lw/library' });
  const hookshot = store.getOrCreate(room).assignments.hookshot;
  assert.strictEqual(hookshot.length, 1);
  assert.strictEqual(hookshot[0].checkId, 'lw/library');

  // Multi-slot items accumulate up to their limit and refuse duplicates.
  for (const checkId of ['lw/sick-kid', 'lw/hobo', 'lw/king-zora', 'dw/catfish']) {
    store.apply(room, { type: 'assign', itemId: 'bottle', checkId });
  }
  assert.strictEqual(store.getOrCreate(room).assignments.bottle.length, 4);
  assert.throws(() => store.apply(room, { type: 'assign', itemId: 'bottle', checkId: 'lw/library' }));
  assert.throws(() => store.apply(room, { type: 'assign', itemId: 'sword', checkId: 'lw/sick-kid' }), {
    message: /already recorded/,
  });

  // Unknown ids are rejected rather than stored.
  assert.throws(() => store.apply(room, { type: 'assign', itemId: 'nope', checkId: 'lw/library' }));
  assert.throws(() => store.apply(room, { type: 'assign', itemId: 'lamp', checkId: 'lw/nope' }));

  const first = store.getOrCreate(room).assignments.bottle[0];
  store.apply(room, { type: 'unassign', itemId: 'bottle', assignmentId: first.id });
  assert.strictEqual(store.getOrCreate(room).assignments.bottle.length, 3);

  store.apply(room, { type: 'reset' });
  assert.deepStrictEqual(store.getOrCreate(room).assignments, {});
});

test('rooms persist across a restart', () => {
  const store = new Store();
  store.apply('persist-me', { type: 'assign', itemId: 'lamp', checkId: 'hc/sanctuary' });
  store.apply('persist-me', { type: 'rename', name: 'Friday night race' });
  store.saveNow();

  const reloaded = new Store();
  const room = reloaded.getOrCreate('persist-me');
  assert.strictEqual(room.name, 'Friday night race');
  assert.strictEqual(room.assignments.lamp[0].checkId, 'hc/sanctuary');
});

test('room codes are normalised to something shareable', () => {
  const store = new Store();
  assert.strictEqual(store.getOrCreate('  My Room!! ').id, 'myroom');
  assert.strictEqual(store.getOrCreate('').id, 'lobby');
});
