using System.Text.Json;

namespace AlttpTracker.Api;

public record GameItem(string Id, string Name, int Slots);

public record GameCheck(string Id, string FullName);

/// <summary>
/// The item and check tables, loaded from gamedata.json at startup.
/// </summary>
/// <remarks>
/// The file is written by scripts/export-gamedata.js from the same JS modules
/// the board renders from, so the rules enforced here cannot drift from the
/// tracker's own idea of what an item is or how many locations it holds.
/// </remarks>
public class GameData
{
    private GameData(IReadOnlyDictionary<string, GameItem> items, IReadOnlyDictionary<string, GameCheck> checks)
    {
        Items = items;
        Checks = checks;
    }

    public IReadOnlyDictionary<string, GameItem> Items { get; }

    public IReadOnlyDictionary<string, GameCheck> Checks { get; }

    public static GameData Load(string path)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException(
                $"Game data not found at {path}. Run 'node scripts/export-gamedata.js' from the repository root.",
                path);
        }

        using var stream = File.OpenRead(path);
        var payload = JsonSerializer.Deserialize<Payload>(stream, JsonOptions)
            ?? throw new InvalidDataException($"Game data at {path} is empty.");

        if (payload.Items.Count == 0 || payload.Checks.Count == 0)
        {
            throw new InvalidDataException($"Game data at {path} has no items or no checks.");
        }

        return new GameData(
            payload.Items.ToDictionary(i => i.Id, StringComparer.Ordinal),
            payload.Checks.ToDictionary(c => c.Id, StringComparer.Ordinal));
    }

    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    private sealed record Payload(List<GameItem> Items, List<GameCheck> Checks);
}
