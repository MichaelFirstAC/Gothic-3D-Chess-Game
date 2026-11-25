// Procedural canvas textures. Nothing here is loaded from a file.
import * as THREE from 'three';

export function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeCanvas(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  return canvas;
}

function asTexture(canvas, colorSpace = THREE.SRGBColorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function canvasTexture(size, draw) {
  return asTexture(makeCanvas(size, size, draw));
}

export function paintedTexture(width, height, draw) {
  return asTexture(makeCanvas(width, height, draw));
}

export function marble(base, vein, seed, size = 1024) {
  const random = seededRandom(seed);
  return canvasTexture(size, (ctx) => {
    const scale = size / 1024;
    ctx.scale(scale, scale);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 500; i++) {
      const x = random() * 1024;
      const y = random() * 1024;
      const r = 20 + random() * 110;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.strokeStyle = vein;
    for (let i = 0; i < 46; i++) {
      let x = random() * 1024;
      let y = random() * 1024;
      let angle = random() * Math.PI * 2;
      ctx.lineWidth = 0.5 + random() * 2.2;
      ctx.globalAlpha = 0.15 + random() * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let step = 0; step < 36; step++) {
        angle += (random() - 0.5) * 0.9;
        x += Math.cos(angle) * 12;
        y += Math.sin(angle) * 12;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

// Turns a greyscale height canvas into a tangent-space normal map.
function normalFromHeight(heights, strength) {
  const { width, height } = heights;
  const source = heights.getContext('2d').getImageData(0, 0, width, height).data;
  const at = (x, y) => source[(((y + height) % height) * width + ((x + width) % width)) * 4] / 255;
  const canvas = makeCanvas(width, height, (ctx) => {
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const length = Math.hypot(dx, dy, 1);
        const i = (y * width + x) * 4;
        image.data[i] = 127.5 + (dx / length) * 127.5;
        image.data[i + 1] = 127.5 + (dy / length) * 127.5;
        image.data[i + 2] = 127.5 + (1 / length) * 127.5;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  return asTexture(canvas, THREE.NoColorSpace);
}

// Draws something four times over so that it wraps across the tile edges.
function wrapped(size, x, y, paint) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) paint(x + dx, y + dy);
  }
}

// Coursed stone blocks, drawn twice: once for colour, once for relief.
function masonry({ size, rows, minWidth, maxWidth, mortar, tones, mortarColor, seed, streaks, wear }) {
  const random = seededRandom(seed);
  const rowHeight = size / rows;
  const blocks = [];
  for (let row = 0; row < rows; row++) {
    const widths = [];
    let used = 0;
    while (used < size) {
      const width = Math.min(minWidth + random() * (maxWidth - minWidth), size - used);
      widths.push(width);
      used += width;
    }
    // A sliver at the end of a course is merged into its neighbour.
    if (widths.length > 1 && widths.at(-1) < minWidth * 0.6) widths[widths.length - 2] += widths.pop();
    const offset = random() * size;
    let x = offset;
    for (const width of widths) {
      blocks.push({
        x: x % size, y: row * rowHeight, width, height: rowHeight,
        tone: tones[Math.floor(random() * tones.length)], lift: random(),
      });
      x += width;
    }
  }

  const specks = Array.from({ length: wear }, () => ({
    x: random() * size, y: random() * size, r: 0.6 + random() * 2.4, dark: random() > 0.35, alpha: 0.1 + random() * 0.25,
  }));
  const stains = Array.from({ length: 70 }, () => ({
    x: random() * size, y: random() * size, r: 20 + random() * 90, dark: random() > 0.3,
  }));
  const drips = Array.from({ length: streaks }, () => ({
    x: random() * size, y: random() * size, width: 2 + random() * 14, length: 60 + random() * 300,
    alpha: 0.1 + random() * 0.28,
  }));

  const eachBlock = (paint) => {
    for (const block of blocks) {
      for (const dx of [-size, 0, size]) paint({ ...block, x: block.x + dx });
    }
  };

  const color = makeCanvas(size, size, (ctx) => {
    ctx.fillStyle = mortarColor;
    ctx.fillRect(0, 0, size, size);
    eachBlock((b) => {
      ctx.fillStyle = b.tone;
      ctx.fillRect(b.x + mortar / 2, b.y + mortar / 2, b.width - mortar, b.height - mortar);
    });
    for (const { x, y, r, dark } of stains) {
      wrapped(size, x, y, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, dark ? 'rgba(10,8,6,0.22)' : 'rgba(215,205,180,0.1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    for (const { x, y, r, dark, alpha } of specks) {
      ctx.fillStyle = dark ? `rgba(20,16,12,${alpha})` : `rgba(230,220,198,${alpha * 0.6})`;
      ctx.fillRect(x, y, r, r);
    }
    for (const { x, y, width, length, alpha } of drips) {
      wrapped(size, x, y, (px, py) => {
        const g = ctx.createLinearGradient(0, py, 0, py + length);
        g.addColorStop(0, `rgba(12,10,8,${alpha})`);
        g.addColorStop(1, 'rgba(12,10,8,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px, py, width, length);
      });
    }
  });

  const relief = makeCanvas(size, size, (ctx) => {
    ctx.fillStyle = '#303030';
    ctx.fillRect(0, 0, size, size);
    eachBlock((b) => {
      const level = Math.round(165 + b.lift * 40);
      // Stepped insets round off the edge of each block.
      for (let step = 0; step < 4; step++) {
        const inset = mortar / 2 + step * 1.5;
        const shade = Math.round(level * (0.7 + step * 0.1));
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(b.x + inset, b.y + inset, b.width - inset * 2, b.height - inset * 2);
      }
    });
    for (const { x, y, r, dark } of specks) {
      ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, r * 1.4, r * 1.4);
    }
  });

  const map = asTexture(color);
  const normalMap = normalFromHeight(relief, 3.2);
  for (const texture of [map, normalMap]) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

// Weathered ashlar walling.
export const ashlar = () => masonry({
  size: 512, rows: 8, minWidth: 80, maxWidth: 170, mortar: 4, seed: 311, streaks: 45, wear: 5200,
  tones: ['#8d8478', '#7f776c', '#978d7e', '#746d65', '#888075', '#9a9285'], mortarColor: '#4a443d',
});

// Large worn floor flags.
export const flagstones = () => masonry({
  size: 512, rows: 4, minWidth: 110, maxWidth: 230, mortar: 6, seed: 977, streaks: 0, wear: 9000,
  tones: ['#6f6962', '#625d57', '#776f66', '#59544f', '#6a645e'], mortarColor: '#2a2622',
});

const JEWELS = ['#8d1630', '#1f3f98', '#60207f', '#106350', '#b27f1c', '#7a2d12', '#2a62a8'];

// Leaded lights for a tall window: a lattice of coloured panes with medallions.
export function lancetGlass(seed) {
  const random = seededRandom(seed);
  const pick = () => JEWELS[Math.floor(random() * JEWELS.length)];
  return paintedTexture(256, 1024, (ctx, width, height) => {
    ctx.fillStyle = '#07050a';
    ctx.fillRect(0, 0, width, height);
    const columns = 4;
    const cell = width / columns;
    const pair = [pick(), pick()];
    for (let y = 0; y < height; y += cell * 0.8) {
      for (let c = 0; c < columns; c++) {
        ctx.fillStyle = random() < 0.65 ? pair[(c === 0 || c === columns - 1) ? 0 : 1] : pick();
        ctx.globalAlpha = 0.65 + random() * 0.35;
        ctx.fillRect(c * cell + 3, y + 3, cell - 6, cell * 0.8 - 6);
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 7;
    for (let y = height * 0.16; y < height; y += height * 0.24) {
      for (const [r, fill] of [[78, pick()], [52, pick()], [22, '#d9b35a']]) {
        ctx.beginPath();
        ctx.arc(width / 2, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.strokeStyle = '#08060a';
        ctx.fill();
        ctx.stroke();
      }
    }
    // Lead lines.
    ctx.strokeStyle = 'rgba(8,6,10,0.8)';
    ctx.lineWidth = 3;
    for (let i = -height; i < width + height; i += 46) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height, height);
      ctx.moveTo(i, 0);
      ctx.lineTo(i - height, height);
      ctx.stroke();
    }
    // Stone mullions.
    ctx.fillStyle = '#0b090e';
    for (const x of [width / 3, (width * 2) / 3]) ctx.fillRect(x - 6, 0, 12, height);
  });
}

export function roseGlass() {
  const colors = ['#8d1630', '#1f3f98', '#60207f', '#106350', '#b27f1c'];
  return canvasTexture(1024, (ctx, size) => {
    const c = size / 2;
    ctx.fillStyle = '#0b090e';
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(c, c);
    const petal = (count, inner, outer, shift) => {
      for (let i = 0; i < count; i++) {
        ctx.save();
        ctx.rotate((i / count) * Math.PI * 2);
        const half = Math.tan(Math.PI / count) * outer * 0.72;
        ctx.beginPath();
        ctx.moveTo(0, -inner);
        ctx.quadraticCurveTo(half * 1.3, -(inner + outer) / 2, 0, -outer);
        ctx.quadraticCurveTo(-half * 1.3, -(inner + outer) / 2, 0, -inner);
        ctx.fillStyle = colors[(i + shift) % colors.length];
        ctx.fill();
        ctx.lineWidth = 9;
        ctx.strokeStyle = '#08060a';
        ctx.stroke();
        ctx.restore();
      }
    };
    petal(24, 340, 490, 1);
    petal(16, 190, 355, 0);
    petal(8, 60, 215, 2);
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#4a4250';
    for (const r of [60, 345, 498]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#d0a032';
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.fill();
  });
}

// White with soft edges; `fade` makes it thin out toward the bottom.
export function shaftTexture() {
  return paintedTexture(128, 256, (ctx, width, height) => {
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const across = Math.sin((x / (width - 1)) * Math.PI) ** 2;
        const ribs = 0.8 + 0.2 * Math.sin(x * 0.31) * Math.sin(x * 0.13 + 1);
        const along = (1 - y / height) ** 0.8 * Math.min(1, y / 20);
        const i = (y * width + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
        image.data[i + 3] = 255 * across * ribs * along;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

// A soft round glow.
export function glowTexture(size = 128, inner = 0) {
  return canvasTexture(size, (ctx) => {
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, half * inner, half, half, half);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}
