import Phaser from 'phaser'
import ScoutBot, { SCOUT_FRAME_W, SCOUT_FRAME_H } from '../enemies/ScoutBot.js'
import Gatekeeper, { GATEKEEPER_MAX_HP } from '../enemies/Gatekeeper.js'
import HealthBar, { COLOR_BOSS } from '../ui/HealthBar.js'
import DialogueBox from '../ui/DialogueBox.js'

// --- tilemap ---
const TILE = 16
// 3x divides the 720px viewport into exactly 15 rows, so the camera never has
// to scroll vertically. (Tile pixels render 3x vs Kai's 2x; drop to 2 for an
// exact pixel-density match at the cost of a non-integer row count.)
const TILE_SCALE = 3
const TILE_PX = TILE * TILE_SCALE
const MAP_COLS = 146
const MAP_ROWS = 15
const WORLD_W = MAP_COLS * TILE_PX // 7008
const WORLD_H = MAP_ROWS * TILE_PX // 720

const GROUND_ROW = 13
const GROUND_TOP_Y = GROUND_ROW * TILE_PX // 624

// Indices into the 32-col tileset (index = row * 32 + col). All fully opaque.
// Picked for how they look TILED: the plain panels (33/65/97) are featureless
// and read as one grey slab once repeated, so these have visible seams.
const TILE_GROUND_TOP = 134 // bright band along the tile top -- floor surface
const TILE_GROUND_FILL = 96 // riveted panel -- structural mass below
const TILE_PLATFORM = 135 // grating with strong dividers -- walkway

// Kai's jump clears 169px (520^2 / 2*800) and carries ~286px horizontally, so
// a stand-on ledge must sit under ~150px above whatever he launches from.
// Underside clearance matters too: a row-10 slab (underside 528) clears both
// Kai's standing body (top 568) and a bot (top 564); a row-11 slab (underside
// 576) blocks both -- that is what makes the slide tunnel a real gate.
// Laid out so no chain of ledges becomes a roof over the fight. Three rules:
//   1. No slab sits above a bot's x, so none can be waited out from safety.
//   2. Nothing is lower than row 10, so a slab can never trap a bot walking
//      under it (underside 528 vs a bot's 564 top).
//   3. Chains are at most two slabs and always dead-end into a drop back to the
//      floor, so the route forward runs through the bots rather than over them.
// Reach: row 10 (144 up) is a standing jump off the floor; rows 9 and 8 are
// only reachable by stepping off a row-10 slab.
const PLATFORMS = [
  { row: 10, c0: 22, c1: 25 }, // 1056-1200
  { row: 10, c0: 36, c1: 39 }, // 1728-1872, step up to...
  { row: 9, c0: 42, c1: 45 }, // 2016-2208, dead-ends past the first pit
  { row: 10, c0: 50, c1: 52 }, // 2400-2544, landing after the pit
  { row: 10, c0: 62, c1: 64 }, // 2976-3120, past the slide tunnel, step up to...
  { row: 9, c0: 67, c1: 70 }, // 3216-3408, dead-ends before the 3450/3620 pair
  { row: 10, c0: 78, c1: 81 }, // 3744-3936
  { row: 10, c0: 92, c1: 94 }, // 4416-4512
  { row: 10, c0: 108, c1: 110 }, // 5184-5280, step up to...
  { row: 8, c0: 112, c1: 116 }, // 5376-5616, highest ledge, dead-ends before the gate
]

// Floor gaps: both ground rows carved out. 144px wide against a 286px jump, so
// clearing them is comfortable; falling in drops Kai 96px onto the world floor,
// which his 169px jump can climb back out of. No death pit, no respawn needed.
const PITS = [
  { c0: 47, c1: 49 },
  { c0: 99, c1: 101 },
]

// Bulkhead: solid from row 6 down to row 11, leaving only row 12 open. Its top
// (y 288) is far above Kai's 455px jump apex, so it cannot be jumped -- the
// 48px slot underneath is passable only by the 32px-tall slide body.
// Kept to 2 columns (96px): a slide covers 172px from a standstill, so the body
// is fully clear of the overhang before it expands back to full height.
const SLIDE_TUNNELS = [{ c0: 56, c1: 57, rowTop: 6, rowBottom: 11 }]

const PLAYER_SPAWN_X = 150
const PLAYER_SPAWN_Y = 400
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

// Slide keeps the same body bottom so shrinking it can't drop Kai through the
// floor -- only the top comes down.
const SLIDE_BODY_H = 16
const SLIDE_BODY_OFFSET_Y = FRAME_H - 1 - SLIDE_BODY_H
const SLIDE_SPEED = 430
const SLIDE_MS = 400

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

const DIE_ANIM_MS = 700
const DEATH_PROMPT_DELAY_MS = 450

// Fall death. collideWorldBounds pins Kai to the world floor, so dropping into
// a pit bottoms him out at y=722 -- he can never get below the map, and a kill
// line "under the level" would never fire. This one sits inside the pit
// instead: 64px below where he stands on the floor (626) and 32px above the pit
// bottom. Every platform is higher than the floor, so passing this line can
// only mean he has dropped into a gap.
const FALL_KILL_Y = GROUND_TOP_Y + 66 // 690

const HITSTOP_MS = 70
const SHAKE_MS = 120
const SHAKE_INTENSITY = 0.006
const PLAYER_HURT_SHAKE_INTENSITY = 0.01

// --- objective ---
const GATE_W = 56
const GATE_H = 150
const GATE_X = 6850
const GATE_TRIGGER_DIST = 110

// Small clusters with breathing room between them, so the level paces as a
// fight-through rather than one pile. Kept clear of the pits (x 2256-2400,
// 4752-4848) and the bulkhead (x 2688-2832) so nobody spawns stuck.
const SCOUT_SPAWN_XS = [900, 1350, 1520, 2600, 3450, 3620, 5100, 6200]

// The Gatekeeper plants itself in front of the gate, so clearing the level
// means going through it rather than around it.
const BOSS_SPAWN_X = GATE_X - 190

const INTRO_LINES = [
  { speaker: 'BIT', text: "Kai, the gate's sealed. Clear these Scout Bots and I'll get it open." },
  { speaker: 'BIT', text: 'Press F to swing your blade. SPACE slides — use it to dodge through things.' },
]
const BOSS_LINES = [
  { speaker: 'BIT', text: 'Bots down — but something heavy just spun up at the gate. GATEKEEPER class.' },
  { speaker: 'BIT', text: "Front plating will shrug you off. Hit it when its guard drops — or get behind it." },
]
const OVERRIDE_LINES = [
  { speaker: 'OVERRIDE', text: 'One human remains. Correcting the error.' },
]

// prefix -> frame count, frameRate, repeat (-1 loops, 0 plays once)
const ANIMS = {
  idle: { prefix: 'idle', count: 4, frameRate: 8, repeat: -1 },
  run: { prefix: 'run', count: 6, frameRate: 12, repeat: -1 },
  jump: { prefix: 'jump', count: 4, frameRate: 10, repeat: 0 },
  fall: { prefix: 'fall', count: 2, frameRate: 8, repeat: -1 },
  slide: { prefix: 'slide', count: 2, frameRate: 8, repeat: -1 },
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

    this.load.image('robot-tiles', 'assets/tileset/0x72_16x16RobotTileset.v1.png')
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)

    this.buildLevel()
    this.createAnimations()

    // --- player ---
    this.player = this.physics.add.sprite(PLAYER_SPAWN_X, PLAYER_SPAWN_Y, 'adventurer-idle-00')
    this.player.setOrigin(0.5, 1)
    this.player.setScale(PLAYER_SCALE)
    this.player.body.setSize(BODY_W, BODY_H, false)
    this.player.body.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y)
    this.player.body.setCollideWorldBounds(true)
    // Bots stop against Kai instead of shoving him around. `pushable` is a
    // plain property on the Arcade body -- there is no setPushable() in 3.90.
    this.player.body.pushable = false
    this.player.play('idle')

    this.physics.add.collider(this.player, this.groundLayer)

    this.playerHp = PLAYER_MAX_HP
    this.playerDead = false
    this.player.isDeadPlayer = false
    this.playerInvulnUntil = 0
    this.isAttacking = false
    this.isHurt = false
    this.isSliding = false
    this.slideEndsAt = 0
    this.playerFrozen = false
    this.blinkTween = null
    this.gateOpen = false
    this.missionPhase = 'bots' // 'bots' -> 'boss' -> 'complete'
    this.boss = null
    this.bossBar = null
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
      const bot = new ScoutBot(this, x, GROUND_TOP_Y, this.player)
      this.enemies.add(bot)
      this.enemyHitboxes.add(bot.attackHitbox)
    }
    // Registered empty: Phaser group colliders pick up children added later, so
    // the Gatekeeper needs no extra wiring when it spawns mid-level.
    this.bosses = this.add.group()

    this.physics.add.collider(this.enemies, this.groundLayer)
    this.physics.add.collider(this.player, this.enemies)
    this.physics.add.collider(this.bosses, this.groundLayer)
    this.physics.add.collider(this.player, this.bosses)
    this.physics.add.overlap(this.hitbox, this.bosses, (_hb, boss) => this.onBladeHit(boss))

    // The gate is only actually solid because of this collider -- a static body
    // on its own is never consulted. Torn down when the level is cleared.
    this.gateCollider = this.physics.add.collider(this.player, this.gate)

    this.physics.add.overlap(this.hitbox, this.enemies, (_hb, enemy) => this.onBladeHit(enemy))
    this.physics.add.overlap(this.player, this.enemyHitboxes, (_p, hb) => this.onEnemyHit(hb))

    this.player.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onPlayerAnimUpdate, this)
    this.player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onPlayerAnimComplete, this)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.attackKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F)
    this.slideKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // Follow horizontally; WORLD_H equals the viewport, so Y stays pinned at 0.
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.dialogue = new DialogueBox(this)
    this.showDialogue(INTRO_LINES)
  }

  /** showDialogue([{ speaker, text }, ...], onDone?) -- BIT and OVERRIDE styles. */
  showDialogue(lines, onDone = null) {
    this.dialogue.show(lines, onDone)
  }

  buildLevel() {
    // Blank map, then stamp ground and platforms into the 2D index array.
    const data = Array.from({ length: MAP_ROWS }, () => new Array(MAP_COLS).fill(-1))

    for (let c = 0; c < MAP_COLS; c++) {
      data[GROUND_ROW][c] = TILE_GROUND_TOP
      for (let r = GROUND_ROW + 1; r < MAP_ROWS; r++) data[r][c] = TILE_GROUND_FILL
    }

    // Carve the pits back out of the floor.
    for (const pit of PITS) {
      for (let c = pit.c0; c <= pit.c1; c++) {
        for (let r = GROUND_ROW; r < MAP_ROWS; r++) data[r][c] = -1
      }
    }

    for (const t of SLIDE_TUNNELS) {
      for (let c = t.c0; c <= t.c1; c++) {
        for (let r = t.rowTop; r <= t.rowBottom; r++) data[r][c] = TILE_GROUND_FILL
      }
    }

    for (const p of PLATFORMS) {
      for (let c = p.c0; c <= p.c1; c++) data[p.row][c] = TILE_PLATFORM
    }

    this.map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE })
    const tileset = this.map.addTilesetImage('robot-tiles', 'robot-tiles', TILE, TILE, 0, 0)
    this.groundLayer = this.map.createLayer(0, tileset, 0, 0)
    this.groundLayer.setScale(TILE_SCALE)
    this.groundLayer.setCollisionByExclusion([-1])

    // --- the gate: closed, solid, and the mission goal ---
    this.gate = this.add
      .rectangle(GATE_X, GROUND_TOP_Y, GATE_W, GATE_H, 0xd8802a)
      .setOrigin(0.5, 1)
      .setStrokeStyle(3, 0xffc46b)
    this.physics.add.existing(this.gate, true)
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

  // ---------- slide ----------

  startSlide() {
    this.isSliding = true
    this.slideEndsAt = this.time.now + SLIDE_MS

    const dir = this.player.flipX ? -1 : 1
    this.player.body.setVelocityX(dir * SLIDE_SPEED)

    // Bottom stays put; only the top of the body drops.
    this.player.body.setSize(BODY_W, SLIDE_BODY_H, false)
    this.player.body.setOffset(BODY_OFFSET_X, SLIDE_BODY_OFFSET_Y)

    // Dodge i-frames for the duration of the slide.
    this.playerInvulnUntil = Math.max(this.playerInvulnUntil, this.slideEndsAt)
    this.player.play('slide')
  }

  endSlide() {
    if (!this.isSliding) return
    this.isSliding = false
    this.player.body.setSize(BODY_W, BODY_H, false)
    this.player.body.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y)
  }

  // ---------- taking damage ----------

  onEnemyHit(hitbox) {
    const bot = hitbox.owner
    if (!bot || bot.hasHitThisAttack) return
    // Spent either way: a swing that lands during i-frames is a wasted swing.
    bot.hasHitThisAttack = true
    // The Gatekeeper hits for more than a Scout, so the attacker owns the number.
    this.damagePlayer(bot.contactDamage ?? ENEMY_DAMAGE, bot.x)
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

    // A hit cancels whatever swing or slide was in progress.
    this.isAttacking = false
    this.setHitboxActive(false)
    this.endSlide()

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

  /** Falling costs everything, so empty the bar before the shared death flow. */
  killByFall() {
    this.playerHp = 0
    this.healthBar.setValue(0, PLAYER_MAX_HP)
    this.killPlayer()
  }

  killPlayer() {
    this.playerDead = true
    this.player.isDeadPlayer = true
    this.isHurt = false
    this.playerFrozen = false
    this.endSlide()
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

  // ---------- objective ----------

  /** A bot counts as cleared the moment its HP hits 0, not when it finishes exploding. */
  botsRemaining() {
    return this.enemies.getChildren().filter((bot) => !bot.dead).length
  }

  updateGate() {
    if (this.missionPhase === 'complete') return

    const atGate = Math.abs(this.player.x - GATE_X) < GATE_TRIGGER_DIST

    if (this.missionPhase === 'bots') {
      const remaining = this.botsRemaining()
      if (remaining === 0) {
        this.startBossPhase()
        return
      }
      this.showSealedHint(atGate, `The gate is sealed — clear the bots\n${remaining} remaining`)
      return
    }

    // Boss phase: the gate stays shut for as long as the Gatekeeper stands.
    if (this.boss && !this.boss.dead) {
      this.bossBar?.setValue(this.boss.hp, GATEKEEPER_MAX_HP)
      this.showSealedHint(atGate, 'The gate is sealed — the GATEKEEPER holds it')
    }
  }

  showSealedHint(visible, message) {
    if (!this.sealedText) {
      this.sealedText = this.add
        .text(this.scale.width / 2, 150, '', {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: '#ffc46b',
          align: 'center',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1001)
    }
    this.sealedText.setVisible(visible)
    if (visible) this.sealedText.setText(message)
  }

  // ---------- boss phase ----------

  startBossPhase() {
    this.missionPhase = 'boss'
    this.showDialogue(BOSS_LINES)

    this.boss = new Gatekeeper(this, BOSS_SPAWN_X, GROUND_TOP_Y, this.player)
    this.boss.onDefeated = () => this.onBossDefeated()
    this.bosses.add(this.boss)
    this.enemyHitboxes.add(this.boss.attackHitbox)

    this.bossBar = new HealthBar(this, 340, 24, 600, 24, 'GATEKEEPER', COLOR_BOSS)
    this.bossBar.setValue(GATEKEEPER_MAX_HP, GATEKEEPER_MAX_HP)
  }

  onBossDefeated() {
    this.missionPhase = 'complete'
    this.boss = null
    this.sealedText?.setVisible(false)
    this.bossBar?.setValue(0, GATEKEEPER_MAX_HP)

    // OVERRIDE speaks for the first time, then the way out finally opens.
    this.showDialogue(OVERRIDE_LINES, () => {
      this.bossBar?.destroy()
      this.bossBar = null
      this.openGate()
      this.time.delayedCall(1000, () => this.showMissionComplete())
    })
  }

  showMissionComplete() {
    const cx = this.scale.width / 2
    const cy = this.scale.height / 2

    this.missionCompleteText = this.add
      .text(cx, cy - 30, 'MISSION 1 COMPLETE', {
        fontFamily: 'monospace',
        fontSize: '54px',
        color: '#ffc46b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)

    this.missionSubText = this.add
      .text(cx, cy + 34, 'THE GATES — cleared', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9fb3d9',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)
  }


  openGate() {
    this.gateOpen = true
    this.sealedText?.setVisible(false)

    if (this.gateCollider) {
      this.gateCollider.destroy()
      this.gateCollider = null
    }
    this.gate.body.enable = false
    this.tweens.add({
      targets: this.gate,
      y: this.gate.y - (GATE_H + 24),
      alpha: 0.3,
      duration: 700,
      ease: 'Cubic.easeOut',
    })

    this.gateText = this.add
      .text(this.scale.width / 2, 120, 'GATE OPENING', {
        fontFamily: 'monospace',
        fontSize: '44px',
        color: '#ffc46b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
  }

  // ---------- loop ----------

  update() {
    if (this.playerDead) return

    // Dropped into a gap -- same death flow as running out of HP.
    if (this.player.y > FALL_KILL_Y) {
      this.killByFall()
      return
    }

    this.updateGate()

    if (this.playerFrozen) return

    const player = this.player
    const body = player.body
    const onGround = body.blocked.down || body.touching.down

    // No input while the hurt animation is committed; knockback carries.
    if (this.isHurt) return

    if (this.isSliding) {
      if (this.time.now >= this.slideEndsAt) this.endSlide()
      else return // movement locked for the duration of the slide
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.slideKey) &&
      onGround &&
      !this.isAttacking &&
      !this.isSliding
    ) {
      this.startSlide()
      return
    }

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
