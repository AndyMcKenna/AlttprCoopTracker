using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AlttpTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDeadChecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DeadChecks",
                columns: table => new
                {
                    RoomId = table.Column<string>(type: "character varying(32)", nullable: false),
                    CheckId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeadChecks", x => new { x.RoomId, x.CheckId });
                    table.ForeignKey(
                        name: "FK_DeadChecks_Rooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "Rooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DeadChecks");
        }
    }
}
