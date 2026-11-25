// Connects the rules engine to the 3D board and the side panel.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Game, inCheck, colorOf, squareName } from './engine.js';
import { createPieceFactory } from './pieces.js';
import { createScene, createHighlights, squarePosition } from './scene.js';

const NAMES = { w: 'White', b: 'Black' };
const GLYPHS = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PIECE_NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
const VALUE_ORDER = 'qrbnp';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const { renderer, scene, camera, update } = createScene(stage);
const highlights = createHighlights(scene);
const makePiece = createPieceFactory();
const canvas = renderer.domElement;

let game = new Game();
let selected = -1;
let hovered = -1;
let busy = false; // true while a piece is moving or a promotion is being chosen

// ---------------------------------------------------------------- pieces

const board = new THREE.Group();
const graveyard = new THREE.Group();
scene.add(board, graveyard);
const meshes = new Map(); // square -> piece object

function placePiece(piece, square) {
  const mesh = makePiece(piece);
  mesh.position.copy(squarePosition(square));
  mesh.userData.square = square;
  board.add(mesh);
  meshes.set(square, mesh);
}

// Captured pieces stand in two rows beside the board, on their captor's side.
function refreshGraveyard() {
  graveyard.clear();
  const counts = { w: 0, b: 0 };
  for (const { move } of game.history) {
    if (!move.captured) continue;
    const captor = colorOf(move.piece);
    const index = counts[captor]++;
    const side = captor === 'w' ? 1 : -1;
    const mesh = makePiece(move.captured);
    mesh.scale.setScalar(0.58);
    mesh.position.set(
      side * (5.35 + Math.floor(index / 8) * 0.55),
      -0.8,
      side * (3.6 - (index % 8) * 0.6),
    );
    graveyard.add(mesh);
  }
}

function syncPieces() {
  board.clear();
  meshes.clear();
  game.state.board.forEach((piece, square) => piece && placePiece(piece, square));
  refreshGraveyard();
}

// ---------------------------------------------------------------- animation

const tweens = new Set();

function tween(duration, step) {
  return new Promise((resolve) => tweens.add({ start: performance.now(), duration, step, resolve }));
}

function runTweens(now) {
  for (const item of tweens) {
    const t = Math.min(1, Math.max(0, (now - item.start) / item.duration));
    item.step(t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    if (t === 1) {
      tweens.delete(item);
      item.resolve();
    }
  }
}

function slide(mesh, to, hop) {
  const from = mesh.position.clone();
  const target = squarePosition(to);
  const distance = from.distanceTo(target);
  mesh.userData.square = to;
  return tween(260 + distance * 65, (t) => {
    mesh.position.lerpVectors(from, target, t);
    mesh.position.y = Math.sin(t * Math.PI) * hop;
  });
}

async function animateMove(move) {
  const mover = meshes.get(move.from);
  const victimSquare = move.flag === 'ep' ? move.to + (colorOf(move.piece) === 'w' ? -8 : 8) : move.to;
  const victim = move.captured ? meshes.get(victimSquare) : null;
  meshes.delete(move.from);
  if (victim) meshes.delete(victimSquare);

  const jobs = [slide(mover, move.to, move.piece.toLowerCase() === 'n' ? 1.7 : 0.12)];
  if (move.flag === 'castle-short' || move.flag === 'castle-long') {
    const short = move.flag === 'castle-short';
    const rookFrom = short ? move.to + 1 : move.to - 2;
    const rook = meshes.get(rookFrom);
    const rookTo = short ? move.to - 1 : move.to + 1;
    meshes.delete(rookFrom);
    meshes.set(rookTo, rook);
    jobs.push(slide(rook, rookTo, 1.5));
  }
  if (victim) {
    jobs.push(tween(460, (t) => {
      const sink = Math.max(0, t - 0.4) / 0.6;
      victim.position.y = -sink * 0.9;
      victim.scale.setScalar(1 - sink * 0.85);
    }));
  }
  await Promise.all(jobs);
  if (victim) board.remove(victim);
  meshes.set(move.to, mover);
  if (move.promotion) {
    board.remove(mover);
    const piece = colorOf(move.piece) === 'w' ? move.promotion.toUpperCase() : move.promotion;
    placePiece(piece, move.to);
    const crowned = meshes.get(move.to);
    await tween(420, (t) => crowned.scale.setScalar(0.3 + 0.7 * t));
  }
}

// ---------------------------------------------------------------- camera

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 21;
controls.maxPolarAngle = Math.PI * 0.46;
controls.target.set(0, 0, 0);

let viewSide = 'w';
let cameraMoved = false;
controls.addEventListener('start', () => { cameraMoved = true; });

// Distance at which the whole board fits the current viewport shape.
const homeDistance = () => Math.min(controls.maxDistance, 13.6 * Math.max(1, 1.12 / camera.aspect));

function homeCamera() {
  const polar = 0.64;
  const distance = homeDistance();
  camera.position.set(0, Math.cos(polar) * distance, Math.sin(polar) * distance * (viewSide === 'w' ? 1 : -1));
  controls.update();
}

function turnCamera(side) {
  if (side === viewSide) return Promise.resolve();
  viewSide = side;
  const start = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const goal = side === 'w' ? 0 : Math.PI;
  let delta = goal - start.theta;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(Math.abs(delta) - Math.PI) < 0.01) delta = Math.PI;
  controls.enabled = false;
  return tween(900, (t) => {
    camera.position
      .setFromSpherical(new THREE.Spherical(start.radius, start.phi, start.theta + delta * t))
      .add(controls.target);
    camera.lookAt(controls.target);
  }).then(() => { controls.enabled = true; });
}

function resize() {
  const { clientWidth: width, clientHeight: height } = stage;
  if (!width || !height) return;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (!cameraMoved) homeCamera();
}
new ResizeObserver(resize).observe(stage);

// ---------------------------------------------------------------- dialog

const dialog = $('dialog');

// Shows a modal and resolves with the chosen value, or null if dismissed.
function ask(title, text, choices) {
  if (dialog.open) return Promise.resolve(null);
  $('dialog-title').textContent = title;
  $('dialog-text').textContent = text;
  return new Promise((resolve) => {
    let answer = null;
    $('dialog-actions').replaceChildren(...choices.map(({ label, value, glyph }) => {
      const button = document.createElement('button');
      if (glyph) {
        const icon = document.createElement('span');
        icon.className = 'glyph';
        icon.textContent = glyph;
        button.append(icon);
      }
      button.append(label);
      button.addEventListener('click', () => { answer = value; dialog.close(); });
      return button;
    }));
    dialog.addEventListener('close', () => resolve(answer), { once: true });
    dialog.showModal();
  });
}

const confirmAction = (title, text, yes, no = 'Cancel') =>
  ask(title, text, [{ label: yes, value: true }, { label: no, value: false }]);

// ---------------------------------------------------------------- panel

function resultText({ winner, reason }) {
  return winner
    ? { main: `${NAMES[winner]} wins`, detail: `by ${reason}` }
    : { main: 'Draw', detail: `by ${reason}` };
}

function renderMarks() {
  const marks = [];
  const last = game.history.at(-1);
  if (last) marks.push({ square: last.move.from, style: 'last' }, { square: last.move.to, style: 'last' });
  if (inCheck(game.state)) {
    marks.push({ square: game.state.board.indexOf(game.state.turn === 'w' ? 'K' : 'k'), style: 'check' });
  }
  if (selected >= 0) {
    marks.push({ square: selected, style: 'selected' });
    const seen = new Set();
    for (const move of game.movesFrom(selected)) {
      if (seen.has(move.to)) continue;
      seen.add(move.to);
      marks.push({ square: move.to, style: move.captured ? 'capture' : 'target' });
    }
  }
  if (hovered >= 0) marks.push({ square: hovered, style: 'hover' });
  highlights.show(marks);
}

function renderPanel() {
  const check = inCheck(game.state);
  const status = game.result
    ? resultText(game.result)
    : { main: `${NAMES[game.state.turn]} to move`, detail: check ? 'Check!' : '' };
  const claims = game.drawClaims();
  if (claims.length) status.detail = `A draw may be claimed: ${claims.join(', ')}`;
  $('status-main').textContent = status.main;
  $('status-detail').textContent = status.detail;
  $('status').classList.toggle('alert', check || Boolean(game.result));

  for (const color of ['w', 'b']) {
    $(`taken-${color}`).textContent = game.history
      .filter(({ move }) => move.captured && colorOf(move.piece) === color)
      .map(({ move }) => move.captured.toLowerCase())
      .sort((a, b) => VALUE_ORDER.indexOf(a) - VALUE_ORDER.indexOf(b))
      .map((type) => GLYPHS[type] + '︎')
      .join('');
  }

  const rows = [];
  for (const { state, san } of game.history) {
    const white = state.turn === 'w';
    if (white || !rows.length) rows.push({ number: state.fullmove, w: white ? san : '…', b: white ? '' : san });
    else rows.at(-1).b = san;
  }
  const list = $('moves');
  list.replaceChildren(...rows.map((row) => {
    const item = document.createElement('li');
    for (const [className, text] of [['number', `${row.number}.`], ['san', row.w], ['san', row.b]]) {
      const cell = document.createElement('span');
      cell.className = className;
      cell.textContent = text;
      item.append(cell);
    }
    return item;
  }));
  list.scrollTop = list.scrollHeight;

  const over = Boolean(game.result);
  const canClaim = !over && (claims.length > 0 || game.intendedDrawClaims().length > 0);
  $('undo').disabled = busy || !game.history.length;
  $('claim').disabled = busy || !canClaim;
  $('offer').disabled = busy || over;
  $('resign').disabled = busy || over;
  $('new-game').disabled = busy;
}

function render() {
  renderPanel();
  renderMarks();
}

async function announceResult() {
  if (!game.result) return;
  const { main, detail } = resultText(game.result);
  const again = await ask(main, detail, [
    { label: 'New game', value: true },
    { label: 'View board', value: false },
  ]);
  if (again) newGame();
}

// ---------------------------------------------------------------- moves

function select(square) {
  selected = square;
  renderMarks();
}

async function makeMove(from, to) {
  const options = game.movesFrom(from).filter((m) => m.to === to);
  if (!options.length) return;
  busy = true;
  renderPanel();
  let promotion = null;
  if (options[0].promotion) {
    const color = NAMES[game.state.turn];
    promotion = await ask('Promotion', `${color} pawn reaches ${squareName(to)}. Choose a piece (Esc to cancel).`,
      Object.entries(PIECE_NAMES).map(([value, label]) => ({ value, label, glyph: GLYPHS[value] + '︎' })));
    if (!promotion) {
      busy = false;
      selected = -1;
      render();
      return;
    }
  }
  const { move } = game.play(from, to, promotion);
  selected = -1;
  hovered = -1;
  render();
  await animateMove(move);
  refreshGraveyard();
  if (!game.result && $('auto-turn').checked) await turnCamera(game.state.turn);
  busy = false;
  render();
  announceResult();
}

function newGame() {
  game = new Game();
  selected = -1;
  syncPieces();
  render();
  if ($('auto-turn').checked) turnCamera('w');
}

// ---------------------------------------------------------------- input

const raycaster = new THREE.Raycaster();
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// The square under the pointer. Tall pieces can hide the square behind them,
// so a legal destination under the cursor wins over a piece in front of it.
function pickSquare(event) {
  const rect = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  ), camera);

  let onPiece = -1;
  const hit = raycaster.intersectObjects(board.children, true)[0];
  if (hit) {
    let object = hit.object;
    while (object.userData.square === undefined) object = object.parent;
    onPiece = object.userData.square;
  }

  let onBoard = -1;
  const point = raycaster.ray.intersectPlane(boardPlane, new THREE.Vector3());
  if (point) {
    const file = Math.floor(point.x + 4);
    const rank = Math.floor(4 - point.z);
    if (file >= 0 && file < 8 && rank >= 0 && rank < 8) onBoard = rank * 8 + file;
  }

  if (selected >= 0) {
    const targets = new Set(game.movesFrom(selected).map((m) => m.to));
    if (targets.has(onPiece)) return onPiece;
    if (targets.has(onBoard)) return onBoard;
  }
  return onPiece >= 0 ? onPiece : onBoard;
}

const isOwnPiece = (square) => {
  const piece = game.state.board[square];
  return Boolean(piece) && colorOf(piece) === game.state.turn && !game.result;
};

function handleSquare(square) {
  if (busy) return;
  if (selected >= 0 && game.movesFrom(selected).some((m) => m.to === square)) makeMove(selected, square);
  else if (square >= 0 && square !== selected && isOwnPiece(square)) select(square);
  else select(-1);
}

let press = null;
canvas.addEventListener('pointerdown', (event) => {
  press = event.button === 0 && event.isPrimary ? { x: event.clientX, y: event.clientY } : null;
});
canvas.addEventListener('pointerup', (event) => {
  // A drag rotates the camera; only a stationary click picks a square.
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 7) {
    handleSquare(pickSquare(event));
  }
  press = null;
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse') return;
  const square = busy || event.buttons ? -1 : pickSquare(event);
  const useful = square >= 0 && (isOwnPiece(square)
    || (selected >= 0 && game.movesFrom(selected).some((m) => m.to === square)));
  canvas.classList.toggle('pointing', useful);
  const next = useful ? square : -1;
  if (next !== hovered) {
    hovered = next;
    renderMarks();
  }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !dialog.open) select(-1);
});

$('new-game').addEventListener('click', async () => {
  if (game.history.length && !game.result
      && !(await confirmAction('New game', 'Abandon the current game?', 'Abandon'))) return;
  newGame();
});

$('undo').addEventListener('click', () => {
  game.undo();
  selected = -1;
  syncPieces();
  render();
  if ($('auto-turn').checked) turnCamera(game.state.turn);
});

$('claim').addEventListener('click', async () => {
  const [current] = game.drawClaims();
  if (current) {
    if (!(await confirmAction('Claim draw', `Claim a draw by ${current}?`, 'Claim'))) return;
    game.claimDraw(current);
  } else {
    // FIDE lets a player claim by declaring the move that will qualify.
    const options = game.intendedDrawClaims();
    const chosen = await ask('Claim draw', 'Declare a move that earns the draw:', [
      ...options.map((o) => ({ label: `${o.san} (${o.reason})`, value: o })),
      { label: 'Cancel', value: false },
    ]);
    if (!chosen) return;
    const { move } = game.play(chosen.move.from, chosen.move.to, chosen.move.promotion);
    if (!game.result) game.claimDraw(chosen.reason);
    selected = -1;
    busy = true;
    render();
    await animateMove(move);
    busy = false;
    refreshGraveyard();
  }
  selected = -1;
  render();
  announceResult();
});

$('offer').addEventListener('click', async () => {
  const offerer = game.state.turn;
  const accepted = await confirmAction('Draw offered',
    `${NAMES[offerer]} offers a draw. ${NAMES[offerer === 'w' ? 'b' : 'w']}, do you accept?`, 'Accept', 'Decline');
  if (!accepted) return;
  game.agreeDraw();
  selected = -1;
  render();
  announceResult();
});

$('resign').addEventListener('click', async () => {
  const loser = game.state.turn;
  if (!(await confirmAction('Resign', `${NAMES[loser]}, do you concede the game?`, 'Resign'))) return;
  game.resign(loser);
  selected = -1;
  render();
  announceResult();
});

$('flip').addEventListener('click', () => {
  if (controls.enabled) turnCamera(viewSide === 'w' ? 'b' : 'w');
});

$('auto-turn').addEventListener('change', (event) => {
  if (event.target.checked && controls.enabled) turnCamera(game.state.turn);
});

// ---------------------------------------------------------------- start

renderer.setAnimationLoop((now) => {
  runTweens(performance.now());
  if (controls.enabled) controls.update();
  update(now / 1000);
  highlights.pulse(now / 1000);
  renderer.render(scene, camera);
});

resize();
syncPieces();
render();

// Development-only handle for driving the board from the console.
if (import.meta.env.DEV) {
  window.chessDebug = {
    get game() { return game; },
    // Screen position of a square, for simulating real clicks.
    screenPoint(square, height = 0) {
      const v = squarePosition(square).setY(height).project(camera);
      const rect = canvas.getBoundingClientRect();
      return [rect.left + (v.x + 1) * rect.width / 2, rect.top + (1 - v.y) * rect.height / 2];
    },
    camera,
    controls,
  };
}
