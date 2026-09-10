using AlttpTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AlttpTracker.Api.Data;

public class TrackerDbContext(DbContextOptions<TrackerDbContext> options) : DbContext(options)
{
    public DbSet<Room> Rooms => Set<Room>();

    public DbSet<Assignment> Assignments => Set<Assignment>();

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
    }
}
