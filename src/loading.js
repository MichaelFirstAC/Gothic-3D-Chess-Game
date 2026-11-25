// The loading screen. Its markup and styles are in index.html, so that it shows
// before any of this code has arrived.

// Shortest time it stays up, so that it never just flashes past.
const MINIMUM = 2500;

// `progress` runs from 0 to 1.
export function showProgress(message, progress) {
  const screen = document.getElementById('loading');
  if (!screen) return;
  screen.querySelector('.loading-text').textContent = message;
  screen.querySelector('.loading-bar i').style.transform = `scaleX(${progress})`;
}

// Lets the browser paint what has just changed before more work starts. The
// timer is for hidden tabs, which never paint.
export const nextPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => setTimeout(resolve, 0));
  setTimeout(resolve, 120);
});

// Fades the screen away and hands over the page.
export async function reveal() {
  const screen = document.getElementById('loading');
  if (!screen) return;
  // performance.now() counts from when the page began to load.
  const wait = MINIMUM - performance.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  showProgress('Enter', 1);
  for (const element of document.querySelectorAll('[inert]')) element.inert = false;
  performance.mark('revealed');
  screen.classList.add('done');
  setTimeout(() => screen.remove(), 1100);
}

export function showFailure() {
  const screen = document.getElementById('loading');
  if (!screen) return;
  screen.classList.add('failed');
  screen.querySelector('.loading-text').textContent =
    'The cathedral could not be raised. Reload the page, or try a browser with WebGL turned on.';
}
