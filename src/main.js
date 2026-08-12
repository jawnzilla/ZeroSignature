import { Game } from './Game.js';
import { initAudio } from './systems/Audio.js';
import './style.css';

// --- error capture for diagnosis ---
window.__err = null;
window.addEventListener('error', e => {
  window.__err = (e.error && (e.error.stack || e.error.message)) || e.message || String(e);
  console.error('[GAME ERROR]', window.__err);
});
window.addEventListener('unhandledrejection', e => {
  const r = (e.reason && (e.reason.stack || e.reason.message)) || String(e.reason);
  window.__err = 'REJECTION: ' + r;
  console.error('[UNHANDLED REJECTION]', r);
});

const container = document.getElementById('app');
const boot = document.getElementById('boot');
window.addEventListener('click', () => initAudio(), { once: true });

function start() {
  if (!boot.classList.contains('done')) {
    boot.classList.add('done');
  }
  initAudio();
  window.game = window.game || new Game(container);
}
boot.addEventListener('click', start);
// Clicking the canvas (after boot) also (re)locks pointer.
container.addEventListener('click', () => { if (boot.classList.contains('done')) initAudio(); });
