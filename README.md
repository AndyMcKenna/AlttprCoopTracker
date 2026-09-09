# ALTTP Co-op Tracker

A shared item tracker for co-op *A Link to the Past* runs. One player finds an
item, records **where** it was, and everyone else in the room sees it instantly.

It answers the question that actually comes up mid-run: *"where did we see the
Fire Rod again?"*

## How it works

1. Each of the 31 main items is a sprite tile on the left.
2. Click **Set location** on an item — the tracker arms that item.
3. Click one of the **216 checks** on the right.
4. The check's name is stored next to the item's sprite as text, and the check
   tile is marked with the item it holds.

Everything is per-room and live: everyone on the same room code sees the same
board over a WebSocket, and the room survives a server restart.

## Running it

```sh
npm install
npm start          # http://localhost:3000
```

```sh
PORT=8080 npm start   # different port
npm test              # data + store checks
```

Share the URL from **Copy invite link** with the other players. Anyone on the
same machine or LAN who opens it joins the same board. The room code is in the
URL (`?room=demo`) and can be edited in the header.

## Details worth knowing

- **Progressive items have several slots.** Sword holds 4 locations, Shield 3,
  Mail/Gloves/Bow/Boomerang 2, Bottle 4. Single-slot items simply move when you
  re-assign them; multi-slot items fill up and then say so.
- **A check holds one item.** Assigning an item to a check that already has one
  is refused with a message naming the current holder — clear the old entry
  (the `×` next to it) first. Nobody's note gets silently overwritten.
- **Filtering.** Search by name, filter by region chips, or hide checks that are
  already recorded to see what's left.
- **Names are optional.** Type one in the header and your assignments carry it,
  visible on hover.
- **Esc** cancels an armed item.

## Layout

| Path                 | What it is                                             |
| -------------------- | ------------------------------------------------------ |
| `src/checks.js`      | The 216 checks, grouped into 16 regions                |
| `src/items.js`       | The tracked items and how many locations each holds    |
| `src/sprites.js`     | Hand-drawn 12x12 pixel art for items and check icons   |
| `src/store.js`       | Room state, the assignment rules, JSON persistence     |
| `src/server.js`      | Express static server, `/api/data`, WebSocket fan-out  |
| `public/`            | The client — no build step, no framework               |
| `test/smoke.test.js` | Data integrity and store behaviour                     |

Sessions are written to `data/rooms.json` (git-ignored). Delete it to wipe every
room; the **Reset** button clears just the current one.

## Sprites

The item art is original pixel art drawn as 12x12 character grids in
`src/sprites.js`, rendered to inline SVG in the browser — no ripped game assets,
and nothing to download. Each check tile gets a glyph based on what kind of
location it is: chest, big chest, NPC, boss drop, tablet, or freestanding item.
