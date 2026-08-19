import Phaser from 'phaser'

const BOX_H = 108
const SIDE_MARGIN = 90
const BOTTOM_MARGIN = 18
const DEPTH = 1100

const TYPE_MS = 20 // per character
const HOLD_MS = 1900 // after the line is fully revealed, before auto-advance
const INPUT_LOCKOUT_MS = 250 // stops one keypress blowing through two lines

// Bit is the friendly voice in the room; OVERRIDE is the castle speakers.
const STYLES = {
  BIT: { accent: 0x5fe3d0, accentHex: '#5fe3d0', body: '#dff7f3' },
  OVERRIDE: { accent: 0xff4d4d, accentHex: '#ff6b6b', body: '#ffdede' },
}
const DEFAULT_STYLE = STYLES.BIT

/**
 * Queued, typewriter dialogue pinned to the camera. Non-blocking on purpose --
 * the game keeps running underneath, so a line can play while Kai is moving and
 * a story beat never freezes combat.
 */
export default class DialogueBox {
  constructor(scene) {
    this.scene = scene
    this.queue = []
    this.active = false
    this.onDone = null
    this.line = null
    this.fullText = ''
    this.typeEvent = null
    this.holdEvent = null
    this.shownAt = 0

    const w = scene.scale.width - SIDE_MARGIN * 2
    const y = scene.scale.height - BOTTOM_MARGIN - BOX_H

    this.bg = scene.add
      .rectangle(SIDE_MARGIN, y, w, BOX_H, 0x080a12, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, DEFAULT_STYLE.accent)

    this.accentBar = scene.add
      .rectangle(SIDE_MARGIN, y, 5, BOX_H, DEFAULT_STYLE.accent)
      .setOrigin(0, 0)

    this.nameText = scene.add
      .text(SIDE_MARGIN + 20, y + 12, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: DEFAULT_STYLE.accentHex,
      })
      .setOrigin(0, 0)

    this.bodyText = scene.add
      .text(SIDE_MARGIN + 20, y + 40, '', {
        fontFamily: 'monospace',
        fontSize: '19px',
        color: DEFAULT_STYLE.body,
        wordWrap: { width: w - 40 },
      })
      .setOrigin(0, 0)

    this.hintText = scene.add
      .text(SIDE_MARGIN + w - 16, y + BOX_H - 22, 'any key', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#6b7a99',
      })
      .setOrigin(1, 0)

    this.parts = [this.bg, this.accentBar, this.nameText, this.bodyText, this.hintText]
    for (const p of this.parts) p.setScrollFactor(0).setDepth(DEPTH).setVisible(false)

    this.keyHandler = () => this.onKey()
    scene.input.keyboard.on('keydown', this.keyHandler)
  }

  /** showDialogue([{ speaker, text }, ...]); onDone fires when the queue drains. */
  show(lines, onDone = null) {
    this.queue.push(...lines)
    if (onDone) this.onDone = onDone
    if (!this.active) this.advance()
  }

  get isTyping() {
    return this.bodyText.text.length < this.fullText.length
  }

  onKey() {
    if (!this.active) return
    if (this.scene.time.now - this.shownAt < INPUT_LOCKOUT_MS) return
    // First press finishes the reveal, second moves on -- the usual contract.
    if (this.isTyping) this.revealAll()
    else this.advance()
  }

  advance() {
    this.clearTimers()

    const next = this.queue.shift()
    if (!next) {
      this.hide()
      return
    }

    this.active = true
    this.line = next
    this.fullText = next.text
    this.shownAt = this.scene.time.now

    const style = STYLES[next.speaker] ?? DEFAULT_STYLE
    this.bg.setStrokeStyle(2, style.accent)
    this.accentBar.setFillStyle(style.accent)
    this.nameText.setColor(style.accentHex).setText(next.speaker)
    this.bodyText.setColor(style.body).setText('')

    for (const p of this.parts) p.setVisible(true)

    this.typeEvent = this.scene.time.addEvent({
      delay: TYPE_MS,
      repeat: this.fullText.length - 1,
      callback: () => {
        this.bodyText.setText(this.fullText.slice(0, this.bodyText.text.length + 1))
        if (!this.isTyping) this.scheduleAutoAdvance()
      },
    })
  }

  revealAll() {
    this.typeEvent?.remove()
    this.typeEvent = null
    this.bodyText.setText(this.fullText)
    this.scheduleAutoAdvance()
  }

  scheduleAutoAdvance() {
    this.holdEvent?.remove()
    this.holdEvent = this.scene.time.delayedCall(HOLD_MS, () => this.advance())
  }

  clearTimers() {
    this.typeEvent?.remove()
    this.holdEvent?.remove()
    this.typeEvent = null
    this.holdEvent = null
  }

  hide() {
    this.clearTimers()
    this.active = false
    this.line = null
    this.fullText = ''
    for (const p of this.parts) p.setVisible(false)
    const done = this.onDone
    this.onDone = null
    done?.()
  }

  destroy() {
    this.clearTimers()
    this.scene.input.keyboard?.off('keydown', this.keyHandler)
    for (const p of this.parts) p.destroy()
  }
}
