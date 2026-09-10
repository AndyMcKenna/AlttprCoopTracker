# ALTTP Co-op Tracker

A shared item tracker for co-op *A Link to the Past* runs. One player finds an
item, records **where** it was, and everyone else in the room sees it instantly.

It answers the question that actually comes up mid-run: *"where did we see the
Fire Rod again?"*

## How it works

1. Each of the 30 main items is a sprite tile on the left, with the dungeon
   keys as a third group under Equipment and Items.
2. Click the **pencil** in the item's top-right corner — the tracker arms it.
3. Click one of the **216 checks** on the right.
4. The check's name is stored next to the item's sprite as text, and the check
   tile is marked with the item it holds.

Everything is per-room and live: everyone on the same room code sees the same
board over a WebSocket, and rooms are kept in a database, so closing the browser
and coming back later picks the run up where it was.

## The two halves

| Piece                        | What it does                                                |
| ---------------------------- | ----------------------------------------------------------- |
| `backend/` (.NET Aspire)     | Rooms, the rules about what goes where, the database, and the websocket fan-out |
| the Node app at the root     | Serves the board and the game tables (the 216 checks, the items, the sprites) |

The browser reads the game tables from the Node app, then talks to the API for
everything to do with a room: a change is a request to the API, and the API
pushes the new state down the websocket to everyone in that room.

## Running it

Start both halves together with Aspire:

```sh
npm install
dotnet run --project backend/AlttpTracker.AppHost
```

Aspire starts the API, applies any outstanding database migrations, starts the
board, and prints a dashboard URL where both are listed with their addresses.
Open the `frontend` address to play.

To run the halves separately — useful when working on one of them:

```sh
dotnet run --project backend/AlttpTracker.Api   # http://localhost:5220
API_URL=http://localhost:5220 npm start         # http://localhost:3000
```

```sh
npm test                                  # game tables and sprites
dotnet test backend/AlttpTracker.Api.Tests   # the room rules
```

Share the URL from **Copy invite link** with the other players. Anyone on the
same machine or LAN who opens it joins the same board. The room code is in the
URL (`?room=demo`) and can be edited in the header.

## Details worth knowing

- **Progressive items have several slots.** Sword holds 4 locations, Shield 3,
  Bottle 4, and Mail, Gloves, Boomerang and Bow 2 each — the Bow's second slot
  is the silver arrows. These carry a `found/total` counter next to the name,
  green once every slot is placed. Single-slot items simply move when you
  re-assign them; multi-slot items fill up and then say so.
- **A check holds one item.** Assigning an item to a check that already has one
  is refused with a message naming the current holder — clear the old entry
  (the `×` next to it) first. Nobody's note gets silently overwritten.
- **Filtering.** Search by name, filter by region chips, or hide checks that are
  already recorded to see what's left. Searching looks inside collapsed regions
  and opens them, so results are never hidden behind a folded header.
- **Collapsible regions.** Light World and Dark World start open, the dungeons
  start folded; click any region header to toggle it.
- **Keys.** The key panel is one line per dungeon, big key then small keys, and
  works exactly like the item board. Small keys are interchangeable, so a
  dungeon gets one box holding as many locations as it has keys — Palace of
  Darkness 6, Turtle Rock and Ganon's Tower 4, and so on (11 big keys and 29
  small keys, matching the game). Hyrule Castle and Castle Tower have no big
  key; Eastern Palace has no small keys.
- **Names are optional.** Type one in the header and your assignments carry it,
  visible on hover.
- **Esc** cancels an armed item.

## Layout

| Path                                | What it is                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| `src/checks.js`                     | The 216 checks, grouped into 15 regions                        |
| `src/items.js`                      | Items and dungeon keys, and how many locations each holds      |
| `src/sprites.js`                    | Hand-drawn 12x12 pixel art for items and check icons           |
| `src/server.js`                     | Express static server and `/api/data`                          |
| `public/`                           | The client — no build step, no framework                       |
| `test/smoke.test.js`                | Game tables and sprites                                        |
| `backend/AlttpTracker.AppHost`      | Aspire: starts the API and the board together                  |
| `backend/AlttpTracker.Api`          | The API, EF Core model and migrations, websocket fan-out       |
| `backend/AlttpTracker.Api.Tests`    | The room rules                                                 |
| `scripts/export-gamedata.js`        | Writes `gamedata.json` for the API                             |

### The API

| Route                                            | What it does                    |
| ------------------------------------------------ | ------------------------------- |
| `GET /api/rooms/{room}`                          | The room, created on first ask  |
| `POST /api/rooms/{room}/assignments`             | Record an item at a check       |
| `DELETE /api/rooms/{room}/assignments/{id}`      | Clear one location              |
| `POST /api/rooms/{room}/reset`                   | Clear the room                  |
| `PUT /api/rooms/{room}/name`                     | Rename the session              |
| `GET /ws?room={room}`                            | Listen for changes              |

Rooms live in SQLite next to the API (`tracker.db`, git-ignored) and migrations
run at startup, so a clean checkout needs no setup step. Delete the file to wipe
every room; the **Reset** button clears just the current one.

The API has to know the same things the board does — which item and check ids
exist, and how many locations an item holds — so `scripts/export-gamedata.js`
writes them to `gamedata.json` from the JS modules. The JS files stay the single
source of truth; run `npm run export-gamedata` after editing `checks.js` or
`items.js`.

## Sprites

The item art is original pixel art drawn as 12x12 character grids in
`src/sprites.js`, rendered to inline SVG in the browser — no ripped game assets,
and nothing to download. Each check tile gets a glyph based on what kind of
location it is: chest, big chest, NPC, boss drop, tablet, or freestanding item.
