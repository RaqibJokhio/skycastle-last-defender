import Phaser from 'phaser'
import './style.css'
import BootScene from './scenes/BootScene.js'

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game',
  backgroundColor: '#0d0f1a',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 800 },
      debug: false,
    },
  },
  scene: [BootScene],
}

const game = new Phaser.Game(config)

// Dev-only handle so the running game can be poked from the browser console
// (or an automated check). Stripped from production builds by Vite.
if (import.meta.env.DEV) {
  window.game = game
}

export default game
