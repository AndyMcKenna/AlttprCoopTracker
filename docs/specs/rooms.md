# Rooms

A room is one shared board. Everyone who has its code sees and changes the
same board. There are no accounts and no owners.

## Codes

- **ROOM-1** A room code is 1–32 characters from `a-z`, `0-9` and `-`. Any
  code received — in a URL, typed into the room box, or in an API path — is
  folded first: lower-cased, every other character dropped, then cut to 32.
  An empty result is the code `lobby`.
- **ROOM-2** The code is the only thing that gates a room. Nothing else is
  asked for and nothing is checked.
- **ROOM-3** The home page offers a fresh code on request. A suggested code
  is three words, `adjective-adjective-noun`, drawn from the lists in
  `RoomNames.cs` with the two adjectives different, and is not the code of a
  room that exists. If twelve tries are all taken it falls back to two words
  and four digits, and finally two words and six hex characters, so the
  button always yields a code.
- **ROOM-4** The board puts the code in the URL as `?room=<code>` and
  remembers it in the browser, so opening the board with no `room` parameter
  reopens the last room used, or `lobby` if there is none.
- **ROOM-5** Changing the code in the board's room box switches to that room
  in place: the URL is rewritten, anything armed is put down, and the board
  reconnects for the new room.

## Existence

- **ROOM-6** Opening a code does not create a room. A code that has never
  been written to reads as an empty board with no rows in the database.
- **ROOM-7** A room is created by its first write: recording a location or
  marking a check dead. Clearing a location, bringing a check back or
  resetting a room that does not exist succeeds and creates nothing. Two
  first writes arriving together both succeed: one creates the room and the
  other lands in it.
- **ROOM-8** A room records when it was created and when it was last
  changed. Every write updates the latter.

## Persistence and retention

- **ROOM-9** A room's assignments and dead marks are kept in the database, so
  closing every browser and coming back later shows the same board.
- **ROOM-10** Reset removes every assignment and every dead mark in the room.
  The room itself remains, and is now empty.
- **ROOM-11** A sweeper deletes rooms nobody will come back to: a room that
  has been empty (no assignments and no dead marks) for a day, or that has
  not been changed in ninety days. It runs at startup and then hourly. A
  swept code, opened again, is an empty board (ROOM-6).
- **ROOM-12** Deleting a room deletes its assignments and dead marks with it.
