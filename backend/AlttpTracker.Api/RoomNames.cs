using AlttpTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api;

/// <summary>
/// Makes up room codes like "brave-deku" — two words a player can read out
/// over voice chat without spelling anything.
/// </summary>
public static class RoomNames
{
    private static readonly string[] Adjectives =
    [
        "ancient", "azure", "bold", "brave", "bright", "clever", "crimson", "curious",
        "daring", "eager", "fearless", "gentle", "golden", "hidden", "humble", "lucky",
        "merry", "mighty", "misty", "noble", "quiet", "radiant", "roaming", "secret",
        "shining", "silent", "steady", "sturdy", "sunlit", "swift", "valiant", "wandering",
    ];

    private static readonly string[] Nouns =
    [
        "armos", "boomerang", "chest", "deku", "dungeon", "ether", "flippers", "flute",
        "goron", "hookshot", "hyrule", "kakariko", "keese", "lantern", "medallion", "moblin",
        "mushroom", "ocarina", "octorok", "peahat", "pendant", "pyramid", "quake", "rupee",
        "sanctuary", "shield", "stalfos", "tektite", "triforce", "windmill", "zora",
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
