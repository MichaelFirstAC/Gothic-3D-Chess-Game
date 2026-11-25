// Capture, promotion and take-back effects. Each is one entry on a timeline, and
// its clean-up leaves the scene exactly as if no effect had run.
import * as THREE from 'three';
import { fracturePiece, stepBody } from './fracture.js';
import { createDissolve } from './dissolve.js';
import { phase, easeIn, easeOut, easeInOut } from './timeline.js';
import { glowTexture } from '../textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const range = (min, max) => min + Math.random() * (max - min);
const randomAxis = () => new THREE.Vector3(range(-1, 1), range(-1, 1), range(-1, 1)).normalize();

// effectsGroup: where temporary objects live. sound: (name) => void.
// reduced: () => true when the viewer prefers reduced motion.
export function createShatter({ effectsGroup, timeline, sound = () => {}, reduced = () => false }) {
  let spark = null;
  const sparkMap = () => (spark ||= glowTexture(64));

  // The materials of a piece in mesh order, which chunk groups refer to.
  const materialsOf = (piece) => piece.children.map((mesh) => mesh.material);

  // Runs `step` on a timeline entry, with one bag that is emptied at the end.
  function play(duration, build) {
    const bag = [];
    const keep = (clean) => bag.push(clean);
    const { update, done } = build(keep);
    return timeline.run({
      duration,
      update,
      end() {
        for (const clean of bag.reverse()) clean();
        done?.();
      },
    });
  }

  function dissolveFor(piece, keep, options) {
    const dissolve = createDissolve(materialsOf(piece), options);
    keep(() => dissolve.dispose());
    return dissolve;
  }

  // Swaps a piece onto dissolvable materials until the effect ends.
  function borrow(piece, keep, options) {
    const originals = materialsOf(piece);
    const dissolve = dissolveFor(piece, keep, { doubleSided: false, ...options });
    piece.children.forEach((mesh, i) => { mesh.material = dissolve.materials[i]; });
    keep(() => piece.children.forEach((mesh, i) => { mesh.material = originals[i]; }));
    return dissolve;
  }

  // One mesh per chunk, placed so that together they look like the whole piece.
  function chunkMeshes(piece, dissolve, keep) {
    piece.updateMatrixWorld(true);
    const holder = new THREE.Group();
    effectsGroup.add(holder);
    keep(() => effectsGroup.remove(holder));
    return fracturePiece(piece).map((chunk) => {
      const mesh = new THREE.Mesh(chunk.geometry, dissolve.materials);
      mesh.position.copy(chunk.center).applyMatrix4(piece.matrixWorld);
      mesh.quaternion.copy(piece.quaternion);
      mesh.scale.copy(piece.scale);
      mesh.castShadow = true;
      holder.add(mesh);
      return {
        mesh, chunk, holder,
        home: mesh.position.clone(), facing: mesh.quaternion.clone(), axis: randomAxis(),
      };
    });
  }

  function dust(at, keep, count = 28) {
    const positions = new Float32Array(count * 3);
    const velocities = Array.from({ length: count }, (_, i) => {
      positions.set([at.x + range(-0.2, 0.2), range(0.05, 0.25), at.z + range(-0.2, 0.2)], i * 3);
      const angle = range(0, Math.PI * 2);
      const speed = range(0.25, 1.1);
      return [Math.cos(angle) * speed, range(0.1, 0.8), Math.sin(angle) * speed];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: sparkMap(), color: 0xa2937c, size: 0.26, transparent: true, opacity: 0, depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.frustumCulled = false;
    effectsGroup.add(points);
    keep(() => {
      effectsGroup.remove(points);
      geometry.dispose();
      material.dispose();
    });
    return (age, dt) => {
      points.visible = age >= 0 && age < 0.9;
      if (!points.visible) return;
      velocities.forEach((v, i) => {
        v[1] -= 1.2 * dt;
        for (let k = 0; k < 3; k++) {
          v[k] *= 1 - 2.2 * dt;
          positions[i * 3 + k] += v[k] * dt;
        }
        positions[i * 3 + 1] = Math.max(0.03, positions[i * 3 + 1]);
      });
      geometry.attributes.position.needsUpdate = true;
      material.opacity = 0.5 * (1 - age / 0.9);
    };
  }

  // Gives chunks a push away from the piece's axis.
  function loosen(parts, centre, floor, force = 1) {
    return parts.map((part) => {
      const out = part.home.clone().sub(centre).setY(0);
      if (out.lengthSq() < 1e-4) out.set(range(-1, 1), 0, range(-1, 1));
      out.normalize().applyAxisAngle(UP, range(-0.7, 0.7));
      const speed = range(0.5, 1.7) * force;
      const height = Math.max(0, part.home.y - floor);
      return {
        part,
        spin: range(4, 12),
        floor: floor + part.chunk.radius * part.mesh.scale.y * 0.3,
        resting: false,
        position: part.mesh.position,
        velocity: { x: out.x * speed, y: range(0.4, 2.2) * force + height * 0.7, z: out.z * speed },
      };
    });
  }

  function tumble(bodies, dt) {
    for (const body of bodies) {
      stepBody(body, dt);
      if (body.spin) body.part.mesh.rotateOnAxis(body.part.axis, body.spin * dt);
    }
  }

  // Chunks fly in from a loose cloud around the piece and lock into place.
  function gather(piece, keep) {
    const dissolve = dissolveFor(piece, keep);
    const parts = chunkMeshes(piece, dissolve, keep);
    const size = piece.scale.y;
    for (const part of parts) {
      part.from = part.home.clone().add(new THREE.Vector3(
        range(-1, 1) * 1.1 * size, range(0.15, 1.5) * size, range(-1, 1) * 1.1 * size,
      ));
      part.turned = part.facing.clone().multiply(new THREE.Quaternion().setFromAxisAngle(part.axis, range(2, 5)));
      part.delay = Math.random() * 0.35;
      part.mesh.visible = false;
    }
    // t runs from 0 to 1 across the whole gathering.
    return (t) => {
      for (const part of parts) {
        const p = easeInOut(phase(t, part.delay, part.delay + 0.65));
        part.mesh.visible = t > part.delay * 0.5;
        part.mesh.position.lerpVectors(part.from, part.home, p);
        part.mesh.quaternion.slerpQuaternions(part.turned, part.facing, p);
      }
      dissolve.amount = 0.65 * (1 - phase(t, 0, 0.8));
      dissolve.glow = 0.55 * Math.sin(Math.PI * Math.min(1, t));
    };
  }

  // A plain fade of a whole piece.
  function fade(piece, keep, from, to) {
    const dissolve = borrow(piece, keep);
    return (t) => { dissolve.opacity = from + (to - from) * t; };
  }

  return {
    // The victim is crushed, bursts apart, and is swallowed by the board, while
    // `grave` (its final mesh beside the board) gathers itself out of the air.
    // `delay` is the time until the attacker lands, in seconds.
    capture({ victim, grave, delay = 0 }) {
      effectsGroup.add(victim);
      if (reduced()) {
        return play(delay + 0.3, (keep) => {
          const out = fade(victim, keep, 1, 0);
          const into = fade(grave, keep, 0, 1);
          grave.visible = true;
          return {
            update(t) {
              out(phase(t, delay, delay + 0.3));
              into(phase(t, delay, delay + 0.3));
            },
            done() {
              effectsGroup.remove(victim);
              grave.visible = true;
            },
          };
        });
      }
      const CRUSH = 0.14;
      const SINK = 0.85;
      const END = 1.45;
      return play(delay + END, (keep) => {
        grave.visible = false;
        const base = victim.scale.clone();
        const centre = victim.position.clone();
        const debris = dissolveFor(victim, keep);
        let bodies = null;
        let dustStep = null;
        let rise = null;
        let sunk = false;
        let reforming = false;
        const puff = dust(centre, keep);
        return {
          update(total, dt) {
            const t = total - delay;
            if (t < 0) return;
            if (!bodies) {
              const squash = easeIn(phase(t, 0, CRUSH));
              victim.scale.set(base.x * (1 + 0.14 * squash), base.y * (1 - 0.3 * squash), base.z * (1 + 0.14 * squash));
              if (t < CRUSH) return;
              victim.scale.copy(base);
              const parts = chunkMeshes(victim, debris, keep);
              bodies = loosen(parts, centre, 0);
              victim.visible = false;
              dustStep = puff;
              sound('capture');
            }
            dustStep(t - CRUSH, dt);
            if (t < SINK) tumble(bodies, dt);
            else {
              if (!sunk) {
                sunk = true;
                debris.clipY = -0.001; // anything below the board's face is gone
                sound('sink');
              }
              const p = phase(t, SINK, END);
              for (const body of bodies) body.position.y -= dt * (0.25 + p * 0.55);
              debris.amount = easeIn(p) * 0.95;
              debris.glow = 0.12 * Math.sin(Math.PI * p);
            }
            if (t >= 0.5) {
              if (!reforming) {
                reforming = true;
                rise = gather(grave, keep);
                sound('reform');
              }
              rise(phase(t, 0.5, END));
            }
          },
          done() {
            effectsGroup.remove(victim);
            grave.visible = true;
          },
        };
      });
    },

  };
}
