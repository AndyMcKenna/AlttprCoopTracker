using System.Collections.Concurrent;

namespace AlttpTracker.Api.Services;

/// <summary>
/// One writer at a time per room. The rules in <see cref="RoomService"/>
/// read a room, decide, and write; two players clicking in the same instant
/// could both read the same room and both decide "yes" — a single-slot item
/// recorded twice, say. The database catches the case it has an index for
/// (one item per check); this catches the rest by not letting two writes
/// to one room overlap at all.
/// </summary>
/// <remarks>
/// In-process, so it holds for one instance, which is how the app runs. A
/// second instance would need the lock in the database instead.
/// </remarks>
public sealed class RoomLocks
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);

    public async Task<T> RunAsync<T>(string roomId, Func<Task<T>> action, CancellationToken cancellationToken = default)
    {
        var gate = _locks.GetOrAdd(roomId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            return await action();
        }
        finally
        {
            gate.Release();
        }
    }
}
