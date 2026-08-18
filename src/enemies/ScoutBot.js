import Phaser from 'phaser'

export const SCOUT_FRAME_W = 58
export const SCOUT_FRAME_H = 41

// The bot's art only occupies x 7-22 of the 58px frame -- the rest is reach for
// its attack frames. Put the origin on the ART's centre, not the frame's, so the
// sprite sits where its x says it does and flipX mirrors it in place.
const ART_CENTER_X = 14.5
const ART_TOP_Y = 11

const BODY_W = 16
const BODY_H = SCOUT_FRAME_H - ART_TOP_Y
const SCALE = 2

const MAX_HP = 30
const DETECT_RANGE = 250
const MOVE_SPEED = 70

const KNOCKBACK_X = 200
const KNOCKBACK_Y = -130
const FLASH_MS = 90

export default class ScoutBot extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, target) {
    super(scene, x, y, 'scout-wake', 0)

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.target = target
    this.hp = MAX_HP
    this.dead = false
    this.frozen = false
    this.aiState = 'dormant'
    this.pendingKnockback = null

    this.setOrigin(ART_CENTER_X / SCOUT_FRAME_W, 1)
    this.setScale(SCALE)
    this.body.setSize(BODY_W, BODY_H)
    this.body.setOffset(ART_CENTER_X - BODY_W / 2, ART_TOP_Y)
    this.body.setCollideWorldBounds(true)

    this.setFrame(0)

    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimComplete, this)
  }

  onAnimComplete(anim) {
    if (anim.key === 'scout-wake' && !this.dead) {
      this.aiState = 'chase'
    } else if (anim.key === 'scout-hurt' && !this.dead) {
      this.aiState = 'chase'
    } else if (anim.key === 'scout-death') {
      this.body.enable = false
      this.destroy()
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta)

    if (this.dead || this.frozen || !this.body) return

    // Hurt/wake are committed animations -- hold still until they finish.
    if (this.aiState === 'waking' || this.aiState === 'hurt') {
      this.setVelocityX(0)
      return
    }

    const dist = Math.abs(this.target.x - this.x)

    if (this.aiState === 'dormant') {
      this.setVelocityX(0)
      if (dist <= DETECT_RANGE) {
        this.aiState = 'waking'
        this.play('scout-wake')
      }
      return
    }

    // chase
    const dir = Math.sign(this.target.x - this.x) || 1
    this.setVelocityX(dir * MOVE_SPEED)
    this.setFlipX(dir < 0)
    if (this.anims.currentAnim?.key !== 'scout-run') this.play('scout-run')
  }

  /** Returns true if the hit landed (used to gate hitstop/shake/screen feel). */
  takeHit(damage, fromX) {
    if (this.dead) return false

    this.hp -= damage
    const dir = Math.sign(this.x - fromX) || 1

    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(FLASH_MS, () => {
      if (this.active) this.clearTint()
    })

    // Queued rather than applied now: the scene freezes us for hitstop first,
    // and releasing INTO the knockback is what gives the hit its pop.
    this.pendingKnockback = { x: dir * KNOCKBACK_X, y: KNOCKBACK_Y }

    if (this.hp <= 0) {
      this.dead = true
      this.aiState = 'dead'
      // Keep colliding with the ground so the corpse lands instead of sinking
      // through it mid-explosion. Further hits are already blocked by `dead`.
      this.play('scout-death')
    } else {
      this.aiState = 'hurt'
      this.play('scout-hurt')
    }

    return true
  }

  freeze() {
    if (this.frozen || !this.body) return
    this.frozen = true
    this.savedVelocity = { x: this.body.velocity.x, y: this.body.velocity.y }
    this.savedGravity = this.body.allowGravity
    this.body.setVelocity(0, 0)
    this.body.allowGravity = false
    this.anims.pause()
  }

  unfreeze() {
    if (!this.frozen || !this.body) return
    this.frozen = false
    this.body.allowGravity = this.savedGravity
    this.anims.resume()

    if (this.pendingKnockback) {
      this.body.setVelocity(this.pendingKnockback.x, this.pendingKnockback.y)
      this.pendingKnockback = null
    } else {
      this.body.setVelocity(this.savedVelocity.x, this.savedVelocity.y)
    }
  }
}
