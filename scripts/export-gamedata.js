'use strict';

/**
 * Write the game tables out as JSON for the .NET API to read.
 *
 *   node scripts/export-gamedata.js
 *
 * The API has to enforce the same rules the board does — how many locations
 * an item can hold, and which check ids exist — so it needs the same tables.
 * Rather than transcribe them into C# and let the two drift, the JS files stay
 * the single source of truth and this writes what the API needs.
 *
 * Run it after editing checks.js or items.js; the API reads the result at
 * startup. `npm run export-gamedata` does the same thing.
 */

const fs = require('fs');
const path = require('path');

const { CHECKS } = require('../src/checks');
const { ITEMS } = require('../src/items');

const OUT = path.join(__dirname, '..', 'backend', 'AlttpTracker.Api', 'gamedata.json');

const payload = {
  generatedFrom: 'src/checks.js, src/items.js',
  items: ITEMS.map((item) => ({ id: item.id, name: item.name, slots: item.slots })),
  checks: CHECKS.map((check) => ({ id: check.id, fullName: check.fullName })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));

console.log(
  'wrote ' +
    path.relative(process.cwd(), OUT) +
    ': ' +
    payload.items.length +
    ' items, ' +
    payload.checks.length +
    ' checks'
);
