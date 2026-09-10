var builder = DistributedApplication.CreateBuilder(args);

// Rooms, assignments and the websocket fan-out. Keeps its own SQLite file, so
// there is no container to start before a run.
var api = builder.AddProject<Projects.AlttpTracker_Api>("api")
    .WithExternalHttpEndpoints();

// The board itself: the existing Node app, which serves the page and the game
// tables. WithReference hands it the API's address as services__api__http__0,
// which server.js passes on to the browser.
builder.AddNpmApp("frontend", "../..", "start")
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
