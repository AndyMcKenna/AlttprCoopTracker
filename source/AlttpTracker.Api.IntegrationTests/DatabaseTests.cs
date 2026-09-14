using AlttpTracker.Api.Data;
using AlttpTracker.Api.Models;
using AlttpTracker.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace AlttpTracker.Api.IntegrationTests;

/// <summary>
/// What the database itself is responsible for, against the real thing.
/// </summary>
public class DatabaseTests(PostgresFixture postgres) : IClassFixture<PostgresFixture>
{
    [Fact]
    public async Task Migrations_apply_and_leave_nothing_pending()
    {
        await using var db = postgres.NewContext();

        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.NotEmpty(await db.Database.GetAppliedMigrationsAsync());
    }

    [Fact]
    public async Task Seeding_writes_the_whole_game_and_reads_it_back()
    {
        await postgres.SeedAndLoadAsync();

        await using var db = postgres.NewContext();

        Assert.Equal(216, await db.GameChecks.CountAsync());
        Assert.Equal(16, await db.GameRegions.CountAsync());
        Assert.Equal(13, await db.GameKeyRows.CountAsync());
        Assert.NotEmpty(await db.GamePalette.ToListAsync());

        // The pixel art goes through a value converter on the way in and out,
        // so it is worth confirming a grid survives the round trip intact.
        var sword = await db.GameSprites.SingleAsync(s => s.Kind == "item" && s.Name == "sword");
        Assert.Equal(12, sword.Rows.Count);
        Assert.All(sword.Rows, row => Assert.Equal(12, row.Length));
    }

    [Fact]
    public async Task Seeding_again_with_the_same_file_changes_nothing()
    {
        await postgres.SeedAndLoadAsync();

        await using var db = postgres.NewContext();
        var before = await db.GameDataVersions.AsNoTracking().SingleAsync();

        await new GameDataSeeder(postgres.NewContext(), NullLogger<GameDataSeeder>.Instance)
            .SeedAsync(PostgresFixture.GameDataPath());

        await using var after = postgres.NewContext();
        var version = await after.GameDataVersions.AsNoTracking().SingleAsync();

        // Untouched, so the fingerprint short-circuit is doing its job.
        Assert.Equal(before.Hash, version.Hash);
        Assert.Equal(before.SeededAt, version.SeededAt);
        Assert.Equal(216, await after.GameChecks.CountAsync());
    }

    [Fact]
    public async Task The_database_refuses_two_items_on_one_check()
    {
        await postgres.SeedAndLoadAsync();
        var room = "clash-" + Guid.NewGuid().ToString("n")[..8];

        await using var db = postgres.NewContext();
        db.Rooms.Add(new Room { Id = room, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.Assignments.Add(NewAssignment(room, "hookshot", "ep/big-chest"));
        await db.SaveChangesAsync();

        // The service checks this first and reports it nicely; this is the
        // backstop for two players clicking the same check at the same moment.
        await using var second = postgres.NewContext();
        second.Assignments.Add(NewAssignment(room, "lamp", "ep/big-chest"));

        await Assert.ThrowsAsync<DbUpdateException>(() => second.SaveChangesAsync());
    }

    [Fact]
    public async Task The_same_check_in_another_room_is_fine()
    {
        await postgres.SeedAndLoadAsync();
        var first = "roomA-" + Guid.NewGuid().ToString("n")[..8];
        var second = "roomB-" + Guid.NewGuid().ToString("n")[..8];

        await using var db = postgres.NewContext();
        db.Rooms.Add(new Room { Id = first, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.Rooms.Add(new Room { Id = second, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.Assignments.Add(NewAssignment(first, "lamp", "hc/sanctuary"));
        db.Assignments.Add(NewAssignment(second, "lamp", "hc/sanctuary"));

        await db.SaveChangesAsync();

        // Scoped to these two rooms: the container is shared by the class, so
        // other tests have their own rows against this check.
        Assert.Equal(2, await db.Assignments
            .CountAsync(a => a.CheckId == "hc/sanctuary" && (a.RoomId == first || a.RoomId == second)));
    }

    [Fact]
    public async Task Clearing_a_room_takes_its_assignments_with_it()
    {
        await postgres.SeedAndLoadAsync();
        var room = "cascade-" + Guid.NewGuid().ToString("n")[..8];

        await using var db = postgres.NewContext();
        db.Rooms.Add(new Room { Id = room, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.Assignments.Add(NewAssignment(room, "lamp", "lw/library"));
        await db.SaveChangesAsync();

        db.Rooms.Remove(await db.Rooms.SingleAsync(r => r.Id == room));
        await db.SaveChangesAsync();

        Assert.Empty(await db.Assignments.Where(a => a.RoomId == room).ToListAsync());
    }

    [Fact]
    public async Task A_room_recorded_through_the_service_is_there_on_a_new_connection()
    {
        var catalog = await postgres.SeedAndLoadAsync();
        var room = "persist-" + Guid.NewGuid().ToString("n")[..8];

        await using (var db = postgres.NewContext())
        {
            var service = new RoomService(db, catalog);
            Assert.True((await service.AssignAsync(room, "lamp", "hc/sanctuary")).Ok);
        }

        // A separate connection, as a later request would use.
        await using (var db = postgres.NewContext())
        {
            var reopened = await new RoomService(db, catalog).GetOrCreateAsync(room);

            var assignment = Assert.Single(reopened.Assignments);
            Assert.Equal("hc/sanctuary", assignment.CheckId);
        }
    }

    [Fact]
    public async Task Two_first_writes_to_a_new_room_at_once_both_land()
    {
        var catalog = await postgres.SeedAndLoadAsync();

        // The race is between two requests each finding no room and each
        // creating it; the primary key lets one through. Run it a few times
        // so that the two actually overlap at least once.
        for (var attempt = 0; attempt < 10; attempt += 1)
        {
            var room = "race-" + Guid.NewGuid().ToString("n")[..8];
            await using var first = postgres.NewContext();
            await using var second = postgres.NewContext();

            var results = await Task.WhenAll(
                new RoomService(first, catalog).AssignAsync(room, "lamp", "lw/hobo"),
                new RoomService(second, catalog).AssignAsync(room, "hookshot", "lw/library"));

            Assert.All(results, result => Assert.True(result.Ok, result.Error));

            await using var db = postgres.NewContext();
            Assert.Equal(2, await db.Assignments.CountAsync(a => a.RoomId == room));
        }
    }

    [Fact]
    public async Task Moving_the_Death_Mountain_checks_carries_rooms_across()
    {
        var room = "dm-" + Guid.NewGuid().ToString("n")[..8];

        // Step the schema back to before the move, record against the old
        // ids the way a Beta 2 room would have, then bring it forward.
        await using (var db = postgres.NewContext())
        {
            await db.GetService<IMigrator>().MigrateAsync("AddDeadChecks");

            db.Rooms.Add(new Room { Id = room, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            db.Assignments.Add(NewAssignment(room, "lamp", "lw/old-man"));
            db.Assignments.Add(NewAssignment(room, "hookshot", "lw/library"));
            db.DeadChecks.Add(new DeadCheck { RoomId = room, CheckId = "lw/floating-island", At = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();

            await db.Database.MigrateAsync();
        }

        await using (var check = postgres.NewContext())
        {
            var ids = await check.Assignments
                .Where(a => a.RoomId == room)
                .OrderBy(a => a.ItemId)
                .Select(a => a.ItemId + "@" + a.CheckId)
                .ToListAsync();
            Assert.Equal(["hookshot@lw/library", "lamp@dm/old-man"], ids);

            var dead = Assert.Single(await check.DeadChecks.Where(d => d.RoomId == room).ToListAsync());
            Assert.Equal("dm/floating-island", dead.CheckId);
        }
    }

    [Fact]
    public async Task The_sweeper_drops_stale_rooms_and_keeps_live_ones()
    {
        var now = DateTimeOffset.UtcNow;
        var tag = Guid.NewGuid().ToString("n")[..8];
        var emptyOld = "sweep-empty-old-" + tag;
        var emptyNew = "sweep-empty-new-" + tag;
        var idle = "sweep-idle-" + tag;
        var live = "sweep-live-" + tag;

        await using (var db = postgres.NewContext())
        {
            db.Rooms.AddRange(
                new Room { Id = emptyOld, CreatedAt = now.AddDays(-2), UpdatedAt = now.AddDays(-2) },
                new Room { Id = emptyNew, CreatedAt = now, UpdatedAt = now },
                new Room { Id = idle, CreatedAt = now.AddDays(-200), UpdatedAt = now.AddDays(-100) },
                new Room { Id = live, CreatedAt = now.AddDays(-30), UpdatedAt = now.AddDays(-30) });
            db.Assignments.AddRange(
                NewAssignment(idle, "lamp", "hc/sanctuary"),
                NewAssignment(live, "lamp", "hc/sanctuary"));
            await db.SaveChangesAsync();
        }

        // The sweeper opens its own scope per pass, the way it does in the app.
        var services = new ServiceCollection()
            .AddDbContext<TrackerDbContext>(options => options.UseNpgsql(postgres.ConnectionString))
            .BuildServiceProvider();
        var sweeper = new RoomSweeper(
            services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<RoomSweeper>.Instance);

        await sweeper.SweepAsync(CancellationToken.None);

        await using (var db = postgres.NewContext())
        {
            var remaining = await db.Rooms
                .Where(r => r.Id.EndsWith(tag))
                .Select(r => r.Id)
                .ToListAsync();

            Assert.Equal([emptyNew, live], remaining.Order());

            // The idle room's assignment went with it, through the cascade.
            Assert.Empty(await db.Assignments.Where(a => a.RoomId == idle).ToListAsync());
        }
    }

    private static Assignment NewAssignment(string room, string itemId, string checkId) => new()
    {
        Id = Guid.NewGuid(),
        RoomId = room,
        ItemId = itemId,
        CheckId = checkId,
        At = DateTimeOffset.UtcNow,
    };
}
