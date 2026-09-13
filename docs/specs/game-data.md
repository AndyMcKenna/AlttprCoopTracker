# Game data

Where the game is written down, and how it reaches the app.

## Source of truth

- **DATA-1** The game is authored in JavaScript under `source/data`:
  `checks.js` (the regions and their checks), `items.js` (the items, keys
  and slot counts), `sprites.js` (12×12 pixel-art fallbacks and their
  palette). Nothing else defines an id, a name or a slot count.
- **DATA-2** Check ids are derived from names (`<region>/<slug>`, CHECK-2)
  and item ids are written by hand. Ids are stable: they are what rooms
  store, so renaming a check must not change its id without a migration of
  every room that recorded it.
- **DATA-3** `npm run export-gamedata` (in `source/`) writes those three
  modules to `source/AlttpTracker.Api/gamedata.json`, the form the app
  reads. The JSON is committed, and CI fails if it does not match what the
  modules would produce.

## Seeding

- **DATA-4** At startup, after migrating the database, the app reads
  `gamedata.json` into the game tables (regions, checks, items, key rows,
  sprites, palette). The file is fingerprinted with SHA-256; a start with
  the same fingerprint as last time writes nothing.
- **DATA-5** The catalog — every item's name and slots, every check's full
  name, and the payload for API-3 — is read from those tables once, after
  seeding, and held in memory for the life of the process. The rules and
  the board both read from it, so they can never disagree about what exists.

## Sprites

- **DATA-6** The board prefers a real sprite: a PNG under
  `wwwroot/sprites/items/<sprite>.png` or `wwwroot/sprites/checks/<icon>.png`.
  Which PNGs exist is scanned from disk at startup and told to the board in
  API-3.
- **DATA-7** The PNGs are drawn from one packed sheet, `sprites/sheet.png`,
  with a CSS class per sprite in `sprites/sheet.css`, so the board makes one
  image request. `npm run build-sprites` regenerates both; the CSS carries a
  fingerprint of the source pixels, and `npm test` and CI fail when it is
  behind them.
- **DATA-8** A check glyph with no PNG of its own is drawn with the chest's
  (CHECK-4). An item sprite with no PNG falls back to the pixel art in
  `sprites.js`, rendered as inline SVG.

## Tests

- **DATA-9** `npm test` checks the game tables: 216 checks with unique ids,
  the key counts (11 big, 29 small), that every item names a sprite that is
  drawn, that every pixel-art grid is 12×12 from the palette, that every
  check resolves to a known glyph, and that the sheet is current.
- **DATA-10** The rules in `RoomService` are tested on SQLite in memory
  (`AlttpTracker.Api.Tests`), seeded from the same `gamedata.json`; the
  database's own responsibilities — migrations, the unique index, cascades,
  the sweeper — are tested on real Postgres in a container
  (`AlttpTracker.Api.IntegrationTests`).
- **DATA-11** The board is tested in a real browser with Playwright
  (`source/e2e`), against the app running on a real Postgres: what it
  draws, what each click does, what two boards on one room see of each
  other. Every item and check tile carries its id as `data-item` or
  `data-check` for the tests to address it by; names are not unique.
