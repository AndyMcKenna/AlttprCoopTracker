'use strict';

const { REGIONS } = require('./checks');

// The main items tracked on the board. `slots` is how many separate locations
// an item can hold: 4 bottles are 4 different checks, the sword is found up to
// 4 times as a progressive upgrade, and so on.

const MAIN_ITEMS = [
  { id: 'sword', name: 'Sword', sprite: 'sword', slots: 4, group: 'Equipment' },
  { id: 'shield', name: 'Shield', sprite: 'shield', slots: 3, group: 'Equipment' },
  { id: 'mail', name: 'Mail', sprite: 'mail', slots: 2, group: 'Equipment' },
  { id: 'glove', name: 'Gloves', sprite: 'glove', slots: 2, group: 'Equipment' },
  { id: 'boots', name: 'Pegasus Boots', sprite: 'boots', slots: 1, group: 'Equipment' },
  { id: 'flippers', name: 'Flippers', sprite: 'flippers', slots: 1, group: 'Equipment' },
  { id: 'moonpearl', name: 'Moon Pearl', sprite: 'moonpearl', slots: 1, group: 'Equipment' },

  { id: 'bow', name: 'Bow', sprite: 'bow', slots: 2, group: 'Items' },
  { id: 'boomerang', name: 'Boomerang', sprite: 'boomerang', slots: 2, group: 'Items' },
  { id: 'hookshot', name: 'Hookshot', sprite: 'hookshot', slots: 1, group: 'Items' },
  { id: 'mushroom', name: 'Mushroom', sprite: 'mushroom', slots: 1, group: 'Items' },
  { id: 'powder', name: 'Magic Powder', sprite: 'powder', slots: 1, group: 'Items' },
  { id: 'firerod', name: 'Fire Rod', sprite: 'firerod', slots: 1, group: 'Items' },
  { id: 'icerod', name: 'Ice Rod', sprite: 'icerod', slots: 1, group: 'Items' },
  { id: 'bombos', name: 'Bombos', sprite: 'bombos', slots: 1, group: 'Items' },
  { id: 'ether', name: 'Ether', sprite: 'ether', slots: 1, group: 'Items' },
  { id: 'quake', name: 'Quake', sprite: 'quake', slots: 1, group: 'Items' },
  { id: 'lamp', name: 'Lamp', sprite: 'lamp', slots: 1, group: 'Items' },
  { id: 'hammer', name: 'Hammer', sprite: 'hammer', slots: 1, group: 'Items' },
  { id: 'shovel', name: 'Shovel', sprite: 'shovel', slots: 1, group: 'Items' },
  { id: 'flute', name: 'Flute', sprite: 'flute', slots: 1, group: 'Items' },
  { id: 'bugnet', name: 'Bug Net', sprite: 'bugnet', slots: 1, group: 'Items' },
  { id: 'book', name: 'Book of Mudora', sprite: 'book', slots: 1, group: 'Items' },
  { id: 'bottle', name: 'Bottle', sprite: 'bottle', slots: 4, group: 'Items' },
  { id: 'somaria', name: 'Cane of Somaria', sprite: 'somaria', slots: 1, group: 'Items' },
  { id: 'byrna', name: 'Cane of Byrna', sprite: 'byrna', slots: 1, group: 'Items' },
  { id: 'cape', name: 'Magic Cape', sprite: 'cape', slots: 1, group: 'Items' },
  { id: 'mirror', name: 'Magic Mirror', sprite: 'mirror', slots: 1, group: 'Items' },
  { id: 'halfmagic', name: 'Half Magic', sprite: 'halfmagic', slots: 1, group: 'Items' },
].map((item) => ({ ...item, panel: 'items' }));

// Keys, by dungeon. `small` is how many small keys the dungeon holds — they
// are interchangeable, so one box tracks all of them. Hyrule Castle and
// Castle Tower have no big key; Eastern Palace has no small keys.
const DUNGEON_KEYS = [
  { region: 'hc', small: 1, big: false },
  { region: 'ct', small: 2, big: false },
  { region: 'ep', small: 0, big: true },
  { region: 'dp', small: 1, big: true },
  { region: 'toh', small: 1, big: true },
  { region: 'pod', small: 6, big: true },
  { region: 'sp', small: 1, big: true },
  { region: 'sw', small: 3, big: true },
  { region: 'tt', small: 1, big: true },
  { region: 'ip', small: 2, big: true },
  { region: 'mm', small: 3, big: true },
  { region: 'tr', small: 4, big: true },
  { region: 'gt', small: 4, big: true },
];

const REGIONS_BY_ID = new Map(REGIONS.map((region) => [region.id, region]));

// Key items reuse the ordinary item machinery: `label` is what the key panel
// shows (the dungeon is already the row heading) while `name` stays unique so
// error messages and check tiles read unambiguously.
const KEY_ITEMS = DUNGEON_KEYS.flatMap((dungeon) => {
  const region = REGIONS_BY_ID.get(dungeon.region);
  const made = [];

  if (dungeon.big) {
    made.push({
      id: 'bk-' + dungeon.region,
      name: region.short + ' Big Key',
      label: 'Big Key',
      sprite: 'bigkey',
      slots: 1,
      panel: 'keys',
      dungeon: dungeon.region,
    });
  }

  if (dungeon.small > 0) {
    made.push({
      id: 'sk-' + dungeon.region,
      name: region.short + ' Small Key',
      label: dungeon.small === 1 ? 'Small Key' : 'Small Keys',
      sprite: 'smallkey',
      slots: dungeon.small,
      panel: 'keys',
      dungeon: dungeon.region,
      // Worth seeing "2/6" even before the box is full.
      alwaysCount: true,
    });
  }

  return made;
});

const ITEMS = [...MAIN_ITEMS, ...KEY_ITEMS];

const ITEMS_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

const GROUPS = MAIN_ITEMS.reduce((acc, item) => {
  if (!acc.includes(item.group)) acc.push(item.group);
  return acc;
}, []);

// What the key panel needs to lay itself out: one row per dungeon, big key first.
const KEY_PANEL = DUNGEON_KEYS.map((dungeon) => {
  const region = REGIONS_BY_ID.get(dungeon.region);
  return {
    id: region.id,
    name: region.name,
    short: region.short,
    color: region.color,
    bigKey: dungeon.big ? 'bk-' + dungeon.region : null,
    smallKey: dungeon.small > 0 ? 'sk-' + dungeon.region : null,
  };
});

module.exports = { ITEMS, MAIN_ITEMS, KEY_ITEMS, ITEMS_BY_ID, GROUPS, KEY_PANEL };
