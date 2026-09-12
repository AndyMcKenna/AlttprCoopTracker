namespace AlttpTracker.Api.Models;

/// <summary>
/// A check a player has looked at and found nothing worth recording — a
/// rupee, a dead bumper ledge — so it can be dimmed and taken off the table
/// for everyone in the room. A check is either dead or not, so the pair of
/// room and check is the key; nothing else needs to be said about it.
/// </summary>
public class DeadCheck
{
    public required string RoomId { get; set; }

    public Room? Room { get; set; }

    /// <summary>Matches a check id from gamedata.json, e.g. "dw/bumper-cave-ledge".</summary>
    public required string CheckId { get; set; }

    public DateTimeOffset At { get; set; }
}
