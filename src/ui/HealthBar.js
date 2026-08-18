import Phaser from 'phaser'

const PAD = 3
const DEPTH = 1000

const COLOR_HEALTHY = 0x46d17b
const COLOR_WARN = 0xe0b341
const COLOR_CRITICAL = 0xdc4b4b

/**
 * A bordered bar pinned to the camera (scrollFactor 0), so it stays put once
 * the camera starts following the player in a later step.
 */
export default class HealthBar {
  constructor(scene, x, y, width, height, label = 'KAI') {
    this.label = label
    this.maxFillWidth = width - PAD * 2
    this.fillHeight = height - PAD * 2

    this.bg = scene.add
      .rectangle(x, y, width, height, 0x0b0d16, 0.85)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x8fa3c8)

    this.fill = scene.add
      .rectangle(x + PAD, y + PAD, this.maxFillWidth, this.fillHeight, COLOR_HEALTHY)
      .setOrigin(0, 0)

    this.text = scene.add
      .text(x, y + height + 5, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#9fb3d9',
      })
      .setOrigin(0, 0)

    for (const obj of [this.bg, this.fill, this.text]) {
      obj.setScrollFactor(0).setDepth(DEPTH)
    }
  }

  setValue(current, max) {
    const ratio = Phaser.Math.Clamp(current / max, 0, 1)

    this.fill.setVisible(ratio > 0)
    if (ratio > 0) {
      this.fill.setSize(this.maxFillWidth * ratio, this.fillHeight)
    }

    const color = ratio > 0.5 ? COLOR_HEALTHY : ratio > 0.25 ? COLOR_WARN : COLOR_CRITICAL
    this.fill.setFillStyle(color)
    this.text.setText(`${this.label}  ${Math.ceil(current)} / ${max}`)
  }

  destroy() {
    this.bg.destroy()
    this.fill.destroy()
    this.text.destroy()
  }
}
