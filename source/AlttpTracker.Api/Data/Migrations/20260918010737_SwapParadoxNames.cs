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
        private static readonly (string Lower, string Upper)[] Pairs =
        [
            ("dm/paradox-lower-far-left", "dm/paradox-upper-far-left"),
            ("dm/paradox-lower-left", "dm/paradox-upper-left"),
            ("dm/paradox-lower-middle", "dm/paradox-upper-middle"),
            ("dm/paradox-lower-right", "dm/paradox-upper-right"),
            ("dm/paradox-lower-far-right", "dm/paradox-upper-far-right"),
        ];

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
            // One statement per table, so that a lower id becoming upper can
            // never be caught by the upper-to-lower rewrite of the same run.
            var cases = string.Join("\n", Pairs.SelectMany(p => new[]
            {
                $"WHEN '{p.Lower}' THEN '{p.Upper}'",
                $"WHEN '{p.Upper}' THEN '{p.Lower}'",
            }).Select(line => "        " + line));
            var ids = string.Join(", ", Pairs.SelectMany(p => new[] { $"'{p.Lower}'", $"'{p.Upper}'" }));

            foreach (var table in new[] { "Assignments", "DeadChecks" })
            {
                migrationBuilder.Sql(
                    $"""
                    UPDATE "{table}"
                    SET "CheckId" = CASE "CheckId"
                    {cases}
                    END
                    WHERE "CheckId" IN ({ids});
                    """);
            }
        }
    }
}
