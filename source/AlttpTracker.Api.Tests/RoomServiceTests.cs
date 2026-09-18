using AlttpTracker.Api.Data;
using AlttpTracker.Api.Services;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
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
    private readonly GameCatalog _catalog;
    private readonly RoomLocks _locks = new();

    public RoomServiceTests()
    {
        // A real SQLite database, held in memory: unique indexes and foreign
        // keys behave as they do in production, unlike the in-memory provider.
        // The model avoids provider-specific column types so it opens here as
        // well as on the Postgres the app actually runs against.
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        _options = new DbContextOptionsBuilder<TrackerDbContext>()
            .UseSqlite(_connection)
            .Options;

        using var db = new TrackerDbContext(_options);
        db.Database.EnsureCreated();

        // The rules read the game from the catalog, and the catalog reads it
        // from the database, so the tests seed it the same way the app does.
        new GameDataSeeder(db, NullLogger<GameDataSeeder>.Instance)
            .SeedAsync(GameDataPath())
            .GetAwaiter()
            .GetResult();

        _catalog = new GameCatalog();
        _catalog
            .LoadAsync(db, SpriteImages.Scan("no-such-directory", NullLogger.Instance))
            .GetAwaiter()
            .GetResult();
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
        return new RoomService(db, _catalog, _locks);
    }

    public void Dispose() => _connection.Dispose();

    [Fact]
    public async Task Assigning_records_the_item_against_the_check()
    {
        var service = NewService(out var db);
        using (db)
        {
            var result = await service.AssignAsync("test-room", "hookshot", "ep/big-chest");

            Assert.True(result.Ok);
            var assignment = Assert.Single(result.Room!.Assignments);
            Assert.Equal("ep/big-chest", assignment.CheckId);
        }
    }

    [Fact]
    public async Task A_single_slot_item_moves_rather_than_erroring()
    {
        var service = NewService(out var db);
        using (db)
        {
            await service.AssignAsync("test-room", "hookshot", "ep/big-chest");
            var result = await service.AssignAsync("test-room", "hookshot", "lw/library");

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
                Assert.True((await service.AssignAsync("test-room", "bottle", check)).Ok);
            }

            Assert.Equal(4, db.Assignments.Count(a => a.ItemId == "bottle"));

            var full = await service.AssignAsync("test-room", "bottle", "lw/library");
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
            await service.AssignAsync("test-room", "hookshot", "ep/big-chest");

            var taken = await service.AssignAsync("test-room", "lamp", "ep/big-chest");

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
            Assert.True((await service.AssignAsync("keys", "bk-ep", "ep/big-chest")).Ok);

            var taken = await service.AssignAsync("keys", "lamp", "ep/big-chest");
            Assert.False(taken.Ok);
            Assert.Contains("EP Big Key", taken.Error);

            // Palace of Darkness holds six small keys in the one box.
            foreach (var check in new[] { "pod/shooter-room", "pod/the-arena-ledge", "pod/map-chest" })
            {
                Assert.True((await service.AssignAsync("keys", "sk-pod", check)).Ok);
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
            var result = await service.AssignAsync("test-room", itemId, checkId);

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
            await service.AssignAsync("test-room", "bottle", "lw/sick-kid");
            await service.AssignAsync("test-room", "bottle", "lw/hobo");

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
            await service.AssignAsync("test-room", "lamp", "hc/sanctuary");
            await service.SetDeadAsync("test-room", "dw/bumper-cave-ledge", dead: true);

            var result = await service.ResetAsync("test-room");

            Assert.True(result.Ok);
            Assert.Empty(result.Room!.Assignments);
            Assert.Empty(result.Room!.DeadChecks);
            Assert.Empty(db.Assignments);
            Assert.Empty(db.DeadChecks);
        }
    }

    [Fact]
    public async Task A_check_can_be_marked_dead_and_brought_back()
    {
        var service = NewService(out var db);
        using (db)
        {
            var dead = await service.SetDeadAsync("test-room", "dw/bumper-cave-ledge", dead: true);
            Assert.True(dead.Ok);
            Assert.Equal("dw/bumper-cave-ledge", Assert.Single(dead.Room!.DeadChecks).CheckId);
            Assert.Contains("dw/bumper-cave-ledge", RoomState.From(dead.Room!).Dead);

            // Marking it again is not an error: two players may both have looked.
            Assert.True((await service.SetDeadAsync("test-room", "dw/bumper-cave-ledge", dead: true)).Ok);
            Assert.Single(db.DeadChecks);

            var back = await service.SetDeadAsync("test-room", "dw/bumper-cave-ledge", dead: false);
            Assert.True(back.Ok);
            Assert.Empty(back.Room!.DeadChecks);
            Assert.Empty(db.DeadChecks);
        }
    }

    [Fact]
    public async Task A_check_holding_an_item_cannot_be_marked_dead()
    {
        var service = NewService(out var db);
        using (db)
        {
            await service.AssignAsync("test-room", "hookshot", "ep/big-chest");

            var result = await service.SetDeadAsync("test-room", "ep/big-chest", dead: true);

            Assert.False(result.Ok);
            Assert.Contains("recorded as Hookshot", result.Error);
            Assert.Empty(db.DeadChecks);
        }
    }

    [Fact]
    public async Task Recording_an_item_at_a_dead_check_brings_it_back()
    {
        var service = NewService(out var db);
        using (db)
        {
            await service.SetDeadAsync("test-room", "ep/big-chest", dead: true);

            var result = await service.AssignAsync("test-room", "hookshot", "ep/big-chest");

            Assert.True(result.Ok);
            Assert.Empty(result.Room!.DeadChecks);
            Assert.Equal("ep/big-chest", Assert.Single(result.Room!.Assignments).CheckId);
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("lw/nope")]
    public async Task Marking_a_check_that_does_not_exist_is_refused(string? checkId)
    {
        var service = NewService(out var db);
        using (db)
        {
            var result = await service.SetDeadAsync("test-room", checkId, dead: true);

            Assert.False(result.Ok);
            Assert.Empty(db.Rooms);
        }
    }

    [Fact]
    public async Task Marking_a_check_dead_creates_the_room_but_bringing_one_back_does_not()
    {
        var service = NewService(out var db);
        using (db)
        {
            Assert.True((await service.SetDeadAsync("never-written", "lw/library", dead: false)).Ok);
            Assert.Empty(db.Rooms);

            Assert.True((await service.SetDeadAsync("first-dead", "lw/library", dead: true)).Ok);
            Assert.Single(db.Rooms);
        }
    }

    [Fact]
    public async Task A_room_survives_being_reopened()
    {
        var first = NewService(out var db);
        using (db)
        {
            await first.AssignAsync("persist-me", "lamp", "hc/sanctuary");
        }

        // A new context, as a later request would use.
        var second = NewService(out var db2);
        using (db2)
        {
            var room = await second.GetOrCreateAsync("persist-me");

            Assert.Equal("hc/sanctuary", Assert.Single(room.Assignments).CheckId);
        }
    }

    [Fact]
    public async Task Opening_a_code_does_not_create_a_room()
    {
        var service = NewService(out var db);
        using (db)
        {
            var state = await service.GetStateAsync("never-written");

            Assert.Equal("never-written", state.Id);
            Assert.Empty(state.Assignments);
            Assert.Empty(db.Rooms);
        }
    }

    [Fact]
    public async Task Clearing_a_room_that_was_never_written_does_not_create_it()
    {
        var service = NewService(out var db);
        using (db)
        {
            Assert.True((await service.ResetAsync("never-written")).Ok);
            Assert.True((await service.UnassignAsync("never-written", Guid.NewGuid())).Ok);
            Assert.Empty(db.Rooms);
        }
    }

    [Fact]
    public async Task The_first_recorded_location_is_what_creates_a_room()
    {
        var service = NewService(out var db);
        using (db)
        {
            await service.AssignAsync("first-write", "lamp", "hc/sanctuary");

            Assert.Single(db.Rooms);
        }
    }

    [Theory]
    [InlineData(null, "lw/library")]
    [InlineData("lamp", null)]
    [InlineData("", "")]
    public async Task A_body_missing_a_field_is_refused_not_thrown(string? itemId, string? checkId)
    {
        var service = NewService(out var db);
        using (db)
        {
            var result = await service.AssignAsync("test-room", itemId, checkId);

            Assert.False(result.Ok);
            Assert.Contains("required", result.Error);
        }
    }

    [Fact]
    public async Task Keydrop_locations_and_keys_need_the_room_playing_keydrop()
    {
        var service = NewService(out var db);
        using (db)
        {
            var location = await service.AssignAsync("test-room", "lamp", "ep/dark-square-pot-key");
            Assert.False(location.Ok);
            Assert.Contains("turn on Keydrop", location.Error);

            var key = await service.AssignAsync("test-room", "bk-hc", "hc/big-key-drop");
            Assert.False(key.Ok);
            Assert.Contains("turn on Keydrop", key.Error);

            var dead = await service.SetDeadAsync("test-room", "ep/dark-square-pot-key", dead: true);
            Assert.False(dead.Ok);

            Assert.True((await service.SetKeydropAsync("test-room", keydrop: true)).Ok);

            Assert.True((await service.AssignAsync("test-room", "lamp", "ep/dark-square-pot-key")).Ok);
            Assert.True((await service.AssignAsync("test-room", "bk-hc", "hc/big-key-drop")).Ok);
            Assert.True((await service.SetDeadAsync("test-room", "ep/dark-eyegore-key-drop", dead: true)).Ok);
        }
    }

    [Fact]
    public async Task Small_key_boxes_grow_in_keydrop_and_what_was_recorded_survives_turning_it_off()
    {
        var service = NewService(out var db);
        using (db)
        {
            // Skull Woods holds three small keys, five in keydrop.
            foreach (var check in new[] { "sw/map-chest", "sw/compass-chest", "sw/big-chest" })
            {
                Assert.True((await service.AssignAsync("test-room", "sk-sw", check)).Ok);
            }

            var full = await service.AssignAsync("test-room", "sk-sw", "sw/pot-prison");
            Assert.False(full.Ok);
            Assert.Contains("already has 3 locations", full.Error);

            Assert.True((await service.SetKeydropAsync("test-room", keydrop: true)).Ok);
            Assert.True((await service.AssignAsync("test-room", "sk-sw", "sw/pot-prison")).Ok);
            Assert.True((await service.AssignAsync("test-room", "sk-sw", "sw/west-lobby-pot-key")).Ok);
            Assert.Equal(5, db.Assignments.Count(a => a.ItemId == "sk-sw"));

            var off = await service.SetKeydropAsync("test-room", keydrop: false);
            Assert.True(off.Ok);
            Assert.False(off.Room!.Keydrop);
            Assert.Equal(5, db.Assignments.Count(a => a.ItemId == "sk-sw"));
            Assert.Contains("sw/west-lobby-pot-key", RoomState.From(off.Room!).Assignments["sk-sw"].Select(a => a.CheckId));
        }
    }

    [Fact]
    public async Task Turning_keydrop_on_creates_the_room_and_off_does_not()
    {
        var service = NewService(out var db);
        using (db)
        {
            Assert.True((await service.SetKeydropAsync("never-written", keydrop: false)).Ok);
            Assert.Empty(db.Rooms);

            var on = await service.SetKeydropAsync("keydrop-room", keydrop: true);
            Assert.True(on.Ok);
            Assert.True(on.Room!.Keydrop);
            Assert.True(RoomState.From(on.Room!).Keydrop);
            Assert.Single(db.Rooms);
        }
    }

    [Fact]
    public async Task Room_codes_are_three_words_that_fit_the_column()
    {
        var service = NewService(out var db);
        using (db)
        {
            for (var i = 0; i < 20; i += 1)
            {
                var code = await RoomNames.SuggestAsync(db);

                Assert.Equal(3, code.Split('-').Length);
                Assert.InRange(code.Length, 1, 32);
                Assert.Equal(code, RoomService.NormalizeRoomId(code));
            }
        }
    }

    [Theory]
    [InlineData("  My Room!! ", "myroom")]
    [InlineData("", "lobby")]
    [InlineData(null, "lobby")]
    [InlineData("UPPER-case", "upper-case")]
    public void Room_codes_are_normalised_to_something_shareable(string? input, string expected) =>
        Assert.Equal(expected, RoomService.NormalizeRoomId(input));

}
