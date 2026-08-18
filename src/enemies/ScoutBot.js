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

// --- attack ---
const MELEE_RANGE = 40
const ATTACK_COOLDOWN_MS = 1500
// The 10-frame attack is a three-lunge flurry: 0-2 windup, 3-4 / 6 / 8 extend
// (art reaches x~53-57), 5 / 7 / 9 retract. All three lunges are live, but
// hasHitThisAttack keeps a single attack to a single point of damage.
const ATTACK_ACTIVE_FRAMES = [3, 4, 6, 8]
const ATTACK_HITBOX_W = 44
const ATTACK_HITBOX_H = 40
const ATTACK_HITBOX_OFFSET_X = 38
const ATTACK_HITBOX_OFFSET_Y = -30

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
    this.attackReadyAt = 0
    this.hasHitThisAttack = false

    this.setOrigin(ART_CENTER_X / SCOUT_FRAME_W, 1)
    this.setScale(SCALE)
    this.body.setSize(BODY_W, BODY_H)
    this.body.setOffset(ART_CENTER_X - BODY_W / 2, ART_TOP_Y)
    this.body.setCollideWorldBounds(true)

    this.setFrame(0)

    // Own hitbox so several bots can swing independently. The scene groups
    // these and runs one overlap against the player.
    this.attackHitbox = scene.add.zone(x, y, ATTACK_HITBOX_W, ATTACK_HITBOX_H)
    scene.physics.add.existing(this.attackHitbox)
    this.attackHitbox.body.setAllowGravity(false)
    this.attackHitbox.body.enable = false
    this.attackHitbox.owner = this

    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimComplete, this)
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onAnimUpdate, this)
  }

  onAnimUpdate(anim, frame) {
    if (anim.key !== 'scout-attack') return
    this.setAttackHitboxActive(ATTACK_ACTIVE_FRAMES.includes(frame.index - 1))
  }

  onAnimComplete(anim) {
    if (anim.key === 'scout-death') {
      this.body.enable = false
      this.destroy()
      return
    }
    if (this.dead) return

    if (anim.key === 'scout-attack') {
      this.setAttackHitboxActive(false)
      this.attackReadyAt = this.scene.time.now + ATTACK_COOLDOWN_MS
      this.aiState = 'chase'
    } else if (anim.key === 'scout-wake' || anim.key === 'scout-hurt') {
      this.aiState = 'chase'
    }
  }

  setAttackHitboxActive(active) {
    if (!this.attackHitbox) return
    if (active) this.positionAttackHitbox()
    this.attackHitbox.body.enable = active
  }

  positionAttackHitbox() {
    const dir = this.flipX ? -1 : 1
    this.attackHitbox.setPosition(
      this.x + dir * ATTACK_HITBOX_OFFSET_X,
      this.y + ATTACK_HITBOX_OFFSET_Y
    )
    this.attackHitbox.body.reset(this.attackHitbox.x, this.attackHitbox.y)
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta)

    if (this.dead || this.frozen || !this.body) return

    if (this.aiState === 'attacking') {
      this.setVelocityX(0)
      if (this.attackHitbox.body.enable) this.positionAttackHitbox()
      return
    }

    // Wake and hurt are committed animations -- hold still until they finish.
    if (this.aiState === 'waking' || this.aiState === 'hurt') {
      this.setVelocityX(0)
      return
    }

    const dx = this.target.x - this.x
    const dist = Math.abs(dx)

    if (this.aiState === 'dormant') {
      this.setVelocityX(0)
      if (dist <= DETECT_RANGE) {
        this.aiState = 'waking'
        this.play('scout-wake')
      }
      return
    }

    // chase
    const dir = Math.sign(dx) || 1
    this.setFlipX(dir < 0)

    if (dist <= MELEE_RANGE && time >= this.attackReadyAt && !this.target.isDeadPlayer) {
      this.aiState = 'attacking'
      this.hasHitThisAttack = false
      this.setVelocityX(0)
      this.play('scout-attack')
      return
    }

    this.setVelocityX(dir * MOVE_SPEED)
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

    // Getting hit interrupts a swing in progress.
    this.setAttackHitboxActive(false)

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

  destroy(fromScene) {
    if (this.attackHitbox) {
      this.attackHitbox.destroy()
      this.attackHitbox = null
    }
    super.destroy(fromScene)
  }
}
