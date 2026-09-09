'use strict';

// The main items tracked on the board. `slots` is how many separate locations
// an item can hold: 4 bottles are 4 different checks, the sword is found up to
// 4 times as a progressive upgrade, and so on.

const ITEMS = [
  { id: 'sword', name: 'Sword', sprite: 'sword', slots: 4, group: 'Equipment' },
  { id: 'shield', name: 'Shield', sprite: 'shield', slots: 3, group: 'Equipment' },
  { id: 'mail', name: 'Mail', sprite: 'mail', slots: 2, group: 'Equipment' },
  { id: 'glove', name: 'Gloves', sprite: 'glove', slots: 2, group: 'Equipment' },
  { id: 'boots', name: 'Pegasus Boots', sprite: 'boots', slots: 1, group: 'Equipment' },
  { id: 'flippers', name: 'Flippers', sprite: 'flippers', slots: 1, group: 'Equipment' },
  { id: 'moonpearl', name: 'Moon Pearl', sprite: 'moonpearl', slots: 1, group: 'Equipment' },

  { id: 'bow', name: 'Bow', sprite: 'bow', slots: 2, group: 'Items' },
  { id: 'silverarrows', name: 'Silver Arrows', sprite: 'silverarrows', slots: 1, group: 'Items' },
  { id: 'boomerang', name: 'Boomerang', sprite: 'boomerang', slots: 2, group: 'Items' },
  { id: 'hookshot', name: 'Hookshot', sprite: 'hookshot', slots: 1, group: 'Items' },
  { id: 'mushroom', name: 'Mushroom', sprite: 'mushroom', slots: 1, group: 'Items' },
  { id: 'powder', name: 'Magic Powder', sprite: 'powder', slots: 1, group: 'Items' },
  { id: 'firerod', name: 'Fire Rod', sprite: 'firerod', slots: 1, group: 'Items' },
  { id: 'icerod', name: 'Ice Rod', sprite: 'icerod', slots: 1, group: 'Items' },
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

  { id: 'bombos', name: 'Bombos', sprite: 'bombos', slots: 1, group: 'Medallions' },
  { id: 'ether', name: 'Ether', sprite: 'ether', slots: 1, group: 'Medallions' },
  { id: 'quake', name: 'Quake', sprite: 'quake', slots: 1, group: 'Medallions' },
];

const ITEMS_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

const GROUPS = ITEMS.reduce((acc, item) => {
  if (!acc.includes(item.group)) acc.push(item.group);
  return acc;
}, []);

module.exports = { ITEMS, ITEMS_BY_ID, GROUPS };
