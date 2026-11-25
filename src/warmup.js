// Everything that would otherwise stutter in the first moments of play, done
// while the loading screen is still up.
import { createSettleWatch } from './settle.js';

// Draws the whole scene once with nothing culled or hidden, so every shader,
// texture and mesh is on the graphics card before the camera first turns to it.
export function drawEverything(renderer, scene, camera) {
  const restore = [];
  scene.traverse((object) => {
    const { visible, frustumCulled } = object;
    restore.push(() => Object.assign(object, { visible, frustumCulled }));
    object.visible = true;
    object.frustumCulled = false;
  });
  try {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  } finally {
    for (const undo of restore) undo();
    // Draw the shadows once more without what was only shown for this.
    renderer.shadowMap.needsUpdate = true;
  }
}

// Resolves once frames come steadily and `ready()` agrees, or after `limit`
// milliseconds whatever happens. The timer also covers a hidden tab, where no
// frames are drawn at all.
export function untilSmooth({ ready = () => true, limit = 8000 } = {}) {
  return new Promise((resolve) => {
    const watch = createSettleWatch();
    let last = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, limit);
    const frame = (now) => {
      if (done) return;
      const steady = last > 0 && watch.frame(now - last);
      last = now;
      if (steady && ready()) finish();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
