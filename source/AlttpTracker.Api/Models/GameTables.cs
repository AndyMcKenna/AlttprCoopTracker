namespace AlttpTracker.Api.Models;

/// <summary>
/// The game itself, as rows: the regions, the 216 checks, the items and keys,
/// and the drawn pixel art. Authored in the JS modules and seeded from
/// gamedata.json, then served to the board from here.
/// </summary>
/// <remarks>
/// Every table carries an <c>Ordinal</c> because the board's order is
/// meaningful — checks read in route order, items in board order — and rows
/// come back from a database in no particular order otherwise.
/// </remarks>
public class GameRegion
{
    public required string Id { get; set; }

    public required string Name { get; set; }

    public required string Short { get; set; }

    public required string Color { get; set; }

    /// <summary>How many checks the region holds, shown on its filter chip.</summary>
    public int Count { get; set; }

    /// <summary>How many more it holds when the room is playing keydrop.</summary>
    public int KeydropCount { get; set; }

    public int Ordinal { get; set; }
}

public class GameCheck
{
    public required string Id { get; set; }

    public required string Name { get; set; }

    /// <summary>Region-qualified, because check names repeat between dungeons.</summary>
    public required string FullName { get; set; }

    public required string Region { get; set; }

    public required string RegionName { get; set; }

    public required string RegionShort { get; set; }

    /// <summary>Which glyph the tile shows: chest, boss, mirror, and so on.</summary>
    public required string Icon { get; set; }

    /// <summary>A key under a pot or on an enemy: only in play when the room is playing keydrop.</summary>
    public bool Keydrop { get; set; }

    public int Ordinal { get; set; }
}

public class GameItem
{
    public required string Id { get; set; }

    /// <summary>Unique and unambiguous, e.g. "EP Big Key".</summary>
    public required string Name { get; set; }

    /// <summary>Shorter label for the key rows, where the dungeon is the heading.</summary>
    public string? Label { get; set; }

    public required string Sprite { get; set; }

    /// <summary>How many locations it can hold; 4 for the sword, 1 for the lamp.</summary>
    public int Slots { get; set; }

    /// <summary>How many when the room is playing keydrop; the same for everything but small keys.</summary>
    public int KeydropSlots { get; set; }

    /// <summary>Exists only in keydrop: Hyrule Castle's big key, Eastern Palace's small keys.</summary>
    public bool KeydropOnly { get; set; }

    /// <summary>The key-row label in keydrop, where a box may hold more keys.</summary>
    public string? KeydropLabel { get; set; }

    /// <summary>Equipment or Items; null for keys, which are grouped by dungeon.</summary>
    public string? Group { get; set; }

    /// <summary>"items" or "keys".</summary>
    public required string Panel { get; set; }

    public string? Dungeon { get; set; }

    /// <summary>Show the counter even at one slot, so "0/1" reads as "one key".</summary>
    public bool AlwaysCount { get; set; }

    public int Ordinal { get; set; }
}

/// <summary>One line of the key board: a dungeon, its big key and its small keys.</summary>
public class GameKeyRow
{
    public required string Id { get; set; }

    public required string Name { get; set; }

    public required string Short { get; set; }

    public required string Color { get; set; }

    public string? BigKey { get; set; }

    public string? SmallKey { get; set; }

    public int Ordinal { get; set; }
}

/// <summary>A 12x12 grid of palette symbols, one row per string.</summary>
public class GameSprite
{
    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>"item" for board tiles, "icon" for check glyphs.</summary>
    public required string Kind { get; set; }

    public required List<string> Rows { get; set; }
}

public class GamePaletteEntry
{
    public required string Symbol { get; set; }

    public required string Color { get; set; }
}

/// <summary>
/// A fingerprint of the seeded game data, so a changed gamedata.json is
/// noticed on start and an unchanged one costs nothing.
/// </summary>
public class GameDataVersion
{
    public int Id { get; set; }

    public required string Hash { get; set; }

    public DateTimeOffset SeededAt { get; set; }
}
