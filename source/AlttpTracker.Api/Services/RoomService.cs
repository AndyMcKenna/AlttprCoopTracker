using System.Text.RegularExpressions;
using AlttpTracker.Api.Data;
using AlttpTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api.Services;

/// <summary>The outcome of a change: either the new room state, or why not.</summary>
public readonly record struct RoomResult(Room? Room, string? Error)
{
    public bool Ok => Error is null;

    public static RoomResult Success(Room room) => new(room, null);

    public static RoomResult Failure(string error) => new(null, error);
}

/// <summary>
/// Every rule about what may be recorded where. Kept in one place so the HTTP
/// endpoints stay thin and the rules can be tested without a web server.
/// </summary>
public partial class RoomService(TrackerDbContext db, GameCatalog catalog)
{
    /// <summary>
    /// Room codes are typed by hand and shared, so they are folded to a
    /// predictable shape rather than trusted as given.
    /// </summary>
    public static string NormalizeRoomId(string? id)
    {
        var cleaned = RoomCodePattern().Replace((id ?? string.Empty).ToLowerInvariant(), string.Empty);
        if (cleaned.Length > 32)
        {
            cleaned = cleaned[..32];
        }

        return cleaned.Length == 0 ? "lobby" : cleaned;
    }

    /// <summary>Loads a room, creating it the first time anyone opens the code.</summary>
    public async Task<Room> GetOrCreateAsync(string roomId, CancellationToken cancellationToken = default)
    {
        var id = NormalizeRoomId(roomId);

        var room = await db.Rooms
            .Include(r => r.Assignments)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

        if (room is not null)
        {
            return room;
        }

        room = new Room
        {
            Id = id,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };

        db.Rooms.Add(room);
        await db.SaveChangesAsync(cancellationToken);
        return room;
    }

    public async Task<RoomResult> AssignAsync(
        string roomId,
        string itemId,
        string checkId,
        CancellationToken cancellationToken = default)
    {
        if (!catalog.Items.TryGetValue(itemId, out var item))
        {
            return RoomResult.Failure($"Unknown item: {itemId}");
        }

        if (!catalog.Checks.TryGetValue(checkId, out var check))
        {
            return RoomResult.Failure($"Unknown check: {checkId}");
        }

        var room = await GetOrCreateAsync(roomId, cancellationToken);

        // A check holds one item, so refuse rather than overwrite someone
        // else's note. Clearing the old entry first is a deliberate act.
        var holder = room.Assignments.FirstOrDefault(a => a.CheckId == check.Id);
        if (holder is not null)
        {
            var holderName = catalog.Items.TryGetValue(holder.ItemId, out var held) ? held.Name : holder.ItemId;
            return RoomResult.Failure($"{check.FullName} is already recorded as {holderName}");
        }

        var existing = room.Assignments.Where(a => a.ItemId == item.Id).ToList();
        if (existing.Count >= item.Slots)
        {
            if (item.Slots == 1)
            {
                // Single-slot items move to the new location rather than
                // making the player clear the old one first.
                db.Assignments.RemoveRange(existing);
                foreach (var stale in existing)
                {
                    room.Assignments.Remove(stale);
                }
            }
            else
            {
                return RoomResult.Failure($"{item.Name} already has {item.Slots} locations");
            }
        }

        var assignment = new Assignment
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            ItemId = item.Id,
            CheckId = check.Id,
            At = DateTimeOffset.UtcNow,
        };

        // Added to the set rather than to room.Assignments: an entity found
        // through a navigation with its key already set is taken to be an
        // existing row, and EF would issue an UPDATE that matches nothing.
        // Tracking it puts it on room.Assignments anyway, so adding it there
        // as well would have it counted twice.
        db.Assignments.Add(assignment);

        room.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return RoomResult.Success(room);
    }

    public async Task<RoomResult> UnassignAsync(
        string roomId,
        Guid assignmentId,
        CancellationToken cancellationToken = default)
    {
        var room = await GetOrCreateAsync(roomId, cancellationToken);

        var assignment = room.Assignments.FirstOrDefault(a => a.Id == assignmentId);
        if (assignment is null)
        {
            // Already gone: two players clearing the same entry is not an error.
            return RoomResult.Success(room);
        }

        room.Assignments.Remove(assignment);
        db.Assignments.Remove(assignment);
        room.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return RoomResult.Success(room);
    }

    public async Task<RoomResult> ResetAsync(string roomId, CancellationToken cancellationToken = default)
    {
        var room = await GetOrCreateAsync(roomId, cancellationToken);

        db.Assignments.RemoveRange(room.Assignments);
        room.Assignments.Clear();
        room.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return RoomResult.Success(room);
    }

    [GeneratedRegex("[^a-z0-9-]")]
    private static partial Regex RoomCodePattern();
}
