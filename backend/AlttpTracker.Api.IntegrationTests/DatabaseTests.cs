using AlttpTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
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
        Assert.Equal(15, await db.GameRegions.CountAsync());
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
            Assert.True((await service.AssignAsync(room, "lamp", "hc/sanctuary", "Andy")).Ok);
            await service.RenameAsync(room, "Friday night race");
        }

        // A separate connection, as a later request would use.
        await using (var db = postgres.NewContext())
        {
            var reopened = await new RoomService(db, catalog).GetOrCreateAsync(room);

            Assert.Equal("Friday night race", reopened.Name);
            var assignment = Assert.Single(reopened.Assignments);
            Assert.Equal("hc/sanctuary", assignment.CheckId);
            Assert.Equal("Andy", assignment.By);
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
