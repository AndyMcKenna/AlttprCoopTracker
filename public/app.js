'use strict';

/**
 * Co-op tracker client.
 *
 * Flow: pick an item ("Set location"), then click one of the 216 check tiles.
 * The pairing goes to the server, which broadcasts the whole room state back
 * to everyone connected to the same room code.
 */

const el = {
  status: document.getElementById('status'),
  players: document.getElementById('players'),
  playerName: document.getElementById('player-name'),
  roomInput: document.getElementById('room-input'),
  roomName: document.getElementById('room-name'),
  copyLink: document.getElementById('copy-link'),
  reset: document.getElementById('reset'),
  hint: document.getElementById('hint'),
  items: document.getElementById('items'),
  itemsSummary: document.getElementById('items-summary'),
  checks: document.getElementById('checks'),
  checksSummary: document.getElementById('checks-summary'),
  regions: document.getElementById('regions'),
  search: document.getElementById('search'),
  hideUsed: document.getElementById('hide-used'),
  assignBar: document.getElementById('assign-bar'),
  assignBarText: document.getElementById('assign-bar-text'),
  assignCancel: document.getElementById('assign-cancel'),
};

const OPEN_BY_DEFAULT = new Set(['lw', 'dw']);

const state = {
  data: null,
  room: null,
  armed: null, // item id waiting for a check click
  regionFilter: new Set(), // empty means "all regions"
  collapsed: new Set(), // region ids folded shut; filled in once data arrives
  search: '',
  hideUsed: false,
  spriteCache: new Map(),
};

let socket = null;
let reconnectDelay = 500;
let hintTimer = null;

/* ------------------------------------------------------------------ room */

function roomFromUrl() {
  const fromQuery = new URLSearchParams(location.search).get('room');
  return normalizeRoom(fromQuery || localStorage.getItem('alttp-room') || 'lobby');
}

function normalizeRoom(value) {
  const clean = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32);
  return clean || 'lobby';
}

let roomId = roomFromUrl();

function setRoom(next) {
  const normalized = normalizeRoom(next);
  if (normalized === roomId) return;
  roomId = normalized;
  localStorage.setItem('alttp-room', roomId);
  el.roomInput.value = roomId;
  const url = new URL(location.href);
  url.searchParams.set('room', roomId);
  history.replaceState(null, '', url);
  state.room = null;
  disarm();
  connect();
}

/* --------------------------------------------------------------- sprites */

// A pixel grid becomes an SVG of horizontal run-length rects, used as an
// <img> source so the browser scales it crisply at any tile size.
function spriteUrl(cacheKey, grid) {
  if (state.spriteCache.has(cacheKey)) return state.spriteCache.get(cacheKey);

  const palette = state.data.palette;
  const rects = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run += 1;
      rects.push(
        '<rect x="' + x + '" y="' + y + '" width="' + run + '" height="1" fill="' + palette[ch] + '"/>'
      );
      x += run;
    }
  });

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">' +
    rects.join('') +
    '</svg>';
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg);
  state.spriteCache.set(cacheKey, url);
  return url;
}

// The one bit of chrome that isn't game art: a pencil for "record a location".
const PENCIL_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
  '<path d="M11.0 1.2 L14.8 5.0 L4.9 14.9 L0.7 15.3 L1.1 11.1 Z" fill="currentColor"/>' +
  '<path d="M9.1 3.1 L12.9 6.9" stroke="var(--bg-tile)" stroke-width="1.2" fill="none"/>' +
  '</svg>';

function editLabel(item, count, full) {
  if (state.armed === item.id) {
    return 'Click the check where ' + item.name + ' was found (Esc to cancel)';
  }
  if (full) {
    return item.slots > 1
      ? item.name + ' already has all ' + item.slots + ' locations'
      : 'Change where ' + item.name + ' was found';
  }
  if (count) {
    return 'Record another location for ' + item.name + ' (' + count + ' of ' + item.slots + ')';
  }
  return 'Record where ' + item.name + ' was found';
}

/* ---------------------------------------------------------------- derive */

function assignmentsFor(itemId) {
  return (state.room && state.room.assignments[itemId]) || [];
}

/** checkId -> the item recorded there, for the "already used" markers. */
function buildOwners() {
  const owners = new Map();
  if (!state.room) return owners;
  for (const item of state.data.items) {
    for (const entry of assignmentsFor(item.id)) {
      owners.set(entry.checkId, item);
    }
  }
  return owners;
}

/* ---------------------------------------------------------------- render */

function render() {
  if (!state.data) return;
  const owners = buildOwners();
  renderItems(owners);
  renderChecks(owners);

  const mainItems = state.data.items.filter((item) => item.panel === 'items');
  const found = mainItems.filter((item) => assignmentsFor(item.id).length).length;
  el.itemsSummary.textContent = found + ' of ' + mainItems.length + ' located';
  el.checksSummary.textContent = owners.size + ' of ' + state.data.checks.length + ' recorded';
}

/**
 * One item tile: sprite, name, the pencil that arms it, and the list of
 * locations recorded against it. Shared by the item board and the key panel.
 */
function buildItemTile(item) {
  const entries = assignmentsFor(item.id);
  const full = entries.length >= item.slots;

  const tile = document.createElement('div');
  tile.className = 'item';
  if (state.armed === item.id) tile.classList.add('is-armed');
  tile.classList.add(entries.length ? 'is-found' : 'is-empty');

  const sprite = document.createElement('img');
  sprite.className = 'item-sprite';
  sprite.alt = '';
  sprite.src = spriteUrl('item:' + item.sprite, state.data.itemSprites[item.sprite]);
  tile.appendChild(sprite);

  const body = document.createElement('div');
  body.className = 'item-body';

  const name = document.createElement('div');
  name.className = 'item-name';
  // Key tiles use the short label; the dungeon is already the row heading.
  name.textContent = item.label || item.name;
  // Progressive items say how many of their locations are pinned down.
  if (item.slots > 1 || item.alwaysCount) {
    const count = document.createElement('span');
    count.className = 'item-count';
    if (full) count.classList.add('is-full');
    count.textContent = entries.length + '/' + item.slots;
    name.appendChild(count);
  }
  body.appendChild(name);

  const edit = document.createElement('button');
  edit.className = 'item-edit';
  edit.type = 'button';
  edit.innerHTML = PENCIL_ICON;
  if (full && state.armed !== item.id) edit.classList.add('is-full');
  const editText = editLabel(item, entries.length, full);
  edit.title = editText;
  edit.setAttribute('aria-label', editText);
  edit.addEventListener('click', () => toggleArm(item.id));
  tile.appendChild(edit);

  if (entries.length) {
    const list = document.createElement('ul');
    list.className = 'item-locations';

    for (const entry of entries) {
      const check = state.checksById.get(entry.checkId);
      const row = document.createElement('li');
      row.className = 'item-location';
      row.title = entry.by
        ? 'Recorded by ' + entry.by + ' at ' + new Date(entry.at).toLocaleTimeString()
        : 'Recorded at ' + new Date(entry.at).toLocaleTimeString();

      const region = document.createElement('span');
      region.className = 'loc-region';
      region.textContent = check ? check.regionShort : '??';
      row.appendChild(region);

      const label = document.createElement('span');
      label.className = 'loc-name';
      label.textContent = check ? check.name : entry.checkId;
      row.appendChild(label);

      const remove = document.createElement('button');
      remove.className = 'loc-remove';
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Clear this location';
      remove.addEventListener('click', () =>
        send({ type: 'unassign', itemId: item.id, assignmentId: entry.id })
      );
      row.appendChild(remove);

      list.appendChild(row);
    }

    body.appendChild(list);
  }

  tile.appendChild(body);
  return tile;
}

/**
 * The Keys group: one row per dungeon, big key first, then the single
 * small-key box. Rendered as a third group inside the item board.
 */
function buildKeysGroup() {
  const section = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'item-group-title';
  title.textContent = 'Keys';

  // Keys count individual keys, not boxes: a dungeon's 6 small keys are 6.
  const keyItems = state.data.items.filter((item) => item.panel === 'keys');
  const found = keyItems.reduce((sum, item) => sum + assignmentsFor(item.id).length, 0);
  const total = keyItems.reduce((sum, item) => sum + item.slots, 0);
  const count = document.createElement('span');
  count.className = 'group-count';
  count.textContent = found + ' of ' + total + ' located';
  title.appendChild(count);
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'key-grid';

  for (const dungeon of state.data.keyPanel) {
    const row = document.createElement('div');
    row.className = 'key-row';

    const heading = document.createElement('div');
    heading.className = 'key-dungeon';
    const swatch = document.createElement('span');
    swatch.className = 'region-swatch';
    swatch.style.background = dungeon.color;
    heading.appendChild(swatch);
    heading.appendChild(document.createTextNode(dungeon.name));
    row.appendChild(heading);

    if (dungeon.bigKey) row.appendChild(buildItemTile(state.itemsById.get(dungeon.bigKey)));

    if (dungeon.smallKey) {
      const tile = buildItemTile(state.itemsById.get(dungeon.smallKey));
      // Keep the small-key column aligned when a dungeon has no big key.
      if (!dungeon.bigKey) tile.classList.add('is-small-only');
      row.appendChild(tile);
    }

    grid.appendChild(row);
  }

  section.appendChild(grid);
  return section;
}

function renderItems(owners) {
  const frag = document.createDocumentFragment();

  for (const group of state.data.groups) {
    const section = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'item-group-title';
    title.textContent = group;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'item-grid';

    for (const item of state.data.items.filter((entry) => entry.group === group)) {
      grid.appendChild(buildItemTile(item));
    }

    section.appendChild(grid);
    frag.appendChild(section);
  }

  frag.appendChild(buildKeysGroup());
  el.items.replaceChildren(frag);
}

function renderChecks(owners) {
  const scroll = el.checks.scrollTop;
  const needle = state.search.trim().toLowerCase();
  const frag = document.createDocumentFragment();
  let shown = 0;

  for (const region of state.data.regions) {
    if (state.regionFilter.size && !state.regionFilter.has(region.id)) continue;

    const matches = state.data.checks.filter((check) => {
      if (check.region !== region.id) return false;
      if (state.hideUsed && owners.has(check.id)) return false;
      if (needle && !check.fullName.toLowerCase().includes(needle)) return false;
      return true;
    });
    if (!matches.length) continue;
    shown += matches.length;

    // A search should never hide its own results behind a collapsed header.
    const collapsed = !needle && state.collapsed.has(region.id);

    const block = document.createElement('div');
    block.className = 'region-block';

    const title = document.createElement('button');
    title.className = 'region-title';
    title.type = 'button';
    title.setAttribute('aria-expanded', String(!collapsed));

    const caret = document.createElement('span');
    caret.className = 'region-caret';
    caret.textContent = collapsed ? '▸' : '▾';
    title.appendChild(caret);

    const swatch = document.createElement('span');
    swatch.className = 'region-swatch';
    swatch.style.background = region.color;
    title.appendChild(swatch);
    title.appendChild(document.createTextNode(region.name + ' (' + matches.length + ')'));
    title.addEventListener('click', () => {
      if (state.collapsed.has(region.id)) state.collapsed.delete(region.id);
      else state.collapsed.add(region.id);
      render();
    });
    block.appendChild(title);

    if (collapsed) {
      frag.appendChild(block);
      continue;
    }

    const grid = document.createElement('div');
    grid.className = 'check-grid';

    for (const check of matches) {
      const owner = owners.get(check.id);

      const tile = document.createElement('button');
      tile.className = 'check';
      tile.type = 'button';
      tile.title = check.fullName + (owner ? ' — holds ' + owner.name : '');
      if (owner) tile.classList.add('is-used');

      const icon = document.createElement('img');
      icon.className = 'check-icon';
      icon.alt = '';
      icon.src = spriteUrl('icon:' + check.icon, state.data.iconSprites[check.icon]);
      tile.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'check-label';
      label.textContent = check.name;
      if (owner) {
        const holder = document.createElement('span');
        holder.className = 'check-holder';
        holder.textContent = owner.name;
        label.appendChild(holder);
      }
      tile.appendChild(label);

      tile.addEventListener('click', () => pickCheck(check));
      grid.appendChild(tile);
    }

    block.appendChild(grid);
    frag.appendChild(block);
  }

  if (!shown) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No checks match this filter.';
    frag.appendChild(empty);
  }

  el.checks.replaceChildren(frag);
  el.checks.scrollTop = scroll;
}

/**
 * Filtering to a region is a statement of interest, so that region opens.
 * Dropping the filter falls back to the default: the two overworlds open and
 * every dungeon folded. Regions still pinned by another chip stay open.
 */
function syncCollapsedToFilter() {
  state.collapsed = new Set(
    state.data.regions
      .map((region) => region.id)
      .filter((id) => !OPEN_BY_DEFAULT.has(id) && !state.regionFilter.has(id))
  );
}

function renderRegionFilters() {
  const frag = document.createDocumentFragment();

  for (const region of state.data.regions) {
    const chip = document.createElement('button');
    chip.className = 'region-chip';
    chip.type = 'button';
    chip.textContent = region.short + ' ' + region.count;
    chip.title = region.name;
    const active = state.regionFilter.has(region.id);
    chip.setAttribute('aria-pressed', String(active));
    if (active) {
      chip.style.background = region.color;
      chip.style.borderColor = region.color;
    }
    chip.addEventListener('click', () => {
      if (state.regionFilter.has(region.id)) state.regionFilter.delete(region.id);
      else state.regionFilter.add(region.id);
      syncCollapsedToFilter();
      renderRegionFilters();
      render();
    });
    frag.appendChild(chip);
  }

  const all = document.createElement('button');
  all.className = 'region-chip';
  all.type = 'button';
  all.textContent = 'All';
  all.setAttribute('aria-pressed', String(state.regionFilter.size === 0));
  all.addEventListener('click', () => {
    state.regionFilter.clear();
    syncCollapsedToFilter();
    renderRegionFilters();
    render();
  });
  frag.appendChild(all);

  el.regions.replaceChildren(frag);
}

/* ------------------------------------------------------------ assignment */

function toggleArm(itemId) {
  state.armed = state.armed === itemId ? null : itemId;
  syncAssignBar();
  render();
}

function disarm() {
  if (!state.armed) return;
  state.armed = null;
  syncAssignBar();
  render();
}

function syncAssignBar() {
  const item = state.armed && state.data.items.find((entry) => entry.id === state.armed);
  document.body.classList.toggle('is-assigning', Boolean(item));
  el.assignBar.hidden = !item;
  if (item) el.assignBarText.textContent = 'Click the check where ' + item.name + ' was found';
}

function pickCheck(check) {
  if (!state.armed) {
    showHint('Choose an item first, then click a check.');
    return;
  }
  send({
    type: 'assign',
    itemId: state.armed,
    checkId: check.id,
    by: el.playerName.value.trim(),
  });
  disarm();
}

function showHint(message) {
  el.hint.textContent = message;
  el.hint.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    el.hint.hidden = true;
  }, 4000);
}

/* ------------------------------------------------------------- transport */

function send(action) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showHint('Not connected — reconnecting…');
    return;
  }
  socket.send(JSON.stringify(action));
}

function setStatus(text, kind) {
  el.status.textContent = text;
  el.status.className = 'status status-' + kind;
}

function connect() {
  if (socket) {
    socket.onclose = null;
    socket.close();
  }

  setStatus('Connecting…', 'connecting');
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(scheme + '://' + location.host + '/ws?room=' + encodeURIComponent(roomId));

  socket.onopen = () => {
    reconnectDelay = 500;
    setStatus('Connected', 'open');
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'state') {
      state.room = message.room;
      if (document.activeElement !== el.roomName) el.roomName.value = message.room.name;
      setPlayers(message.players);
      render();
    } else if (message.type === 'players') {
      setPlayers(message.players);
    } else if (message.type === 'error') {
      showHint(message.message);
    }
  };

  socket.onclose = () => {
    setStatus('Reconnecting…', 'closed');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
  };
}

function setPlayers(count) {
  const n = count || 1;
  el.players.textContent = n + (n === 1 ? ' player' : ' players');
}

/* ------------------------------------------------------------------ init */

el.roomInput.value = roomId;
el.playerName.value = localStorage.getItem('alttp-player') || '';

el.roomInput.addEventListener('change', () => {
  setRoom(el.roomInput.value);
  el.roomInput.value = roomId;
});

el.playerName.addEventListener('change', () => {
  localStorage.setItem('alttp-player', el.playerName.value.trim());
});

el.roomName.addEventListener('change', () => {
  send({ type: 'rename', name: el.roomName.value });
});

el.search.addEventListener('input', () => {
  state.search = el.search.value;
  render();
});

el.hideUsed.addEventListener('change', () => {
  state.hideUsed = el.hideUsed.checked;
  render();
});

el.assignCancel.addEventListener('click', disarm);

el.copyLink.addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('room', roomId);
  try {
    await navigator.clipboard.writeText(url.toString());
    showHint('Invite link copied — anyone who opens it shares this tracker.');
  } catch {
    showHint('Share this link: ' + url.toString());
  }
});

el.reset.addEventListener('click', () => {
  if (confirm('Clear every recorded location in room "' + roomId + '"?')) {
    send({ type: 'reset' });
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') disarm();
});

fetch('/api/data')
  .then((response) => response.json())
  .then((data) => {
    state.data = data;
    state.checksById = new Map(data.checks.map((check) => [check.id, check]));
    state.itemsById = new Map(data.items.map((item) => [item.id, item]));
    // The two overworlds start open; the dungeons are folded away until needed.
    syncCollapsedToFilter();
    renderRegionFilters();
    render();
    connect();
  })
  .catch(() => setStatus('Failed to load game data', 'closed'));
