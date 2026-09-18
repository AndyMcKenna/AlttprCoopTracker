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

    /// <summary>
    /// Playing keydrop: the small keys under pots and on enemies are shuffled
    /// too, so their locations are checks and the dungeons hold more keys.
    /// </summary>
    public bool Keydrop { get; set; }

    public List<Assignment> Assignments { get; set; } = [];

    public List<DeadCheck> DeadChecks { get; set; } = [];
}
