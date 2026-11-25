// Camera control from the keyboard: A/D turn around the board, W/S tilt, and
// Q/E zoom out and in. Held keys move the camera smoothly.

// Physical key positions, so the layout matches on AZERTY and other keyboards.
export const KEY_ACTIONS = {
  KeyA: ['theta', -1],
  KeyD: ['theta', 1],
  KeyW: ['phi', -1], // look more from above
  KeyS: ['phi', 1], // drop toward eye level
  KeyQ: ['zoom', 1], // farther away
  KeyE: ['zoom', -1], // closer
};

const TURN_SPEED = 1.7; // radians per second
const TILT_SPEED = 0.9;
const ZOOM_SPEED = 1.1; // distance changes by this factor's natural log per second
const MIN_TILT = 0.05; // just short of straight down

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Moves { radius, phi, theta } by the held keys over `seconds`, within limits.
export function steerCamera({ radius, phi, theta }, held, seconds, { minDistance, maxDistance, maxPolarAngle }) {
  const push = { theta: 0, phi: 0, zoom: 0 };
  for (const code of held) {
    const action = KEY_ACTIONS[code];
    if (action) push[action[0]] += action[1];
  }
  return {
    theta: theta + push.theta * TURN_SPEED * seconds,
    phi: clamp(phi + push.phi * TILT_SPEED * seconds, MIN_TILT, maxPolarAngle),
    radius: clamp(radius * Math.exp(push.zoom * ZOOM_SPEED * seconds), minDistance, maxDistance),
  };
}

// Panning may move the point the camera circles only this far. With the tilt
// limit, that keeps the camera above the top of the pillar and inside the walls.
export const PAN_LIMIT = { radius: 3, minY: 0, maxY: 3 };

// Where the camera's target { x, y, z } is allowed to be.
export function clampTarget({ x, y, z }, { radius, minY, maxY } = PAN_LIMIT) {
  const out = Math.hypot(x, z);
  const keep = out > radius ? radius / out : 1;
  return { x: x * keep, y: clamp(y, minY, maxY), z: z * keep };
}

// True when a key press belongs to something else, such as typing a username.
export function isTyping(target) {
  if (!target) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(target.type);
}

// Tracks which camera keys are held. blocked() returns true while the keyboard
// should be ignored, for instance when a dialog is open.
export function createKeyTracker(target, blocked = () => false) {
  const held = new Set();
  target.addEventListener('keydown', (event) => {
    if (!KEY_ACTIONS[event.code] || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTyping(event.target) || blocked()) return;
    event.preventDefault();
    held.add(event.code);
  });
  target.addEventListener('keyup', (event) => held.delete(event.code));
  // A key released while the window is elsewhere never reports it.
  target.addEventListener('blur', () => held.clear());
  return held;
}
