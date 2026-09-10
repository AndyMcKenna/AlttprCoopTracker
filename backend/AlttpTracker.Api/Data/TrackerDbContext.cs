using AlttpTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace AlttpTracker.Api.Data;

public class TrackerDbContext(DbContextOptions<TrackerDbContext> options) : DbContext(options)
{
    // What players record.
    public DbSet<Room> Rooms => Set<Room>();

    public DbSet<Assignment> Assignments => Set<Assignment>();

    // The game itself, seeded from gamedata.json and served to the board.
    public DbSet<GameRegion> GameRegions => Set<GameRegion>();

    public DbSet<GameCheck> GameChecks => Set<GameCheck>();

    public DbSet<GameItem> GameItems => Set<GameItem>();

    public DbSet<GameKeyRow> GameKeyRows => Set<GameKeyRow>();

    public DbSet<GameSprite> GameSprites => Set<GameSprite>();

    public DbSet<GamePaletteEntry> GamePalette => Set<GamePaletteEntry>();

    public DbSet<GameDataVersion> GameDataVersions => Set<GameDataVersion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Room>(room =>
        {
            room.HasKey(r => r.Id);
            room.Property(r => r.Id).HasMaxLength(32);
            room.Property(r => r.Name).HasMaxLength(40);

            room.HasMany(r => r.Assignments)
                .WithOne(a => a.Room)
                .HasForeignKey(a => a.RoomId)
                // Clearing a room should take its assignments with it.
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Assignment>(assignment =>
        {
            assignment.HasKey(a => a.Id);
            assignment.Property(a => a.ItemId).HasMaxLength(64);
            assignment.Property(a => a.CheckId).HasMaxLength(64);
            assignment.Property(a => a.By).HasMaxLength(40);

            // A check holds one item. The service reports a friendly error
            // before it gets here, but two players clicking at once should
            // fail on the database rather than both succeed.
            assignment.HasIndex(a => new { a.RoomId, a.CheckId }).IsUnique();

            assignment.HasIndex(a => new { a.RoomId, a.ItemId });
        });

        modelBuilder.Entity<GameRegion>(region =>
        {
            region.HasKey(r => r.Id);
            region.Property(r => r.Id).HasMaxLength(16);
        });

        modelBuilder.Entity<GameCheck>(check =>
        {
            check.HasKey(c => c.Id);
            check.Property(c => c.Id).HasMaxLength(64);
            check.HasIndex(c => c.Region);
        });

        modelBuilder.Entity<GameItem>(item =>
        {
            item.HasKey(i => i.Id);
            item.Property(i => i.Id).HasMaxLength(64);
            item.HasIndex(i => i.Panel);
        });

        modelBuilder.Entity<GameKeyRow>(row =>
        {
            row.HasKey(r => r.Id);
            row.Property(r => r.Id).HasMaxLength(16);
        });

        modelBuilder.Entity<GameSprite>(sprite =>
        {
            sprite.HasKey(s => s.Id);
            sprite.Property(s => s.Name).HasMaxLength(64);
            sprite.Property(s => s.Kind).HasMaxLength(16);

            // Stored as one newline-joined string rather than a Postgres
            // text[], so the model also opens on SQLite — which is what the
            // tests use to stay fast and not need a container.
            sprite.Property(s => s.Rows)
                .HasConversion(
                    rows => string.Join('\n', rows),
                    text => text.Split('\n', StringSplitOptions.None).ToList(),
                    new ValueComparer<List<string>>(
                        (a, b) => a != null && b != null && a.SequenceEqual(b),
                        v => v.Aggregate(0, (hash, row) => HashCode.Combine(hash, row.GetHashCode())),
                        v => v.ToList()));
            // One sprite may serve both boards under the same name, so the
            // pair is what has to be unique.
            sprite.HasIndex(s => new { s.Kind, s.Name }).IsUnique();
        });

        modelBuilder.Entity<GamePaletteEntry>(entry =>
        {
            entry.HasKey(e => e.Symbol);
            entry.Property(e => e.Symbol).HasMaxLength(2);
            entry.Property(e => e.Color).HasMaxLength(16);
        });

        modelBuilder.Entity<GameDataVersion>(version =>
        {
            version.HasKey(v => v.Id);
            version.Property(v => v.Hash).HasMaxLength(64);
        });
    }
}
