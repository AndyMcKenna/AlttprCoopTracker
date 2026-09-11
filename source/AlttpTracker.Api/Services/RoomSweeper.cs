using AlttpTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api.Services;

/// <summary>
/// Deletes rooms nobody will come back to, so the table only ever holds runs
/// that are actually happening. Runs once an hour for the life of the process.
/// </summary>
/// <remarks>
/// A room is created by its first recorded location and kept as long as it is
/// being changed. One that has been reset and left empty for a day, or has
/// not been touched at all in three months, is gone; a player opening the
/// code again just gets a fresh board, which is what an empty room was anyway.
/// </remarks>
public class RoomSweeper(IServiceScopeFactory scopes, ILogger<RoomSweeper> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private static readonly TimeSpan EmptyRoomAge = TimeSpan.FromDays(1);
    private static readonly TimeSpan IdleRoomAge = TimeSpan.FromDays(90);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        // Sweep at startup too, so a deploy after a long gap tidies up at once
        // rather than an hour later.
        do
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // The next hour's pass will try again; the app runs fine
                // without this ever succeeding.
                logger.LogWarning(ex, "Room sweep failed.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public async Task SweepAsync(CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackerDbContext>();
        var now = DateTimeOffset.UtcNow;

        var emptyBefore = now - EmptyRoomAge;
        var idleBefore = now - IdleRoomAge;

        // Assignments go with their room: the foreign key cascades.
        var deleted = await db.Rooms
            .Where(r => (r.UpdatedAt < emptyBefore && !r.Assignments.Any()) || r.UpdatedAt < idleBefore)
            .ExecuteDeleteAsync(cancellationToken);

        if (deleted > 0)
        {
            logger.LogInformation("Swept {Count} stale rooms.", deleted);
        }
    }
}
