using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AlttpTracker.Api.Data.Migrations
{
    /// <summary>
    /// The two Paradox Cave rooms traded names: the five-chest room is now
    /// Upper and the two-chest room Lower, the way players think of them
    /// (issue #47). A check's id carries its name, and rooms store the id, so
    /// every location and dead mark recorded against the old ids is rewritten
    /// to the new ones. The swap is its own inverse, so Down is Up.
    /// </summary>
    public partial class SwapParadoxNames : Migration
    {
        private static readonly string[] Slugs = ["far-left", "left", "middle", "right", "far-right"];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            Swap(migrationBuilder);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            Swap(migrationBuilder);
        }

        private static void Swap(MigrationBuilder migrationBuilder)
        {
            // Three steps through a prefix nothing else uses. A single UPDATE
            // with a CASE is not enough: (RoomId, CheckId) is unique and
            // Postgres checks it row by row, so a room holding both
            // paradox-lower-left and paradox-upper-left collides with itself
            // halfway through — which is exactly what took Beta 4 down.
            foreach (var table in new[] { "Assignments", "DeadChecks" })
            {
                Rename(migrationBuilder, table, from: "dm/paradox-lower-", to: "dm/paradox-swap-");
                Rename(migrationBuilder, table, from: "dm/paradox-upper-", to: "dm/paradox-lower-");
                Rename(migrationBuilder, table, from: "dm/paradox-swap-", to: "dm/paradox-upper-");
            }
        }

        private static void Rename(MigrationBuilder migrationBuilder, string table, string from, string to)
        {
            var ids = string.Join(", ", Slugs.Select(slug => $"'{from}{slug}'"));

            // substr is 1-based: keep the slug after the old prefix.
            migrationBuilder.Sql(
                $"""
                UPDATE "{table}"
                SET "CheckId" = '{to}' || substr("CheckId", {from.Length + 1})
                WHERE "CheckId" IN ({ids});
                """);
        }
    }
}
