using System.Security.Cryptography;
using System.Text.Json;
using AlttpTracker.Api.Data;
using AlttpTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api;

/// <summary>
/// Puts the game into the database from gamedata.json, which
/// scripts/export-gamedata.js writes out of the JS modules.
/// </summary>
/// <remarks>
/// The file is fingerprinted, so a start with unchanged data does nothing and
/// an edited board is picked up without anyone having to remember a command.
/// </remarks>
public class GameDataSeeder(TrackerDbContext db, ILogger<GameDataSeeder> logger)
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    public async Task SeedAsync(string path, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException(
                $"Game data not found at {path}. Run 'npm run export-gamedata' from the repository root.",
                path);
        }

        var json = await File.ReadAllBytesAsync(path, cancellationToken);
        var hash = Convert.ToHexString(SHA256.HashData(json));

        var current = await db.GameDataVersions.FirstOrDefaultAsync(cancellationToken);
        if (current?.Hash == hash)
        {
            logger.LogInformation("Game data already seeded and unchanged.");
            return;
        }

        var payload = JsonSerializer.Deserialize<Payload>(json, JsonOptions)
            ?? throw new InvalidDataException($"Game data at {path} is empty.");

        if (payload.Checks.Count == 0 || payload.Items.Count == 0)
        {
            throw new InvalidDataException($"Game data at {path} has no checks or no items.");
        }

        logger.LogInformation(
            "Seeding game data: {Regions} regions, {Checks} checks, {Items} items, {Sprites} sprites.",
            payload.Regions.Count, payload.Checks.Count, payload.Items.Count, payload.Sprites.Count);

        // Replaced wholesale rather than merged: the JS modules are the source
        // of truth, so whatever they no longer mention should not survive.
        await db.GameRegions.ExecuteDeleteAsync(cancellationToken);
        await db.GameChecks.ExecuteDeleteAsync(cancellationToken);
        await db.GameItems.ExecuteDeleteAsync(cancellationToken);
        await db.GameKeyRows.ExecuteDeleteAsync(cancellationToken);
        await db.GameSprites.ExecuteDeleteAsync(cancellationToken);
        await db.GamePalette.ExecuteDeleteAsync(cancellationToken);

        db.GameRegions.AddRange(payload.Regions);
        db.GameChecks.AddRange(payload.Checks);
        db.GameItems.AddRange(payload.Items);
        db.GameKeyRows.AddRange(payload.KeyPanel);
        db.GamePalette.AddRange(payload.Palette);
        db.GameSprites.AddRange(payload.Sprites.Select(s => new GameSprite
        {
            Name = s.Name,
            Kind = s.Kind,
            Rows = s.Rows,
        }));

        if (current is null)
        {
            db.GameDataVersions.Add(new GameDataVersion { Hash = hash, SeededAt = DateTimeOffset.UtcNow });
        }
        else
        {
            current.Hash = hash;
            current.SeededAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private sealed record SpritePayload(string Name, string Kind, List<string> Rows);

    private sealed record Payload(
        List<GameRegion> Regions,
        List<GameCheck> Checks,
        List<GameItem> Items,
        List<GameKeyRow> KeyPanel,
        List<GamePaletteEntry> Palette,
        List<SpritePayload> Sprites);
}
