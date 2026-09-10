'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const { ITEMS, GROUPS, KEY_PANEL } = require('./items');
const { REGIONS, CHECKS } = require('./checks');
const { PALETTE, ITEM_SPRITES, ICON_SPRITES, kindForCheck } = require('./sprites');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Where the tracker service lives. Under Aspire the AppHost injects the API's
 * address as services__api__http__0; running this app on its own, point
 * API_URL at a `dotnet run` of AlttpTracker.Api.
 *
 * The browser talks to it directly, so this has to be an address the browser
 * can reach, not an internal one.
 */
// http is preferred over https deliberately: the browser has to reach this
// address, and other machines on the LAN will not trust the local dev
// certificate. Set API_URL to override.
const API_URL =
  process.env.API_URL ||
  process.env.services__api__http__0 ||
  process.env.services__api__https__0 ||
  '';

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Real sprite images, if any have been dropped in. A file named after an
// item's `sprite` (public/sprites/items/lamp.png) is used in place of the
// drawn pixel art; anything missing falls back to the built-in grid, so the
// tracker still works from a clean checkout with no images at all.
const SPRITE_DIR = path.join(__dirname, '..', 'public', 'sprites');

function availableIcons(kind) {
  const dir = path.join(SPRITE_DIR, kind);
  try {
    return fs
      .readdirSync(dir)
      .filter((file) => file.toLowerCase().endsWith('.png'))
      .map((file) => file.replace(/\.png$/i, ''));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not read ' + dir + ':', err.message);
    return [];
  }
}

// Static game data. Sent once on load so the client can render sprites and
// the check list without shipping a second copy of the tables. Room state is
// not here — that belongs to the API.
const STATIC_DATA = {
  items: ITEMS,
  groups: GROUPS,
  keyPanel: KEY_PANEL,
  regions: REGIONS.map((region) => ({
    id: region.id,
    name: region.name,
    short: region.short,
    color: region.color,
    count: region.checks.length,
  })),
  checks: CHECKS.map((check) => ({ ...check, icon: kindForCheck(check) })),
  palette: PALETTE,
  itemSprites: ITEM_SPRITES,
  spriteImages: availableIcons('items'),
  checkImages: availableIcons('checks'),
  iconSprites: ICON_SPRITES,
};

app.get('/api/data', (req, res) =>
  res.json({ ...STATIC_DATA, apiBaseUrl: API_URL.replace(/\/$/, '') })
);

const server = app.listen(PORT, HOST, () => {
  console.log('ALTTP co-op tracker board on http://localhost:' + PORT);
  console.log(API_URL ? 'tracker service at ' + API_URL : 'no tracker service configured (set API_URL)');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server };
