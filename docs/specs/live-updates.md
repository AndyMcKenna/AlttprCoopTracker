# Live updates

A change made by one player shows up for the others without a refresh.

## The socket

- **LIVE-1** The board opens `GET /ws?room=<code>` (folded, ROOM-1) and
  then only listens. Nothing the client sends on the socket is acted on.
- **LIVE-2** Every successful write through the API (API-2) is followed by
  one broadcast of the room's state, read back from the database, to every
  socket open on that room — the writer's own included.
- **LIVE-3** On connecting, the new socket is sent the room's state at once,
  and, because it is already counted, that same broadcast tells the others
  the player count went up. When a socket closes, the remaining sockets are
  sent the state again so their count goes down.
- **LIVE-4** Messages are JSON. `{ "type": "state", "room": <room state>,
  "players": <n> }` carries a room state (API-4) and the number of sockets
  open on the room. A client also accepts `{ "type": "players", "players": n }`
  and `{ "type": "error", "message": "..." }`, the latter shown as a hint.
- **LIVE-5** The player count is sockets open on the room in this process,
  not people: one person with two tabs is two. It is shown as `1 player`,
  `3 players`.

## Ordering

- **LIVE-6** States reach a board from two directions — the response to
  its own request and the broadcast — and several players' writes can be in
  flight at once, so they do not always arrive in the order they were made.
  A board applies a state only if its `updatedAt` is not older than the one
  it is showing; an older state is dropped. A state for a different room id
  is always applied (the player switched rooms).
- **LIVE-7** A broadcast is not cancelled by the player whose request caused
  it giving up on that request; it goes to everyone regardless.

## Delivery

- **LIVE-8** Sends to one socket are serialised, so two writes broadcast at
  the same moment do not interleave on the wire.
- **LIVE-9** A socket that cannot take a message within ten seconds is
  dropped, and a socket that errors mid-send is dropped, without holding up
  the others. The client reconnects on its own (LIVE-10).
- **LIVE-10** When the socket closes for any reason, the board shows
  Reconnecting… and reconnects after a delay that starts at half a second
  and doubles to a cap of ten seconds, resetting once a connection opens.
  Reconnecting brings the current state (LIVE-3), so a board that missed
  broadcasts while disconnected catches up.
- **LIVE-11** Switching room (ROOM-5) closes the old socket and opens one
  for the new room.
