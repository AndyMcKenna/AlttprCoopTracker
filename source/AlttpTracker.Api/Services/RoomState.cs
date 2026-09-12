using AlttpTracker.Api.Models;

namespace AlttpTracker.Api.Services;

public record AssignmentState(Guid Id, string CheckId, long At);

/// <summary>
/// What a client receives. Assignments are grouped by item because that is how
/// the board reads them — one tile, its list of locations. Dead checks are a
/// flat list of ids: the board only needs to know which tiles to dim.
/// </summary>
public record RoomState(
    string Id,
    long CreatedAt,
    long UpdatedAt,
    Dictionary<string, List<AssignmentState>> Assignments,
    List<string> Dead)
{
    public static RoomState From(Room room) => new(
        room.Id,
        room.CreatedAt.ToUnixTimeMilliseconds(),
        room.UpdatedAt.ToUnixTimeMilliseconds(),
        room.Assignments
            .OrderBy(a => a.At)
            .GroupBy(a => a.ItemId, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(a => new AssignmentState(a.Id, a.CheckId, a.At.ToUnixTimeMilliseconds()))
                    .ToList(),
                StringComparer.Ordinal),
        room.DeadChecks
            .OrderBy(d => d.At)
            .Select(d => d.CheckId)
            .ToList());
}
