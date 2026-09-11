using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;

namespace AlttpTracker.Api;

/// <summary>
/// Holds the open sockets for each room and pushes state to them, so a change
/// made by one player shows up for the others without a refresh.
/// </summary>
public class RoomBroker(ILogger<RoomBroker> logger)
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<Guid, WebSocket>> _rooms = new(StringComparer.Ordinal);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public Guid Add(string roomId, WebSocket socket)
    {
        var id = Guid.NewGuid();
        _rooms.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, WebSocket>())[id] = socket;
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
    public Task BroadcastStateAsync(RoomState state, CancellationToken cancellationToken = default) =>
        SendAsync(state.Id, new { type = "state", room = state, players = PlayerCount(state.Id) }, cancellationToken);

    /// <summary>Send to one socket, used to prime a client as it connects.</summary>
    public Task SendStateAsync(WebSocket socket, RoomState state, CancellationToken cancellationToken = default) =>
        SendToSocketAsync(socket, new { type = "state", room = state, players = PlayerCount(state.Id) }, cancellationToken);

    private async Task SendAsync(string roomId, object message, CancellationToken cancellationToken)
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
                await SendBytesAsync(pair.Value, payload, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Dropping socket {SocketId} in room {RoomId}", pair.Key, roomId);
                Remove(roomId, pair.Key);
            }
        });

        await Task.WhenAll(sends);
    }

    private static Task SendToSocketAsync(WebSocket socket, object message, CancellationToken cancellationToken) =>
        SendBytesAsync(socket, JsonSerializer.SerializeToUtf8Bytes(message, JsonOptions), cancellationToken);

    private static async Task SendBytesAsync(WebSocket socket, byte[] payload, CancellationToken cancellationToken)
    {
        if (socket.State != WebSocketState.Open)
        {
            return;
        }

        await socket.SendAsync(payload, WebSocketMessageType.Text, endOfMessage: true, cancellationToken);
    }

    public Task SendErrorAsync(WebSocket socket, string message, CancellationToken cancellationToken = default) =>
        SendToSocketAsync(socket, new { type = "error", message }, cancellationToken);
}
