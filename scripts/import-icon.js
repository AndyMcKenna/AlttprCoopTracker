'use strict';

/**
 * Turn a blown-up picture of a sprite back into the sprite.
 *
 *   node scripts/import-icon.js <input.png|jpg> <output.png> [--size N] [--keep-bg]
 *
 * Art saved from a wiki or a sprite site is usually the original handful of
 * pixels scaled up hundreds of times, sometimes through a lossy JPEG. This
 * works out how big those blocks are, takes one colour per block, and writes
 * the small image back out — so a 360x360 picture of a 16x16 chest becomes a
 * 16x16 chest again, crisp rather than smudged.
 *
 * The flat colour around the edge is treated as backdrop and made transparent
 * unless --keep-bg is passed.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const MIN_SIZE = 6;
const MAX_SIZE = 48;

function readImage(file) {
  const buffer = fs.readFileSync(file);
  if (/\.jpe?g$/i.test(file)) {
    const raw = jpeg.decode(buffer, { useTArray: true });
    return { width: raw.width, height: raw.height, data: raw.data };
  }
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

const at = (img, x, y) => (y * img.width + x) * 4;

/**
 * Sample the middle of the cell at (cx, cy) on a `size`-square grid. The
 * middle avoids the smeared edges a JPEG leaves at every colour boundary.
 */
function cellColour(img, size, cx, cy) {
  const x0 = Math.floor((cx * img.width) / size);
  const x1 = Math.floor(((cx + 1) * img.width) / size);
  const y0 = Math.floor((cy * img.height) / size);
  const y1 = Math.floor(((cy + 1) * img.height) / size);

  const insetX = Math.max(1, Math.floor((x1 - x0) / 4));
  const insetY = Math.max(1, Math.floor((y1 - y0) / 4));

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0 + insetY; y < y1 - insetY; y += 1) {
    for (let x = x0 + insetX; x < x1 - insetX; x += 1) {
      const i = at(img, x, y);
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
      n += 1;
    }
  }
  if (n === 0) {
    const i = at(img, Math.min(x0, img.width - 1), Math.min(y0, img.height - 1));
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/**
 * How wrong it would be to call this image a `size`-square grid: average
 * distance between each pixel and the flat colour of the cell it lands in.
 */
function gridError(img, size) {
  const colours = [];
  for (let cy = 0; cy < size; cy += 1) {
    for (let cx = 0; cx < size; cx += 1) colours.push(cellColour(img, size, cx, cy));
  }

  let error = 0;
  let n = 0;
  // Every fourth pixel is plenty and keeps the search quick.
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const cx = Math.min(size - 1, Math.floor((x * size) / img.width));
      const cy = Math.min(size - 1, Math.floor((y * size) / img.height));
      const want = colours[cy * size + cx];
      const i = at(img, x, y);
      error +=
        Math.abs(img.data[i] - want[0]) +
        Math.abs(img.data[i + 1] - want[1]) +
        Math.abs(img.data[i + 2] - want[2]);
      n += 3;
    }
  }
  return error / n;
}

/** The smallest grid that explains the picture about as well as the best one. */
function detectSize(img, tolerance = 1.35) {
  let best = MIN_SIZE;
  let bestError = Infinity;
  const errors = new Map();

  for (let size = MIN_SIZE; size <= MAX_SIZE; size += 1) {
    const error = gridError(img, size);
    errors.set(size, error);
    if (error < bestError) {
      bestError = error;
      best = size;
    }
  }

  // Prefer the smallest size that is nearly as good, so a 16x16 sprite is not
  // reported as the 32x32 that trivially also fits it.
  for (let size = MIN_SIZE; size <= best; size += 1) {
    if (errors.get(size) <= bestError * tolerance) return { size, error: errors.get(size), bestError };
  }
  return { size: best, error: bestError, bestError };
}

function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const [input, output] = positional;
  if (!input || !output) {
    console.error('usage: node scripts/import-icon.js <input> <output.png> [--size N] [--keep-bg]');
    process.exit(1);
  }

  const forced = args.indexOf('--size');
  const keepBackground = args.includes('--keep-bg');

  const img = readImage(input);
  const size = forced === -1 ? detectSize(img).size : Number(args[forced + 1]);
  console.log(path.basename(input) + ': ' + img.width + 'x' + img.height + ' -> ' + size + 'x' + size);

  const out = new PNG({ width: size, height: size });
  const grid = [];
  for (let cy = 0; cy < size; cy += 1) {
    for (let cx = 0; cx < size; cx += 1) grid.push(cellColour(img, size, cx, cy));
  }

  // The backdrop is whatever colour the corners agree on.
  const corners = [grid[0], grid[size - 1], grid[size * (size - 1)], grid[size * size - 1]];
  const near = (a, b) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 40;
  const backdrop = corners.filter((c) => near(c, corners[0])).length >= 3 ? corners[0] : null;

  let cleared = 0;
  for (let i = 0; i < grid.length; i += 1) {
    const [r, g, b] = grid[i];
    const to = i * 4;
    if (!keepBackground && backdrop && near(grid[i], backdrop)) {
      out.data[to] = 0;
      out.data[to + 1] = 0;
      out.data[to + 2] = 0;
      out.data[to + 3] = 0;
      cleared += 1;
      continue;
    }
    out.data[to] = r;
    out.data[to + 1] = g;
    out.data[to + 2] = b;
    out.data[to + 3] = 255;
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, PNG.sync.write(out));
  console.log('wrote ' + output + (cleared ? ' (' + cleared + ' backdrop cells cleared)' : ''));
}

main();
