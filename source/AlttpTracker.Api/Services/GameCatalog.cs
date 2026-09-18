using AlttpTracker.Api.Data;
using AlttpTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api.Services;

public record CatalogItem(string Id, string Name, int Slots, int KeydropSlots, bool KeydropOnly)
{
    /// <summary>How many locations the item holds in a room playing, or not playing, keydrop.</summary>
    public int SlotsFor(bool keydrop) => keydrop ? KeydropSlots : Slots;
}

public record CatalogCheck(string Id, string FullName, bool Keydrop);

/// <summary>
/// The game data, read out of the database once at startup and held in memory.
/// </summary>
/// <remarks>
/// It only changes when the seeder runs, which is before this loads, so there
/// is nothing to invalidate. That keeps both users cheap: the rules look up an
/// item on every click, and the board asks for the whole lot on every load.
/// </remarks>
public class GameCatalog
{
    private IReadOnlyDictionary<string, CatalogItem> _items =
        new Dictionary<string, CatalogItem>(StringComparer.Ordinal);

    private IReadOnlyDictionary<string, CatalogCheck> _checks =
        new Dictionary<string, CatalogCheck>(StringComparer.Ordinal);

    private object _payload = new { };

    public IReadOnlyDictionary<string, CatalogItem> Items => _items;

    public IReadOnlyDictionary<string, CatalogCheck> Checks => _checks;

    /// <summary>Everything the board needs to draw itself.</summary>
    public object Payload => _payload;

    public async Task LoadAsync(TrackerDbContext db, SpriteImages images, CancellationToken cancellationToken = default)
    {
        var regions = await db.GameRegions.AsNoTracking().OrderBy(r => r.Ordinal).ToListAsync(cancellationToken);
        var checks = await db.GameChecks.AsNoTracking().OrderBy(c => c.Ordinal).ToListAsync(cancellationToken);
        var items = await db.GameItems.AsNoTracking().OrderBy(i => i.Ordinal).ToListAsync(cancellationToken);
        var keyRows = await db.GameKeyRows.AsNoTracking().OrderBy(k => k.Ordinal).ToListAsync(cancellationToken);
        var sprites = await db.GameSprites.AsNoTracking().ToListAsync(cancellationToken);
        var palette = await db.GamePalette.AsNoTracking().ToListAsync(cancellationToken);

        if (checks.Count == 0 || items.Count == 0)
        {
            throw new InvalidOperationException("Game data is empty; the seeder should have run first.");
        }

        _items = items.ToDictionary(
            i => i.Id,
            i => new CatalogItem(i.Id, i.Name, i.Slots, i.KeydropSlots, i.KeydropOnly),
            StringComparer.Ordinal);
        _checks = checks.ToDictionary(c => c.Id, c => new CatalogCheck(c.Id, c.FullName, c.Keydrop), StringComparer.Ordinal);

        // Shaped the way the board reads it: sprites and palette by name, and
        // the item groups in the order they should appear.
        _payload = new
        {
            items = items.Select(i => new
            {
                id = i.Id,
                name = i.Name,
                label = i.Label,
                sprite = i.Sprite,
                slots = i.Slots,
                keydropSlots = i.KeydropSlots,
                keydropOnly = i.KeydropOnly,
                keydropLabel = i.KeydropLabel,
                group = i.Group,
                panel = i.Panel,
                dungeon = i.Dungeon,
                alwaysCount = i.AlwaysCount,
            }),
            groups = items.Where(i => i.Group is not null).Select(i => i.Group!).Distinct(),
            keyPanel = keyRows.Select(k => new
            {
                id = k.Id,
                name = k.Name,
                @short = k.Short,
                color = k.Color,
                bigKey = k.BigKey,
                smallKey = k.SmallKey,
            }),
            regions = regions.Select(r => new
            {
                id = r.Id,
                name = r.Name,
                @short = r.Short,
                color = r.Color,
                count = r.Count,
                keydropCount = r.KeydropCount,
            }),
            checks = checks.Select(c => new
            {
                id = c.Id,
                name = c.Name,
                fullName = c.FullName,
                region = c.Region,
                regionName = c.RegionName,
                regionShort = c.RegionShort,
                icon = c.Icon,
                keydrop = c.Keydrop,
            }),
            palette = palette.ToDictionary(p => p.Symbol, p => p.Color, StringComparer.Ordinal),
            itemSprites = SpritesOfKind(sprites, "item"),
            iconSprites = SpritesOfKind(sprites, "icon"),
            spriteImages = images.Items,
            checkImages = images.Checks,
        };
    }

    private static Dictionary<string, List<string>> SpritesOfKind(List<GameSprite> sprites, string kind) =>
        sprites
            .Where(s => s.Kind == kind)
            .ToDictionary(s => s.Name, s => s.Rows, StringComparer.Ordinal);
}

/// <summary>
/// Which sprite PNGs are actually on disk. The board falls back to the drawn
/// pixel art for anything missing, so this is what decides which tiles show a
/// real image.
/// </summary>
public class SpriteImages
{
    public IReadOnlyList<string> Items { get; private init; } = [];

    public IReadOnlyList<string> Checks { get; private init; } = [];

    public static SpriteImages Scan(string root, ILogger logger) => new()
    {
        Items = ScanDirectory(Path.Combine(root, "items"), logger),
        Checks = ScanDirectory(Path.Combine(root, "checks"), logger),
    };

    private static List<string> ScanDirectory(string dir, ILogger logger)
    {
        try
        {
            return Directory
                .EnumerateFiles(dir, "*.png")
                .Select(Path.GetFileNameWithoutExtension)
                .Where(name => !string.IsNullOrEmpty(name))
                .Select(name => name!)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToList();
        }
        catch (DirectoryNotFoundException)
        {
            // No images dropped in yet: the drawn pixel art covers everything.
            return [];
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not read sprite images from {Directory}", dir);
            return [];
        }
    }
}
