'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { ITEMS_BY_ID } = require('./items');
const { CHECKS_BY_ID } = require('./checks');

const DATA_DIR = process.env.TRACKER_DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');

/**
 * All tracker rooms, kept in memory and mirrored to a JSON file so a restart
 * does not lose a co-op session. The whole dataset is a few hundred KB at
 * worst, so a debounced full rewrite is plenty.
 */
class Store {
  constructor() {
    this.rooms = new Map();
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (const room of parsed.rooms || []) this.rooms.set(room.id, room);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Could not read ' + DATA_FILE + ', starting empty:', err.message);
      }
    }
  }

  save() {
    // Debounce: a burst of clicks should not mean a burst of disk writes.
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 250);
    if (this.saveTimer.unref) this.saveTimer.unref();
  }

  saveNow() {
    const payload = JSON.stringify({ rooms: [...this.rooms.values()] }, null, 2);
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, payload);
      fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.error('Failed to persist rooms:', err.message);
    }
  }

  /** Rooms are addressed by a human-typeable code, created on first visit. */
  getOrCreate(id) {
    const roomId = normalizeRoomId(id);
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        name: 'Co-op Tracker',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        assignments: {},
      };
      this.rooms.set(roomId, room);
      this.save();
    }
    return room;
  }

  /**
   * Apply a client action. Returns the updated room, or throws on anything
   * the client should not have been able to send.
   */
  apply(roomId, action) {
    const room = this.getOrCreate(roomId);

    switch (action.type) {
      case 'assign': {
        const item = ITEMS_BY_ID.get(action.itemId);
        const check = CHECKS_BY_ID.get(action.checkId);
        if (!item) throw new Error('Unknown item: ' + action.itemId);
        if (!check) throw new Error('Unknown check: ' + action.checkId);

        // A check holds one item, so refuse to overwrite someone else's note.
        // Clearing the old entry first is a deliberate act, not a side effect.
        const holder = findHolder(room, check.id);
        if (holder) {
          throw new Error(
            check.fullName + ' is already recorded as ' + ITEMS_BY_ID.get(holder).name
          );
        }

        const list = room.assignments[item.id] || (room.assignments[item.id] = []);
        if (list.length >= item.slots) {
          // Single-slot items just move to the new location rather than
          // making the player clear the old one first.
          if (item.slots === 1) list.length = 0;
          else throw new Error(item.name + ' already has ' + item.slots + ' locations');
        }
        list.push({
          id: crypto.randomUUID(),
          checkId: check.id,
          by: sanitizeName(action.by),
          at: Date.now(),
        });
        break;
      }

      case 'unassign': {
        const list = room.assignments[action.itemId];
        if (!list) break;
        const next = list.filter((entry) => entry.id !== action.assignmentId);
        if (next.length) room.assignments[action.itemId] = next;
        else delete room.assignments[action.itemId];
        break;
      }

      case 'rename': {
        room.name = sanitizeName(action.name) || 'Co-op Tracker';
        break;
      }

      case 'reset': {
        room.assignments = {};
        break;
      }

      default:
        throw new Error('Unknown action: ' + action.type);
    }

    room.updatedAt = Date.now();
    this.save();
    return room;
  }
}

/** Which item, if any, is already recorded at this check. */
function findHolder(room, checkId) {
  for (const [itemId, list] of Object.entries(room.assignments)) {
    if (list.some((entry) => entry.checkId === checkId)) return itemId;
  }
  return null;
}

function normalizeRoomId(id) {
  const clean = String(id || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32);
  return clean || 'lobby';
}

function sanitizeName(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

module.exports = { Store, normalizeRoomId, DATA_FILE };
