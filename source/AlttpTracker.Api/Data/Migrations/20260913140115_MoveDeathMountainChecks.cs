using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AlttpTracker.Api.Data.Migrations
{
    /// <summary>
    /// Fourteen checks moved out of Light World into a region of their own,
    /// Death Mountain. A check's id carries its region, and rooms store the
    /// id, so every location and dead mark recorded against the old ids is
    /// rewritten to the new ones. The check names themselves did not change.
    /// </summary>
    public partial class MoveDeathMountainChecks : Migration
    {
        private static readonly string[] Slugs =
        [
            "old-man",
            "spectacle-rock-cave",
            "spectacle-rock",
            "ether-tablet",
            "spiral-cave",
            "mimic-cave",
            "paradox-lower-far-left",
            "paradox-lower-left",
            "paradox-lower-middle",
            "paradox-lower-right",
            "paradox-lower-far-right",
            "paradox-upper-left",
            "paradox-upper-right",
            "floating-island",
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            Move(migrationBuilder, from: "lw", to: "dm");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            Move(migrationBuilder, from: "dm", to: "lw");
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
