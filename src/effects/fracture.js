// Breaks a piece into chunks, and moves loose chunks about. The factory shares
// geometry between pieces, so it is only ever read here: every chunk is a copy.
import * as THREE from 'three';

const MAX_EDGE = 0.14; // longer triangles are split so that chunks stay small
export const CHUNKS = 30;

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Triangles of one geometry, as arrays of { p: [x,y,z], n: [x,y,z] } corners,
// with big ones split along their longest edge.
function triangles(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const corner = (i) => {
    const v = index ? index.getX(i) : i;
    return {
      p: [position.getX(v), position.getY(v), position.getZ(v)],
      n: [normal.getX(v), normal.getY(v), normal.getZ(v)],
    };
  };
  const middle = (a, b) => ({
    p: a.p.map((v, k) => (v + b.p[k]) / 2),
    n: a.n.map((v, k) => (v + b.n[k]) / 2),
  });
  const result = [];
  const pending = [];
  for (let i = 0; i < count; i += 3) pending.push([corner(i), corner(i + 1), corner(i + 2), 0]);
  while (pending.length) {
    const [a, b, c, depth] = pending.pop();
    const sides = [[a, b, c], [b, c, a], [c, a, b]];
    const lengths = sides.map(([x, y]) => Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1], x.p[2] - y.p[2]));
    const longest = lengths.indexOf(Math.max(...lengths));
    if (depth < 6 && lengths[longest] > MAX_EDGE) {
      const [x, y, z] = sides[longest];
      const m = middle(x, y);
      pending.push([x, m, z, depth + 1], [m, y, z, depth + 1]);
    } else result.push([a, b, c]);
  }
  return result;
}

const centroid = (t) => [0, 1, 2].map((k) => (t[0].p[k] + t[1].p[k] + t[2].p[k]) / 3);
const distance2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// Voronoi-style cut of a list of meshes. Returns chunks of
// { geometry, center: Vector3, radius }, in the piece's own coordinates. Each
// chunk's geometry has one group per source mesh it takes from, and a group's
// materialIndex is that mesh's index.
export function fractureGeometries(geometries, { chunks = CHUNKS, seed = 1 } = {}) {
  const random = seeded(seed);
  const all = geometries.flatMap((geometry, mesh) => triangles(geometry).map((t) => ({ t, mesh, c: centroid(t) })));

  // Spread the cell centres out: each is the triangle farthest from the others.
  const cells = [all[Math.floor(random() * all.length)].c];
  const nearest = all.map((item) => distance2(item.c, cells[0]));
  while (cells.length < Math.min(chunks, all.length)) {
    let best = 0;
    let bestScore = -1;
    nearest.forEach((d, i) => {
      const score = d * (0.55 + random() * 0.45);
      if (score > bestScore) [best, bestScore] = [i, score];
    });
    const next = all[best].c;
    cells.push(next);
    all.forEach((item, i) => { nearest[i] = Math.min(nearest[i], distance2(item.c, next)); });
  }

  const groups = cells.map(() => []);
  for (const item of all) {
    let cell = 0;
    let closest = Infinity;
    cells.forEach((c, i) => {
      const d = distance2(item.c, c);
      if (d < closest) [cell, closest] = [i, d];
    });
    groups[cell].push(item);
  }

  return groups.filter((members) => members.length).map((members) => {
    members.sort((a, b) => a.mesh - b.mesh);
    const center = [0, 1, 2].map((k) => members.reduce((sum, m) => sum + m.c[k], 0) / members.length);
    const positions = [];
    const normals = [];
    const geometry = new THREE.BufferGeometry();
    let start = 0;
    let radius = 0;
    members.forEach((member, i) => {
      for (const { p, n } of member.t) {
        const local = p.map((v, k) => v - center[k]);
        radius = Math.max(radius, Math.hypot(...local));
        positions.push(...local);
        normals.push(...n);
      }
      if (i === members.length - 1 || members[i + 1].mesh !== member.mesh) {
        const end = (i + 1) * 3;
        geometry.addGroup(start, end - start, member.mesh);
        start = end;
      }
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return { geometry, center: new THREE.Vector3(...center), radius };
  });
}

const cache = new WeakMap(); // first geometry of a piece -> chunks

// The prepared fracture of a piece made by the factory, cut once per piece type.
export function fracturePiece(piece) {
  const geometries = piece.children.map((mesh) => mesh.geometry);
  let chunks = cache.get(geometries[0]);
  if (!chunks) cache.set(geometries[0], chunks = fractureGeometries(geometries, { seed: geometries.length * 977 }));
  return chunks;
}

// ---------------------------------------------------------------- motion

export const GRAVITY = 11;

// Advances a loose chunk: gravity, a bounce or two off the floor, then rest.
// body: { position, velocity: {x,y,z}, spin: number, floor, resting }
export function stepBody(body, dt) {
  if (body.resting) return body;
  const { position, velocity } = body;
  velocity.y -= GRAVITY * dt;
  position.x += velocity.x * dt;
  position.y += velocity.y * dt;
  position.z += velocity.z * dt;
  if (position.y <= body.floor && velocity.y < 0) {
    position.y = body.floor;
    velocity.y *= -0.34;
    velocity.x *= 0.55;
    velocity.z *= 0.55;
    body.spin *= 0.5;
    if (velocity.y < 0.45) {
      velocity.x = velocity.y = velocity.z = 0;
      body.spin = 0;
      body.resting = true;
    }
  }
  return body;
}
