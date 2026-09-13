'use strict';

/**
 * Slice the sprite-sheet rips in source/raw_sprites into one PNG per sprite.
 *
 *   node scripts/slice-sprites.js [--out <dir>] [--gap <px>] [--min <px>]
 *
 * The sheets are rips on a flat background (magenta, usually) with sprites
 * scattered around, so the approach is:
 *
 *   1. take the most common colour in the sheet as the background,
 *   2. mark every pixel that is not that colour,
 *   3. grow those marks by a few pixels so the parts of one sprite join up,
 *   4. take each connected blob as a sprite and crop it from the original,
 *   5. write it out with the background turned transparent.
 *
 * Step 3 is the knob that matters: too small and a sprite comes out in
 * pieces, too large and neighbouring frames merge. --gap sets it.
 *
 * The sheets also carry palette strips, captions and rip credits, and those
 * come out as "sprites" too — there is no reliable way to tell a caption from
 * a sprite by shape alone, so they are left in for a human to discard.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SOURCE_DIR = path.join(__dirname, '..', 'raw_sprites');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const at = args.indexOf('--' + name);
  return at === -1 ? fallback : args[at + 1];
}

const OUT_DIR = path.resolve(arg('out', path.join(SOURCE_DIR, 'sliced')));
const GAP = Number(arg('gap', 2)); // how far apart two blobs must be to stay apart
const MIN_SIDE = Number(arg('min', 6)); // drop anything thinner than this
const MIN_INK = Number(arg('minink', 30)); // ...or with fewer pixels than this

// Whole-world maps, not sprite sheets: blob detection has nothing to find in
// a continuous map, so slicing them would only produce noise.
const MAX_PIXELS = 4_000_000;

function slug(name) {
  return name
    .replace(/\.png$/i, '')
    .replace(/^SNES - The Legend of Zelda_ A Link to the Past - /i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The sheet background: whichever colour covers the most pixels. */
function backgroundColour(png) {
  const counts = new Map();
  const { data, width, height } = png;
  for (let i = 0; i < width * height; i += 1) {
    const at = i * 4;
    // already transparent

    if (data[at + 3] === 0) {
      continue;
    }
    const key = (data[at] << 16) | (data[at + 1] << 8) | data[at + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let best = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return { r: (best >> 16) & 255, g: (best >> 8) & 255, b: best & 255, count: bestCount };
}

/** Grow a boolean mask by `radius`, as two 1-D passes. */
function dilate(mask, width, height, radius) {
  if (radius <= 0) {
    return mask;
  }

  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!mask[row + x]) {
        continue;
      }
      const from = Math.max(0, x - radius);
      const to = Math.min(width - 1, x + radius);
      for (let k = from; k <= to; k += 1) {
        horizontal[row + k] = 1;
      }
    }
  }

  const grown = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!horizontal[row + x]) {
        continue;
      }
      const from = Math.max(0, y - radius);
      const to = Math.min(height - 1, y + radius);
      for (let k = from; k <= to; k += 1) {
        grown[k * width + x] = 1;
      }
    }
  }
  return grown;
}

/**
 * Label 8-connected blobs in `grown`, but measure each blob's bounds from
 * `ink` so the padding added by dilation does not inflate the crop.
 */
function findBlobs(grown, ink, width, height) {
  const seen = new Uint8Array(grown.length);
  const queue = new Int32Array(grown.length);
  const blobs = [];

  for (let start = 0; start < grown.length; start += 1) {
    if (!grown[start] || seen[start]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let inkCount = 0;

    while (head < tail) {
      const at = queue[head++];
      const x = at % width;
      const y = (at - x) / width;

      if (ink[at]) {
        inkCount += 1;
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
      }

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) {
            continue;
          }
          const next = ny * width + nx;
          if (grown[next] && !seen[next]) {
            seen[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }

    if (inkCount === 0) {
      continue;
    }
    blobs.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      pixels: inkCount,
    });
  }

  return blobs;
}

/** Crop one blob out of the sheet, background knocked out to transparent. */
function crop(png, box, bg) {
  const out = new PNG({ width: box.width, height: box.height });
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const from = ((box.y + y) * png.width + (box.x + x)) * 4;
      const to = (y * box.width + x) * 4;
      const isBackground =
        png.data[from] === bg.r && png.data[from + 1] === bg.g && png.data[from + 2] === bg.b;

      if (isBackground || png.data[from + 3] === 0) {
        out.data[to] = 0;
        out.data[to + 1] = 0;
        out.data[to + 2] = 0;
        out.data[to + 3] = 0;
      } else {
        out.data[to] = png.data[from];
        out.data[to + 1] = png.data[from + 1];
        out.data[to + 2] = png.data[from + 2];
        out.data[to + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * The colour filling most of a crop's outer ring, if there is one. Inventory
 * icons are drawn on a solid box whose colour is not the sheet background, so
 * that box shows up as a ring of one colour around the sprite.
 */
function dominantBorderColour(png) {
  const { data, width, height } = png;
  const counts = new Map();

  const look = (x, y) => {
    const at = (y * width + x) * 4;
    if (data[at + 3] === 0) {
      return;
    }
    const key = (data[at] << 16) | (data[at + 1] << 8) | data[at + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  };

  for (let x = 0; x < width; x += 1) {
    look(x, 0);
    look(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    look(0, y);
    look(width - 1, y);
  }

  let best = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (best === null) {
    return null;
  }

  // Measured against the whole ring, not just its opaque pixels: a box fills
  // its ring completely, while a sprite or a caption only touches it here and
  // there — counting opaque pixels alone would read a caption's letters as a
  // "background" and eat every stroke joined to the edge.
  const ring = 2 * width + 2 * height - 4;
  if (bestCount / ring < 0.7) {
    return null;
  }
  return { r: (best >> 16) & 255, g: (best >> 8) & 255, b: best & 255 };
}

/**
 * Clear `colour` where it is reachable from the crop's edge, so the box
 * around an icon goes but the same colour inside the artwork stays.
 * Returns how many pixels were cleared.
 */
function clearBoxColour(png, colour) {
  const { data, width, height } = png;
  const total = width * height;
  const fill = new Uint8Array(total);
  const queue = new Int32Array(total);
  let tail = 0;

  const matches = (at) =>
    data[at * 4 + 3] !== 0 &&
    data[at * 4] === colour.r &&
    data[at * 4 + 1] === colour.g &&
    data[at * 4 + 2] === colour.b;

  const push = (at) => {
    if (fill[at] || !matches(at)) {
      return;
    }
    fill[at] = 1;
    queue[tail++] = at;
  };

  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }

  for (let head = 0; head < tail; head += 1) {
    const at = queue[head];
    const x = at % width;
    const y = (at - x) / width;
    if (x > 0) {
      push(at - 1);
    }
    if (x < width - 1) {
      push(at + 1);
    }
    if (y > 0) {
      push(at - width);
    }
    if (y < height - 1) {
      push(at + width);
    }
  }

  let opaque = 0;
  for (let i = 0; i < total; i += 1) {
    if (data[i * 4 + 3] !== 0) {
      opaque += 1;
    }
  }
  // If the "box" is nearly the whole image this was a solid swatch, not an
  // icon on a background; clearing it would leave nothing meaningful.
  if (tail === 0 || tail > opaque * 0.95) {
    return 0;
  }

  for (let i = 0; i < total; i += 1) {
    if (fill[i]) {
      data[i * 4 + 3] = 0;
    }
  }
  return tail;
}

/** Tight bounds of the opaque pixels, or null if nothing is left. */
function opaqueBounds(png) {
  const { data, width, height } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) {
        continue;
      }
      if (x < minX) {
        minX = x;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return null;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Copy a sub-rectangle of an RGBA PNG. */
function subImage(png, box) {
  const out = new PNG({ width: box.width, height: box.height });
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const from = ((box.y + y) * png.width + (box.x + x)) * 4;
      const to = (y * box.width + x) * 4;
      out.data[to] = png.data[from];
      out.data[to + 1] = png.data[from + 1];
      out.data[to + 2] = png.data[from + 2];
      out.data[to + 3] = png.data[from + 3];
    }
  }
  return out;
}

/**
 * Peel the box an icon sits on: clear the dominant edge colour, then look
 * again in case the box had an outline in a second colour, and re-crop to
 * whatever artwork is left.
 */
function stripIconBox(png) {
  let cleared = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    const colour = dominantBorderColour(png);
    if (!colour) {
      break;
    }
    const removed = clearBoxColour(png, colour);
    if (removed === 0) {
      break;
    }
    cleared += removed;
  }

  const bounds = opaqueBounds(png);
  if (!bounds) {
    return null;
  }
  const tightened = bounds.width !== png.width || bounds.height !== png.height;
  return { png: tightened ? subImage(png, bounds) : png, offset: bounds, cleared };
}

function sliceSheet(file) {
  const name = path.basename(file);
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width, height } = png;

  if (width * height > MAX_PIXELS) {
    return { name, skipped: 'looks like a world map (' + width + 'x' + height + '), not a sheet' };
  }

  const bg = backgroundColour(png);
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i += 1) {
    const at = i * 4;
    if (png.data[at + 3] === 0) {
      continue;
    }
    if (png.data[at] === bg.r && png.data[at + 1] === bg.g && png.data[at + 2] === bg.b) {
      continue;
    }
    ink[i] = 1;
  }

  // Sparse sheets want a gap wide enough to rejoin the parts of one sprite;
  // densely packed ones (the Link sheet has frames touching) merge into a
  // single blob at any gap at all. Back the gap off until the sheet stops
  // coming out as one lump.
  let gap = GAP;
  let blobs;
  for (;;) {
    blobs = findBlobs(dilate(ink, width, height, gap), ink, width, height);
    const biggest = blobs.reduce((max, blob) => Math.max(max, blob.width * blob.height), 0);
    if (gap === 0 || biggest < width * height * 0.5) {
      break;
    }
    gap -= 1;
  }

  blobs = blobs
    .filter((blob) => blob.width >= MIN_SIDE && blob.height >= MIN_SIDE && blob.pixels >= MIN_INK)
    // Reading order, so the numbering matches how the sheet looks.
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const dir = path.join(OUT_DIR, slug(name));
  fs.mkdirSync(dir, { recursive: true });

  const manifest = [];
  for (const blob of blobs) {
    const stripped = stripIconBox(crop(png, blob, bg));
    // Nothing but box: a palette swatch or a filled rectangle, not a sprite.
    if (!stripped) {
      continue;
    }

    const { png: sprite, offset, cleared } = stripped;
    if (sprite.width < MIN_SIDE || sprite.height < MIN_SIDE) {
      continue;
    }

    const id = String(manifest.length + 1).padStart(3, '0');
    fs.writeFileSync(path.join(dir, id + '.png'), PNG.sync.write(sprite));
    manifest.push({
      file: id + '.png',
      x: blob.x + offset.x,
      y: blob.y + offset.y,
      width: sprite.width,
      height: sprite.height,
      boxPixelsCleared: cleared,
    });
  }

  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ source: name, sheet: { width, height }, background: bg, sprites: manifest }, null, 2)
  );

  return { name, dir, count: manifest.length };
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error('No ' + SOURCE_DIR);
    process.exit(1);
  }

  const only = arg('only', '');
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .filter((file) => !only || file.toLowerCase().includes(only.toLowerCase()))
    .map((file) => path.join(SOURCE_DIR, file));

  let total = 0;
  for (const file of files) {
    const result = sliceSheet(file);
    if (result.skipped) {
      console.log('skip  ' + result.name + '  — ' + result.skipped);
      continue;
    }
    total += result.count;
    console.log(String(result.count).padStart(4) + '  ' + path.relative(process.cwd(), result.dir));
  }
  console.log('\n' + total + ' sprites written to ' + path.relative(process.cwd(), OUT_DIR));
}

main();
