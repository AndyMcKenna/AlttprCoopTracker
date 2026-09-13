'use strict';

/** Home page: hand out a room code, or take one the player already has. */

const generate = document.getElementById('generate');
const note = document.getElementById('generate-note');
const joinForm = document.getElementById('join-form');
const joinRoom = document.getElementById('join-room');

function openBoard(room) {
  location.href = 'board.html?room=' + encodeURIComponent(room);
}

/** Same folding the API does, so the box cannot offer a code it would reject. */
function normalizeRoom(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32);
}

generate.addEventListener('click', async () => {
  generate.disabled = true;
  const wording = generate.textContent;
  generate.textContent = 'Finding a room…';

  try {
    // The service picks the name: it can see which codes are already taken.
    const response = await fetch('api/rooms/new-name');
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    const { room } = await response.json();
    openBoard(room);
  } catch {
    note.textContent = 'Could not reach the tracker. Try again in a moment.';
    note.classList.add('is-error');
    generate.disabled = false;
    generate.textContent = wording;
  }
});

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const room = normalizeRoom(joinRoom.value);
  if (!room) {
    joinRoom.focus();
    return;
  }
  openBoard(room);
});
