# Specifications

These files say how the tracker behaves. They are the contract: the code
implements them, the tests check them, and the README describes them to a
player. When behaviour changes, the specification changes in the same PR — a
spec that no longer matches the app is a bug in whichever one is wrong.

Each statement is numbered so that a test, an issue or a PR can point at it
(`BOARD-7`, `ROOM-3`).

| File                                                | What it covers                                            |
| --------------------------------------------------- | --------------------------------------------------------- |
| [rooms.md](rooms.md)                                | Room codes, when a room exists, persistence, retention    |
| [items-and-locations.md](items-and-locations.md)    | Items, keys, slots, and the rules for recording locations |
| [checks.md](checks.md)                              | The 216 checks, regions, and dead checks                  |
| [board.md](board.md)                                | The board: layout, tabs, clicking, filters, feedback      |
| [api.md](api.md)                                    | Routes, payloads, errors, limits                          |
| [live-updates.md](live-updates.md)                  | The websocket, broadcasts, ordering, reconnecting         |
| [game-data.md](game-data.md)                        | Where the game is authored and how it reaches the app     |

Words used throughout:

- **Item** — one of the 30 main items, or a dungeon's big-key or small-key box.
- **Check** — one of the 216 item locations in the game.
- **Location** (of an item) — a check the item has been recorded at. One row
  in the item's tile.
- **Assignment** — the pairing of one item with one check; the stored form of
  a location.
- **Dead** — a check marked as holding nothing worth recording.
- **Armed** — the half of a pairing that has been clicked and is waiting for
  the other half.
- **Room** — one shared board, addressed by its code.
