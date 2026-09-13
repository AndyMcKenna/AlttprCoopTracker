# Items and locations

The point of the tracker: which check each item was found at.

## Items

- **ITEM-1** There are 32 main items, in two groups. Equipment: Sword,
  Shield, Mail, Gloves, Pegasus Boots, Flippers, Moon Pearl, Heart
  Container, 300 Rupees. Items: Bow, Blue
  Boomerang, Red Boomerang, Hookshot, Mushroom, Magic Powder, Fire Rod, Ice
  Rod, Bombos, Ether, Quake, Lamp, Hammer, Shovel, Flute, Bug Net, Book of
  Mudora, Bottle, Cane of Somaria, Cane of Byrna, Magic Cape, Magic Mirror,
  Half Magic.
- **ITEM-2** Each item has a number of **slots**: how many separate locations
  it can hold. Heart Container 11, Sword 4, Bottle 4, 300 Rupees 4, Shield
  3, Mail 2, Gloves 2, Bow 2 (the second is the silver arrows). Every other
  main item has 1. The two
  boomerangs are separate items, not one progressive one.
- **ITEM-3** Keys are items too, one per dungeon per kind: a big-key box
  with 1 slot, and a small-key box with as many slots as the dungeon has
  small keys, since small keys are interchangeable. Hyrule Castle 1 small,
  Castle Tower 2 small (neither has a big key); Eastern Palace big only;
  Desert Palace, Tower of Hera, Swamp Palace and Thieves' Town 1 small;
  Ice Palace 2; Skull Woods and Misery Mire 3; Turtle Rock and Ganon's
  Tower 4; Palace of Darkness 6. That is 11 big keys and 29 small keys, 40
  in all, in 23 boxes.
- **ITEM-4** Keys follow exactly the same rules as main items. Nothing below
  distinguishes them.

## Recording a location

- **ITEM-5** A location is recorded by pairing one item with one check. The
  result is an assignment: item, check, and the time it was recorded.
- **ITEM-6** A check holds at most one item. Recording an item at a check
  that already holds one is refused, and the refusal names the item that
  holds it. The existing entry is never overwritten.
- **ITEM-7** An item with one slot that already has a location **moves**: the
  old location is dropped and the new one recorded, in the one write.
- **ITEM-8** An item with several slots fills them in order. Recording it
  when every slot is taken is refused, and the refusal says how many
  locations it holds. To change one, clear it first (ITEM-10).
- **ITEM-9** Recording an item at a dead check brings the check back (see
  [checks.md](checks.md), DEAD-6) and records the item, in the one write.
- **ITEM-10** Any one location can be cleared on its own. Clearing a
  location that is already gone is not an error.
- **ITEM-11** Two players recording the same check at the same instant: the
  database's unique index on (room, check) lets exactly one through. The
  other is refused as in ITEM-6, naming whichever item won.
- **ITEM-12** An item or check id that is not in the game data is refused as
  unknown. A request missing either id is refused, not an error.
- **ITEM-13** A location, once recorded, is ordered by the time it was
  recorded. The item's list of locations shows them in that order.
