'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const { CHECKS, REGIONS } = require('../data/checks');
const { ITEMS, ITEMS_BY_ID, KEY_PANEL, GENERIC_KEYS } = require('../data/items');
const { PALETTE, ITEM_SPRITES, ICON_SPRITES, kindForCheck } = require('../data/sprites');
const spriteSheet = require('../scripts/build-spritesheet');

test('the game has exactly 216 checks with unique ids, and 33 more for keydrop', () => {
  const regular = CHECKS.filter((check) => !check.keydrop);
  const keydrop = CHECKS.filter((check) => check.keydrop);
  assert.strictEqual(regular.length, 216);
  assert.strictEqual(keydrop.length, 33);
  assert.strictEqual(new Set(CHECKS.map((check) => check.id)).size, 249);
  const regionTotal = REGIONS.reduce((sum, region) => sum + region.checks.length, 0);
  assert.strictEqual(regionTotal, 216);
  // Keydrop locations are only ever in dungeons.
  for (const check of keydrop) {
    assert.ok(!['lw', 'kak', 'dm', 'dw'].includes(check.region), check.id + ' is not in a dungeon');
  }
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
    // An unlimited item has no slots by design; everything else needs one.
    if (item.unlimited) {
      continue;
    }
    if (item.keydropOnly) {
      assert.ok(item.keydropSlots >= 1, item.id + ' needs at least one keydrop slot');
    } else {
      assert.ok(item.slots >= 1, item.id + ' needs at least one slot');
    }
  }
});

test('the key panel matches the game: 11 big keys, 29 small keys; 12 and 61 in keydrop', () => {
  const keyItems = ITEMS.filter((item) => item.panel === 'keys' && !item.unlimited);
  const bigKeys = keyItems.filter((item) => item.sprite === 'bigkey');
  const smallKeys = keyItems.filter((item) => item.sprite === 'smallkey');

  assert.strictEqual(bigKeys.filter((item) => !item.keydropOnly).length, 11);
  assert.strictEqual(bigKeys.length, 12);
  assert.strictEqual(
    smallKeys.reduce((sum, item) => sum + item.slots, 0),
    29
  );
  assert.strictEqual(
    smallKeys.reduce((sum, item) => sum + (item.keydropSlots ?? item.slots), 0),
    61
  );

  // One small-key box per dungeon that has any, never one box per key.
  assert.strictEqual(smallKeys.length, 13);
  assert.strictEqual(smallKeys.filter((item) => !item.keydropOnly).length, 12);
  assert.strictEqual(smallKeys.find((item) => item.id === 'sk-pod').slots, 6);
  assert.strictEqual(smallKeys.find((item) => item.id === 'sk-gt').keydropSlots, 8);

  // Every key row points at real items, and no dungeon is missing both.
  for (const dungeon of KEY_PANEL) {
    assert.ok(dungeon.bigKey || dungeon.smallKey, dungeon.name + ' has no keys at all');
    for (const id of [dungeon.bigKey, dungeon.smallKey].filter(Boolean)) {
      assert.ok(ITEMS_BY_ID.get(id), 'missing key item ' + id);
    }
  }

  // Castle Tower never has a big key; Hyrule Castle only in keydrop. Every
  // dungeon has a small-key box in keydrop; Eastern Palace has none without.
  const noBigKey = KEY_PANEL.filter((d) => !d.bigKey).map((d) => d.id);
  assert.deepStrictEqual(noBigKey, ['ct']);
  assert.ok(ITEMS_BY_ID.get('bk-hc').keydropOnly);
  assert.deepStrictEqual(KEY_PANEL.filter((d) => !d.smallKey).map((d) => d.id), []);
  assert.ok(ITEMS_BY_ID.get('sk-ep').keydropOnly);
});

test('the generic keys are a pair with no limit, first on the key panel', () => {
  assert.deepStrictEqual(GENERIC_KEYS.map((key) => key.id), ['bk-generic', 'sk-generic']);

  for (const key of GENERIC_KEYS) {
    assert.ok(key.unlimited, key.id + ' should be unlimited');
    assert.strictEqual(key.slots, 0, key.id + ' should have no slots to count');
    assert.strictEqual(key.keydropSlots, 0, key.id + ' should have no slots in keydrop either');
    // Always on the board: a key you cannot name is not a keydrop thing.
    assert.ok(!key.keydropOnly, key.id + ' should be in play with keydrop off');
    assert.strictEqual(ITEMS_BY_ID.get(key.id), key);
  }

  // First, above Hyrule Castle, and the only row that is not a region.
  assert.strictEqual(KEY_PANEL[0].id, 'generic');
  assert.strictEqual(KEY_PANEL[0].bigKey, 'bk-generic');
  assert.strictEqual(KEY_PANEL[0].smallKey, 'sk-generic');
  assert.strictEqual(KEY_PANEL[1].id, 'hc');
  assert.ok(!REGIONS.some((region) => region.id === KEY_PANEL[0].id));

  // Nothing else in the game is unlimited: the rule is for these two only.
  assert.deepStrictEqual(
    ITEMS.filter((item) => item.unlimited).map((item) => item.id),
    ['bk-generic', 'sk-generic']
  );
});

test('every check resolves to a known tile icon', () => {
  for (const check of CHECKS) {
    assert.ok(ICON_SPRITES[kindForCheck(check)], 'no icon for ' + check.fullName);
  }
});

test('the sprite sheet matches the PNGs it was built from', () => {
  const css = fs.readFileSync(spriteSheet.SHEET_CSS, 'utf8');
  const sprites = spriteSheet.loadSprites();
  const stamp = /\/\* sources: ([0-9a-f]+) \*\//.exec(css);
  assert.ok(stamp, 'sheet.css has no sources fingerprint');
  assert.strictEqual(
    stamp[1],
    spriteSheet.fingerprint(sprites),
    'sheet.css is behind wwwroot/sprites; run npm run build-sprites'
  );
  for (const sprite of sprites) {
    assert.ok(css.includes('.sprite--' + sprite.kind + '-' + sprite.name + ' {'), 'no class for ' + sprite.kind + '/' + sprite.name);
  }
});
