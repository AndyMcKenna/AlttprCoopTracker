'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const { ITEMS, GROUPS, KEY_PANEL } = require('./items');
const { REGIONS, CHECKS } = require('./checks');
const { PALETTE, ITEM_SPRITES, ICON_SPRITES, kindForCheck } = require('./sprites');
const { Store, normalizeRoomId } = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const store = new Store();
const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Real sprite images, if any have been dropped in. A file named after an
// item's `sprite` (public/sprites/items/lamp.png) is used in place of the
// drawn pixel art; anything missing falls back to the built-in grid, so the
// tracker still works from a clean checkout with no images at all.
const SPRITE_DIR = path.join(__dirname, '..', 'public', 'sprites');

function availableIcons(kind) {
  const dir = path.join(SPRITE_DIR, kind);
  try {
    return fs
      .readdirSync(dir)
      .filter((file) => file.toLowerCase().endsWith('.png'))
      .map((file) => file.replace(/\.png$/i, ''));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not read ' + dir + ':', err.message);
    return [];
  }
}

// Static game data. Sent once on load so the client can render sprites and
// the check list without shipping a second copy of the tables.
const STATIC_DATA = {
  items: ITEMS,
  groups: GROUPS,
  keyPanel: KEY_PANEL,
  regions: REGIONS.map((region) => ({
    id: region.id,
    name: region.name,
    short: region.short,
    color: region.color,
    count: region.checks.length,
  })),
  checks: CHECKS.map((check) => ({ ...check, icon: kindForCheck(check) })),
  palette: PALETTE,
  itemSprites: ITEM_SPRITES,
  spriteImages: availableIcons('items'),
  checkImages: availableIcons('checks'),
  iconSprites: ICON_SPRITES,
};

app.get('/api/data', (req, res) => res.json(STATIC_DATA));

app.get('/api/room/:id', (req, res) => {
  res.json(store.getOrCreate(req.params.id));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// roomId -> Set of sockets currently viewing that room.
const roomClients = new Map();

function clientsFor(roomId) {
  let set = roomClients.get(roomId);
  if (!set) roomClients.set(roomId, (set = new Set()));
  return set;
}

function broadcast(roomId, message) {
  const payload = JSON.stringify(message);
  for (const socket of clientsFor(roomId)) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function broadcastRoom(roomId) {
  broadcast(roomId, {
    type: 'state',
    room: store.getOrCreate(roomId),
    players: clientsFor(roomId).size,
  });
}

wss.on('connection', (socket, request) => {
  const url = new URL(request.url, 'http://localhost');
  const roomId = normalizeRoomId(url.searchParams.get('room'));
  socket.roomId = roomId;
  socket.isAlive = true;
  clientsFor(roomId).add(socket);

  broadcastRoom(roomId);

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let action;
    try {
      action = JSON.parse(raw);
    } catch {
      return;
    }

    try {
      store.apply(roomId, action);
      broadcastRoom(roomId);
    } catch (err) {
      // Rejected actions are the sender's problem only (e.g. two players
      // assigning the same item at once); everyone else keeps their state.
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    }
  });

  socket.on('close', () => {
    clientsFor(roomId).delete(socket);
    broadcast(roomId, { type: 'players', players: clientsFor(roomId).size });
  });
});

// Drop sockets that stopped answering so the player count stays honest.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);
heartbeat.unref();

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => {
  console.log('ALTTP co-op tracker listening on http://localhost:' + PORT);
});

function shutdown() {
  store.saveNow();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server };
