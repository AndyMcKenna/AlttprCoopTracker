using System.Net.WebSockets;
using AlttpTracker.Api;
using AlttpTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

// Postgres, run as a container by the AppHost. Aspire supplies the connection
// string and wires up health checks and retries.
builder.AddNpgsqlDbContext<TrackerDbContext>("tracker");

builder.Services.AddScoped<RoomService>();
builder.Services.AddScoped<GameDataSeeder>();
builder.Services.AddSingleton<RoomBroker>();

// Loaded from the database at startup and held for the life of the process.
builder.Services.AddSingleton<GameCatalog>();

var app = builder.Build();

// Migrate, seed the game from gamedata.json, then read it back into memory.
// The order matters: the catalog is what the rules and the board both read.
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var db = services.GetRequiredService<TrackerDbContext>();

    await db.Database.MigrateAsync();

    var gameDataPath = Path.Combine(builder.Environment.ContentRootPath, "gamedata.json");
    await services.GetRequiredService<GameDataSeeder>().SeedAsync(gameDataPath);

    // Which sprite PNGs exist is a fact about the folder they sit in, not the
    // database, so it is read from disk rather than seeded.
    var spritesPath = builder.Configuration["Sprites:Path"]
        ?? Path.Combine(builder.Environment.WebRootPath ?? builder.Environment.ContentRootPath, "sprites");

    var images = SpriteImages.Scan(
        Path.GetFullPath(spritesPath),
        services.GetRequiredService<ILogger<Program>>());

    await app.Services.GetRequiredService<GameCatalog>().LoadAsync(db, images);
}

app.MapDefaultEndpoints();

// The board itself: index.html and its assets out of wwwroot, same origin as
// the API it talks to.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseWebSockets();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Everything the board needs to draw itself: the regions, the 216 checks, the
// items and keys, the pixel art, and which sprite images are on disk.
app.MapGet("/api/gamedata", (GameCatalog catalog) => Results.Ok(catalog.Payload));

var rooms = app.MapGroup("/api/rooms");

// A room code nobody is using, for the button on the home page.
rooms.MapGet("/new-name", async (TrackerDbContext db, CancellationToken ct) =>
    Results.Ok(new { room = await RoomNames.SuggestAsync(db, ct) }));

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
