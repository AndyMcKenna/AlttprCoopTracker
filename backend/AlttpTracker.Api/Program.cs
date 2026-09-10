using System.Net.WebSockets;
using AlttpTracker.Api;
using AlttpTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

// SQLite keeps the tracker to a single file with no container to run, which
// suits a tool people start on a laptop before a race.
var connectionString = builder.Configuration.GetConnectionString("tracker")
    ?? $"Data Source={Path.Combine(builder.Environment.ContentRootPath, "tracker.db")}";

builder.Services.AddDbContext<TrackerDbContext>(options => options.UseSqlite(connectionString));

builder.Services.AddSingleton(_ =>
    GameData.Load(Path.Combine(builder.Environment.ContentRootPath, "gamedata.json")));
builder.Services.AddScoped<RoomService>();
builder.Services.AddSingleton<RoomBroker>();

// The board is served by the frontend app on its own origin, so it has to be
// allowed to call this one.
const string FrontendCors = "frontend";
builder.Services.AddCors(options => options.AddPolicy(FrontendCors, policy => policy
    .SetIsOriginAllowed(_ => true)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

// Bring the database up to date on start. With SQLite there is no server to
// wait for, and it means a fresh clone runs without a manual step.
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<TrackerDbContext>().Database.MigrateAsync();
}

app.MapDefaultEndpoints();
app.UseCors(FrontendCors);
app.UseWebSockets();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

var rooms = app.MapGroup("/api/rooms");

rooms.MapGet("/{roomId}", async (string roomId, RoomService service, CancellationToken ct) =>
    Results.Ok(RoomState.From(await service.GetOrCreateAsync(roomId, ct))));

rooms.MapPost("/{roomId}/assignments", async (
    string roomId,
    AssignRequest request,
    RoomService service,
    RoomBroker broker,
    CancellationToken ct) =>
{
    var result = await service.AssignAsync(roomId, request.ItemId, request.CheckId, request.By, ct);
    return await RespondAsync(result, broker, ct);
});

rooms.MapDelete("/{roomId}/assignments/{assignmentId:guid}", async (
    string roomId,
    Guid assignmentId,
    RoomService service,
    RoomBroker broker,
    CancellationToken ct) =>
{
    var result = await service.UnassignAsync(roomId, assignmentId, ct);
    return await RespondAsync(result, broker, ct);
});

rooms.MapPost("/{roomId}/reset", async (
    string roomId,
    RoomService service,
    RoomBroker broker,
    CancellationToken ct) =>
{
    var result = await service.ResetAsync(roomId, ct);
    return await RespondAsync(result, broker, ct);
});

rooms.MapPut("/{roomId}/name", async (
    string roomId,
    RenameRequest request,
    RoomService service,
    RoomBroker broker,
    CancellationToken ct) =>
{
    var result = await service.RenameAsync(roomId, request.Name, ct);
    return await RespondAsync(result, broker, ct);
});

// Clients open this and then just listen: every change anyone makes through
// the API above is pushed back down it.
app.Map("/ws", async (HttpContext context, RoomService service, RoomBroker broker, ILogger<Program> logger) =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    var roomId = RoomService.NormalizeRoomId(context.Request.Query["room"]);
    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    var socketId = broker.Add(roomId, socket);

    try
    {
        // This socket is already in the room, so one broadcast both primes it
        // and tells everyone else the player count went up.
        var state = RoomState.From(await service.GetOrCreateAsync(roomId, context.RequestAborted));
        await broker.BroadcastStateAsync(state, context.RequestAborted);

        // Nothing is expected from the client, but the socket has to be read
        // for close frames to arrive and for the connection to stay healthy.
        var buffer = new byte[1024];
        while (socket.State == WebSocketState.Open)
        {
            var received = await socket.ReceiveAsync(buffer, context.RequestAborted);
            if (received.MessageType == WebSocketMessageType.Close)
            {
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                break;
            }
        }
    }
    catch (OperationCanceledException)
    {
        // The client navigated away; nothing to report.
    }
    catch (WebSocketException ex)
    {
        logger.LogDebug(ex, "Socket closed abruptly in room {RoomId}", roomId);
    }
    finally
    {
        broker.Remove(roomId, socketId);

        // Let whoever is left know the count went down. A new scope is needed
        // because the request's own services are being torn down.
        using var scope = context.RequestServices.GetRequiredService<IServiceScopeFactory>().CreateScope();
        var scoped = scope.ServiceProvider.GetRequiredService<RoomService>();
        var state = RoomState.From(await scoped.GetOrCreateAsync(roomId, CancellationToken.None));
        await broker.BroadcastStateAsync(state, CancellationToken.None);
    }
});

app.Run();

// Push the new state to everyone in the room, and hand it back to the caller.
static async Task<IResult> RespondAsync(RoomResult result, RoomBroker broker, CancellationToken ct)
{
    if (!result.Ok)
    {
        return Results.BadRequest(new { error = result.Error });
    }

    var state = RoomState.From(result.Room!);
    await broker.BroadcastStateAsync(state, ct);
    return Results.Ok(state);
}

record AssignRequest(string ItemId, string CheckId, string? By);

record RenameRequest(string? Name);
