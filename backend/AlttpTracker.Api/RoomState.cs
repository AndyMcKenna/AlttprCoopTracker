using AlttpTracker.Api.Models;

namespace AlttpTracker.Api;

public record AssignmentState(Guid Id, string CheckId, string? By, long At);

/// <summary>
/// What a client receives. Assignments are grouped by item because that is how
/// the board reads them — one tile, its list of locations.
/// </summary>
public record RoomState(
    string Id,
    string Name,
    long CreatedAt,
    long UpdatedAt,
    Dictionary<string, List<AssignmentState>> Assignments)
{
    public static RoomState From(Room room) => new(
        room.Id,
        room.Name,
        room.CreatedAt.ToUnixTimeMilliseconds(),
        room.UpdatedAt.ToUnixTimeMilliseconds(),
        room.Assignments
            .OrderBy(a => a.At)
            .GroupBy(a => a.ItemId, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(a => new AssignmentState(a.Id, a.CheckId, a.By, a.At.ToUnixTimeMilliseconds()))
                    .ToList(),
                StringComparer.Ordinal));
}
