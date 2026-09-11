using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;

namespace AlttpTracker.Api.Services;

/// <summary>
/// Holds the open sockets for each room and pushes state to them, so a change
/// made by one player shows up for the others without a refresh.
/// </summary>
public class RoomBroker(ILogger<RoomBroker> logger)
{
    /// <summary>
    /// A socket allows one outstanding send at a time, so two players clicking
    /// at once must queue behind each other rather than collide.
    /// </summary>
    private sealed record Connection(WebSocket Socket, SemaphoreSlim SendLock);

    private readonly ConcurrentDictionary<string, ConcurrentDictionary<Guid, Connection>> _rooms = new(StringComparer.Ordinal);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // A client that cannot take a message in this long is stuck; cancelling
    // the send aborts its socket and it reconnects on its own.
    private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(10);

    public Guid Add(string roomId, WebSocket socket)
    {
        var id = Guid.NewGuid();
        var connection = new Connection(socket, new SemaphoreSlim(1, 1));
        _rooms.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, Connection>())[id] = connection;
        return id;
    }

    public void Remove(string roomId, Guid socketId)
    {
        if (!_rooms.TryGetValue(roomId, out var sockets))
        {
            return;
        }

        sockets.TryRemove(socketId, out _);

        // Don't leave an empty bag behind for every room ever opened.
        if (sockets.IsEmpty)
        {
            _rooms.TryRemove(roomId, out _);
        }
    }

    public int PlayerCount(string roomId) =>
        _rooms.TryGetValue(roomId, out var sockets) ? sockets.Count : 0;

    /// <summary>Send the current state of a room to everyone watching it.</summary>
    public Task BroadcastStateAsync(RoomState state) =>
        SendAsync(state.Id, new { type = "state", room = state, players = PlayerCount(state.Id) });

    /// <summary>
    /// Deliberately takes no cancellation token: a broadcast is triggered by
    /// one player's request, but it goes to everyone, and that player giving
    /// up on their request must not abort the other players' sockets.
    /// </summary>
    private async Task SendAsync(string roomId, object message)
    {
        if (!_rooms.TryGetValue(roomId, out var sockets) || sockets.IsEmpty)
        {
            return;
        }

        var payload = JsonSerializer.SerializeToUtf8Bytes(message, JsonOptions);

        // A socket that fails mid-send is dropped rather than allowed to stall
        // the others; the client reconnects on its own.
        var sends = sockets.Select(async pair =>
        {
            try
            {
                await SendBytesAsync(pair.Value, payload);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Dropping socket {SocketId} in room {RoomId}", pair.Key, roomId);
                Remove(roomId, pair.Key);
            }
        });

        await Task.WhenAll(sends);
    }

    private static async Task SendBytesAsync(Connection connection, byte[] payload)
    {
        using var timeout = new CancellationTokenSource(SendTimeout);

        await connection.SendLock.WaitAsync(timeout.Token);
        try
        {
            if (connection.Socket.State != WebSocketState.Open)
            {
                return;
            }

            await connection.Socket.SendAsync(payload, WebSocketMessageType.Text, endOfMessage: true, timeout.Token);
        }
        finally
        {
            connection.SendLock.Release();
        }
    }
}
