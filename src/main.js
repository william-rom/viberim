import './logCapture.js';
import { Game } from './core/Game.js';

const game = new Game();
window.__game = game; // expose for debugging
game.init().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Failed to load: ' + err.message;
});
