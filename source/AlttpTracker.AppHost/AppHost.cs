using System.Diagnostics;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = DistributedApplication.CreateBuilder(args);

// Postgres in a container. The volume keeps rooms across restarts of the
// AppHost — without it every `dotnet run` would start an empty database.
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume("alttp-tracker-pgdata")
    .WithPgAdmin();

var tracker = postgres.AddDatabase("tracker");

// The API migrates on startup, but that only helps when it is starting. This
// puts the same job on a button in the dashboard, for bringing the database up
// to date after adding a migration without cycling the app.
//
// It shells out to `dotnet ef` rather than calling MigrateAsync directly: an
// Aspire project reference is a resource reference, not a code one, so the
// DbContext is not visible from here.
tracker.WithCommand(
    name: "migrate",
    displayName: "Run EF migrations",
    executeCommand: async context =>
    {
        var connectionString = await tracker.Resource.ConnectionStringExpression
            .GetValueAsync(context.CancellationToken);

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return CommandResults.Failure("The database has no connection string yet.");
        }

        var apiProject = Path.GetFullPath(Path.Combine(
            builder.AppHostDirectory, "..", "AlttpTracker.Api", "AlttpTracker.Api.csproj"));

        var start = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = Path.GetDirectoryName(apiProject)!,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        start.ArgumentList.Add("ef");
        start.ArgumentList.Add("database");
        start.ArgumentList.Add("update");
        start.ArgumentList.Add("--project");
        start.ArgumentList.Add(apiProject);

        // Read by TrackerDbContextFactory, so the tools act on this database
        // rather than the placeholder they use for scaffolding.
        start.Environment["TRACKER_CONNECTION"] = connectionString;

        try
        {
            using var process = Process.Start(start);
            if (process is null)
            {
                return CommandResults.Failure("Could not start dotnet.");
            }

            var output = await process.StandardOutput.ReadToEndAsync(context.CancellationToken);
            var error = await process.StandardError.ReadToEndAsync(context.CancellationToken);
            await process.WaitForExitAsync(context.CancellationToken);

            if (process.ExitCode == 0)
            {
                return CommandResults.Success();
            }

            var detail = string.IsNullOrWhiteSpace(error) ? output : error;
            if (detail.Contains("is not a dotnet command", StringComparison.OrdinalIgnoreCase))
            {
                detail = "The EF tools are missing. Run: dotnet tool install --global dotnet-ef";
            }

            return CommandResults.Failure(detail.Trim());
        }
        catch (Exception ex)
        {
            return CommandResults.Failure(ex.Message);
        }
    },
    commandOptions: new CommandOptions
    {
        Description = "Apply any outstanding EF Core migrations to this database.",
        IconName = "DatabaseArrowUp",
        // Pointless until the container is accepting connections.
        UpdateState = context => context.ResourceSnapshot.HealthStatus == HealthStatus.Healthy
            ? ResourceCommandState.Enabled
            : ResourceCommandState.Disabled,
    });

// The whole app: the board, the API, the game tables and the websocket fan-out.
builder.AddProject<Projects.AlttpTracker_Api>("api")
    .WithReference(tracker)
    .WaitFor(tracker)
    .WithExternalHttpEndpoints();

builder.Build().Run();
