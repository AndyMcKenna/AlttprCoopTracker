using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AlttpTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddKeydrop : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Keydrop",
                table: "Rooms",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "KeydropCount",
                table: "GameRegions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "KeydropLabel",
                table: "GameItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "KeydropOnly",
                table: "GameItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "KeydropSlots",
                table: "GameItems",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "Keydrop",
                table: "GameChecks",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Keydrop",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "KeydropCount",
                table: "GameRegions");

            migrationBuilder.DropColumn(
                name: "KeydropLabel",
                table: "GameItems");

            migrationBuilder.DropColumn(
                name: "KeydropOnly",
                table: "GameItems");

            migrationBuilder.DropColumn(
                name: "KeydropSlots",
                table: "GameItems");

            migrationBuilder.DropColumn(
                name: "Keydrop",
                table: "GameChecks");
        }
    }
}
