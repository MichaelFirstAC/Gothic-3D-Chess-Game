// Connects the rules engine to the 3D board, the menus and what is shown over it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Game, inCheck, colorOf, squareName, applyMove, legalMoves } from './engine.js';
import { createPieceFactory } from './pieces.js';
import { createScene, createHighlights, createBestMoveArrow, squarePosition } from './scene.js';
import { createBoardView } from './boardView.js';
import { createShadowWatch } from './renderBudget.js';
import { nearestPiece } from './pick.js';
import { createAudio, resultSound } from './audio.js';
import { createReviewMode } from './reviewMode.js';
import { createKeyTracker, createKeyMotion, clampTarget } from './keyCamera.js';
import { openImportDialog } from './importDialog.js';
import { showProgress, showFailure, nextPaint, reveal } from './loading.js';
import { drawEverything, untilSmooth } from './warmup.js';
import { createShowcase } from './showcase.js';

const NAMES = { w: 'White', b: 'Black' };
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PIECE_NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
const VALUE_ORDER = 'qrbnp';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const { renderer, scene, camera, update, quality, fitResolution, setCovered } = createScene(stage);
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
  scene,
  makePiece,
  // The moments shown on the starting page are played in silence.
  sound: (name) => { if (!onMenu()) audio.play(name); },
  reducedMotion: () => motion.matches || forceReducedMotion,
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
controls.addEventListener('start', () => {
  cameraMoved = true;
  keyMotion.stop();
});

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
const back = new THREE.Vector3();
function keepInBounds() {
  const kept = clampTarget(controls.target);
  back.set(kept.x, kept.y, kept.z).sub(controls.target);
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
  keyMotion.stop();
  return tween(900, (t) => {
    camera.position
      .setFromSpherical(new THREE.Spherical(start.radius, start.phi, start.theta + delta * t))
      .add(controls.target);
    camera.lookAt(controls.target);
  }).then(() => { controls.enabled = true; });
}

let loading = true;
// Which is showing: the starting page, or the board.
const onMenu = () => document.body.dataset.screen === 'menu';
const inDialog = () => Boolean(document.querySelector('dialog[open]'));
const cameraKeys = createKeyTracker(window, () => loading || onMenu() || inDialog());

const keyMotion = createKeyMotion();

function steerFromKeys(seconds) {
  const offset = camera.position.clone().sub(controls.target);
  const next = keyMotion.step(new THREE.Spherical().setFromVector3(offset), cameraKeys, seconds, controls);
  if (!next) return;
  cameraMoved = true;
  camera.position
    .setFromSpherical(new THREE.Spherical(next.radius, next.phi, next.theta))
    .add(controls.target);
}

function resize() {
  const { clientWidth: width, clientHeight: height } = stage;
  if (!width || !height) return;
  fitResolution();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  // A tall, narrow screen takes a wider view, so that the whole board is in it.
  camera.zoom = Math.min(1, camera.aspect / 0.72);
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
      button.autofocus = value === false;
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

// ---------------------------------------------------------------- over the board

function resultText({ winner, reason }) {
  return winner
    ? { main: `${NAMES[winner]} wins`, detail: `by ${reason}` }
    : { main: 'Draw', detail: `by ${reason}` };
}

function renderMarks() {
  // On the starting page the board is not showing the game.
  if (onMenu() && showcase?.running) return;
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

// The sign of the piece that made a move, in its side's colour. It is only for
// the eye: the move's own letters already name the piece.
function pieceIcon(piece) {
  const icon = document.createElement('span');
  icon.className = `piece-icon ${colorOf(piece)}`;
  icon.setAttribute('aria-hidden', 'true');
  // The selector keeps the sign from being drawn as an emoji.
  icon.textContent = GLYPHS[piece.toLowerCase()] + '︎';
  return icon;
}

// decorate(index, san) may return an element to show in place of the plain text.
// `list` is the review panel's list unless another is named.
function renderMoveList(history, decorate = (index, san) => san, list = 'moves') {
  const rows = [];
  history.forEach(({ state, san, move }, index) => {
    const white = state.turn === 'w';
    let cell = decorate(index, san);
    if (typeof cell === 'string') {
      const text = cell;
      cell = document.createElement('span');
      cell.append(text);
    }
    cell.classList.add('ply');
    cell.prepend(pieceIcon(move.piece));
    if (white || !rows.length) rows.push({ number: state.fullmove, w: white ? cell : '…', b: white ? '' : cell });
    else rows.at(-1).b = cell;
  });
  $(list).replaceChildren(...rows.map((row) => {
    const item = document.createElement('li');
    for (const [className, content] of [['number', `${row.number}.`], ['san', row.w], ['san', row.b]]) {
      const cell = document.createElement('span');
      cell.className = className;
      cell.append(content);
      item.append(cell);
    }
    return item;
  }));
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No moves yet';
    $(list).append(empty);
  }
}

// What lies over the board during a game. Buttons that cannot be used just now
// are not shown at all.
function renderHud() {
  const check = inCheck(game.state);
  const status = game.result
    ? resultText(game.result)
    : { main: `${NAMES[game.state.turn]} to move`, detail: check ? 'Check!' : '' };
  const claims = game.drawClaims();
  if (claims.length) status.detail = `A draw may be claimed: ${claims.join(', ')}`;
  $('turn-main').textContent = status.main;
  $('turn-detail').textContent = status.detail;
  $('turn').classList.toggle('alert', check || Boolean(game.result));

  for (const color of ['w', 'b']) {
    $(`taken-${color}`).textContent = game.history
      .filter(({ move }) => move.captured && colorOf(move.piece) === color)
      .map(({ move }) => move.captured.toLowerCase())
      .sort((a, b) => VALUE_ORDER.indexOf(a) - VALUE_ORDER.indexOf(b))
      .map((type) => GLYPHS[type] + '︎')
      .join('');
  }

  renderMoveList(game.history, undefined, 'history');
  $('history').scrollTop = $('history').scrollHeight;

  const over = Boolean(game.result);
  const canClaim = !over && (claims.length > 0 || game.intendedDrawClaims().length > 0);
  $('claim').hidden = !canClaim;
  $('offer').hidden = $('resign').hidden = over;
  $('after-game').hidden = !over;
  $('undo').hidden = !game.history.length;
  for (const id of ['undo', 'claim', 'offer', 'resign', 'new-game', 'review']) $(id).disabled = busy;
}

function render() {
  renderHud();
  renderMarks();
}

async function announceResult() {
  if (!game.result) return;
  const { main, detail } = resultText(game.result);
  const choice = await ask(main, detail, [
    { label: 'Inquisition', value: 'review' },
    { label: 'New game', value: 'new' },
    { label: 'View board', value: 'stay' },
    { label: 'Main menu', value: 'menu' },
  ]);
  if (choice === 'new') newGame();
  if (choice === 'menu') showMenu();
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
    const side = sideBeforeImport;
    sideBeforeImport = null;
    // Back to wherever the review was asked for.
    if (reviewFromMenu) {
      if (side) viewSide = side;
      cameraMoved = false;
      showMenu();
    } else if (side) turnCamera(side);
    reviewFromMenu = false;
  },
});

let sideBeforeImport = null;
let reviewFromMenu = false;

// Reviews a game fetched by username, seen from that player's side of the board.
async function importGame() {
  if (busy || review.active) return;
  const record = await openImportDialog();
  if (!record || busy || review.active) return;
  reviewFromMenu = onMenu();
  showBoard();
  selected = hovered = -1;
  canvas.classList.remove('pointing');
  sideBeforeImport = viewSide;
  review.open(record);
  if (record.side) turnCamera(record.side);
}

function reviewCurrentGame() {
  if (busy || review.active) return;
  reviewFromMenu = onMenu();
  showBoard();
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
  renderHud();
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
  if (game === finished && game.history.length === moves && !busy && !review.active && !onMenu()) {
    announceResult();
  }
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

  // Against simple stand-ins for the pieces: this runs as the mouse moves.
  const onPiece = nearestPiece(raycaster.ray, boardView.pieces.children)?.userData.square ?? -1;

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
// A mouse can report far more often than the screen is drawn, so only its
// latest place is looked at, once a frame.
let pointed = null;
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse' || review.active) return;
  const waiting = pointed !== null;
  pointed = { clientX: event.clientX, clientY: event.clientY, buttons: event.buttons };
  if (!waiting) requestAnimationFrame(markPointed);
});
function markPointed() {
  const at = pointed;
  pointed = null;
  if (!at || review.active) return;
  const square = busy || at.buttons ? -1 : pickSquare(at);
  const useful = square >= 0 && (isOwnPiece(square)
    || (selected >= 0 && game.movesFrom(selected).some((m) => m.to === square)));
  canvas.classList.toggle('pointing', useful);
  const next = useful ? square : -1;
  if (next !== hovered) {
    hovered = next;
    renderMarks();
  }
}
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !inDialog() && !review.active) select(-1);
});

$('new-game').addEventListener('click', () => { if (!busy) newGame(); });

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

$('show-moves').addEventListener('click', () => {
  const list = $('history');
  list.hidden = !list.hidden;
  $('show-moves').setAttribute('aria-expanded', String(!list.hidden));
  list.scrollTop = list.scrollHeight;
});

// ---------------------------------------------------------------- menus

const unfinished = () => game.history.length > 0 && !game.result;

function showMenu() {
  selected = hovered = -1;
  canvas.classList.remove('pointing');
  render();
  keepView();
  // A game left half way can be taken up again.
  $('menu-resume').hidden = !unfinished();
  $('menu-play').textContent = unfinished() ? 'New game' : 'Play';
  $('menu-play').classList.toggle('primary', !unfinished());
  document.body.dataset.screen = 'menu';
  cameraKeys.clear();
  (unfinished() ? $('menu-resume') : $('menu-play')).focus();
}

function showBoard() {
  const leaving = onMenu();
  document.body.dataset.screen = 'board';
  document.activeElement?.blur();
  if (leaving) endShowcase();
}

// The player's own view, kept while the starting page borrows the camera.
let kept = null;
function keepView() {
  if (!onMenu()) kept = { position: camera.position.clone(), target: controls.target.clone() };
}

// Puts the board and the camera back as the player left them.
function endShowcase() {
  showcase.stop();
  setCovered(0, 0);
  syncPieces();
  render();
  resize();
  if (cameraMoved && kept) {
    controls.target.copy(kept.target);
    camera.position.copy(kept.position);
    controls.update();
  } else homeCamera();
}

$('menu-resume').addEventListener('click', showBoard);
$('menu-play').addEventListener('click', async () => {
  if (unfinished()
      && !(await confirmAction('New game', 'Abandon the game in progress?', 'Abandon'))) return;
  // A move still being made is left to finish before the board is cleared.
  if (busy) return;
  showBoard();
  if (game.history.length) newGame();
});
$('menu-review').addEventListener('click', async () => {
  if (!game.history.length) {
    importGame();
    return;
  }
  const choice = await ask('Review', 'Which game shall the Inquisition judge?', [
    { label: 'The last one played here', value: 'last' },
    { label: 'Import a game', value: 'import' },
    { label: 'Cancel', value: false },
  ]);
  if (choice === 'last') reviewCurrentGame();
  if (choice === 'import') importGame();
});

const settings = $('settings');
function openSettings() {
  if (settings.open) return;
  $('to-menu').hidden = onMenu();
  settings.showModal();
}
$('open-settings').addEventListener('click', openSettings);
$('menu-settings').addEventListener('click', openSettings);
$('settings-done').addEventListener('click', () => settings.close());
$('to-menu').addEventListener('click', () => {
  settings.close();
  if (review.active) {
    reviewFromMenu = true;
    review.close();
  } else showMenu();
});

$('auto-turn').addEventListener('change', (event) => {
  if (event.target.checked && controls.enabled) turnCamera(game.state.turn);
});

// ---------------------------------------------------------------- showcase

// How much of the stage the menu covers, as [left, bottom] in pixels.
function menuCover() {
  const box = $('menu').getBoundingClientRect();
  return box.width < stage.clientWidth * 0.75 ? [box.width, 0] : [0, box.height];
}

const showcase = createShowcase({
  sync: (state, history) => boardView.sync(state, history),
  animate: (move, history) => boardView.animateMove(move, history),
  mark: (marks) => highlights.show(marks),
  camera({ azimuth, polar, distance }) {
    const [left, bottom] = menuCover();
    setCovered(left, bottom);
    // Far enough back for the board to fit in what the menu leaves free.
    const width = Math.max(1, stage.clientWidth - left);
    const height = Math.max(1, stage.clientHeight - bottom);
    // On a tall screen the width of the whole stage is the limit.
    const zoom = Math.min(0.9 * Math.min(1, width / height / 0.95, height / stage.clientHeight + 0.12),
      camera.aspect / 0.8);
    if (Math.abs(camera.zoom - zoom) > 0.001) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    const far = Math.min(controls.maxDistance, Math.max(20, 15.5 / Math.min(1.4, width / height)));
    camera.position.setFromSpherical(new THREE.Spherical(far * distance, polar, azimuth));
    camera.lookAt(0, 0, 0);
  },
  caption(details) {
    const box = $('moment');
    box.hidden = !details;
    if (!details) return;
    for (const part of ['title', 'who', 'note']) box.querySelector(`.moment-${part}`).textContent = details[part];
    // The move is named once it has been made.
    box.querySelector('.moment-move').textContent = details.played ? details.move : '\u00a0';
  },
  veil: (dark) => $('veil').classList.toggle('dark', dark),
}, { reducedMotion: () => motion.matches || forceReducedMotion });

// ---------------------------------------------------------------- audio

// Browsers only allow sound after the viewer has clicked or pressed a key.
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => audio.unlock(), { capture: true });
}
document.addEventListener('click', (event) => {
  if (event.target.closest?.('button')) audio.play('click');
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

const shadowsChanged = createShadowWatch(boardView.casters);
let lastFrame = 0;
function drawFrame(now) {
  const elapsed = lastFrame ? now - lastFrame : 0;
  lastFrame = now;
  runTweens(performance.now());
  boardView.update(elapsed / 1000);
  if (onMenu()) {
    // A move still being made in the game is let finish before the board is
    // borrowed.
    if (!busy) {
      // Time does not pass for it until it can be seen.
      if (showcase.running) showcase.update(loading ? 0 : elapsed / 1000);
      else showcase.start();
    }
  } else if (controls.enabled) {
    // A long gap between frames must not fling the camera.
    steerFromKeys(Math.min(elapsed, 50) / 1000);
    controls.update();
    keepInBounds();
  }
  update(now / 1000, elapsed);
  highlights.pulse(now / 1000);
  bestArrow.pulse(now / 1000);
  if (shadowsChanged(boardView.timeline.size > 0)) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}

resize();
syncPieces();
render();

// Gets the capture effects ready, and with them every shader and mesh, so that
// nothing is left to stall on once the loading screen has gone.
async function warmUp() {
  showProgress('Raising the vaults…', 0.45);
  await nextPaint();
  // The markers and the arrow are only made when first shown.
  highlights.show(['selected', 'last', 'hover', 'target', 'capture', 'check', 'played']
    .map((style, square) => ({ square, style })));
  bestArrow.show({ from: 1, to: 18 });
  try {
    await renderer.compileAsync(scene, camera);
    showProgress('Lighting the candles…', 0.65);
    await nextPaint();
    drawEverything(renderer, scene, camera);
  } finally {
    bestArrow.show(null);
    render();
  }
  try {
    await boardView.prepare(renderer, camera);
  } catch (error) {
    console.warn('Effects could not be prepared early:', error);
  }
}

const prepared = warmUp().catch((error) => console.warn('Warm-up was cut short:', error));

// Runs behind the loading screen until the frame rate is steady.
const ready = prepared.then(async () => {
  showProgress('Letting the dust settle…', 0.85);
  quality.hurry(true);
  renderer.setAnimationLoop(drawFrame);
  await untilSmooth({ ready: () => quality.settled });
  quality.hurry(false);
  await reveal();
  loading = false;
}).catch((error) => {
  showFailure();
  throw error;
});

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
    ready: () => ready,
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
    showcase,
    quality,
    info: () => ({ ...renderer.info.render, geometries: renderer.info.memory.geometries }),
  };
}
