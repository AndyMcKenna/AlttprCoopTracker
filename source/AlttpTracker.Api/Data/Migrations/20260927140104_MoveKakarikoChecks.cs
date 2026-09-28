using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AlttpTracker.Api.Data.Migrations
{
    /// <summary>
    /// Sixteen checks moved out of Light World into a region of their own,
    /// Kakariko Village. A check's id carries its region, and rooms store the
    /// id, so every location and dead mark recorded against the old ids is
    /// rewritten to the new ones. The check names themselves did not change,
    /// and no kak/ id existed before, so there is nothing to collide with.
    /// </summary>
    public partial class MoveKakarikoChecks : Migration
    {
        private static readonly string[] Slugs =
        [
            "blinds-hideout-top",
            "blinds-hideout-far-left",
            "blinds-hideout-left",
            "blinds-hideout-right",
            "blinds-hideout-far-right",
            "kakariko-well-bottom",
            "kakariko-well-top",
            "kakariko-well-left",
            "kakariko-well-middle",
            "kakariko-well-right",
            "bottle-merchant",
            "chicken-house",
            "kakariko-tavern",
            "sick-kid",
            "library",
            "maze-race",
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            Move(migrationBuilder, from: "lw", to: "kak");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            Move(migrationBuilder, from: "kak", to: "lw");
        }

        private static void Move(MigrationBuilder migrationBuilder, string from, string to)
        {
            var oldIds = string.Join(", ", Slugs.Select(slug => $"'{from}/{slug}'"));

            // substr is 1-based: skip the old prefix and its slash.
            foreach (var table in new[] { "Assignments", "DeadChecks" })
            {
                migrationBuilder.Sql(
                    $"""
                    UPDATE "{table}"
                    SET "CheckId" = '{to}/' || substr("CheckId", {from.Length + 2})
                    WHERE "CheckId" IN ({oldIds});
                    """);
            }
        }
    }
}
