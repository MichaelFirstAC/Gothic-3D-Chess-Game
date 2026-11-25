// Procedural canvas textures. Nothing here is loaded from a file.
import * as THREE from 'three';
import { layoutWall } from './stoneLayout.js';

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

const STONE_TONES = ['#8d8478', '#7f776c', '#978d7e', '#746d65', '#888075', '#9a9285', '#827a6a', '#908a82'];

// Weathered ashlar walling: courses of uneven height, some stones two courses
// tall, with cracked blocks, open joints, streaks and pitting. Different seeds
// give different walls. Returns a large colour map and a half-size relief map.
export function stoneWall(seed, size = 2048) {
  const random = seededRandom(seed * 8191 + 3);
  const blocks = layoutWall(size, seed, { course: [64, 132], width: [110, 340], tall: 0.08 }).map((block) => ({
    ...block,
    tone: STONE_TONES[Math.floor(random() * STONE_TONES.length)],
    lift: random(),
    cracked: random() < 0.07,
    // Some joints have lost their mortar and read as black gaps.
    openTop: random() < 0.09,
    openSide: random() < 0.07,
  }));
  const mortar = 6;
  const scatter = (count, make) => Array.from({ length: count }, () => ({ x: random() * size, y: random() * size, ...make() }));
  const mottles = scatter(1500, () => ({ r: 14 + random() ** 2 * 70, dark: random() < 0.55, alpha: 0.035 + random() * 0.075 }));
  const specks = scatter(42000, () => ({ r: 0.8 + random() ** 3 * 3.4, dark: random() < 0.62, alpha: 0.08 + random() * 0.22 }));
  const drips = scatter(120, () => ({ width: 4 + random() * 20, length: 70 + random() * 360, alpha: 0.05 + random() * 0.13 }));
  const cracks = blocks.filter((b) => b.cracked).map((b) => {
    let x = b.x + b.width * (0.2 + random() * 0.6);
    let y = b.y + mortar;
    const points = [[x, y]];
    while (y < b.y + b.height - mortar) {
      x += (random() - 0.5) * 34;
      y += 8 + random() * 20;
      points.push([x, Math.min(y, b.y + b.height - mortar)]);
    }
    return points;
  });

  // Paints something at its place and wherever it wraps across an edge.
  const tiled = (x, y, reachX, reachY, paint) => {
    for (const dx of [0, x + reachX > size ? -size : x - reachX < 0 ? size : 0]) {
      for (const dy of [0, y + reachY > size ? -size : y - reachY < 0 ? size : 0]) paint(x + dx, y + dy);
    }
  };
  const eachBlock = (paint) => {
    for (const block of blocks) {
      paint(block, block.x, block.y);
      if (block.x + block.width > size) paint(block, block.x - size, block.y);
    }
  };
  const joints = (ctx, color, thickness) => {
    ctx.fillStyle = color;
    eachBlock((b, x, y) => {
      if (b.openTop) ctx.fillRect(x, y - thickness / 2, b.width, thickness);
      if (b.openSide) ctx.fillRect(x - thickness / 2, y, thickness, b.height);
    });
  };
  const fissures = (ctx, color, thickness) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineJoin = 'bevel';
    for (const points of cracks) {
      for (const shift of [0, -size]) {
        ctx.beginPath();
        points.forEach(([x, y], i) => (i ? ctx.lineTo(x + shift, y) : ctx.moveTo(x + shift, y)));
        ctx.stroke();
      }
    }
  };

  const color = makeCanvas(size, size, (ctx) => {
    ctx.fillStyle = '#4b453e';
    ctx.fillRect(0, 0, size, size);
    eachBlock((b, x, y) => {
      ctx.fillStyle = b.tone;
      ctx.fillRect(x + mortar / 2, y + mortar / 2, b.width - mortar, b.height - mortar);
    });
    // Many small, soft mottles: nothing large enough to be recognised again.
    for (const { x, y, r, dark, alpha } of mottles) {
      tiled(x, y, r, r, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, dark ? `rgba(24,18,12,${alpha})` : `rgba(222,210,184,${alpha * 0.8})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    for (const { x, y, r, dark, alpha } of specks) {
      ctx.fillStyle = dark ? `rgba(22,17,12,${alpha})` : `rgba(232,222,198,${alpha * 0.6})`;
      ctx.fillRect(x, y, r, r);
    }
    for (const { x, y, width, length, alpha } of drips) {
      tiled(x, y, width, length, (px, py) => {
        const g = ctx.createLinearGradient(0, py, 0, py + length);
        g.addColorStop(0, `rgba(14,11,8,${alpha})`);
        g.addColorStop(1, 'rgba(14,11,8,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px, py, width, length);
      });
    }
    joints(ctx, 'rgba(10,8,6,0.75)', mortar + 3);
    fissures(ctx, 'rgba(18,13,9,0.7)', 2.4);
  });

  const reliefSize = size / 2;
  const relief = makeCanvas(reliefSize, reliefSize, (ctx) => {
    ctx.scale(reliefSize / size, reliefSize / size);
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, size, size);
    eachBlock((b, x, y) => {
      const level = 160 + b.lift * 45;
      // Stepped insets round off the edge of each block.
      for (let step = 0; step < 4; step++) {
        const inset = mortar / 2 + step * 3;
        const shade = Math.round(level * (0.7 + step * 0.1));
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x + inset, y + inset, b.width - inset * 2, b.height - inset * 2);
      }
    });
    for (let i = 0; i < specks.length; i += 3) {
      const { x, y, r, dark } = specks[i];
      ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y, r * 1.8, r * 1.8);
    }
    joints(ctx, '#050505', mortar + 3);
    fissures(ctx, '#101010', 4);
  });

  const map = asTexture(color);
  const normalMap = normalFromHeight(relief, 3.2);
  for (const texture of [map, normalMap]) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

// Three unrelated smooth noises in the red, green and blue channels, tiling.
export function noiseTexture(seed = 5, size = 256, cells = 8) {
  const random = seededRandom(seed);
  const lattice = Array.from({ length: 3 }, () => Array.from({ length: cells * cells * 5 }, () => random()));
  const value = (channel, x, y, frequency, offset) => {
    const gx = (x / size) * frequency;
    const gy = (y / size) * frequency;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const at = (i, j) => lattice[channel][(offset + ((j % frequency) * frequency + (i % frequency))) % lattice[channel].length];
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
  const canvas = makeCanvas(size, size, (ctx) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        for (let c = 0; c < 3; c++) {
          const sum = value(c, x, y, cells, 0) * 0.67 + value(c, x, y, cells * 2, cells * cells) * 0.33;
          image.data[i + c] = sum * 255;
        }
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  const texture = asTexture(canvas, THREE.NoColorSpace);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

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

// Bare rock: lumps and grain at many sizes, split by fine cracks. Tiles in both
// directions. Returns a colour map and a relief map.
export function rockSurface(seed, size = 1024) {
  const random = seededRandom(seed);
  const lattice = Float32Array.from({ length: 65536 }, () => random());
  // Smooth tiling noise: `cells` lumps across the texture.
  const value = (x, y, cells, salt) => {
    const gx = (x / size) * cells;
    const gy = (y / size) * cells;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const at = (i, j) => lattice[(((j % cells) * 251 + (i % cells) * 13 + salt * 977) & 65535)];
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
  // Scattered points that divide the surface into broken faces, each tipped its
  // own way. `cells` of them cross the texture.
  const facets = (cells) => {
    const points = Array.from({ length: cells * cells }, (_, i) => ({
      x: (i % cells) + random(), y: Math.floor(i / cells) + random(),
      tiltX: random() - 0.5, tiltY: random() - 0.5, lift: random(),
    }));
    return (x, y) => {
      const gx = (((x / size) * cells) % cells + cells) % cells;
      const gy = (((y / size) * cells) % cells + cells) % cells;
      let near = 9;
      let next = 9;
      let face = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const cx = Math.floor(gx) + i;
          const cy = Math.floor(gy) + j;
          const p = points[((cy + cells) % cells) * cells + ((cx + cells) % cells)];
          const dx = p.x + (cx < 0 ? -cells : cx >= cells ? cells : 0) - gx;
          const dy = p.y + (cy < 0 ? -cells : cy >= cells ? cells : 0) - gy;
          const d = Math.hypot(dx, dy);
          if (d < near) {
            next = near;
            near = d;
            face = p.lift + dx * p.tiltX * 1.3 + dy * p.tiltY * 1.3;
          } else if (d < next) next = d;
        }
      }
      return { face, edge: next - near };
    };
  };
  const large = facets(7);
  const small = facets(23);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // A little warping keeps the breaks from running dead straight.
      const wx = x + (value(x, y, 13, 1) - 0.5) * 46;
      const wy = y + (value(x, y, 13, 2) - 0.5) * 46;
      let lumps = 0;
      let amplitude = 0.5;
      for (let octave = 0; octave < 4; octave++) {
        lumps += value(x, y, 16 << octave, 3 + octave) * amplitude;
        amplitude *= 0.58;
      }
      const a = large(wx, wy);
      const b = small(wx, wy);
      // Cracks follow some of the larger breaks and then die out.
      const open = Math.max(0, value(x, y, 6, 11) * 2.6 - 1.25);
      const crack = Math.max(0, 1 - a.edge * 22) * Math.min(1, open);
      heights[y * size + x] = 0.06 + lumps * 0.55 + a.face * 0.13 + b.face * 0.1
        - crack * 0.2 + (random() - 0.5) * 0.09;
    }
  }
  const paint = (shade) => makeCanvas(size, size, (ctx) => {
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < heights.length; i++) {
      image.data.set(shade(heights[i], i), i * 4);
    }
    ctx.putImageData(image, 0, 0);
  });
  const byte = (v) => Math.max(0, Math.min(255, v));
  const color = paint((h) => {
    const tone = byte(4 + h * 232);
    return [tone, tone * 0.965, tone * 0.93, 255];
  });
  const relief = paint((h) => {
    const level = byte(h * 255);
    return [level, level, level, 255];
  });
  const map = asTexture(color);
  const normalMap = normalFromHeight(relief, 2.4);
  for (const texture of [map, normalMap]) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

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
