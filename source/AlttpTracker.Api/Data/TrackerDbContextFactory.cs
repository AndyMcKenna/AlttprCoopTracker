using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AlttpTracker.Api.Data;

/// <summary>
/// Used only by `dotnet ef` when adding or scripting a migration.
/// </summary>
/// <remarks>
/// At runtime Aspire supplies the connection string, and there is none at
/// design time. The tools still need a provider to know what SQL to write, so
/// this hands them Npgsql with a placeholder. It never opens a connection —
/// generating a migration reads the model, not the database.
/// </remarks>
public class TrackerDbContextFactory : IDesignTimeDbContextFactory<TrackerDbContext>
{
    /// <summary>Set this to point the tools at a real database.</summary>
    public const string ConnectionVariable = "TRACKER_CONNECTION";

    public TrackerDbContext CreateDbContext(string[] args)
    {
        // Adding a migration only reads the model, so the placeholder is
        // enough. Applying one needs a real database, which the Aspire
        // dashboard command and the deploy workflow both supply here.
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable)
            ?? "Host=localhost;Database=tracker;Username=postgres";

        var options = new DbContextOptionsBuilder<TrackerDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new TrackerDbContext(options);
    }
}
