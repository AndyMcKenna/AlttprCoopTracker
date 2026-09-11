using System.Security.Cryptography;
using AlttpTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api.Services;

/// <summary>
/// Makes up room codes like "brave-golden-deku" — words a player can read out
/// over voice chat without spelling anything.
/// </summary>
/// <remarks>
/// Three words rather than two on purpose. The code is the only thing that
/// gates a room, and two words from these lists is about four thousand codes,
/// few enough for someone to try them all and reset every live game. Three
/// is a quarter of a million, which with the request limits is out of reach.
/// </remarks>
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
    /// A code nobody is using yet. Falls back to adding digits if the codes it
    /// tries are all taken, so this always returns something.
    /// </summary>
    public static async Task<string> SuggestAsync(TrackerDbContext db, CancellationToken cancellationToken = default)
    {
        for (var attempt = 0; attempt < 12; attempt += 1)
        {
            var candidate = Triple();
            if (!await db.Rooms.AnyAsync(r => r.Id == candidate, cancellationToken))
            {
                return candidate;
            }
        }

        // Every code tried is in use — rare, but the button still has to work.
        // Two words here, not three: the longest three plus digits would not
        // fit the 32 characters a room id has.
        for (var attempt = 0; attempt < 50; attempt += 1)
        {
            var candidate = $"{Pair()}-{RandomNumberGenerator.GetInt32(1000, 10000)}";
            if (!await db.Rooms.AnyAsync(r => r.Id == candidate, cancellationToken))
            {
                return candidate;
            }
        }

        return $"{Pair()}-{Guid.NewGuid().ToString("n")[..6]}";
    }

    /// <summary>Two adjectives and a noun, the second adjective never the first.</summary>
    private static string Triple()
    {
        var first = Pick(Adjectives);
        string second;
        do
        {
            second = Pick(Adjectives);
        }
        while (second == first);

        return $"{first}-{second}-{Pick(Nouns)}";
    }

    private static string Pair() => $"{Pick(Adjectives)}-{Pick(Nouns)}";

    // The code is what admits a player to a room, so it is drawn from the
    // system's random source rather than a seeded generator someone could
    // follow along with.
    private static string Pick(string[] words) => words[RandomNumberGenerator.GetInt32(words.Length)];
}
