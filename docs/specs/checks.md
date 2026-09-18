# Checks

The 216 item locations of *A Link to the Past*, and the marks a room can put
on them.

## The checks

- **CHECK-1** There are 216 checks in 16 regions: Light World (54), Death
  Mountain (14), Dark World (25), Hyrule Castle (8), Eastern Palace (6), Desert Palace (6),
  Tower of Hera (6), Castle Tower (2), Palace of Darkness (14), Swamp Palace
  (10), Skull Woods (8), Thieves' Town (8), Ice Palace (8), Misery Mire (8),
  Turtle Rock (12), Ganon's Tower (27).
- **CHECK-2** Names follow the community and randomizer convention, so they
  match spoiler logs and route notes. A check's id is `<region>/<slug>` —
  `dw/bumper-cave-ledge` — because names such as "Big Chest" repeat across
  dungeons. Its full name is `<region name> - <name>`, and that is what
  refusals and tooltips say.
- **CHECK-3** Each region has a short label (`LW`, `PoD`, `GT`) and a colour,
  used by the region chips, region headers and the location rows on item
  tiles.
- **CHECK-4** Each check has a glyph saying what kind of location it is —
  chest, big chest, NPC, boss drop, tablet, standing item, pot, enemy and so
  on — drawn from the sprite sheet when there is a PNG for it, and from the
  plain chest when there is not.

## Keydrop

In keydrop, the small keys that sit under pots or are dropped by enemies
are shuffled with everything else, so where they turn up is worth recording.

- **KEYDROP-1** There are 33 keydrop locations, all in dungeons: Hyrule
  Castle 4 (three key drops and the Big Key Drop), Eastern Palace 2, Desert
  Palace 3, Castle Tower 2, Swamp Palace 5, Skull Woods 2, Thieves' Town 2,
  Ice Palace 4, Misery Mire 3, Turtle Rock 2, Ganon's Tower 4. Palace of
  Darkness and Tower of Hera have none. Names end in `Pot Key` (under a pot,
  pot glyph) or `Key Drop` (from an enemy, enemy glyph); ids follow CHECK-2.
- **KEYDROP-2** Keydrop is a setting of the room (ROOM-13). When it is on the
  keydrop locations are checks like any other: they are listed in their
  dungeon after the regular checks, counted by the chips and the summary
  (249 in all), and can hold an item or be marked dead.
- **KEYDROP-3** When it is off they are not shown, and recording an item at
  one, or marking one dead, is refused with a message saying to turn on
  Keydrop for the room. Anything already recorded against one is kept and
  shown again when keydrop is turned back on; while off it is not counted as
  recorded.

## Dead checks

A check a player has looked at and found nothing worth recording, so that
nobody else spends time on it.

- **DEAD-1** Any check in a room can be marked dead, and a dead check can be
  brought back. The mark is per room and shared by everyone in it.
- **DEAD-2** Marking and bringing back are explicit ("make it dead", "make
  it not dead"), never a toggle, so two players clicking at once agree on
  the result. Marking a check that is already dead, or bringing back one
  that is not, succeeds and changes nothing.
- **DEAD-3** A check that holds an item cannot be marked dead. The refusal
  names the item. Clearing the item is the deliberate act.
- **DEAD-4** Marking a check dead is a write (ROOM-7): it creates the room
  if need be, and updates the room's changed time. Bringing a check back in
  a room that does not exist creates nothing.
- **DEAD-5** Reset (ROOM-10) removes every dead mark.
- **DEAD-6** Recording an item at a dead check brings it back as part of the
  recording (ITEM-9).
- **DEAD-7** A room that has dead marks but no assignments is a run in
  progress, not an empty room, for the sweeper (ROOM-11).
- **DEAD-8** The room state lists dead checks by id, in the order they were
  marked.
