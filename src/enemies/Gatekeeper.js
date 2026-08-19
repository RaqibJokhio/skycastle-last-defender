import Phaser from 'phaser'
import { SCOUT_FRAME_W, SCOUT_FRAME_H } from './ScoutBot.js'

// Same droid sheets as the Scout Bot, scaled up and tinted -- a heavy variant
// rather than new art, per the roadmap rule to reuse enemies with stat scaling.
const ART_CENTER_X = 14.5
const ART_TOP_Y = 11

const BODY_W = 16
const BODY_H = SCOUT_FRAME_H - ART_TOP_Y
const SCALE = 2.5

export const GATEKEEPER_MAX_HP = 200

const DETECT_RANGE = 460
const MOVE_SPEED = 45 // Scout walks 70; this thing lumbers.
const CONTACT_DAMAGE = 20 // Scout hits for 10.

// Heavy: it barely flinches.
const KNOCKBACK_X = 40
const KNOCKBACK_Y = 0
const FLASH_MS = 90

// --- attack cycle: telegraph -> swing -> exposed ---
const MELEE_RANGE = 78
const WINDUP_MS = 650 // held on the first attack frame, flaring red
const RECOVER_MS = 950 // shield down: the window Kai is meant to punish
const ATTACK_COOLDOWN_MS = 2600 // Scout re-swings every 1500
const ATTACK_ACTIVE_FRAMES = [3, 4, 6, 8]
const ATTACK_HITBOX_W = 64
const ATTACK_HITBOX_H = 58
const ATTACK_HITBOX_OFFSET_X = 50
const ATTACK_HITBOX_OFFSET_Y = -40

// Front armour vs. exposed back. A blow to the plating barely scratches it; one
// to the back, or to a Gatekeeper still recovering, lands critically.
const ARMOUR_MULTIPLIER = 0.3
const WEAK_POINT_MULTIPLIER = 2

const TINT_ARMOURED = 0xd04a4a
const TINT_WINDUP = 0xff3030
const TINT_EXPOSED = 0x9fe8ff

export default class Gatekeeper extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, target) {
    super(scene, x, y, 'scout-wake', 0)

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.target = target
    this.isBoss = true
    this.hp = GATEKEEPER_MAX_HP
    this.maxHp = GATEKEEPER_MAX_HP
    this.dead = false
    this.frozen = false
    this.aiState = 'dormant'
    this.pendingKnockback = null
    this.attackReadyAt = 0
    this.stateUntil = 0
    this.hasHitThisAttack = false
    this.contactDamage = CONTACT_DAMAGE
    this.lastHitWasCritical = false
    this.onDefeated = null

    this.setOrigin(ART_CENTER_X / SCOUT_FRAME_W, 1)
    this.setScale(SCALE)
    this.body.setSize(BODY_W, BODY_H)
    this.body.setOffset(ART_CENTER_X - BODY_W / 2, ART_TOP_Y)
    this.body.setCollideWorldBounds(true)
    // Kai cannot shove it out of the doorway.
    this.body.pushable = false
    this.setFrame(0)
    this.refreshTint()

    this.attackHitbox = scene.add.zone(x, y, ATTACK_HITBOX_W, ATTACK_HITBOX_H)
    scene.physics.add.existing(this.attackHitbox)
    this.attackHitbox.body.setAllowGravity(false)
    this.attackHitbox.body.enable = false
    this.attackHitbox.owner = this

    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimComplete, this)
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onAnimUpdate, this)
  }

  // ---------- vulnerability ----------

  /** It stops re-aiming once committed, so its back is reachable by sliding past. */
  isHitFromBehind(fromX) {
    const facingRight = !this.flipX
    const hitFromLeft = fromX < this.x
    return facingRight ? hitFromLeft : !hitFromLeft
  }

  isExposed() {
    return this.aiState === 'recovering'
  }

  refreshTint() {
    if (this.dead) return
    if (this.aiState === 'winding') this.setTint(TINT_WINDUP)
    else if (this.isExposed()) this.setTint(TINT_EXPOSED)
    else this.setTint(TINT_ARMOURED)
  }

  enterState(state, until = 0) {
    this.aiState = state
    this.stateUntil = until
    this.refreshTint()
  }

  // ---------- animation plumbing ----------

  onAnimUpdate(anim, frame) {
    if (anim.key !== 'scout-attack' || this.aiState !== 'attacking') return
    this.setAttackHitboxActive(ATTACK_ACTIVE_FRAMES.includes(frame.index - 1))
  }

  onAnimComplete(anim) {
    if (anim.key === 'scout-death') {
      this.body.enable = false
      const done = this.onDefeated
      this.onDefeated = null
      done?.()
      this.destroy()
      return
    }
    if (this.dead) return

    if (anim.key === 'scout-attack') {
      this.setAttackHitboxActive(false)
      this.attackReadyAt = this.scene.time.now + ATTACK_COOLDOWN_MS
      this.enterState('recovering', this.scene.time.now + RECOVER_MS)
    } else if (anim.key === 'scout-wake' || anim.key === 'scout-hurt') {
      this.enterState('chase')
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

  // ---------- AI ----------

  preUpdate(time, delta) {
    super.preUpdate(time, delta)

    if (this.dead || this.frozen || !this.body) return

    if (this.aiState === 'winding') {
      this.setVelocityX(0)
      if (time >= this.stateUntil) {
        this.enterState('attacking')
        this.hasHitThisAttack = false
        this.play('scout-attack')
      }
      return
    }

    if (this.aiState === 'attacking') {
      this.setVelocityX(0)
      if (this.attackHitbox.body.enable) this.positionAttackHitbox()
      return
    }

    if (this.aiState === 'recovering') {
      this.setVelocityX(0)
      if (time >= this.stateUntil) this.enterState('chase')
      return
    }

    if (this.aiState === 'waking' || this.aiState === 'hurt') {
      this.setVelocityX(0)
      return
    }

    const dx = this.target.x - this.x
    const dist = Math.abs(dx)

    if (this.aiState === 'dormant') {
      this.setVelocityX(0)
      if (dist <= DETECT_RANGE) {
        this.enterState('waking')
        this.play('scout-wake')
      }
      return
    }

    // chase -- the only state that re-aims, which is exactly what makes the
    // back reachable once it has committed to a swing.
    const dir = Math.sign(dx) || 1
    this.setFlipX(dir < 0)

    if (dist <= MELEE_RANGE && time >= this.attackReadyAt && !this.target.isDeadPlayer) {
      this.setVelocityX(0)
      this.enterState('winding', time + WINDUP_MS)
      this.anims.stop()
      this.setTexture('scout-attack', 0)
      return
    }

    this.setVelocityX(dir * MOVE_SPEED)
    if (this.anims.currentAnim?.key !== 'scout-run') this.play('scout-run')
  }

  // ---------- damage ----------

  /** Returns true if the hit landed (gates the scene hitstop/shake). */
  takeHit(damage, fromX) {
    if (this.dead) return false

    const critical = this.isExposed() || this.isHitFromBehind(fromX)
    this.lastHitWasCritical = critical
    const dealt = Math.max(
      1,
      Math.round(damage * (critical ? WEAK_POINT_MULTIPLIER : ARMOUR_MULTIPLIER))
    )
    this.hp = Math.max(0, this.hp - dealt)

    this.setTintFill(critical ? 0xffffff : 0xffd8d8)
    this.scene.time.delayedCall(FLASH_MS, () => {
      if (this.active) this.refreshTint()
    })

    const dir = Math.sign(this.x - fromX) || 1
    this.pendingKnockback = { x: dir * KNOCKBACK_X, y: KNOCKBACK_Y }

    if (this.hp <= 0) {
      this.dead = true
      this.aiState = 'dead'
      this.setAttackHitboxActive(false)
      this.setVelocityX(0)
      this.setTint(TINT_ARMOURED)
      this.play('scout-death')
      return true
    }

    // Armour means it shrugs off chip damage: only a critical staggers it, and
    // even then it never drops a swing it has already committed to.
    if (critical && this.aiState !== 'attacking' && this.aiState !== 'winding') {
      this.enterState('hurt')
      this.play('scout-hurt')
    } else {
      this.refreshTint()
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
