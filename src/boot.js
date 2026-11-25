// Starts the game only after the loading screen is on screen. Building the scene
// keeps the browser busy for several seconds, during which it cannot paint.
import { nextPaint, showFailure, showProgress } from './loading.js';

showProgress('Quarrying the stone…', 0.15);
await nextPaint();
try {
  await import('./main.js');
} catch (error) {
  showFailure();
  throw error;
}
