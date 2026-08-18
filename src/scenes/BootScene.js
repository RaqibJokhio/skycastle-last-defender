import Phaser from 'phaser'

const GROUND_HEIGHT = 64
const GROUND_COLOR = 0x2a3050

const PLAYER_SPAWN_X = 200
const PLAYER_SPAWN_Y = 300
const PLAYER_SCALE = 2

// Every adventurer frame is a 50x37 canvas with the character padded inside it.
// Feet land on texture row 35, so origin (0.5, 1) puts them on the floor.
const FRAME_W = 50
const FRAME_H = 37

// Fixed body -- never resized per frame, or the player would jitter as the art
// changes width. Centered on the frame's midline (not the art's), so setFlipX
// doesn't shift the hitbox sideways.
const BODY_W = 20
const BODY_H = 28
const BODY_OFFSET_X = (FRAME_W - BODY_W) / 2
const BODY_OFFSET_Y = FRAME_H - 1 - BODY_H

const MOVE_SPEED = 220
const JUMP_VELOCITY = -520

// prefix -> frame count, frameRate, repeat (-1 loops, 0 plays once)
const ANIMS = {
  idle: { prefix: 'idle', count: 4, frameRate: 8, repeat: -1 },
  run: { prefix: 'run', count: 6, frameRate: 12, repeat: -1 },
  jump: { prefix: 'jump', count: 4, frameRate: 10, repeat: 0 },
  fall: { prefix: 'fall', count: 2, frameRate: 8, repeat: -1 },
  attack: { prefix: 'attack1', count: 5, frameRate: 14, repeat: 0 },
  hurt: { prefix: 'hurt', count: 3, frameRate: 10, repeat: 0 },
  die: { prefix: 'die', count: 7, frameRate: 10, repeat: 0 },
}

const frameKeys = ({ prefix, count }) =>
  Array.from({ length: count }, (_, i) => `adventurer-${prefix}-${String(i).padStart(2, '0')}`)

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload() {
    // Individual PNGs, one texture per frame -- no atlas or sheet.
    for (const anim of Object.values(ANIMS)) {
      for (const key of frameKeys(anim)) {
        this.load.image(key, `assets/adventurer/${key}.png`)
      }
    }
  }

  create() {
    const { width, height } = this.scale

    // Ground: a filled rectangle spanning the bottom, with a static Arcade body.
    const ground = this.add.rectangle(
      width / 2,
      height - GROUND_HEIGHT / 2,
      width,
      GROUND_HEIGHT,
      GROUND_COLOR
    )
    this.physics.add.existing(ground, true)

    this.createAnimations()

    this.player = this.physics.add.sprite(PLAYER_SPAWN_X, PLAYER_SPAWN_Y, 'adventurer-idle-00')
    this.player.setOrigin(0.5, 1)
    this.player.setScale(PLAYER_SCALE)
    this.player.body.setSize(BODY_W, BODY_H)
    this.player.body.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y)
    this.player.body.setCollideWorldBounds(true)
    this.player.play('idle')

    this.physics.add.collider(this.player, ground)

    this.cursors = this.input.keyboard.createCursorKeys()
  }

  createAnimations() {
    for (const [key, anim] of Object.entries(ANIMS)) {
      this.anims.create({
        key,
        frames: frameKeys(anim).map((k) => ({ key: k })),
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      })
    }
  }

  update() {
    const player = this.player
    const body = player.body
    const onGround = body.blocked.down || body.touching.down

    if (this.cursors.left.isDown) {
      body.setVelocityX(-MOVE_SPEED)
      player.setFlipX(true)
    } else if (this.cursors.right.isDown) {
      body.setVelocityX(MOVE_SPEED)
      player.setFlipX(false)
    } else {
      body.setVelocityX(0)
    }

    // JustDown so holding Up doesn't re-jump the instant we land.
    if (onGround && Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      body.setVelocityY(JUMP_VELOCITY)
    }

    if (!onGround) {
      this.setAnim(body.velocity.y < 0 ? 'jump' : 'fall')
    } else if (body.velocity.x !== 0) {
      this.setAnim('run')
    } else {
      this.setAnim('idle')
    }
  }

  // Play only on state change. play(key, true) would restart a non-looping anim
  // once it finished -- the 400ms jump anim would replay during the 650ms rise.
  // This way jump holds its last frame until the state actually changes.
  setAnim(key) {
    if (this.player.anims.currentAnim?.key !== key) {
      this.player.play(key)
    }
  }
}
