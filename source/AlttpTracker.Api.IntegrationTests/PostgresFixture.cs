using AlttpTracker.Api.Data;
using AlttpTracker.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Testcontainers.PostgreSql;

namespace AlttpTracker.Api.IntegrationTests;

/// <summary>
/// A real Postgres in a container, started once for the whole test class.
/// </summary>
/// <remarks>
/// The rule tests use SQLite because it is fast, but that leaves the parts
/// that are actually the database's job untested: whether the migrations
/// apply, whether the unique index really stops a duplicate, and whether the
/// game data survives being written and read back. That is what these cover.
/// </remarks>
public class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:17-alpine")
        .WithDatabase("tracker")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        // Migrations, not EnsureCreated: this is the path production takes, so
        // a migration that does not apply should fail here.
        await using var db = NewContext();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    public TrackerDbContext NewContext() =>
        new(new DbContextOptionsBuilder<TrackerDbContext>()
            .UseNpgsql(ConnectionString)
            .Options);

    /// <summary>Seeds the game tables the way the API does at startup.</summary>
    public async Task<GameCatalog> SeedAndLoadAsync()
    {
        await using var db = NewContext();

        await new GameDataSeeder(db, NullLogger<GameDataSeeder>.Instance).SeedAsync(GameDataPath());

        var catalog = new GameCatalog();
        await catalog.LoadAsync(db, SpriteImages.Scan("no-such-directory", NullLogger.Instance));
        return catalog;
    }

    public static string GameDataPath()
    {
        // Walk up out of bin/Debug/net10.0 to the API project beside this one.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "AlttpTracker.Api", "gamedata.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        throw new FileNotFoundException("Could not find gamedata.json above " + AppContext.BaseDirectory);
    }
}
