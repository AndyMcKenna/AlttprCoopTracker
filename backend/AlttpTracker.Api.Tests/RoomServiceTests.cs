using AlttpTracker.Api;
using AlttpTracker.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api.Tests;

/// <summary>
/// The rules about what can be recorded where. These ran against the old
/// JavaScript store before the API took the job over, so they are the same
/// cases: the tracker's behaviour should not have changed underneath players.
/// </summary>
public class RoomServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<TrackerDbContext> _options;
    private readonly GameData _gameData;

    public RoomServiceTests()
    {
        // A real SQLite database, held in memory: unique indexes and foreign
        // keys behave as they do in production, unlike the in-memory provider.
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        _options = new DbContextOptionsBuilder<TrackerDbContext>()
            .UseSqlite(_connection)
            .Options;

        using var db = new TrackerDbContext(_options);
        db.Database.EnsureCreated();

        _gameData = GameData.Load(GameDataPath());
    }

    private static string GameDataPath()
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

    private RoomService NewService(out TrackerDbContext db)
    {
        db = new TrackerDbContext(_options);
        return new RoomService(db, _gameData);
    }

    public void Dispose() => _connection.Dispose();

    [Fact]
    public async Task Assigning_records_the_item_and_who_found_it()
    {
        var service = NewService(out var db);
        using (db)
        {
            var result = await service.AssignAsync("test-room", "hookshot", "ep/big-chest", "Andy");

            Assert.True(result.Ok);
            var assignment = Assert.Single(result.Room!.Assignments);
            Assert.Equal("ep/big-chest", assignment.CheckId);
            Assert.Equal("Andy", assignment.By);
        }
    }

    [Fact]
    public async Task A_single_slot_item_moves_rather_than_erroring()
    {
        var service = NewService(out var db);
        using (db)
        {
            await service.AssignAsync("test-room", "hookshot", "ep/big-chest", null);
            var result = await service.AssignAsync("test-room", "hookshot", "lw/library", null);

            Assert.True(result.Ok);
            var assignment = Assert.Single(result.Room!.Assignments);
            Assert.Equal("lw/library", assignment.CheckId);
        }
    }

    [Fact]
    public async Task A_progressive_item_fills_its_slots_then_refuses()
    {
        var service = NewService(out var db);
        using (db)
        {
            foreach (var check in new[] { "lw/sick-kid", "lw/hobo", "lw/king-zora", "dw/catfish" })
            {
                Assert.True((await service.AssignAsync("test-room", "bottle", check, null)).Ok);
            }

            Assert.Equal(4, db.Assignments.Count(a => a.ItemId == "bottle"));

            var full = await service.AssignAsync("test-room", "bottle", "lw/library", null);
            Assert.False(full.Ok);
            Assert.Contains("already has 4 locations", full.Error);
        }
    }

    [Fact]
    public async Task A_check_holds_one_item_and_says_which()
    {
        var service = NewService(out var db);
        using (db)
        {
            await service.AssignAsync("test-room", "hookshot", "ep/big-chest", null);

            var taken = await service.AssignAsync("test-room", "lamp", "ep/big-chest", null);

            Assert.False(taken.Ok);
            Assert.Contains("already recorded as Hookshot", taken.Error);
        }
    }

    [Fact]
    public async Task Keys_go_through_the_same_rules_as_any_other_item()
    {
        var service = NewService(out var db);
        using (db)
        {
            Assert.True((await service.AssignAsync("keys", "bk-ep", "ep/big-chest", null)).Ok);

            var taken = await service.AssignAsync("keys", "lamp", "ep/big-chest", null);
            Assert.False(taken.Ok);
            Assert.Contains("EP Big Key", taken.Error);

            // Palace of Darkness holds six small keys in the one box.
            foreach (var check in new[] { "pod/shooter-room", "pod/the-arena-ledge", "pod/map-chest" })
            {
                Assert.True((await service.AssignAsync("keys", "sk-pod", check, null)).Ok);
            }

            Assert.Equal(3, db.Assignments.Count(a => a.ItemId == "sk-pod"));
        }
    }

    [Theory]
    [InlineData("nope", "lw/library")]
    [InlineData("lamp", "lw/nope")]
    public async Task Unknown_ids_are_rejected(string itemId, string checkId)
    {
        var service = NewService(out var db);
        using (db)
        {
            var result = await service.AssignAsync("test-room", itemId, checkId, null);

            Assert.False(result.Ok);
            Assert.Contains("Unknown", result.Error);
        }
    }

    [Fact]
    public async Task Clearing_one_location_leaves_the_rest()
    {
        var service = NewService(out var db);
        using (db)
        {
            await service.AssignAsync("test-room", "bottle", "lw/sick-kid", null);
            await service.AssignAsync("test-room", "bottle", "lw/hobo", null);

            var first = db.Assignments.First(a => a.CheckId == "lw/sick-kid");
            var result = await service.UnassignAsync("test-room", first.Id);

            Assert.True(result.Ok);
            Assert.Equal("lw/hobo", Assert.Single(result.Room!.Assignments).CheckId);
        }
    }

    [Fact]
    public async Task Resetting_empties_the_room()
    {
        var service = NewService(out var db);
        using (db)
        {
            await service.AssignAsync("test-room", "lamp", "hc/sanctuary", null);

            var result = await service.ResetAsync("test-room");

            Assert.True(result.Ok);
            Assert.Empty(result.Room!.Assignments);
            Assert.Empty(db.Assignments);
        }
    }

    [Fact]
    public async Task A_room_survives_being_reopened()
    {
        var first = NewService(out var db);
        using (db)
        {
            await first.AssignAsync("persist-me", "lamp", "hc/sanctuary", null);
            await first.RenameAsync("persist-me", "Friday night race");
        }

        // A new context, as a later request would use.
        var second = NewService(out var db2);
        using (db2)
        {
            var room = await second.GetOrCreateAsync("persist-me");

            Assert.Equal("Friday night race", room.Name);
            Assert.Equal("hc/sanctuary", Assert.Single(room.Assignments).CheckId);
        }
    }

    [Theory]
    [InlineData("  My Room!! ", "myroom")]
    [InlineData("", "lobby")]
    [InlineData(null, "lobby")]
    [InlineData("UPPER-case", "upper-case")]
    public void Room_codes_are_normalised_to_something_shareable(string? input, string expected) =>
        Assert.Equal(expected, RoomService.NormalizeRoomId(input));

    [Fact]
    public void Names_are_trimmed_collapsed_and_capped()
    {
        Assert.Equal("Friday night race", RoomService.SanitizeName("  Friday   night  race "));
        Assert.Null(RoomService.SanitizeName("   "));
        Assert.Equal(40, RoomService.SanitizeName(new string('x', 60))!.Length);
    }
}
