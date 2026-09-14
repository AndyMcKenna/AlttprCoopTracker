# The board

`board.html`: what a player sees and clicks. Plain HTML, CSS and JS with no
build step. Everything here is a rule about what the board does, not how it
is drawn.

## Principle

- **BOARD-1** The board is worked with one hand, the other on the
  controller. Every action mid-run is a click; nothing needs typing except a
  room code, and that happens before the run.

## Layout

- **BOARD-2** A top bar: the title (a link home), the connection status, how
  many players are in the room, the room code box, the **Keydrop** switch
  (ROOM-13), **Copy invite link** and **Reset**. The switch shows the room's
  setting and changes it for everyone.
- **BOARD-3** Two panels. Left: the item board. Right: the checks. The seam
  between them can be dragged to give either side more room, or nudged with
  the arrow keys once focused; the width is kept in the browser and comes
  back on the next visit. Double-clicking the seam (or Backspace/Delete on
  it) returns to the default split. Neither panel can be dragged narrower
  than it needs to draw its tiles. On a page too narrow for two columns the
  panels stack and the seam is not offered.
- **BOARD-4** The item board is two tabs, **Items** and **Keys**. Items
  shows the Equipment and Items groups as tiles; Keys shows one line per
  dungeon with its big-key box then its small-key box (or the small-key box
  alone, kept in its column, where there is no big key). Items is selected
  on load. Switching tabs changes nothing else — in particular whatever is
  armed stays armed.
- **BOARD-5** The item panel's summary follows the tab: Items counts tiles
  with at least one location out of 32; Keys counts keys found out of 40 (a
  box with 2 of 6 counts 2).
- **BOARD-6** The check panel lists checks by region under a header that
  folds the region. Light World, Death Mountain and Dark World start open;
  the dungeons start folded. Filtering to a region opens it; dropping the filter returns
  every region to its default.
- **BOARD-7** The check panel's summary reads `<recorded> of 216 recorded`
  (249 in keydrop), followed by `, <n> dead` when any are. Only checks in
  play are counted on either side.

## Tiles

- **BOARD-8** An item tile shows the item's sprite, name, and one row per
  recorded location (region label, check name, and a `×` that clears just
  that row). A progressive item, and every small-key box, shows
  `found/slots`, green once full. A tile with no location is drawn dimmed.
- **BOARD-9** The whole item tile is its button: clicking anywhere on it
  arms the item. The `×` on a row clears that row and does not arm the tile.
  A tile can be reached with the keyboard and armed with Enter or Space.
- **BOARD-10** A check tile shows its glyph and name, and, under the name,
  the item it holds or `nothing` if it is dead. A tile with an item is drawn
  green-tinged; a dead tile is dimmed with a dashed border.
- **BOARD-11** Every check tile without an item has a small `∅` button at
  its edge that marks it dead, or, if it is dead, brings it back.

## Recording: either order

- **BOARD-12** A pairing is one item and one check, clicked in either order.
  The first click **arms** its tile; the second click completes the pair and
  sends the recording. Nothing is recorded until both are clicked.
- **BOARD-13** While something is armed, a bar at the bottom of the page says
  what is still to be clicked ("Click the check where Hookshot was found" /
  "Click the item found at Light World - Link's House") with a Cancel
  button; the armed tile is outlined; and tiles of the other kind light up
  as the pointer passes over them.
- **BOARD-14** Clicking the armed tile again puts it down. Clicking a
  different tile of the same kind arms that one instead. **Esc**, a
  **right-click** anywhere on the page, and the Cancel button put down
  whatever is armed. A right-click that cancels something does not open the
  browser's menu; one with nothing armed is left to the browser.
- **BOARD-15** A check that holds an item cannot be armed. Clicking it with
  nothing armed shows a hint naming the holder and saying to clear it from
  that item first. (With an item armed, the click is sent and the service
  refuses it, ITEM-6, and the refusal is shown as a hint.)
- **BOARD-16** Clicking a dead check with nothing armed brings it back. With
  an item armed, the pairing is sent and the check comes back as part of it
  (ITEM-9).
- **BOARD-17** Marking a check dead while that check is armed puts it down.

## Filters

- **BOARD-18** Region chips, one per region plus **All**, filter the check
  list. Chips can be combined; All clears them. With no filter on, All works
  the folds instead: it opens every region, and, when every region is
  already open, folds them back to the default (BOARD-6). All is drawn as
  selected whenever no filter is on. There is no text search.
- **BOARD-19** **Hide recorded/dead** hides every check that holds an item
  or is dead, leaving what is still worth visiting. Region headers count
  what is shown.

## Feedback

- **BOARD-20** A refusal or a problem is shown as a hint under the top bar
  for four seconds. Refusals come from the service word for word.
- **BOARD-21** The status pill reads Connecting…, Connected, Reconnecting…,
  Service unreachable or Service restarting. A 5xx from the service means it
  is down or mid-deploy: the click is lost, the board is not, and the player
  is told to try again in a moment. A 429 tells the player to wait a moment.
- **BOARD-22** **Copy invite link** copies the board's URL with the room
  code, and says so; if the clipboard is not available, the link is shown in
  the hint instead.
- **BOARD-23** **Reset** asks for confirmation, naming the room, before
  clearing it.
- **BOARD-24** The board applies the response to its own request as soon as
  it arrives rather than waiting for the broadcast, subject to the ordering
  rule in [live-updates.md](live-updates.md).

## The home page

- **BOARD-25** `index.html` offers a fresh room code (ROOM-3) and a box to
  type one already shared. A typed code is folded the same way the service
  folds it (ROOM-1) before the board opens. It also links to the changelog
  and the GitHub repository.
