namespace AlttpTracker.Api.Models;

/// <summary>
/// One co-op session. Rooms are addressed by the short code players type into
/// the tracker, so the code itself is the key rather than a surrogate id.
/// </summary>
public class Room
{
    public required string Id { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public List<Assignment> Assignments { get; set; } = [];
}
