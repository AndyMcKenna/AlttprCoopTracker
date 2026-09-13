'use strict';

/**
 * Co-op tracker client.
 *
 * Flow: click an item tile and then the check it was found at — or the check
 * first and then the item; either order makes the same pairing.
 * The pairing goes to the server, which broadcasts the whole room state back
 * to everyone connected to the same room code.
 */

const el = {
  status: document.getElementById('status'),
  players: document.getElementById('players'),
  roomInput: document.getElementById('room-input'),
  copyLink: document.getElementById('copy-link'),
  reset: document.getElementById('reset'),
  hint: document.getElementById('hint'),
  items: document.getElementById('items'),
  itemsSummary: document.getElementById('items-summary'),
  tabItems: document.getElementById('tab-items'),
  tabKeys: document.getElementById('tab-keys'),
  checks: document.getElementById('checks'),
  checksSummary: document.getElementById('checks-summary'),
  regions: document.getElementById('regions'),
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
  armedCheck: null, // check id waiting for an item click
  regionFilter: new Set(), // empty means "all regions"
  collapsed: new Set(), // region ids folded shut; filled in once data arrives
  tab: 'items', // which half of the item board is showing: items or keys
  spriteImages: new Set(), // sprite names that have a real image on disk
  checkImages: new Set(), // check glyphs that have a real image on disk
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

// The real sprites all live in one sheet (sprites/sheet.png) and sheet.css
// knows where each one sits, so a tile is an empty element with two classes:
// one for the sheet and one for the sprite. One image fetch draws the board.
function sheetSprite(kind, name) {
  const sprite = document.createElement('span');
  sprite.className = 'sprite sprite--' + kind + '-' + name;
  return sprite;
}

// The drawn pixel art has no sheet; it is still an <img> of its SVG.
function drawnSprite(url) {
  const sprite = document.createElement('img');
  sprite.alt = '';
  sprite.src = url;
  return sprite;
}

// What clicking the tile will do, for its tooltip and for screen readers.
function tileLabel(item, count, full) {
  if (state.armedCheck) {
    const check = state.checksById.get(state.armedCheck);
    return 'Record ' + item.name + ' at ' + (check ? check.fullName : state.armedCheck);
  }
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

  // The summary follows the tab. Items count tiles with at least one
  // location; keys count individual keys, since a dungeon's 6 small keys
  // share one box and each is worth finding.
  const shown = state.data.items.filter((item) => item.panel === state.tab);
  const found =
    state.tab === 'keys'
      ? shown.reduce((sum, item) => sum + assignmentsFor(item.id).length, 0)
      : shown.filter((item) => assignmentsFor(item.id).length).length;
  const total = state.tab === 'keys' ? shown.reduce((sum, item) => sum + item.slots, 0) : shown.length;
  el.itemsSummary.textContent = found + ' of ' + total + ' located';
  const dead = state.room ? state.room.dead.length : 0;
  el.checksSummary.textContent =
    owners.size + ' of ' + state.data.checks.length + ' recorded' + (dead ? ', ' + dead + ' dead' : '');
}

/**
 * One item tile: sprite, name, and the list of locations recorded against
 * it. The whole tile is the button that arms it — a player mid-run should
 * not have to aim at a corner. It cannot literally be a <button>, since the
 * location rows carry their own clear buttons and a button may not contain
 * another, so it takes the role and the keyboard handling instead.
 * Shared by the item board and the key panel.
 */
function buildItemTile(item) {
  const entries = assignmentsFor(item.id);
  const full = entries.length >= item.slots;

  const tile = document.createElement('div');
  tile.className = 'item';
  tile.dataset.item = item.id;
  tile.setAttribute('role', 'button');
  tile.tabIndex = 0;
  if (state.armed === item.id) tile.classList.add('is-armed');
  tile.classList.add(entries.length ? 'is-found' : 'is-empty');
  const tileText = tileLabel(item, entries.length, full);
  tile.title = tileText;
  tile.setAttribute('aria-label', tileText);
  tile.setAttribute('aria-pressed', String(state.armed === item.id));
  tile.addEventListener('click', () => toggleArm(item.id));
  tile.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleArm(item.id);
    }
  });

  // A real image wins over the drawn pixel art when one exists for this sprite.
  const sprite = state.spriteImages.has(item.sprite)
    ? sheetSprite('items', item.sprite)
    : drawnSprite(spriteUrl('item:' + item.sprite, state.data.itemSprites[item.sprite]));
  sprite.classList.add('item-sprite');
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

  if (entries.length) {
    const list = document.createElement('ul');
    list.className = 'item-locations';

    for (const entry of entries) {
      const check = state.checksById.get(entry.checkId);
      const row = document.createElement('li');
      row.className = 'item-location';
      row.title = 'Recorded at ' + new Date(entry.at).toLocaleTimeString();

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
      // The tile around it arms the item; clearing a row must not also do that.
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        send({ type: 'unassign', assignmentId: entry.id });
      });
      row.appendChild(remove);

      list.appendChild(row);
    }

    body.appendChild(list);
  }

  tile.appendChild(body);
  return tile;
}

/**
 * The Keys tab: one row per dungeon, big key first, then the single
 * small-key box.
 */
function buildKeysBoard() {
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

  return grid;
}

/**
 * The item board is two tabs, Items and Keys, so that neither has to be
 * scrolled past to reach the other: forty key tiles under the items made
 * for a long panel. An armed item or check survives a tab switch, so a key
 * can be paired with a check on either tab.
 */
function renderItems(owners) {
  el.tabItems.setAttribute('aria-selected', String(state.tab === 'items'));
  el.tabKeys.setAttribute('aria-selected', String(state.tab === 'keys'));
  el.items.setAttribute('aria-labelledby', state.tab === 'keys' ? 'tab-keys' : 'tab-items');

  if (state.tab === 'keys') {
    el.items.replaceChildren(buildKeysBoard());
    return;
  }

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

  el.items.replaceChildren(frag);
}

/**
 * One check tile. The tile is the button that pairs it with an item; the
 * small "nothing here" button at its edge marks it dead — looked at, found
 * to hold nothing, so it can be dimmed and taken off the table. Two buttons
 * cannot nest, so the tile is a div around the pair.
 */
function buildCheckTile(check, owner, dead) {
  const tile = document.createElement('div');
  tile.className = 'check';
  // The id is what the browser tests address a tile by; names are not unique.
  tile.dataset.check = check.id;
  if (owner) tile.classList.add('is-used');
  if (dead) tile.classList.add('is-dead');
  const armed = state.armedCheck === check.id;
  if (armed) tile.classList.add('is-armed');

  const main = document.createElement('button');
  main.className = 'check-main';
  main.type = 'button';
  main.title = armed
    ? 'Click the item found at ' + check.fullName + ' (Esc to cancel)'
    : dead
      ? check.fullName + ' — nothing here (click to bring it back)'
      : check.fullName + (owner ? ' — holds ' + owner.name : '');
  main.setAttribute('aria-pressed', String(armed));

  // A real image for this glyph wins; failing that, the real chest, so a
  // glyph with no art of its own still looks like the rest of the board
  // rather than falling back to the drawn pixel art. Drop in a PNG named
  // after the glyph, rebuild the sheet, and those tiles pick it up.
  const icon = state.checkImages.has(check.icon)
    ? sheetSprite('checks', check.icon)
    : state.checkImages.has('chest')
      ? sheetSprite('checks', 'chest')
      : drawnSprite(spriteUrl('icon:' + check.icon, state.data.iconSprites[check.icon]));
  icon.classList.add('check-icon');
  main.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'check-label';
  label.textContent = check.name;
  if (owner || dead) {
    const holder = document.createElement('span');
    holder.className = 'check-holder';
    holder.textContent = owner ? owner.name : 'nothing';
    label.appendChild(holder);
  }
  main.appendChild(label);
  main.addEventListener('click', () => pickCheck(check, owner, dead));
  tile.appendChild(main);

  // A check with an item in it is not nothing; the service would refuse the
  // mark, so the button is not offered.
  if (!owner) {
    const toggle = document.createElement('button');
    toggle.className = 'check-dead';
    toggle.type = 'button';
    toggle.textContent = '∅';
    toggle.title = dead ? 'Bring ' + check.name + ' back' : 'Nothing at ' + check.name;
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-pressed', String(dead));
    toggle.addEventListener('click', () => setDead(check, !dead));
    tile.appendChild(toggle);
  }

  return tile;
}

function renderChecks(owners) {
  const scroll = el.checks.scrollTop;
  const dead = new Set((state.room && state.room.dead) || []);
  const frag = document.createDocumentFragment();
  let shown = 0;

  for (const region of state.data.regions) {
    if (state.regionFilter.size && !state.regionFilter.has(region.id)) continue;

    const matches = state.data.checks.filter((check) => {
      if (check.region !== region.id) return false;
      if (state.hideUsed && (owners.has(check.id) || dead.has(check.id))) return false;
      return true;
    });
    if (!matches.length) continue;
    shown += matches.length;

    const collapsed = state.collapsed.has(region.id);

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
      grid.appendChild(buildCheckTile(check, owners.get(check.id), dead.has(check.id)));
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

/**
 * A pairing is one item and one check, clicked in either order. Whichever is
 * clicked first is "armed" and waits; the second click completes the pair.
 * Clicking the armed thing again puts it down, and clicking a different
 * thing of the same kind swaps it in.
 */
function toggleArm(itemId) {
  if (state.armedCheck) {
    send({ type: 'assign', itemId, checkId: state.armedCheck });
    disarm();
    return;
  }
  state.armed = state.armed === itemId ? null : itemId;
  syncAssignBar();
  render();
}

function pickCheck(check, owner, dead) {
  if (state.armed) {
    // Recording an item at a dead check brings it back; the service does that.
    send({ type: 'assign', itemId: state.armed, checkId: check.id });
    disarm();
    return;
  }
  // A dead check's click is "that was a mistake": it comes back, rather than
  // arming, since there is nothing to record at a check that holds nothing.
  if (dead) {
    setDead(check, false);
    return;
  }
  // A check holds one item, so arming a taken one could only end in the
  // service refusing it. Say so now, and say what to do instead.
  if (owner) {
    showHint(check.fullName + ' already holds ' + owner.name + ' — clear it from ' + owner.name + ' first.');
    return;
  }
  state.armedCheck = state.armedCheck === check.id ? null : check.id;
  syncAssignBar();
  render();
}

function setDead(check, dead) {
  // A check waiting for its item and then declared empty is no longer waiting.
  if (state.armedCheck === check.id) disarm();
  send({ type: 'dead', checkId: check.id, dead });
}

function disarm() {
  if (!state.armed && !state.armedCheck) return;
  state.armed = null;
  state.armedCheck = null;
  syncAssignBar();
  render();
}

function syncAssignBar() {
  const item = state.armed && state.itemsById.get(state.armed);
  const check = state.armedCheck && state.checksById.get(state.armedCheck);
  // Each class lights up the tiles that would complete the pair on hover.
  document.body.classList.toggle('is-assigning', Boolean(item));
  document.body.classList.toggle('is-picking-item', Boolean(check));
  el.assignBar.hidden = !item && !check;
  if (item) el.assignBarText.textContent = 'Click the check where ' + item.name + ' was found';
  if (check) el.assignBarText.textContent = 'Click the item found at ' + check.fullName;
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

/** The API serves this page, so its routes are relative. */
function roomUrl(suffix) {
  return 'api/rooms/' + encodeURIComponent(roomId) + (suffix || '');
}

/**
 * Every change goes to the service as a request; the service then pushes the
 * new state down the websocket to everyone in the room, this client included.
 * The response is applied directly too, so the board does not sit still
 * waiting for the round trip.
 */
async function send(action) {
  const json = { headers: { 'content-type': 'application/json' } };
  let request;

  if (action.type === 'assign') {
    request = fetch(roomUrl('/assignments'), {
      method: 'POST',
      ...json,
      body: JSON.stringify({ itemId: action.itemId, checkId: action.checkId }),
    });
  } else if (action.type === 'unassign') {
    request = fetch(roomUrl('/assignments/' + action.assignmentId), { method: 'DELETE' });
  } else if (action.type === 'dead') {
    request = fetch(roomUrl('/dead'), {
      method: 'PUT',
      ...json,
      body: JSON.stringify({ checkId: action.checkId, dead: action.dead }),
    });
  } else if (action.type === 'reset') {
    request = fetch(roomUrl('/reset'), { method: 'POST' });
  } else {
    return;
  }

  let response;
  try {
    response = await request;
  } catch {
    setStatus('Service unreachable', 'closed');
    showHint('Could not reach the tracker service.');
    return;
  }

  if (response.status >= 500) {
    // The service is down or mid-deploy: an HTML 503 page, not a rule. The
    // click is lost, the board is not — the socket re-syncs when it returns.
    setStatus('Service restarting', 'closed');
    showHint('The tracker service is restarting — try that again in a moment.');
    return;
  }

  if (!response.ok) {
    // A refused change is the sender's problem only — someone else may have
    // taken that check first. Everyone keeps the state the service has.
    const body = await response.json().catch(() => null);
    showHint(
      (body && body.error) ||
        (response.status === 429
          ? 'Too many changes at once — wait a moment and try again.'
          : 'That change was refused.')
    );
    return;
  }

  applyRoom(await response.json());
}

/**
 * States arrive from two directions — the response to this client's own
 * request and the broadcast to the room — and several players' changes can be
 * in flight at once, so they do not always arrive in the order they were made.
 * One older than the board already shows is stale, and is dropped.
 */
function applyRoom(room) {
  if (state.room && state.room.id === room.id && room.updatedAt < state.room.updatedAt) return;
  state.room = room;
  render();
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
      applyRoom(message.room);
      setPlayers(message.players);
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

el.roomInput.addEventListener('change', () => {
  setRoom(el.roomInput.value);
  el.roomInput.value = roomId;
});

for (const [tab, button] of [['items', el.tabItems], ['keys', el.tabKeys]]) {
  button.addEventListener('click', () => {
    if (state.tab === tab) return;
    state.tab = tab;
    render();
  });
}

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

fetch('api/gamedata')
  .then((response) => response.json())
  .then((data) => {
    state.data = data;
    state.checksById = new Map(data.checks.map((check) => [check.id, check]));
    state.itemsById = new Map(data.items.map((item) => [item.id, item]));
    state.spriteImages = new Set(data.spriteImages || []);
    state.checkImages = new Set(data.checkImages || []);
    // The two overworlds start open; the dungeons are folded away until needed.
    syncCollapsedToFilter();
    renderRegionFilters();
    render();
    connect();
  })
  .catch(() => setStatus('Failed to load game data', 'closed'));
