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

## Shape of it

One ASP.NET Core app serves everything: the board out of `wwwroot`, the API it
calls, and the websocket it listens on — all the same origin. Postgres holds
both the rooms and the game itself. The JS at the repository root is not a
server; it is where the game is authored, plus the tooling that carries it
across.

A change is a request to the API, and the API pushes the new state down the
websocket to everyone in that room.

## Running it

```sh
dotnet run --project backend/AlttpTracker.AppHost
```

Aspire starts Postgres in a container, waits for it, applies any outstanding
migrations, seeds the game, and starts the app. It prints a dashboard URL where
the resources are listed with their addresses — open the `api` one to play.
The dashboard also has a **Run EF migrations** button on the database, for
applying a new migration without cycling the app.

Running the app on its own needs a Postgres to point at:

```sh
ConnectionStrings__tracker="Host=localhost;Database=tracker;Username=postgres;Password=..." \
  dotnet run --project backend/AlttpTracker.Api
```

### Tests

```sh
npm test                                            # game tables and sprites
dotnet test backend/AlttpTracker.Api.Tests          # the room rules, on SQLite
dotnet test backend/AlttpTracker.Api.IntegrationTests  # migrations and indexes, on real Postgres
```

The integration tests start their own Postgres with Testcontainers, so they
need Docker running; the other two do not.

From the board, share the URL from **Copy invite link** with the other players.
Anyone who opens it joins the same board. The room code is in the URL
(`?room=brave-deku`) and can be edited in the header.

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
| `src/checks.js`                          | The 216 checks, grouped into 15 regions                   |
| `src/items.js`                           | Items and dungeon keys, and how many locations each holds |
| `src/sprites.js`                         | Hand-drawn 12x12 pixel art for items and check icons      |
| `scripts/export-gamedata.js`             | Carries those three to `gamedata.json` for the API        |
| `test/smoke.test.js`                     | Game tables and sprites                                   |
| `backend/AlttpTracker.AppHost`           | Aspire: Postgres, the app, and the migrations command     |
| `backend/AlttpTracker.Api`               | The app: board, API, EF model, migrations, websockets     |
| `backend/AlttpTracker.Api/wwwroot`       | The board — no build step, no framework                   |
| `backend/AlttpTracker.Api.Tests`         | The room rules                                            |
| `backend/AlttpTracker.Api.IntegrationTests` | Database behaviour, on real Postgres                   |

### The API

| Route                                            | What it does                    |
| ------------------------------------------------ | ------------------------------- |
| `GET /api/gamedata`                              | Everything the board draws from |
| `GET /api/rooms/new-name`                        | An unused room code             |
| `GET /api/rooms/{room}`                          | The room, created on first ask  |
| `POST /api/rooms/{room}/assignments`             | Record an item at a check       |
| `DELETE /api/rooms/{room}/assignments/{id}`      | Clear one location              |
| `POST /api/rooms/{room}/reset`                   | Clear the room                  |
| `PUT /api/rooms/{room}/name`                     | Rename the session              |
| `GET /ws?room={room}`                            | Listen for changes              |

## Deploying

`.github/workflows/ci-cd.yml` builds, runs all three test suites, and — only on
a push to `main` — publishes and deploys to an Azure App Service. Pull requests
stop at the tests.

It signs in with OIDC rather than a publish profile, because new App Services
have basic authentication switched off by default. Before the first deploy:

1. Create an Entra app registration with a federated credential for this
   repository, and give it the **Contributor** role on the App Service.
2. Add repository **secrets** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and
   `AZURE_SUBSCRIPTION_ID`.
3. Add a repository **variable** `AZURE_WEBAPP_NAME` (and `AZURE_WEBAPP_SLOT`
   if you deploy to a slot).
4. On the App Service, set the connection string the app looks for:
   `ConnectionStrings__tracker`, pointing at the Postgres you provisioned.
   Turn on **Web sockets** in the configuration — the live updates need it.

Migrations run when the app starts, so a deploy brings the schema up with it.
That is fine for a single instance; if you ever scale out, apply them from the
pipeline instead so two instances cannot race.

One thing to know: `wwwroot/sprites/` is git-ignored, so a deployed build has no
sprite PNGs and every tile falls back to the drawn pixel art. If you want the
real art in production, either commit that folder or upload it separately.

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
