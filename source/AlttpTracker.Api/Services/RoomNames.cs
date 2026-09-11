using AlttpTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api.Services;

/// <summary>
/// Makes up room codes like "brave-deku" — two words a player can read out
/// over voice chat without spelling anything.
/// </summary>
public static class RoomNames
{
    private static readonly string[] Adjectives =
    [
        "amber", "ancient", "azure", "blazing", "bold", "brave", "breezy", "bright",
        "cheerful", "clever", "cosmic", "crimson", "curious", "daring", "dazzling", "eager",
        "earnest", "emerald", "fabled", "fearless", "gallant", "gentle", "gleaming", "glowing",
        "golden", "grand", "hidden", "hopeful", "humble", "jolly", "keen", "kindly",
        "lively", "lucky", "mellow", "merry", "mighty", "misty", "nimble", "noble",
        "plucky", "quiet", "radiant", "roaming", "rugged", "sapphire", "secret", "shining",
        "silent", "silver", "spirited", "steady", "stormy", "sturdy", "sunlit", "swift",
        "tidy", "twilight", "valiant", "velvet", "wandering", "whimsical", "winding", "wondrous",
    ];

    private static readonly string[] Nouns =
    [
        "agahnim", "armos", "arrow", "beamos", "blacksmith", "bombos", "boomerang", "boots",
        "bottle", "bumper", "cape", "catfish", "chest", "crystal", "cucco", "deku",
        "dungeon", "ether", "fairy", "flippers", "flute", "ganon", "goron", "hammer",
        "hookshot", "hyrule", "kakariko", "keese", "lantern", "lynel", "medallion", "mirror",
        "moblin", "moldorm", "mothula", "mushroom", "ocarina", "octorok", "peahat", "pendant",
        "powder", "pyramid", "quake", "quiver", "rupee", "sahasrahla", "sanctuary", "sheikah",
        "shield", "shovel", "stalfos", "sword", "tablet", "tektite", "torch", "triforce",
        "turtle", "vitreous", "waterfall", "windmill", "zelda", "zora",
    ];

    /// <summary>
    /// A code nobody is using yet. Falls back to adding digits if the pairs it
    /// tries are all taken, so this always returns something.
    /// </summary>
    public static async Task<string> SuggestAsync(TrackerDbContext db, CancellationToken cancellationToken = default)
    {
        for (var attempt = 0; attempt < 12; attempt += 1)
        {
            var candidate = Pair();
            if (!await db.Rooms.AnyAsync(r => r.Id == candidate, cancellationToken))
            {
                return candidate;
            }
        }

        // Every pair tried is in use — rare, but the button still has to work.
        for (var attempt = 0; attempt < 50; attempt += 1)
        {
            var candidate = $"{Pair()}-{Random.Shared.Next(10, 100)}";
            if (!await db.Rooms.AnyAsync(r => r.Id == candidate, cancellationToken))
            {
                return candidate;
            }
        }

        return $"{Pair()}-{Guid.NewGuid().ToString("n")[..6]}";
    }

    private static string Pair() =>
        $"{Adjectives[Random.Shared.Next(Adjectives.Length)]}-{Nouns[Random.Shared.Next(Nouns.Length)]}";
}
