namespace AlttpTracker.Api.Models;

/// <summary>
/// One item recorded at one check. An item can hold several of these when it
/// is progressive (four swords, four bottles), but a check holds exactly one,
/// which is enforced by a unique index as well as in <see cref="RoomService"/>.
/// </summary>
public class Assignment
{
    public Guid Id { get; set; }

    public required string RoomId { get; set; }

    public Room? Room { get; set; }

    /// <summary>Matches an item id from gamedata.json, e.g. "lamp" or "bk-ep".</summary>
    public required string ItemId { get; set; }

    /// <summary>Matches a check id from gamedata.json, e.g. "lw/links-house".</summary>
    public required string CheckId { get; set; }

    /// <summary>Whoever recorded it, if they gave a name.</summary>
    public string? By { get; set; }

    public DateTimeOffset At { get; set; }
}
