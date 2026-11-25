// Connects the rules engine to the 3D board and the side panel.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Game, inCheck, colorOf, squareName, applyMove, legalMoves } from './engine.js';
import { createPieceFactory } from './pieces.js';
import { createScene, createHighlights, createBestMoveArrow, squarePosition } from './scene.js';
import { createBoardView } from './boardView.js';
import { createAudio, resultSound } from './audio.js';
import { createReviewMode } from './reviewMode.js';
import { createKeyTracker, steerCamera, clampTarget } from './keyCamera.js';
import { openImportDialog } from './importDialog.js';

const NAMES = { w: 'White', b: 'Black' };
const GLYPHS = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PIECE_NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
const VALUE_ORDER = 'qrbnp';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const { renderer, scene, camera, update, quality } = createScene(stage);
const highlights = createHighlights(scene);
const bestArrow = createBestMoveArrow(scene);
const makePiece = createPieceFactory();
const canvas = renderer.domElement;

let game = new Game();
let selected = -1;
let hovered = -1;
let busy = false; // true while a piece is moving or a promotion is being chosen

// ---------------------------------------------------------------- pieces

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let forceReducedMotion = false; // development aid
const audio = createAudio();
const boardView = createBoardView({
  scene, makePiece, sound: (name) => audio.play(name), reducedMotion: () => motion.matches || forceReducedMotion,
});

const syncPieces = (state = game.state, history = game.history) => boardView.sync(state, history);

// ---------------------------------------------------------------- camera moves

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

// ---------------------------------------------------------------- camera

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 21;
// Low enough to look past the rim into the drop, but never under the top.
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0, 0);

let viewSide = 'w';
let cameraMoved = false;
controls.addEventListener('start', () => { cameraMoved = true; });

// Far enough back to show the board on its pillar with the candles at its
// corners, and farther still where a narrow viewport needs it for the width.
const homeDistance = () => Math.min(controls.maxDistance, Math.max(20, 13.6 * (1.12 / camera.aspect)));

function homeCamera() {
  const polar = 0.98;
  const distance = homeDistance();
  controls.target.set(0, 0, 0);
  camera.position.set(0, Math.cos(polar) * distance, Math.sin(polar) * distance * (viewSide === 'w' ? 1 : -1));
  controls.update();
}

// Applied after every camera move, so panning stays within bounds.
function keepInBounds() {
  const kept = clampTarget(controls.target);
  const back = new THREE.Vector3(kept.x, kept.y, kept.z).sub(controls.target);
  if (back.lengthSq() === 0) return;
  controls.target.add(back);
  camera.position.add(back);
  camera.lookAt(controls.target);
}

function turnCamera(side) {
  if (side === viewSide) return Promise.resolve();
  viewSide = side;
  $('eval-bar').classList.toggle('flipped', side === 'b');
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

const cameraKeys = createKeyTracker(window, () => $('dialog').open);

function steerFromKeys(seconds) {
  if (!cameraKeys.size) return;
  cameraMoved = true;
  const offset = camera.position.clone().sub(controls.target);
  const next = steerCamera(new THREE.Spherical().setFromVector3(offset), cameraKeys, seconds, controls);
  camera.position
    .setFromSpherical(new THREE.Spherical(next.radius, next.phi, next.theta))
    .add(controls.target);
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
  $('dialog-body').replaceChildren();
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

// decorate(index, san) may return an element to show in place of the plain text.
function renderMoveList(history, decorate = (index, san) => san) {
  const rows = [];
  history.forEach(({ state, san }, index) => {
    const white = state.turn === 'w';
    const cell = decorate(index, san);
    if (white || !rows.length) rows.push({ number: state.fullmove, w: white ? cell : '…', b: white ? '' : cell });
    else rows.at(-1).b = cell;
  });
  $('moves').replaceChildren(...rows.map((row) => {
    const item = document.createElement('li');
    for (const [className, content] of [['number', `${row.number}.`], ['san', row.w], ['san', row.b]]) {
      const cell = document.createElement('span');
      cell.className = className;
      cell.append(content);
      item.append(cell);
    }
    return item;
  }));
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

  renderMoveList(game.history);
  $('moves').scrollTop = $('moves').scrollHeight;

  const over = Boolean(game.result);
  const canClaim = !over && (claims.length > 0 || game.intendedDrawClaims().length > 0);
  $('undo').disabled = busy || !game.history.length;
  $('claim').disabled = busy || !canClaim;
  $('offer').disabled = busy || over;
  $('resign').disabled = busy || over;
  $('new-game').disabled = busy;
  $('review').disabled = busy || !game.history.length;
  $('import').disabled = busy;
}

function render() {
  renderPanel();
  renderMarks();
}

async function announceResult() {
  if (!game.result) return;
  const { main, detail } = resultText(game.result);
  const choice = await ask(main, detail, [
    { label: 'Inquisition', value: 'review' },
    { label: 'New game', value: 'new' },
    { label: 'View board', value: 'stay' },
  ]);
  if (choice === 'new') newGame();
  if (choice === 'review') reviewCurrentGame();
}

// ---------------------------------------------------------------- review

const review = createReviewMode({
  sync: syncPieces,
  async animate(move, history) {
    const version = boardView.version;
    await boardView.animateMove(move, history);
    if (version !== boardView.version) return;
    const after = applyMove(history.at(-1).state, move);
    if (inCheck(after)) audio.play(legalMoves(after).length ? 'check' : 'checkmate');
  },
  unanimate: (entry, history) => boardView.animateUndo(entry, history),
  mark: (marks) => highlights.show(marks),
  arrow: (move) => bestArrow.show(move),
  moveList: renderMoveList,
  // Back to the live game, exactly as it was left.
  exit() {
    syncPieces();
    render();
    if (sideBeforeImport) turnCamera(sideBeforeImport);
    sideBeforeImport = null;
  },
});

let sideBeforeImport = null;

// Reviews a game fetched by username, seen from that player's side of the board.
async function importGame() {
  if (busy || review.active) return;
  const record = await openImportDialog();
  if (!record || busy || review.active) return;
  selected = hovered = -1;
  canvas.classList.remove('pointing');
  sideBeforeImport = viewSide;
  review.open(record);
  if (record.side) turnCamera(record.side);
}

function reviewCurrentGame() {
  if (busy || review.active) return;
  selected = hovered = -1;
  canvas.classList.remove('pointing');
  review.open({
    history: game.history.slice(),
    finalState: game.state,
    result: game.result,
    title: game.result ? 'Judging the finished game' : 'Judging the game so far',
    resultText: game.result && `${resultText(game.result).main} ${resultText(game.result).detail}`,
  });
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
  const { settled } = await boardView.animateMove(move, game.history);
  soundVerdict();
  if (!game.result && $('auto-turn').checked) await turnCamera(game.state.turn);
  busy = false;
  render();
  await announceAfter(settled);
}

function soundVerdict() {
  if (game.result) audio.play(resultSound(game.result));
  else if (inCheck(game.state)) audio.play('check');
}

// A game that ends on a capture waits for the pieces to settle before the dialog.
async function announceAfter(settled) {
  const finished = game;
  const moves = game.history.length;
  await settled;
  if (game === finished && game.history.length === moves && !busy && !review.active) announceResult();
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
  const hit = raycaster.intersectObjects(boardView.pieces.children, true)[0];
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
  if (busy || review.active) return;
  if (selected >= 0 && game.movesFrom(selected).some((m) => m.to === square)) {
    makeMove(selected, square);
  } else if (square >= 0 && square !== selected && isOwnPiece(square)) {
    audio.play('select');
    select(square);
  } else {
    // A thud for trying something the rules do not allow.
    const triedToMove = selected >= 0 && square >= 0 && square !== selected;
    const touchedEnemy = square >= 0 && square !== selected && Boolean(game.state.board[square]) && !game.result;
    if (triedToMove || touchedEnemy) audio.play('illegal');
    select(-1);
  }
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
  if (event.pointerType !== 'mouse' || review.active) return;
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
  if (event.key === 'Escape' && !dialog.open && !review.active) select(-1);
});

$('new-game').addEventListener('click', async () => {
  if (game.history.length && !game.result
      && !(await confirmAction('New game', 'Abandon the current game?', 'Abandon'))) return;
  newGame();
});

// Take-back plays the move in reverse. Clicks made while it runs are ignored.
$('undo').addEventListener('click', async () => {
  if (busy || review.active) return;
  const taken = game.undo();
  selected = hovered = -1;
  if (!taken) {
    render();
    return;
  }
  busy = true;
  render();
  await boardView.animateUndo(taken, game.history);
  // A safety net: whatever the animation did, the board ends up exact.
  syncPieces();
  busy = false;
  render();
  if ($('auto-turn').checked) turnCamera(game.state.turn);
});

$('claim').addEventListener('click', async () => {
  const [current] = game.drawClaims();
  if (current) {
    if (!(await confirmAction('Claim draw', `Claim a draw by ${current}?`, 'Claim'))) return;
    game.claimDraw(current);
    soundVerdict();
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
    const { settled } = await boardView.animateMove(move, game.history);
    soundVerdict();
    busy = false;
    render();
    await announceAfter(settled);
    return;
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
  soundVerdict();
  selected = -1;
  render();
  announceResult();
});

$('resign').addEventListener('click', async () => {
  const loser = game.state.turn;
  if (!(await confirmAction('Resign', `${NAMES[loser]}, do you concede the game?`, 'Resign'))) return;
  game.resign(loser);
  soundVerdict();
  selected = -1;
  render();
  announceResult();
});

const flipBoard = () => {
  if (controls.enabled) turnCamera(viewSide === 'w' ? 'b' : 'w');
};
$('flip').addEventListener('click', flipBoard);
$('review-flip').addEventListener('click', flipBoard);
$('review').addEventListener('click', reviewCurrentGame);
$('import').addEventListener('click', importGame);

$('auto-turn').addEventListener('change', (event) => {
  if (event.target.checked && controls.enabled) turnCamera(game.state.turn);
});

// ---------------------------------------------------------------- audio

// Browsers only allow sound after the viewer has clicked or pressed a key.
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => audio.unlock(), { capture: true });
}
document.addEventListener('click', (event) => {
  if (event.target.closest?.('#panel button, #dialog button')) audio.play('click');
});

$('sound-mute').checked = audio.settings.muted;
$('sound-volume').value = Math.round(audio.settings.volume * 100);
$('sound-mute').addEventListener('change', (event) => audio.set({ muted: event.target.checked }));
$('sound-volume').addEventListener('input', (event) => audio.set({ volume: event.target.value / 100 }));
$('sound-volume').addEventListener('change', () => audio.play('place'));

$('music-on').checked = audio.settings.music;
$('music-volume').value = Math.round(audio.settings.musicVolume * 100);
$('music-on').addEventListener('change', (event) => {
  audio.unlock();
  audio.set({ music: event.target.checked });
});
$('music-volume').addEventListener('input', (event) => audio.set({ musicVolume: event.target.value / 100 }));

// ---------------------------------------------------------------- start

let lastFrame = 0;
renderer.setAnimationLoop((now) => {
  const elapsed = lastFrame ? now - lastFrame : 0;
  lastFrame = now;
  runTweens(performance.now());
  boardView.update(elapsed / 1000);
  if (controls.enabled) {
    // A long gap between frames must not fling the camera.
    steerFromKeys(Math.min(elapsed, 50) / 1000);
    controls.update();
    keepInBounds();
  }
  update(now / 1000, elapsed);
  highlights.pulse(now / 1000);
  bestArrow.pulse(now / 1000);
  renderer.render(scene, camera);
});

resize();
syncPieces();
render();
// After the first frames, get the capture effects ready.
const prepared = new Promise((resolve) => setTimeout(resolve, 150))
  .then(() => boardView.prepare(renderer, camera))
  .catch((error) => console.warn('Effects could not be prepared early:', error));

// Development-only handle for driving the board from the console.
if (import.meta.env.DEV) {
  window.chessDebug = {
    get game() { return game; },
    review,
    // True when the pieces on screen match `state` (and the graveyard matches
    // `history`) exactly, with no strays.
    boardMatches: (state, history) => boardView.matches(state, history),
    boardView,
    audio,
    renderer,
    renderNow: () => renderer.render(scene, camera),
    prepared: () => prepared,
    move: (from, to) => makeMove(from, to),
    reduceMotion: (value) => { forceReducedMotion = value; },
    // Screen position of a square, for simulating real clicks.
    screenPoint(square, height = 0) {
      const v = squarePosition(square).setY(height).project(camera);
      const rect = canvas.getBoundingClientRect();
      return [rect.left + (v.x + 1) * rect.width / 2, rect.top + (1 - v.y) * rect.height / 2];
    },
    camera,
    controls,
    arrow: bestArrow,
    quality,
    info: () => ({ ...renderer.info.render, geometries: renderer.info.memory.geometries }),
  };
}
