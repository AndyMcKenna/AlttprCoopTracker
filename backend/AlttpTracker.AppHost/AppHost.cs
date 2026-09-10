var builder = DistributedApplication.CreateBuilder(args);

// Postgres in a container. The volume keeps rooms across restarts of the
// AppHost — without it every `dotnet run` would start an empty database.
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume("alttp-tracker-pgdata")
    .WithPgAdmin();

var tracker = postgres.AddDatabase("tracker");

// The whole app: the board, the API, the game tables and the websocket fan-out.
builder.AddProject<Projects.AlttpTracker_Api>("api")
    .WithReference(tracker)
    .WaitFor(tracker)
    .WithExternalHttpEndpoints();

builder.Build().Run();
