import Phaser from 'phaser'
import ScoutBot, { SCOUT_FRAME_W, SCOUT_FRAME_H } from '../enemies/ScoutBot.js'
import HealthBar from '../ui/HealthBar.js'

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

// --- player combat ---
const PLAYER_MAX_HP = 100
const ATTACK_DAMAGE = 10
// 0-based frames of the 5-frame attack anim where the blade is live.
const ATTACK_ACTIVE_FROM = 2
const ATTACK_ACTIVE_TO = 3
const HITBOX_W = 44
const HITBOX_H = 44
const HITBOX_OFFSET_X = 34
const HITBOX_OFFSET_Y = -30

// --- taking damage ---
const ENEMY_DAMAGE = 10
const INVULN_MS = 600
const BLINK_MS = 70
const PLAYER_KNOCKBACK_X = 260
const PLAYER_KNOCKBACK_Y = -200
const FLASH_MS = 90

// die anim is 7 frames @ 10fps, then a beat before the prompt appears.
const DIE_ANIM_MS = 700
const DEATH_PROMPT_DELAY_MS = 450

const HITSTOP_MS = 70
const SHAKE_MS = 120
const SHAKE_INTENSITY = 0.006
const PLAYER_HURT_SHAKE_INTENSITY = 0.01

const SCOUT_SPAWN_XS = [650, 900, 1120]

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

// Scout Bot sheets are vertical strips of 58x41 frames.
const SCOUT_SHEETS = {
  'scout-wake': 'wake.png',
  'scout-run': 'run.png',
  'scout-attack': 'attack.png',
  'scout-hit': 'damaged_and_death.png',
}

const frameKeys = ({ prefix, count }) =>
  Array.from({ length: count }, (_, i) => `adventurer-${prefix}-${String(i).padStart(2, '0')}`)

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload() {
    // Adventurer: individual PNGs, one texture per frame -- no atlas or sheet.
    for (const anim of Object.values(ANIMS)) {
      for (const key of frameKeys(anim)) {
        this.load.image(key, `assets/adventurer/${key}.png`)
      }
    }

    for (const [key, file] of Object.entries(SCOUT_SHEETS)) {
      this.load.spritesheet(key, `assets/scoutbot/${file}`, {
        frameWidth: SCOUT_FRAME_W,
        frameHeight: SCOUT_FRAME_H,
      })
    }
  }

  create() {
    const { width, height } = this.scale
    this.groundTop = height - GROUND_HEIGHT

    const ground = this.add.rectangle(
      width / 2,
      height - GROUND_HEIGHT / 2,
      width,
      GROUND_HEIGHT,
      GROUND_COLOR
    )
    this.physics.add.existing(ground, true)
    this.ground = ground

    this.createAnimations()

    // --- player ---
    this.player = this.physics.add.sprite(PLAYER_SPAWN_X, PLAYER_SPAWN_Y, 'adventurer-idle-00')
    this.player.setOrigin(0.5, 1)
    this.player.setScale(PLAYER_SCALE)
    this.player.body.setSize(BODY_W, BODY_H)
    this.player.body.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y)
    this.player.body.setCollideWorldBounds(true)
    // Bots stop against Kai instead of shoving him around. `pushable` is a
    // plain property on the Arcade body -- there is no setPushable() in 3.90.
    this.player.body.pushable = false
    this.player.play('idle')

    this.physics.add.collider(this.player, ground)

    this.playerHp = PLAYER_MAX_HP
    this.playerDead = false
    this.player.isDeadPlayer = false
    this.playerInvulnUntil = 0
    this.isAttacking = false
    this.isHurt = false
    this.playerFrozen = false
    this.blinkTween = null
    this.hitThisSwing = new Set()

    // --- UI ---
    this.healthBar = new HealthBar(this, 20, 20, 260, 22, 'KAI')
    this.healthBar.setValue(this.playerHp, PLAYER_MAX_HP)

    // --- blade hitbox: a bodied zone, live only on the active attack frames ---
    this.hitbox = this.add.zone(0, 0, HITBOX_W, HITBOX_H)
    this.physics.add.existing(this.hitbox)
    this.hitbox.body.setAllowGravity(false)
    this.hitbox.body.enable = false

    // --- enemies ---
    this.enemies = this.add.group()
    this.enemyHitboxes = this.add.group()
    for (const x of SCOUT_SPAWN_XS) {
      const bot = new ScoutBot(this, x, this.groundTop, this.player)
      this.enemies.add(bot)
      this.enemyHitboxes.add(bot.attackHitbox)
    }
    this.physics.add.collider(this.enemies, ground)
    this.physics.add.collider(this.player, this.enemies)

    this.physics.add.overlap(this.hitbox, this.enemies, (_hb, enemy) => this.onBladeHit(enemy))
    this.physics.add.overlap(this.player, this.enemyHitboxes, (_p, hb) => this.onEnemyHit(hb))

    this.player.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onPlayerAnimUpdate, this)
    this.player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onPlayerAnimComplete, this)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.attackKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F)
  }

  createAnimations() {
    // this.anims is the GLOBAL animation manager, so it survives scene.restart().
    // Guard every key or a restart floods the console with duplicate warnings.
    const define = (key, config) => {
      if (!this.anims.exists(key)) this.anims.create({ key, ...config })
    }

    for (const [key, anim] of Object.entries(ANIMS)) {
      define(key, {
        frames: frameKeys(anim).map((k) => ({ key: k })),
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      })
    }

    define('scout-wake', {
      frames: this.anims.generateFrameNumbers('scout-wake', { start: 0, end: 5 }),
      frameRate: 12,
      repeat: 0,
    })
    define('scout-run', {
      frames: this.anims.generateFrameNumbers('scout-run', { start: 0, end: 5 }),
      frameRate: 12,
      repeat: -1,
    })
    define('scout-attack', {
      frames: this.anims.generateFrameNumbers('scout-attack', { start: 0, end: 9 }),
      frameRate: 12,
      repeat: 0,
    })
    // One 8-frame sheet holds both reactions: 0-2 recoil, 3-7 explode.
    define('scout-hurt', {
      frames: this.anims.generateFrameNumbers('scout-hit', { start: 0, end: 2 }),
      frameRate: 14,
      repeat: 0,
    })
    define('scout-death', {
      frames: this.anims.generateFrameNumbers('scout-hit', { start: 3, end: 7 }),
      frameRate: 10,
      repeat: 0,
    })
  }

  // ---------- player attack ----------

  onPlayerAnimUpdate(anim, frame) {
    if (anim.key !== 'attack') return
    const i = frame.index - 1 // Phaser frame.index is 1-based
    this.setHitboxActive(i >= ATTACK_ACTIVE_FROM && i <= ATTACK_ACTIVE_TO)
  }

  onPlayerAnimComplete(anim) {
    if (anim.key === 'attack') {
      this.isAttacking = false
      this.setHitboxActive(false)
    } else if (anim.key === 'hurt') {
      this.isHurt = false
    }
  }

  setHitboxActive(active) {
    if (active) this.positionHitbox()
    this.hitbox.body.enable = active
  }

  positionHitbox() {
    const dir = this.player.flipX ? -1 : 1
    this.hitbox.setPosition(this.player.x + dir * HITBOX_OFFSET_X, this.player.y + HITBOX_OFFSET_Y)
    this.hitbox.body.reset(this.hitbox.x, this.hitbox.y)
  }

  startAttack() {
    this.isAttacking = true
    this.hitThisSwing.clear()
    this.player.body.setVelocityX(0)
    this.player.play('attack')
  }

  onBladeHit(enemy) {
    // One hit per enemy per swing, even though overlap fires every frame.
    if (this.hitThisSwing.has(enemy)) return
    if (!enemy.takeHit(ATTACK_DAMAGE, this.player.x)) return
    this.hitThisSwing.add(enemy)

    this.cameras.main.shake(SHAKE_MS, SHAKE_INTENSITY)
    this.applyHitstop(enemy)
  }

  /** Freeze attacker and victim for a beat, then release into the knockback. */
  applyHitstop(enemy) {
    this.freezePlayer()
    enemy.freeze()
    this.setHitboxActive(false)

    this.time.delayedCall(HITSTOP_MS, () => {
      this.unfreezePlayer()
      if (enemy.active) enemy.unfreeze()
    })
  }

  freezePlayer() {
    if (this.playerFrozen || this.playerDead) return
    this.playerFrozen = true
    const body = this.player.body
    this.playerSavedVelocity = { x: body.velocity.x, y: body.velocity.y }
    this.playerSavedGravity = body.allowGravity
    body.setVelocity(0, 0)
    body.allowGravity = false
    this.player.anims.pause()
  }

  unfreezePlayer() {
    if (!this.playerFrozen) return
    this.playerFrozen = false
    const body = this.player.body
    body.allowGravity = this.playerSavedGravity
    // A hit landed during hitstop already set our knockback -- don't undo it.
    if (!this.isHurt && !this.playerDead) {
      body.setVelocity(this.playerSavedVelocity.x, this.playerSavedVelocity.y)
    }
    this.player.anims.resume()
  }

  // ---------- taking damage ----------

  onEnemyHit(hitbox) {
    const bot = hitbox.owner
    if (!bot || bot.hasHitThisAttack) return
    // Spent either way: a swing that lands during i-frames is a wasted swing.
    bot.hasHitThisAttack = true
    this.damagePlayer(ENEMY_DAMAGE, bot.x)
  }

  damagePlayer(amount, fromX) {
    if (this.playerDead) return false
    if (this.time.now < this.playerInvulnUntil) return false

    this.playerHp = Math.max(0, this.playerHp - amount)
    this.healthBar.setValue(this.playerHp, PLAYER_MAX_HP)

    this.player.setTintFill(0xffffff)
    this.time.delayedCall(FLASH_MS, () => {
      if (this.player?.active) this.player.clearTint()
    })
    this.cameras.main.shake(SHAKE_MS, PLAYER_HURT_SHAKE_INTENSITY)

    const dir = Math.sign(this.player.x - fromX) || 1

    // A hit cancels whatever swing was in progress.
    this.isAttacking = false
    this.setHitboxActive(false)

    if (this.playerHp <= 0) {
      this.killPlayer()
      return true
    }

    this.playerInvulnUntil = this.time.now + INVULN_MS
    this.startBlink(INVULN_MS)

    this.isHurt = true
    this.player.play('hurt')
    this.player.body.setVelocity(dir * PLAYER_KNOCKBACK_X, PLAYER_KNOCKBACK_Y)
    return true
  }

  startBlink(durationMs) {
    this.stopBlink()
    this.blinkTween = this.tweens.add({
      targets: this.player,
      alpha: { from: 1, to: 0.25 },
      duration: BLINK_MS,
      yoyo: true,
      repeat: -1,
    })
    this.time.delayedCall(durationMs, () => this.stopBlink())
  }

  stopBlink() {
    if (this.blinkTween) {
      this.blinkTween.stop()
      this.blinkTween = null
    }
    if (this.player?.active) this.player.setAlpha(1)
  }

  killPlayer() {
    this.playerDead = true
    this.player.isDeadPlayer = true
    this.isHurt = false
    this.playerFrozen = false
    this.stopBlink()
    this.setHitboxActive(false)
    this.player.body.setVelocity(0, 0)
    this.player.anims.resume()
    this.player.play('die')

    this.time.delayedCall(DIE_ANIM_MS + DEATH_PROMPT_DELAY_MS, () => this.showDeathPrompt())
  }

  showDeathPrompt() {
    const cx = this.scale.width / 2
    const cy = this.scale.height / 2

    this.deathText = this.add
      .text(cx, cy - 20, 'YOU DIED', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#dc4b4b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)

    this.restartText = this.add
      .text(cx, cy + 44, 'press any key to restart', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#9fb3d9',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)

    // Registered only now, so a key held during the death anim can't skip it.
    this.input.keyboard.once('keydown', () => this.scene.restart())
  }

  // ---------- loop ----------

  update() {
    if (this.playerDead || this.playerFrozen) return

    const player = this.player
    const body = player.body
    const onGround = body.blocked.down || body.touching.down

    // No input while the hurt animation is committed; knockback carries.
    if (this.isHurt) return

    if (Phaser.Input.Keyboard.JustDown(this.attackKey) && !this.isAttacking) {
      this.startAttack()
    }

    if (this.isAttacking) {
      // Movement locked during the swing so it lands with weight.
      if (onGround) body.setVelocityX(0)
      if (this.hitbox.body.enable) this.positionHitbox()
      return
    }

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
