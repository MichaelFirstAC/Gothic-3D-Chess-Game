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

  const dustLook = () => new THREE.PointsMaterial({
    map: sparkMap(), color: 0xa2937c, size: 0.26, transparent: true, opacity: 0, depthWrite: false,
  });
  const flashLook = () => new THREE.SpriteMaterial({
    map: sparkMap(), color: 0xffc36b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  // One of each is drawn at warm-up and kept for good, which keeps their shaders.
  let keepers = null;

  // The materials of a piece in mesh order, which chunk groups refer to.
  const materialsOf = (piece) => piece.children.map((mesh) => mesh.material);

  // Freeing a material is safe for its shader only while a keeper still uses it.
  const releaseLater = (material) => {
    if (keepers) material.dispose();
  };

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
    keep(() => dissolve.release());
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
    const material = dustLook();
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.frustumCulled = false;
    effectsGroup.add(points);
    keep(() => {
      effectsGroup.remove(points);
      geometry.dispose();
      releaseLater(material);
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
    // Everything an effect will draw, so the shaders can be compiled before the
    // first capture. `samples` are one piece of each colour. The objects are
    // invisible; call done() once they have been drawn.
    warmUpObjects(samples) {
      const group = new THREE.Group();
      const sets = [];
      for (const piece of samples) {
        for (const doubleSided of [true, false]) {
          const dissolve = createDissolve(materialsOf(piece), { doubleSided });
          if (reduced()) dissolve.opacity = 0;
          // Every pixel is discarded, so nothing shows.
          dissolve.clipY = 1e6;
          sets.push(dissolve);
          piece.children.forEach((mesh, i) => {
            const copy = new THREE.Mesh(mesh.geometry, dissolve.materials[i]);
            copy.frustumCulled = false;
            copy.castShadow = true;
            group.add(copy);
          });
        }
      }
      const kept = { dust: dustLook(), flash: flashLook() };
      const point = new THREE.BufferGeometry()
        .setAttribute('position', new THREE.Float32BufferAttribute([0, -50, 0], 3));
      const points = new THREE.Points(point, kept.dust);
      const sprite = new THREE.Sprite(kept.flash);
      kept.flash.opacity = 0;
      sprite.position.y = -50;
      for (const object of [points, sprite]) object.frustumCulled = false;
      group.add(points, sprite);
      return {
        group,
        done() {
          for (const dissolve of sets) dissolve.release();
          point.dispose();
          keepers = kept;
        },
      };
    },

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
      const CRUSH = 0.07;
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

    // The pawn cracks and falls into its square; fragments of the new piece
    // rise from the ground around it and lock into place one by one.
    promote({ pawn, crowned }) {
      effectsGroup.add(pawn);
      if (reduced()) {
        return play(0.4, (keep) => {
          const out = fade(pawn, keep, 1, 0);
          const into = fade(crowned, keep, 0, 1);
          return {
            update(t) {
              out(phase(t, 0, 0.25));
              into(phase(t, 0.1, 0.4));
            },
            done() {
              effectsGroup.remove(pawn);
              crowned.visible = true;
            },
          };
        });
      }
      return play(1.55, (keep) => {
        crowned.visible = false;
        const centre = pawn.position.clone();
        const crumbs = dissolveFor(pawn, keep);
        const stone = dissolveFor(crowned, keep);
        stone.clipY = -0.001;
        const flashes = [];
        let bodies = null;
        let parts = null;
        let finished = null;
        return {
          update(t, dt) {
            // Crack: a shudder, then the pieces give way.
            if (t < 0.16) {
              pawn.position.x = centre.x + Math.sin(t * 190) * 0.025 * phase(t, 0, 0.16);
              return;
            }
            if (!bodies) {
              pawn.position.copy(centre);
              bodies = loosen(chunkMeshes(pawn, crumbs, keep), centre, 0, 0.45);
              pawn.visible = false;
              sound('crack');
              parts = chunkMeshes(crowned, stone, keep);
              // Lowest fragments lock first, so the piece is built from the ground.
              const order = [...parts].sort((a, b) => a.home.y - b.home.y);
              order.forEach((part, i) => {
                part.start = 0.5 + (i / order.length) * 0.5;
                const angle = Math.atan2(part.home.z - centre.z, part.home.x - centre.x) + range(-0.4, 0.4);
                part.orbit = { angle, radius: range(0.55, 0.95), depth: range(-0.55, -0.15) };
                part.turned = part.facing.clone().multiply(new THREE.Quaternion().setFromAxisAngle(part.axis, range(2, 5)));
                part.mesh.visible = false;
              });
              sound('promote');
            }
            if (t < 0.5) tumble(bodies, dt);
            else {
              crumbs.clipY = -0.001;
              for (const body of bodies) body.position.y -= dt * 0.9;
              crumbs.amount = phase(t, 0.5, 0.95);
            }
            if (!finished) {
              for (const part of parts) {
                const p = phase(t, part.start, part.start + 0.3);
                part.mesh.visible = t >= part.start;
                if (!part.mesh.visible) continue;
                const e = easeOut(p);
                const dx = part.home.x - centre.x;
                const dz = part.home.z - centre.z;
                const swirl = part.orbit.angle + (1 - e) * 2.6;
                const radius = THREE.MathUtils.lerp(part.orbit.radius, Math.hypot(dx, dz), e);
                const final = Math.atan2(dz, dx);
                // Blend the spiral into the exact resting place.
                part.mesh.position.set(
                  THREE.MathUtils.lerp(centre.x + Math.cos(swirl) * radius, centre.x + Math.cos(final) * radius, e * e),
                  THREE.MathUtils.lerp(part.orbit.depth, part.home.y, e),
                  THREE.MathUtils.lerp(centre.z + Math.sin(swirl) * radius, centre.z + Math.sin(final) * radius, e * e),
                );
                if (p === 1) part.mesh.position.copy(part.home);
                part.mesh.quaternion.slerpQuaternions(part.turned, part.facing, e);
                if (p === 1 && !part.snapped) {
                  part.snapped = true;
                  // A small flash as it locks.
                  const flash = new THREE.Sprite(flashLook());
                  flash.position.copy(part.home);
                  effectsGroup.add(flash);
                  keep(() => {
                    effectsGroup.remove(flash);
                    releaseLater(flash.material);
                  });
                  flashes.push({ flash, born: t });
                }
              }
              if (t >= 1.3) {
                // Every fragment is home: show the whole piece and let it glow.
                for (const part of parts) part.holder.visible = false;
                finished = borrow(crowned, keep);
                crowned.visible = true;
              }
            }
            if (finished) finished.glow = 1.1 * Math.sin(Math.PI * phase(t, 1.3, 1.55));
            for (const { flash, born } of flashes) {
              const age = (t - born) / 0.18;
              flash.visible = age < 1;
              flash.scale.setScalar(0.12 + 0.22 * age);
              flash.material.opacity = 0.85 * Math.max(0, 1 - age);
            }
          },
          done() {
            effectsGroup.remove(pawn);
            crowned.visible = true;
          },
        };
      });
    },

    // A piece leaves its place in a haze of embers. Used by take-back.
    dissolveOut(piece, { duration = 0.45 } = {}) {
      effectsGroup.add(piece);
      return play(reduced() ? 0.2 : duration, (keep) => {
        const length = reduced() ? 0.2 : duration;
        if (reduced()) {
          const out = fade(piece, keep, 1, 0);
          return { update: (t) => out(t / length), done: () => effectsGroup.remove(piece) };
        }
        const dissolve = borrow(piece, keep);
        return {
          update(t) { dissolve.amount = easeInOut(t / length); },
          done() { effectsGroup.remove(piece); },
        };
      });
    },

    // A piece already in its final place gathers itself together.
    reform(piece, { delay = 0, duration = 0.65 } = {}) {
      const length = reduced() ? 0.25 : duration;
      return play(delay + length, (keep) => {
        piece.visible = false;
        let step = null;
        return {
          update(t) {
            if (t < delay) return;
            if (!step) {
              if (reduced()) {
                step = fade(piece, keep, 0, 1);
                piece.visible = true;
              } else {
                step = gather(piece, keep);
                sound('reform');
              }
            }
            step(phase(t, delay, delay + length));
          },
          done() { piece.visible = true; },
        };
      });
    },

    // A piece breaks up and sinks where it stands. Used to undo a promotion.
    crumble(piece) {
      if (reduced()) return this.dissolveOut(piece);
      effectsGroup.add(piece);
      return play(0.55, (keep) => {
        const debris = dissolveFor(piece, keep);
        const centre = piece.position.clone();
        const bodies = loosen(chunkMeshes(piece, debris, keep), centre, 0, 0.55);
        piece.visible = false;
        sound('crack');
        return {
          update(t, dt) {
            if (t < 0.3) tumble(bodies, dt);
            else {
              debris.clipY = -0.001;
              for (const body of bodies) body.position.y -= dt * 1.1;
              debris.amount = phase(t, 0.3, 0.55);
            }
          },
          done() { effectsGroup.remove(piece); },
        };
      });
    },
  };
}
