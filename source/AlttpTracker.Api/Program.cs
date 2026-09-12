using System.Net.WebSockets;
using System.Threading.RateLimiting;
using AlttpTracker.Api.Data;
using AlttpTracker.Api.Services;
using Microsoft.AspNetCore.RateLimiting;
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
builder.Services.AddHostedService<RoomSweeper>();

// Loaded from the database at startup and held for the life of the process.
builder.Services.AddSingleton<GameCatalog>();

// The API is open to anyone with a room code, so the only thing standing
// between it and a script is a cap per client address. The numbers are far
// above what a table of players clicking produces, and far below what it
// takes to fill a database or hold a thousand sockets open.
//
// Behind a proxy that hides the client address (Azure App Service on Linux,
// for one) the address has to come from the forwarded headers, or every
// player looks like the same client — see the README.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("api", context => RateLimitPartition.GetFixedWindowLimiter(
        ClientAddress(context),
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 120,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));

    // A socket holds its permit for as long as it stays open, so this is the
    // number of boards one address can have open at once.
    options.AddPolicy("sockets", context => RateLimitPartition.GetConcurrencyLimiter(
        ClientAddress(context),
        _ => new ConcurrencyLimiterOptions
        {
            PermitLimit = 32,
            QueueLimit = 0,
        }));
});

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
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Everything the board needs to draw itself: the regions, the 216 checks, the
// items and keys, the pixel art, and which sprite images are on disk.
app.MapGet("/api/gamedata", (GameCatalog catalog) => Results.Ok(catalog.Payload))
    .RequireRateLimiting("api");

var rooms = app.MapGroup("/api/rooms").RequireRateLimiting("api");

// A room code nobody is using, for the button on the home page.
rooms.MapGet("/new-name", async (TrackerDbContext db, CancellationToken ct) =>
    Results.Ok(new { room = await RoomNames.SuggestAsync(db, ct) }));

// Reading a room does not create it: a code that was never written to is an
// empty board, and stays out of the database until someone records something.
rooms.MapGet("/{roomId}", async (string roomId, RoomService service, CancellationToken ct) =>
    Results.Ok(await service.GetStateAsync(roomId, ct)));

rooms.MapPost("/{roomId}/assignments", async (
    string roomId,
    AssignRequest request,
    RoomService service,
    RoomBroker broker,
    CancellationToken ct) =>
{
    var result = await service.AssignAsync(roomId, request.ItemId, request.CheckId, ct);
    return await RespondAsync(result, service, broker, ct);
});

rooms.MapDelete("/{roomId}/assignments/{assignmentId:guid}", async (
    string roomId,
    Guid assignmentId,
    RoomService service,
    RoomBroker broker,
    CancellationToken ct) =>
{
    var result = await service.UnassignAsync(roomId, assignmentId, ct);
    return await RespondAsync(result, service, broker, ct);
});

// Mark a check as holding nothing, or bring it back. One route with a flag
// rather than a toggle, so a repeated click cannot undo another player's.
rooms.MapPut("/{roomId}/dead", async (
    string roomId,
    DeadRequest request,
    RoomService service,
    RoomBroker broker,
    CancellationToken ct) =>
{
    var result = await service.SetDeadAsync(roomId, request.CheckId, request.Dead, ct);
    return await RespondAsync(result, service, broker, ct);
});

rooms.MapPost("/{roomId}/reset", async (
    string roomId,
    RoomService service,
    RoomBroker broker,
    CancellationToken ct) =>
{
    var result = await service.ResetAsync(roomId, ct);
    return await RespondAsync(result, service, broker, ct);
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
        await broker.BroadcastStateAsync(await service.GetStateAsync(roomId, context.RequestAborted));

        // Nothing is expected from the client, but the socket has to be read
        // for close frames to arrive and for the connection to stay healthy.
        // Whatever it does send is read into this buffer and ignored.
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
        // because the request's own services are being torn down, and the
        // database may already be gone if this is the app shutting down.
        if (broker.PlayerCount(roomId) > 0)
        {
            try
            {
                using var scope = context.RequestServices.GetRequiredService<IServiceScopeFactory>().CreateScope();
                var scoped = scope.ServiceProvider.GetRequiredService<RoomService>();
                await broker.BroadcastStateAsync(await scoped.GetStateAsync(roomId, CancellationToken.None));
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Could not tell room {RoomId} a player left", roomId);
            }
        }
    }
}).RequireRateLimiting("sockets");

app.Run();

// Push the new state to everyone in the room, and hand it back to the caller.
static async Task<IResult> RespondAsync(RoomResult result, RoomService service, RoomBroker broker, CancellationToken ct)
{
    if (!result.Ok)
    {
        return Results.BadRequest(new { error = result.Error });
    }

    // Read back rather than broadcast what this request saw: several players
    // clicking at once each loaded the room a moment apart, and whichever
    // broadcast landed last would otherwise be the board everyone is left
    // with, even if it was the oldest.
    var state = await service.GetStateAsync(result.Room!.Id, ct);
    await broker.BroadcastStateAsync(state);
    return Results.Ok(state);
}

// What a client is limited by. With no forwarded address, a proxy in front
// would make every player one client; see the README for the setting.
static string ClientAddress(HttpContext context) =>
    context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

record AssignRequest(string? ItemId, string? CheckId);

record DeadRequest(string? CheckId, bool Dead);
