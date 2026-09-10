'use strict';

/**
 * Write the game tables out as JSON for the API to seed its database from.
 *
 *   node scripts/export-gamedata.js      (or: npm run export-gamedata)
 *
 * The JS modules stay the place the game is authored — they are far easier to
 * edit than rows — and this hands the result to the API, which stores it and
 * serves it to the board. Run it after editing checks.js, items.js or
 * sprites.js; the API reseeds on start whenever the contents change.
 */

const fs = require('fs');
const path = require('path');

const { REGIONS, CHECKS } = require('../src/checks');
const { ITEMS, KEY_PANEL } = require('../src/items');
const { PALETTE, ITEM_SPRITES, ICON_SPRITES, kindForCheck } = require('../src/sprites');

const OUT = path.join(__dirname, '..', 'backend', 'AlttpTracker.Api', 'gamedata.json');

const sprites = [
  ...Object.entries(ITEM_SPRITES).map(([name, rows]) => ({ name, kind: 'item', rows })),
  ...Object.entries(ICON_SPRITES).map(([name, rows]) => ({ name, kind: 'icon', rows })),
];

const payload = {
  generatedFrom: 'src/checks.js, src/items.js, src/sprites.js',

  regions: REGIONS.map((region, ordinal) => ({
    id: region.id,
    name: region.name,
    short: region.short,
    color: region.color,
    count: region.checks.length,
    ordinal,
  })),

  checks: CHECKS.map((check, ordinal) => ({
    id: check.id,
    name: check.name,
    fullName: check.fullName,
    region: check.region,
    regionName: check.regionName,
    regionShort: check.regionShort,
    icon: kindForCheck(check),
    ordinal,
  })),

  items: ITEMS.map((item, ordinal) => ({
    id: item.id,
    name: item.name,
    label: item.label ?? null,
    sprite: item.sprite,
    slots: item.slots,
    group: item.group ?? null,
    panel: item.panel,
    dungeon: item.dungeon ?? null,
    alwaysCount: item.alwaysCount === true,
    ordinal,
  })),

  keyPanel: KEY_PANEL.map((row, ordinal) => ({
    id: row.id,
    name: row.name,
    short: row.short,
    color: row.color,
    bigKey: row.bigKey,
    smallKey: row.smallKey,
    ordinal,
  })),

  palette: Object.entries(PALETTE).map(([symbol, color]) => ({ symbol, color })),

  sprites,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));

console.log(
  'wrote ' +
    path.relative(process.cwd(), OUT) +
    ': ' +
    payload.regions.length +
    ' regions, ' +
    payload.checks.length +
    ' checks, ' +
    payload.items.length +
    ' items, ' +
    payload.sprites.length +
    ' sprites'
);
