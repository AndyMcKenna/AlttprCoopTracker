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
    public TrackerDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<TrackerDbContext>()
            .UseNpgsql("Host=localhost;Database=tracker;Username=postgres")
            .Options;

        return new TrackerDbContext(options);
    }
}
