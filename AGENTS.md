# Working in this repository

Rules for anyone — person or agent — changing this code. The README explains
what the tracker is and how to run it; this file is about how to change it.

## Where things are

- `source/AlttpTracker.Api` is the app: the board in `wwwroot` (plain HTML,
  CSS and JS — no framework, no build step), the API and websocket in
  `Program.cs`, the rules in `Services/RoomService.cs`, the EF model and
  migrations under `Data/`.
- `source/data/*.js` is where the game is authored. `checks.js` and
  `items.js` are the single source of truth for ids, names and slot counts.
- `docs/` holds the screenshot and, once they exist, the specifications.

## Generated files that must be kept current

- After editing `source/data/checks.js`, `items.js` or `sprites.js`, run
  `npm run export-gamedata` in `source/` and commit `gamedata.json`. CI
  diffs it.
- After adding or redrawing a PNG under `wwwroot/sprites`, run
  `npm run build-sprites` in `source/` and commit `sheet.png` and
  `sheet.css`. CI diffs the CSS.
- After changing the EF model, add a migration:
  `dotnet ef migrations add <Name> --project source/AlttpTracker.Api`
  and commit the migration and the updated model snapshot. Migrations run
  when the app starts.

## Tests

Run what your change touches before opening a PR; CI runs all three.

```sh
cd source
npm test                                        # game tables and sprites
dotnet test AlttpTracker.Api.Tests              # the room rules, on SQLite
dotnet test AlttpTracker.Api.IntegrationTests   # migrations and indexes, on Postgres (needs Docker)
```

A new rule in `RoomService` gets a test in `RoomServiceTests`. Anything the
database itself is responsible for — an index, a cascade, a migration — gets
one in `DatabaseTests`.

## Changelog

`source/AlttpTracker.Api/wwwroot/changelog.html` is what players read.
Every user-visible change adds a bullet under the current release heading,
written for a player, not a developer: what they can now do, not which
function changed. Internal work (docs, tooling, refactors) does not go in.

## Keeping the README true

The README describes how the board behaves. When a change alters that —
a control moves, a gesture changes, a route is added — update the sentence
that describes it in the same PR.

## Style

- Comments say why, not what. Match the density of the surrounding code.
- The board stays 100% clickable: nothing should need typing mid-run
  beyond the room code.
- Commit messages: an imperative summary line, then a body that explains
  the reasoning and anything non-obvious about the change.
- One issue per branch, one PR per issue. Stack PRs when one depends on
  another, and say so in the PR description.
- Work in a git worktree, not on a branch switched in place, so that two
  pieces of work never share a working copy. Worktrees live beside the
  repository in `C:\source\alttp-coop-tracker.worktrees\`, one folder per
  piece of work, named `<issue-number>-<short-description>`
  (`20-resizable-panel`); leave the number off when there is no issue
  (`readme-drop-deploying`). Each worktree needs its own `npm ci` in
  `source/` before the tooling or the browser tests will run there.
