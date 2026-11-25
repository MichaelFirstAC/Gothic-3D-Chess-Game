// The pieces on screen: where they stand, the captured ones beside the board,
// and how a move or its take-back is animated.
import * as THREE from 'three';
import { colorOf } from './engine.js';
import { squarePosition } from './scene.js';
import { gravePosition } from './pillarShape.js';
import { createTimeline, easeInOut, phase } from './effects/timeline.js';
import { createShatter } from './effects/shatter.js';
import { fracturePiece } from './effects/fracture.js';
import { contactFraction } from './effects/impact.js';

const isCastle = (move) => move.flag === 'castle-short' || move.flag === 'castle-long';

// Where a captured piece stood: beside the target square for en passant.
export const victimSquare = (move) =>
  (move.flag === 'ep' ? move.to + (colorOf(move.piece) === 'w' ? -8 : 8) : move.to);

function rookShift(move) {
  const short = move.flag === 'castle-short';
  return { from: short ? move.to + 1 : move.to - 2, to: short ? move.to - 1 : move.to + 1 };
}

// Captured pieces stand in two rows on the rock ledge on their captor's side.
export function graveyardSlots(history) {
  const counts = { w: 0, b: 0 };
  const slots = [];
  for (const { move } of history) {
    if (!move.captured) continue;
    const captor = colorOf(move.piece);
    const index = counts[captor]++;
    const side = captor === 'w' ? 1 : -1;
    slots.push({
      key: `${captor}${index}${move.captured}`,
      piece: move.captured,
      position: gravePosition(side, index),
    });
  }
  return slots;
}

// sound: (name) => void, called as things happen on the board.
export function createBoardView({ scene, makePiece, sound = () => {}, reducedMotion = () => false }) {
  const pieces = new THREE.Group();
  const graveyard = new THREE.Group();
  const effectsGroup = new THREE.Group();
  scene.add(pieces, graveyard, effectsGroup);
  const meshes = new Map(); // square -> piece object
  const timeline = createTimeline();
  const shatter = createShatter({ effectsGroup, timeline, sound, reduced: reducedMotion });
  let version = 0; // bumped whenever the pieces are rebuilt from scratch

  function place(piece, square) {
    const mesh = makePiece(piece);
    mesh.position.copy(squarePosition(square));
    mesh.userData.square = square;
    pieces.add(mesh);
    meshes.set(square, mesh);
    return mesh;
  }

  // Brings the graveyard to match `history`, keeping the meshes already there so
  // that an effect in progress carries on with the very same object.
  function refreshGraveyard(history) {
    const slots = graveyardSlots(history);
    const wanted = new Set(slots.map((s) => s.key));
    for (const mesh of [...graveyard.children]) {
      if (!wanted.has(mesh.userData.key)) graveyard.remove(mesh);
    }
    const present = new Set(graveyard.children.map((mesh) => mesh.userData.key));
    for (const { key, piece, position } of slots) {
      if (present.has(key)) continue;
      const mesh = makePiece(piece);
      mesh.scale.setScalar(0.58);
      mesh.position.set(...position);
      mesh.userData.key = key;
      graveyard.add(mesh);
    }
  }

  // Rebuilds everything from a position, ending any effect that is running.
  function sync(state, history) {
    version++;
    timeline.cancelAll();
    pieces.clear();
    graveyard.clear();
    effectsGroup.clear();
    meshes.clear();
    state.board.forEach((piece, square) => piece && place(piece, square));
    refreshGraveyard(history);
  }

  const slideSeconds = (from, to) => {
    if (reducedMotion()) return 0.2;
    return (260 + squarePosition(from).distanceTo(squarePosition(to)) * 65) / 1000;
  };

  // Moves a mesh to a square, hopping `hop` high on the way.
  function slide(mesh, to, hop, duration) {
    const from = mesh.position.clone();
    const target = squarePosition(to);
    const height = reducedMotion() ? 0 : hop;
    mesh.userData.square = to;
    return timeline.run({
      duration,
      update(t) {
        const e = easeInOut(phase(t, 0, duration));
        mesh.position.lerpVectors(from, target, e);
        mesh.position.y = Math.sin(e * Math.PI) * height;
      },
      end() { mesh.position.copy(target); },
    });
  }

  const hopFor = (piece) => (piece.toLowerCase() === 'n' ? 1.7 : 0.12);

  // history ends with the move being made. Resolves once the move itself is
  // done; a capture's fragments may still be settling, and `settled` says when.
  async function animateMove(move, history) {
    const start = version;
    const mover = meshes.get(move.from);
    const victim = move.captured ? meshes.get(victimSquare(move)) : null;
    meshes.delete(move.from);
    const duration = slideSeconds(move.from, move.to);

    let settled = Promise.resolve();
    if (victim) {
      meshes.delete(victimSquare(move));
      pieces.remove(victim);
    }
    refreshGraveyard(history);
    if (victim) {
      const key = graveyardSlots(history).filter((s) => s.key[0] === colorOf(move.piece)).at(-1).key;
      const grave = graveyard.children.find((mesh) => mesh.userData.key === key);
      // The victim starts to give way just before the attacker touches it.
      const distance = squarePosition(move.from).distanceTo(squarePosition(move.to));
      const contact = duration * contactFraction(distance, move.piece.toLowerCase() === 'n');
      settled = shatter.capture({ victim, grave, delay: Math.max(0, contact - 0.03) });
    }

    const jobs = [slide(mover, move.to, hopFor(move.piece), duration)];
    if (isCastle(move)) {
      const rook = rookShift(move);
      const mesh = meshes.get(rook.from);
      meshes.delete(rook.from);
      meshes.set(rook.to, mesh);
      jobs.push(slide(mesh, rook.to, 1.5, slideSeconds(rook.from, rook.to) + 0.12));
    }
    await Promise.all(jobs);
    // The board was rebuilt mid-move, so these pieces are no longer on it.
    if (start !== version) return { settled };
    meshes.set(move.to, mover);
    sound(isCastle(move) ? 'castle' : move.piece.toLowerCase() === 'n' ? 'knight' : 'place');

    if (move.promotion) {
      pieces.remove(mover);
      const piece = colorOf(move.piece) === 'w' ? move.promotion.toUpperCase() : move.promotion;
      await shatter.promote({ pawn: mover, crowned: place(piece, move.to) });
    }
    return { settled };
  }

  // The reverse of a move. history is what remains after taking it back.
  async function animateUndo(entry, history) {
    const start = version;
    // Anything still settling from the move is finished first.
    timeline.cancelAll();
    const { move } = entry;
    const mover = meshes.get(move.to);
    if (!mover) return;
    meshes.delete(move.to);
    sound('undo');
    const jobs = [];

    if (move.captured) {
      const keys = new Set(graveyardSlots(history).map((s) => s.key));
      const leaving = graveyard.children.find((mesh) => !keys.has(mesh.userData.key));
      if (leaving) {
        graveyard.remove(leaving);
        jobs.push(shatter.dissolveOut(leaving));
      }
    }
    refreshGraveyard(history);

    if (move.promotion) {
      pieces.remove(mover);
      jobs.push((async () => {
        await shatter.crumble(mover);
        if (start !== version) return;
        await shatter.reform(place(move.piece, move.from), { duration: 0.55 });
      })());
    } else {
      meshes.set(move.from, mover);
      jobs.push(slide(mover, move.from, hopFor(move.piece), slideSeconds(move.to, move.from)));
    }

    if (isCastle(move)) {
      const rook = rookShift(move);
      const mesh = meshes.get(rook.to);
      meshes.delete(rook.to);
      meshes.set(rook.from, mesh);
      jobs.push(slide(mesh, rook.from, 1.5, slideSeconds(rook.to, rook.from) + 0.12));
    }
    if (move.captured) {
      const square = victimSquare(move);
      // The returning piece appears once the mover has cleared the square.
      jobs.push(shatter.reform(place(move.captured, square), { delay: reducedMotion() ? 0.1 : 0.28 }));
    }
    await Promise.all(jobs);
  }

  // Does the slow work of the first effect while nothing is happening: compiles
  // its shaders, then cuts each kind of piece into fragments.
  async function prepare(renderer, camera) {
    const warm = shatter.warmUpObjects([makePiece('Q'), makePiece('q')]);
    scene.add(warm.group);
    try {
      await renderer.compileAsync(warm.group, camera, scene);
      // Some drivers finish a shader only when it is first drawn.
      renderer.render(scene, camera);
      warm.done();
    } finally {
      scene.remove(warm.group);
    }
    for (const letter of 'PpNnBbRrQqKk') {
      await new Promise((resolve) => (window.requestIdleCallback
        ? window.requestIdleCallback(resolve, { timeout: 200 }) : setTimeout(resolve, 30)));
      fracturePiece(makePiece(letter));
    }
  }

  return {
    pieces,
    prepare,
    sync,
    refreshGraveyard,
    animateMove,
    animateUndo,
    update: (seconds) => timeline.advance(seconds),
    timeline,
    get version() { return version; },
    // True when the pieces on screen match `state` and `history`, with no strays.
    matches(state, history) {
      const placed = pieces.children.length === meshes.size && state.board.every((piece, square) => {
        const mesh = meshes.get(square);
        return piece
          ? Boolean(mesh) && mesh.visible && mesh.position.distanceTo(squarePosition(square)) < 1e-6
          : !mesh;
      });
      if (!placed || !history) return placed;
      const slots = graveyardSlots(history);
      return graveyard.children.length === slots.length && effectsGroup.children.length === 0
        && graveyard.children.every((mesh) => mesh.visible);
    },
  };
}
