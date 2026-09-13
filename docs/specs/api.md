# The API

One ASP.NET Core app serves the board, the API and the websocket from the
same origin, so the board's requests are relative (`api/rooms/...`).

## Routes

| Route                                       | Does                                                                |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `GET /api/gamedata`                         | Everything the board draws from (API-3)                             |
| `GET /api/rooms/new-name`                   | `{ "room": "<code>" }`, a code nobody is using (ROOM-3)             |
| `GET /api/rooms/{room}`                     | The room state (API-4); an empty board if never written (ROOM-6)    |
| `POST /api/rooms/{room}/assignments`        | Body `{ itemId, checkId }`. Records a location (ITEM-5 to ITEM-13)  |
| `DELETE /api/rooms/{room}/assignments/{id}` | Clears one location by assignment id (ITEM-10)                      |
| `PUT /api/rooms/{room}/dead`                | Body `{ checkId, dead: true\|false }`. Marks or brings back (DEAD-*) |
| `POST /api/rooms/{room}/reset`              | Clears the room (ROOM-10)                                           |
| `GET /ws?room={room}`                       | The websocket ([live-updates.md](live-updates.md))                  |
| `GET /alive`                                | Liveness: the process is up                                         |
| `GET /health`                               | Readiness, including the database; development only                 |

- **API-1** `{room}` in any path is folded as in ROOM-1 before use.
- **API-2** Every write (POST, DELETE, PUT above) responds with the room
  state after the write, as read back from the database — not as the
  request saw it — and broadcasts that same state to the room (LIVE-2).

## Payloads

- **API-3** `GET /api/gamedata` returns the items (id, name, label, sprite,
  slots, group, panel, dungeon, alwaysCount), the item groups in display
  order, the key panel rows, the regions (id, name, short, color, count),
  the checks (id, name, fullName, region, regionName, regionShort, icon),
  the pixel-art palette and sprites, and which sprite PNGs exist on disk.
  It is loaded once at startup and does not change while the app runs.
- **API-4** A room state is:

  ```json
  {
    "id": "brave-golden-deku",
    "createdAt": 1789249478622,
    "updatedAt": 1789249503364,
    "assignments": {
      "lamp": [{ "id": "<guid>", "checkId": "lw/links-uncle", "at": 1789249484241 }]
    },
    "dead": ["dw/bumper-cave-ledge"]
  }
  ```

  Times are Unix milliseconds. Assignments are grouped by item id, each
  list in the order recorded (ITEM-13); items with no location are absent.
  Dead checks are ids in the order marked (DEAD-8).

## Refusals and errors

- **API-5** A refused change is `400` with `{ "error": "<message>" }`. The
  message is written for the player and shown by the board as-is. The
  messages are those in [items-and-locations.md](items-and-locations.md)
  and [checks.md](checks.md): who holds the check, how many locations the
  item has, unknown ids, missing fields.
- **API-6** A refusal changes nothing in the room and is not broadcast.
  Other players keep the state the service has.
- **API-7** A body that is not JSON, or an assignment id that is not a GUID,
  is a `400` from the framework rather than a refusal.

## Limits

The API is open to anyone with a room code, so it defends itself with
limits rather than logins.

- **API-8** `/api/*` allows 120 requests per minute per client address. Over
  that is `429`, with nothing queued.
- **API-9** `/ws` allows 32 open sockets per client address. The 33rd is
  refused with `429`.
- **API-9a** Both numbers are the defaults and can be raised through
  configuration (`RateLimits:ApiPerMinute`, `RateLimits:SocketsPerAddress`).
  The browser test suite does, since all of its boards come from one
  address; nothing else should.
- **API-10** The client address is the connection's, or the forwarded
  address when the host is configured to trust its proxy's forwarded
  headers. Without that, behind a proxy, every player is one client.
- **API-11** A room code is at most 32 characters (ROOM-1), an item or check
  id at most 64. Ids not in the game data are refused (ITEM-12), so a
  room's rows can only ever name real items and checks.
