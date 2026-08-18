import Phaser from 'phaser'

const GROUND_HEIGHT = 64
const GROUND_COLOR = 0x2a3050

const PLAYER_WIDTH = 32
const PLAYER_HEIGHT = 48
const PLAYER_COLOR = 0x6fd3ff
const PLAYER_SPAWN_X = 200
const PLAYER_SPAWN_Y = 120

const MOVE_SPEED = 220
const JUMP_VELOCITY = -520

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
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

    // Player placeholder: a colored rectangle with a dynamic Arcade body.
    this.player = this.add.rectangle(
      PLAYER_SPAWN_X,
      PLAYER_SPAWN_Y,
      PLAYER_WIDTH,
      PLAYER_HEIGHT,
      PLAYER_COLOR
    )
    this.physics.add.existing(this.player)
    this.player.body.setCollideWorldBounds(true)

    this.physics.add.collider(this.player, ground)

    this.cursors = this.input.keyboard.createCursorKeys()
  }

  update() {
    const body = this.player.body

    if (this.cursors.left.isDown) {
      body.setVelocityX(-MOVE_SPEED)
    } else if (this.cursors.right.isDown) {
      body.setVelocityX(MOVE_SPEED)
    } else {
      body.setVelocityX(0)
    }

    // JustDown so holding Up doesn't re-jump the instant we land.
    const onGround = body.blocked.down || body.touching.down
    if (onGround && Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      body.setVelocityY(JUMP_VELOCITY)
    }
  }
}
