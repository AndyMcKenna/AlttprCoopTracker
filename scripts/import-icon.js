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

/** Cut a rectangle out of a decoded image. */
function cropImage(img, box) {
  const out = { width: box.width, height: box.height, data: new Uint8Array(box.width * box.height * 4) };
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const from = ((box.y + y) * img.width + (box.x + x)) * 4;
      const to = (y * box.width + x) * 4;
      out.data[to] = img.data[from];
      out.data[to + 1] = img.data[from + 1];
      out.data[to + 2] = img.data[from + 2];
      out.data[to + 3] = img.data[from + 3];
    }
  }
  return out;
}

/**
 * Sample the middle of the cell at (cx, cy) on a cols x rows grid. The middle
 * avoids the smeared edges a JPEG leaves at every colour boundary.
 */
function cellColour(img, cols, rows, cx, cy) {
  const x0 = Math.floor((cx * img.width) / cols);
  const x1 = Math.floor(((cx + 1) * img.width) / cols);
  const y0 = Math.floor((cy * img.height) / rows);
  const y1 = Math.floor(((cy + 1) * img.height) / rows);

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

/** Grid colours, row-major, for a cols x rows grid. */
function gridColours(img, cols, rows) {
  const colours = [];
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) colours.push(cellColour(img, cols, rows, cx, cy));
  }
  return colours;
}

/**
 * How wrong it would be to call this image a cols x rows grid: average
 * distance between each pixel and the flat colour of the cell it lands in.
 */
function gridError(img, cols, rows) {
  const colours = gridColours(img, cols, rows);

  let error = 0;
  let n = 0;
  // Every other pixel is plenty and keeps the search quick.
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const cx = Math.min(cols - 1, Math.floor((x * cols) / img.width));
      const cy = Math.min(rows - 1, Math.floor((y * rows) / img.height));
      const want = colours[cy * cols + cx];
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

/**
 * The smallest grid that explains the picture about as well as the best one.
 * Rows follow from columns so the recovered pixels stay square — a sprite
 * that is wider than it is tall comes back that shape, not squashed.
 */
function detectGrid(img, tolerance = 1.35) {
  const rowsFor = (cols) => Math.max(1, Math.round((cols * img.height) / img.width));

  let best = MIN_SIZE;
  let bestError = Infinity;
  const errors = new Map();

  for (let cols = MIN_SIZE; cols <= MAX_SIZE; cols += 1) {
    const error = gridError(img, cols, rowsFor(cols));
    errors.set(cols, error);
    if (error < bestError) {
      bestError = error;
      best = cols;
    }
  }

  // Prefer the smallest grid that is nearly as good, so a 16-wide sprite is
  // not reported as the 32-wide one that trivially also fits it.
  for (let cols = MIN_SIZE; cols <= best; cols += 1) {
    if (errors.get(cols) <= bestError * tolerance) return { cols, rows: rowsFor(cols) };
  }
  return { cols: best, rows: rowsFor(best) };
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
  const cropAt = args.indexOf('--crop');
  const passesAt = args.indexOf('--passes');
  const keepBackground = args.includes('--keep-bg');
  // One peel by default. More than one only helps when the art sits inside a
  // frame as well as on a backdrop, and it risks stripping the sprite's own
  // colours once those layers are gone, so it has to be asked for.
  const passes = passesAt === -1 ? 1 : Number(args[passesAt + 1]);

  let img = readImage(input);
  const from = img.width + 'x' + img.height;

  if (cropAt !== -1) {
    const [x, y, width, height] = args[cropAt + 1].split(',').map(Number);
    img = cropImage(img, { x, y, width, height });
  }

  let cols;
  let rows;
  if (forced === -1) {
    ({ cols, rows } = detectGrid(img));
  } else {
    cols = Number(args[forced + 1]);
    rows = Math.max(1, Math.round((cols * img.height) / img.width));
  }
  console.log(path.basename(input) + ': ' + from + ' -> ' + cols + 'x' + rows);

  const out = new PNG({ width: cols, height: rows });
  const grid = gridColours(img, cols, rows);

  const near = (a, b) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 40;

  // Clear the backdrop, then look again: art saved from a sprite site often
  // sits on a backdrop *and* inside a border, so there can be two layers to
  // peel. Only colour reachable from the edge goes, which leaves the sprite's
  // own outline alone even when it is the same colour as the border.
  const gone = new Uint8Array(grid.length);
  let cleared = 0;

  for (let pass = 0; pass < passes && !keepBackground; pass += 1) {
    // Whatever is currently on the outside: the image edge to start with, and
    // after a pass, whatever the cleared cells have exposed.
    const exposed = [];
    for (let i = 0; i < grid.length; i += 1) {
      if (gone[i]) continue;
      const x = i % cols;
      const y = (i - x) / cols;
      const edge =
        x === 0 ||
        y === 0 ||
        x === cols - 1 ||
        y === rows - 1 ||
        gone[i - 1] ||
        gone[i + 1] ||
        gone[i - cols] ||
        gone[i + cols];
      if (edge) exposed.push(i);
    }
    if (exposed.length === 0) break;

    // The backdrop is what the outermost surviving corners agree on. Corners
    // are used rather than the whole ring because sprite art often runs right
    // up to the edge, which would drown out the backdrop in a simple tally.
    const nearestTo = (cornerX, cornerY) =>
      exposed.reduce((best, i) => {
        const x = i % cols;
        const y = (i - x) / cols;
        const d = Math.abs(x - cornerX) + Math.abs(y - cornerY);
        return best === null || d < best.d ? { i, d } : best;
      }, null).i;

    const corners = [
      grid[nearestTo(0, 0)],
      grid[nearestTo(cols - 1, 0)],
      grid[nearestTo(0, rows - 1)],
      grid[nearestTo(cols - 1, rows - 1)],
    ];
    const backdrop = corners[0];
    if (corners.filter((c) => near(c, backdrop)).length < 3) break;

    // Cleared wholesale, not flood-filled: in this art the outline is the same
    // colour as the backdrop it sits on, and the sprite reads better without
    // it once the surrounding block is gone.
    const doomed = [];
    for (let i = 0; i < grid.length; i += 1) {
      if (!gone[i] && near(grid[i], backdrop)) doomed.push(i);
    }
    if (doomed.length === 0) break;

    // Once the backdrop and any frame are gone, the next colour out at the
    // corners is the sprite itself. Refuse a pass that would eat it: peeling
    // must leave most of the picture standing.
    const remaining = grid.length - cleared - doomed.length;
    if (remaining < grid.length * 0.25) break;

    for (const i of doomed) gone[i] = 1;
    cleared += doomed.length;
  }

  for (let i = 0; i < grid.length; i += 1) {
    const [r, g, b] = grid[i];
    const to = i * 4;
    if (gone[i]) {
      out.data[to] = 0;
      out.data[to + 1] = 0;
      out.data[to + 2] = 0;
      out.data[to + 3] = 0;
      continue;
    }
    out.data[to] = r;
    out.data[to + 1] = g;
    out.data[to + 2] = b;
    out.data[to + 3] = 255;
  }

  // Trim the transparent margin the backdrop leaves behind, so the sprite
  // fills its tile instead of floating in a box of nothing.
  let final = out;
  if (!args.includes('--no-trim')) {
    let minX = cols;
    let minY = rows;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (out.data[(y * cols + x) * 4 + 3] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX >= 0 && (minX > 0 || minY > 0 || maxX < cols - 1 || maxY < rows - 1)) {
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const trimmed = new PNG({ width, height });
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const from = ((minY + y) * cols + (minX + x)) * 4;
          const to = (y * width + x) * 4;
          trimmed.data[to] = out.data[from];
          trimmed.data[to + 1] = out.data[from + 1];
          trimmed.data[to + 2] = out.data[from + 2];
          trimmed.data[to + 3] = out.data[from + 3];
        }
      }
      final = trimmed;
      console.log('  trimmed to ' + width + 'x' + height);
    }
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, PNG.sync.write(final));
  console.log('wrote ' + output + (cleared ? ' (' + cleared + ' backdrop cells cleared)' : ''));
}

main();
