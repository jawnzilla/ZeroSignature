import { Game } from './Game.js';
import { initAudio } from './systems/Audio.js';
import './style.css';

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
