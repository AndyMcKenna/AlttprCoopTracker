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

    /// <summary>
    /// Loads a room if it exists. Opening a code does not create anything:
    /// only the first recorded location does, so nobody can fill the database
    /// by asking for codes that were never used.
    /// </summary>
    public Task<Room?> GetAsync(string roomId, CancellationToken cancellationToken = default)
    {
        var id = NormalizeRoomId(roomId);
        // Two collections on one room: loaded as two queries rather than one
        // join, which would return assignments times dead marks and leave EF
        // to fold the duplicates away.
        return db.Rooms
            .Include(r => r.Assignments)
            .Include(r => r.DeadChecks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
    }

    /// <summary>
    /// The room as a client should see it, whether or not it has been written
    /// yet. An unknown code is simply an empty board.
    /// </summary>
    public async Task<RoomState> GetStateAsync(string roomId, CancellationToken cancellationToken = default)
    {
        var id = NormalizeRoomId(roomId);

        // Untracked so that it is what the database holds right now, not a
        // merge with whatever this context loaded earlier in the request.
        var room = await db.Rooms
            .AsNoTracking()
            .Include(r => r.Assignments)
            .Include(r => r.DeadChecks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

        return RoomState.From(room ?? Unwritten(id));
    }

    /// <summary>Loads a room, creating it the first time something is recorded.</summary>
    public async Task<Room> GetOrCreateAsync(string roomId, CancellationToken cancellationToken = default)
    {
        var id = NormalizeRoomId(roomId);

        var room = await GetAsync(id, cancellationToken);
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
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two players' first writes to a new room arrived together, and
            // the other one created it a moment ago. Theirs is the room now;
            // this write carries on against it rather than failing.
            db.Entry(room).State = EntityState.Detached;
            return await GetAsync(id, cancellationToken)
                ?? throw new InvalidOperationException($"Room {id} could neither be created nor found.");
        }

        return room;
    }

    public async Task<RoomResult> AssignAsync(
        string roomId,
        string? itemId,
        string? checkId,
        CancellationToken cancellationToken = default)
    {
        // The body is whatever the client sent; a missing field is a bad
        // request, not a crash.
        if (string.IsNullOrEmpty(itemId) || string.IsNullOrEmpty(checkId))
        {
            return RoomResult.Failure("Both itemId and checkId are required");
        }

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

        // Finding an item at a check is the proof that it was not dead after
        // all; the player should not have to bring it back before recording.
        var dead = room.DeadChecks.FirstOrDefault(d => d.CheckId == check.Id);
        if (dead is not null)
        {
            room.DeadChecks.Remove(dead);
            db.DeadChecks.Remove(dead);
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

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two players recorded the same check in the same instant. The
            // unique index let one through; this is the other, and it gets
            // the answer it would have had a moment later.
            db.Entry(assignment).State = EntityState.Detached;
            room.Assignments.Remove(assignment);

            var winner = await db.Assignments
                .AsNoTracking()
                .FirstOrDefaultAsync(a => a.RoomId == room.Id && a.CheckId == check.Id, cancellationToken);
            var winnerName = winner is not null && catalog.Items.TryGetValue(winner.ItemId, out var won)
                ? won.Name
                : "another item";
            return RoomResult.Failure($"{check.FullName} is already recorded as {winnerName}");
        }

        return RoomResult.Success(room);
    }

    public async Task<RoomResult> UnassignAsync(
        string roomId,
        Guid assignmentId,
        CancellationToken cancellationToken = default)
    {
        // A room nobody has written to has nothing to clear, and clearing it
        // is not what should bring it into being.
        var room = await GetAsync(roomId, cancellationToken);
        if (room is null)
        {
            return RoomResult.Success(Unwritten(roomId));
        }

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

    /// <summary>
    /// Marks a check as holding nothing, or takes that mark back. Explicit
    /// rather than a toggle so that two players clicking at once agree on the
    /// outcome instead of cancelling each other out.
    /// </summary>
    public async Task<RoomResult> SetDeadAsync(
        string roomId,
        string? checkId,
        bool dead,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(checkId))
        {
            return RoomResult.Failure("checkId is required");
        }

        if (!catalog.Checks.TryGetValue(checkId, out var check))
        {
            return RoomResult.Failure($"Unknown check: {checkId}");
        }

        if (!dead)
        {
            // Bringing a check back in a room nobody has written to is a
            // no-op, and not what should bring the room into being.
            var existing = await GetAsync(roomId, cancellationToken);
            if (existing is null)
            {
                return RoomResult.Success(Unwritten(roomId));
            }

            var mark = existing.DeadChecks.FirstOrDefault(d => d.CheckId == check.Id);
            if (mark is null)
            {
                return RoomResult.Success(existing);
            }

            existing.DeadChecks.Remove(mark);
            db.DeadChecks.Remove(mark);
            existing.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            return RoomResult.Success(existing);
        }

        var room = await GetOrCreateAsync(roomId, cancellationToken);

        // A check with an item in it is not "nothing". Clearing the item is
        // the deliberate act; this refuses rather than doing it on the side.
        var holder = room.Assignments.FirstOrDefault(a => a.CheckId == check.Id);
        if (holder is not null)
        {
            var holderName = catalog.Items.TryGetValue(holder.ItemId, out var held) ? held.Name : holder.ItemId;
            return RoomResult.Failure($"{check.FullName} is recorded as {holderName} — clear that first");
        }

        if (room.DeadChecks.Any(d => d.CheckId == check.Id))
        {
            // Already dead: two players marking the same check is not an error.
            return RoomResult.Success(room);
        }

        db.DeadChecks.Add(new DeadCheck
        {
            RoomId = room.Id,
            CheckId = check.Id,
            At = DateTimeOffset.UtcNow,
        });
        room.UpdatedAt = DateTimeOffset.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two players marked it in the same instant; the key let one
            // through, and the other wanted the same thing anyway.
            db.ChangeTracker.Clear();
            return RoomResult.Success((await GetAsync(roomId, cancellationToken)) ?? room);
        }

        return RoomResult.Success(room);
    }

    public async Task<RoomResult> ResetAsync(string roomId, CancellationToken cancellationToken = default)
    {
        var room = await GetAsync(roomId, cancellationToken);
        if (room is null)
        {
            return RoomResult.Success(Unwritten(roomId));
        }

        db.Assignments.RemoveRange(room.Assignments);
        room.Assignments.Clear();
        db.DeadChecks.RemoveRange(room.DeadChecks);
        room.DeadChecks.Clear();
        room.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return RoomResult.Success(room);
    }

    /// <summary>A room that exists only as a code so far: not tracked, not saved.</summary>
    private static Room Unwritten(string roomId)
    {
        var now = DateTimeOffset.UtcNow;
        return new Room { Id = NormalizeRoomId(roomId), CreatedAt = now, UpdatedAt = now };
    }

    [GeneratedRegex("[^a-z0-9-]")]
    private static partial Regex RoomCodePattern();
}
