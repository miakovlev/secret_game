import Phaser from 'phaser'
import { Battle, DURATION, makeFoe, MAX_ARMOR, xpGoal } from './battle'
import type { BattleEvent, Phase, Shot } from './battle'
import {
  archerVolley, boarCharge, court, foes, garden, gardenerRule, heroes, heroIds, loadout, relicRule,
} from './content'
import type { HeroId, RelicId } from './content'
import {
  archerTexture, boarTexture, briarlingTexture, duchessTexture, emberTexture, floorTexture, gardenTexture,
  gardenerTexture, heroTexture, knightTexture, markedTexture, mothTexture, oilTexture, reliquaryTexture, sealTexture,
} from './art'
import { messages, readLanguage, saveLanguage } from './i18n'
import type { Language } from './i18n'
import './style.css'

const panel = document.querySelector<HTMLElement>('#panel')!
const title = document.querySelector<HTMLElement>('#title')!
const message = document.querySelector<HTMLElement>('#message')!
const label = document.querySelector<HTMLElement>('#panel-label')!
const status = document.querySelector<HTMLElement>('#status')!
const action = document.querySelector<HTMLButtonElement>('#action')!
const pause = document.querySelector<HTMLButtonElement>('#pause')!
const armor = document.querySelector<HTMLElement>('#armor')!
const clock = document.querySelector<HTMLElement>('#clock')!
const kills = document.querySelector<HTMLElement>('#kills')!
const level = document.querySelector<HTMLElement>('#level')!
const xp = document.querySelector<HTMLElement>('#xp')!
const xpFill = xp.querySelector<HTMLElement>('i')!
const cards = document.querySelector<HTMLElement>('#cards')!
const cardsTitle = document.querySelector<HTMLElement>('#cards-title')!
const choices = document.querySelector<HTMLElement>('#choices')!
const slots = document.querySelector<HTMLElement>('#slots')!
const sector = document.querySelector<HTMLElement>('#sector')!
const clockLabel = document.querySelector<HTMLElement>('#clock-label')!
const heroList = document.querySelector<HTMLElement>('#heroes')!
const heroName = document.querySelector<HTMLElement>('#hero-name')!
const relicList = document.querySelector<HTMLElement>('#relics')!
const hint = document.querySelector<HTMLElement>('#hint')!
const cardsLabel = document.querySelector<HTMLElement>('#cards-label')!
const cardsMessage = document.querySelector<HTMLElement>('#cards-message')!
const directions = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

let language = readLanguage()
const languageButtons = {
  en: document.querySelector<HTMLButtonElement>('#en')!,
  ru: document.querySelector<HTMLButtonElement>('#ru')!,
}

function localizePage() {
  document.documentElement.lang = language
  const copy = messages[language]
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value !== 'string') continue
    document.querySelectorAll(`[data-copy="${key}"]`).forEach(node => { node.textContent = value })
    document.querySelectorAll(`[data-label="${key}"]`).forEach(node => { node.setAttribute('aria-label', value) })
  }
  for (const [code, button] of Object.entries(languageButtons)) {
    button.setAttribute('aria-pressed', String(code === language))
  }
}

localizePage()
const initial = messages[language]
status.textContent = initial.status.ready
label.textContent = initial.ready.label
title.textContent = initial.ready.title
message.textContent = initial.ready.message
action.textContent = initial.loading
armor.setAttribute('aria-label', initial.armorValue(MAX_ARMOR, MAX_ARMOR))
xp.setAttribute('aria-label', initial.xpValue(0, xpGoal(1)))

function timeText(seconds: number) {
  return (
    Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (seconds % 60).toString().padStart(2, '0')
  )
}

class Arena extends Phaser.Scene {
  // The hero picked for the next run; a finished run keeps its own on the result screen.
  private hero: HeroId = 'warden'
  private battle = new Battle()
  private lastHero = ''
  private keys = new Set<string>()
  private warden!: Phaser.GameObjects.Image
  private foes: Phaser.GameObjects.Image[] = []
  private embers: Phaser.GameObjects.Image[] = []
  private oils: Phaser.GameObjects.Image[] = []
  private chests: Phaser.GameObjects.Image[] = []
  private warnings!: Phaser.GameObjects.Graphics
  private effects!: Phaser.GameObjects.Graphics
  private flash?: { shot: Shot; life: number }
  // Short-lived pictures of pickups, blade swings and bell strokes.
  private pictures: { event: BattleEvent; life: number; span: number }[] = []
  private lastPhase?: Phase
  private lastArmor = -1
  private lastGrowth = ''
  private lastSlots = ''
  private lastPlace = ''
  private floor!: Phaser.GameObjects.Image

  create() {
    this.textures.addCanvas('floor', floorTexture())
    this.textures.addCanvas('garden', gardenTexture())
    this.textures.addCanvas('duchess', duchessTexture())
    this.textures.addCanvas('seal', sealTexture())
    for (const id of heroIds) this.textures.addCanvas(id, heroTexture(id))
    this.textures.addCanvas('briarling', briarlingTexture())
    this.textures.addCanvas('ember', emberTexture())
    this.textures.addCanvas('boar', boarTexture())
    this.textures.addCanvas('archer', archerTexture())
    this.textures.addCanvas('oil', oilTexture())
    this.textures.addCanvas('marked', markedTexture())
    this.textures.addCanvas('knight', knightTexture())
    this.textures.addCanvas('moth', mothTexture())
    this.textures.addCanvas('gardener', gardenerTexture())
    this.textures.addCanvas('reliquary', reliquaryTexture())
    // The running scene, for browser tests and for poking at it from the console.
    Object.assign(window, { arena: this })
    this.floor = this.add.image(0, 0, 'floor').setOrigin(0)
    this.warden = this.add.image(0, 0, 'warden').setDepth(2)
    this.effects = this.add.graphics().setDepth(3)
    this.warnings = this.add.graphics().setDepth(0.7)
    this.battle = this.titleScreen()

    const selectLanguage = (next: Language) => {
      language = next
      saveLanguage(next)
      localizePage()
      this.lastArmor = -1
      this.lastGrowth = ''
      this.lastSlots = ''
      this.lastPlace = ''
      this.lastHero = ''
      this.renderBattle()
      this.showPhase()
    }
    languageButtons.en.onclick = () => selectLanguage('en')
    languageButtons.ru.onclick = () => selectLanguage('ru')

    action.onclick = () => {
      if (this.battle.phase === 'paused') {
        this.battle.phase = 'playing'
      } else {
        this.battle = new Battle(undefined, this.hero)
        this.battle.phase = 'playing'
        this.flash = undefined
        this.pictures = []
      }
      this.keys.clear()
      action.blur()
      this.renderBattle()
    }
    pause.onclick = () => this.pauseRun()
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    window.addEventListener('blur', this.pauseRun)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.keyDown)
      window.removeEventListener('keyup', this.keyUp)
      window.removeEventListener('blur', this.pauseRun)
      document.removeEventListener('visibilitychange', this.onVisibility)
    })
    this.renderBattle()
    action.disabled = false
  }

  // Three still briarlings pose beside the chosen hero on the title screen.
  private titleScreen() {
    const battle = new Battle(undefined, this.hero)
    const { x, y } = battle.player
    battle.foes = [[131, -106], [190, -56], [88, 104]].map(([dx, dy]) =>
      makeFoe('briarling', x + dx, y + dy, 0, 1),
    )
    return battle
  }

  private pickHero(id: HeroId) {
    this.hero = id
    if (this.battle.phase === 'ready') this.battle = this.titleScreen()
    this.lastHero = ''
    this.renderBattle()
  }

  // The picker shows wherever a new run can start: the title and both result screens.
  private showHeroes() {
    const copy = messages[language]
    heroList.replaceChildren(
      ...heroIds.map(id => {
        const button = document.createElement('button')
        const name = document.createElement('b')
        const spell = document.createElement('em')
        const gift = document.createElement('span')
        button.type = 'button'
        button.setAttribute('role', 'radio')
        button.setAttribute('aria-checked', String(id === this.hero))
        name.textContent = copy.heroes[id].name
        spell.textContent = copy.spells[heroes[id].spell].name
        gift.textContent = copy.heroes[id].gift
        button.append(name, spell, gift)
        button.onclick = () => this.pickHero(id)
        return button
      }),
    )
  }

  private pauseRun = () => {
    if (this.battle.phase !== 'playing') return
    this.keys.clear()
    this.battle.phase = 'paused'
    this.renderBattle()
  }

  private onVisibility = () => {
    if (document.hidden) this.pauseRun()
  }

  private keyDown = (event: KeyboardEvent) => {
    if (directions.has(event.code) && this.battle.phase === 'playing') {
      event.preventDefault()
      this.keys.add(event.code)
    } else if (this.battle.phase === 'choosing' && /^Digit[1-9]$/.test(event.code)) {
      if (!event.repeat) this.pick(Number(event.code.slice(5)) - 1)
    } else if (event.code === 'Escape' && !event.repeat) {
      if (this.battle.phase === 'paused') action.click()
      else this.pauseRun()
    }
  }

  private keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code)
  }

  update(_time: number, delta: number) {
    if (this.battle.phase !== 'playing') return
    const held = (a: string, b: string) =>
      Number(this.keys.has(a) || this.keys.has(b))
    let remaining = Math.min(delta / 1000, 0.1)
    const dx = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft')
    const dy = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp')
    while (remaining > 0 && this.battle.phase === 'playing') {
      const dt = Math.min(remaining, 1 / 60)
      if (this.flash) this.flash.life -= dt
      for (const effect of this.pictures) effect.life -= dt
      for (const event of this.battle.step(dt, dx, dy)) {
        if (event.type === 'shot') this.flash = { shot: event, life: 0.17 }
        const span = {
          pickup: 0.25, heal: 0.45, open: 0.5, mend: 0.45, bloom: 0.22, summon: 0.5, rise: 0.8, slash: 0.16, toll: 0.32, lash: 0.24, chain: 0.16, burst: 0.3, sting: 0.18,
        }[event.type as string]
        if (span) this.pictures.push({ event, life: span, span })
      }
      remaining -= dt
    }
    this.pictures = this.pictures.filter(effect => effect.life > 0)
    this.renderBattle()
  }

  private renderBattle() {
    const b = this.battle
    // Moving between the court and the garden swaps the ground and the HUD.
    const place = b.stage + language
    if (this.lastPlace !== place) {
      const copy = messages[language]
      const area = b.stage === 'court' ? court : garden
      this.floor.setTexture(b.stage === 'court' ? 'floor' : 'garden')
      this.cameras.main.setBounds(0, 0, area.width, area.height)
      sector.textContent = b.stage === 'court' ? copy.sector : copy.garden.sector
      clockLabel.textContent = b.stage === 'court' ? copy.timer : copy.garden.timer
      this.lastPlace = place
      this.lastPhase = undefined
    }
    const view = b.camera()
    this.cameras.main.setScroll(view.x, view.y)
    const shown = b.hero + this.hero + language
    if (this.lastHero !== shown) {
      this.warden.setTexture(b.hero)
      heroName.textContent = messages[language].heroes[b.hero].name
      this.showHeroes()
      this.lastHero = shown
    }
    this.warden.setPosition(b.player.x, b.player.y).setRotation(b.facing)
    this.warden.setAlpha(
      b.immunity > 0 && Math.floor(b.immunity * 12) % 2 ? 0.45 : 1,
    )
    while (this.foes.length < b.foes.length) {
      this.foes.push(this.add.image(0, 0, 'briarling').setDepth(1))
    }
    // Marked lanes: where a boar is about to run and where an archer aims.
    const w = this.warnings.clear()
    this.foes.forEach((image, index) => {
      const foe = b.foes[index]
      image.setVisible(!!foe)
      if (!foe) return
      if (image.texture.key !== foe.kind) image.setTexture(foe.kind)
      const rooted = foe.kind === 'seal' || foe.kind === 'duchess' || foe.kind === 'gardener'
      const locked = foe.mode !== 'chase' && foe.mode !== 'rest'
      const pawing = foe.mode === 'windup' ? Math.sin(b.elapsed * 70) * 2 : 0
      image
        .setPosition(foe.x + pawing, foe.y)
        .setRotation(
          rooted
            ? 0
            : locked
              ? Math.atan2(foe.dir.y, foe.dir.x)
              : Math.atan2(b.player.y - foe.y, b.player.x - foe.x),
        )
      if (rooted) {
        // A health bar under each rooted thing; the seal is tied to the crown.
        const span = foe.kind === 'seal' ? 44 : 96
        const left = foe.x - span / 2
        const below = foe.y + (foe.kind === 'seal' ? 30 : 62)
        w.fillStyle(0x17131c, 0.8)
        w.fillRect(left - 1, below - 1, span + 2, 7)
        w.fillStyle(foe.kind === 'seal' ? 0xd877e6 : 0xe7bd78, 1)
        w.fillRect(left, below, (span * Math.max(0, foe.health)) / foe.full, 5)
      }
      if (foe.mode === 'windup') {
        const progress = 1 - foe.timer / boarCharge.windup
        const { x, y } = foe.dir
        const side = boarCharge.width / 2
        const far = { x: foe.x + x * boarCharge.length, y: foe.y + y * boarCharge.length }
        w.fillStyle(0xff5a3c, 0.1 + 0.22 * progress)
        w.beginPath()
        w.moveTo(foe.x - y * side, foe.y + x * side)
        w.lineTo(far.x - y * side, far.y + x * side)
        w.lineTo(far.x + y * side, far.y - x * side)
        w.lineTo(foe.x + y * side, foe.y - x * side)
        w.closePath()
        w.fillPath()
      } else if (foe.mode === 'aim' || foe.mode === 'volley') {
        const progress = foe.mode === 'aim' ? 1 - foe.timer / archerVolley.windup : 1
        w.lineStyle(2 + 2 * progress, 0xffe08a, 0.2 + 0.5 * progress)
        w.lineBetween(
          foe.x,
          foe.y,
          foe.x + foe.dir.x * archerVolley.arrowReach,
          foe.y + foe.dir.y * archerVolley.arrowReach,
        )
      }
    })
    // The Gardener's grave: a glowing bell while it waits, filling as it is rung.
    const pulse = 0.5 + 0.5 * Math.sin(b.elapsed * 6)
    if (b.stage === 'court' && b.trial === 'ready') {
      const { x, y } = court.grave
      w.lineStyle(3, 0xffe08a, 0.35 + 0.4 * pulse)
      w.strokeCircle(x, y, gardenerRule.reach)
      w.fillStyle(0xffe08a, 0.25)
      w.slice(x, y, gardenerRule.reach, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * b.ringing) / gardenerRule.ring).fillPath()
    }
    // An arrow at the edge of the view points to the grave, or to the risen Gardener.
    const lord = b.foes.find(foe => foe.kind === 'gardener')
    const beacon = b.stage !== 'court' ? undefined : lord ?? (b.trial === 'ready' ? court.grave : undefined)
    if (beacon) {
      const view = b.camera()
      const inside =
        beacon.x > view.x && beacon.x < view.x + court.view.width &&
        beacon.y > view.y && beacon.y < view.y + court.view.height
      if (!inside) {
        const turn = Math.atan2(beacon.y - b.player.y, beacon.x - b.player.x)
        const ax = Math.max(view.x + 26, Math.min(view.x + court.view.width - 26, beacon.x))
        const ay = Math.max(view.y + 26, Math.min(view.y + court.view.height - 26, beacon.y))
        w.fillStyle(lord ? 0xf4f1e6 : 0xffe08a, 0.6 + 0.4 * pulse)
        w.beginPath()
        w.moveTo(ax + Math.cos(turn) * 14, ay + Math.sin(turn) * 14)
        w.lineTo(ax + Math.cos(turn + 2.5) * 12, ay + Math.sin(turn + 2.5) * 12)
        w.lineTo(ax + Math.cos(turn - 2.5) * 12, ay + Math.sin(turn - 2.5) * 12)
        w.closePath()
        w.fillPath()
      }
    }
    // Blessed blade swings linger as silver trails.
    for (const trail of b.trails) {
      w.fillStyle(0xcfd8ff, 0.14)
      w.slice(trail.at.x, trail.at.y, trail.range, trail.facing - trail.arc, trail.facing + trail.arc).fillPath()
    }
    // Fire seeds wait on the ground; firefly spirits ride their ring.
    for (const seed of b.seeds) {
      const glow = 0.5 + 0.5 * Math.sin(b.elapsed * 8 + seed.x)
      w.fillStyle(0xff8a3c, 0.25 + 0.2 * glow)
      w.fillCircle(seed.x, seed.y, 9)
      w.fillStyle(0xffd27a, 1)
      w.fillCircle(seed.x, seed.y, 3.5)
    }
    const lady = b.stage === 'garden' ? b.duchess : undefined
    if (lady) {
      const pulse = 0.5 + 0.5 * Math.sin(b.elapsed * 9)
      if (b.shielded) {
        for (const foe of b.foes) {
          if (foe.kind !== 'seal') continue
          w.lineStyle(2, 0xd877e6, 0.25 + 0.2 * pulse)
          w.lineBetween(foe.x, foe.y, lady.x, lady.y)
        }
        // The closed crown: a ring of vines around the Duchess.
        w.lineStyle(6, 0x4b6b4a, 0.95)
        w.strokeCircle(lady.x, lady.y, 50)
        w.lineStyle(2, 0x9fc38a, 0.9)
        w.strokeCircle(lady.x, lady.y, 55)
      } else {
        w.lineStyle(3, 0xffe08a, 0.35 + 0.5 * pulse)
        w.strokeCircle(lady.x, lady.y, 50 + 6 * pulse)
      }
      if (b.lash.warned) {
        const progress = 1 - b.lash.timer / garden.lash.windup
        const arc = (garden.lash.arc * Math.PI) / 180
        w.fillStyle(0xb02a55, 0.12 + 0.3 * progress)
        w.slice(lady.x, lady.y, garden.lash.range, b.lash.facing - arc, b.lash.facing + arc).fillPath()
      }
    }
    while (this.oils.length < b.oils.length) {
      this.oils.push(this.add.image(0, 0, 'oil').setDepth(0.5))
    }
    this.oils.forEach((image, index) => {
      const drop = b.oils[index]
      image.setVisible(!!drop)
      if (drop) image.setPosition(drop.x, drop.y)
    })
    while (this.chests.length < b.reliquaries.length) {
      this.chests.push(this.add.image(0, 0, 'reliquary').setDepth(0.6))
    }
    this.chests.forEach((image, index) => {
      const chest = b.reliquaries[index]
      image.setVisible(!!chest)
      if (chest) image.setPosition(chest.x, chest.y).setScale(1 + 0.08 * Math.sin(b.elapsed * 5))
    })
    while (this.embers.length < b.embers.length) {
      this.embers.push(this.add.image(0, 0, 'ember').setDepth(0.5))
    }
    this.embers.forEach((image, index) => {
      const ember = b.embers[index]
      image.setVisible(!!ember)
      if (ember)
        image
          .setPosition(ember.x, ember.y)
          .setScale(1 + 0.12 * Math.sin(b.elapsed * 6 + ember.x))
    })
    const g = this.effects.clear()
    const flies = b.spells.fireflies && b.stats('fireflies')
    if (flies) {
      g.lineStyle(1, 0xd8f59a, 0.12)
      g.strokeCircle(b.player.x, b.player.y, flies.range)
      for (let i = 0; i < b.swarmSize; i++) {
        const turn = b.flyTurn + (i * 2 * Math.PI) / b.swarmSize
        const x = b.player.x + Math.cos(turn) * flies.range
        const y = b.player.y + Math.sin(turn) * flies.range
        g.fillStyle(0xd8f59a, 0.3)
        g.fillCircle(x, y, 10)
        g.fillStyle(0xf6ffd6, 1)
        g.fillCircle(x, y, 4)
      }
    }
    g.lineStyle(2, 0xf3ead2, 1)
    for (const arrow of b.arrows) {
      g.lineBetween(arrow.x - arrow.vx * 0.05, arrow.y - arrow.vy * 0.05, arrow.x, arrow.y)
    }
    for (const { event, life, span } of this.pictures) {
      const fade = life / span
      if (event.type === 'pickup') {
        g.lineStyle(1.5, 0xffc46b, fade)
        g.strokeCircle(event.at.x, event.at.y, 6 + (1 - fade) * 14)
      } else if (event.type === 'chain') {
        g.lineStyle(2.5, 0xffdb93, fade)
        g.lineBetween(event.from.x, event.from.y, event.to.x, event.to.y)
        g.strokeCircle(event.to.x, event.to.y, 5 + (1 - fade) * 8)
      } else if (event.type === 'burst') {
        const radius = event.radius * (0.4 + 0.6 * (1 - fade))
        g.fillStyle(0xff8a3c, 0.3 * fade)
        g.fillCircle(event.at.x, event.at.y, radius)
        g.lineStyle(3, 0xffd27a, fade)
        g.strokeCircle(event.at.x, event.at.y, radius)
      } else if (event.type === 'sting') {
        g.lineStyle(2, 0xd8f59a, fade)
        g.strokeCircle(event.at.x, event.at.y, 6 + (1 - fade) * 10)
      } else if (event.type === 'bloom') {
        g.fillStyle(0xff8a3c, 0.28 * fade)
        g.fillCircle(event.at.x, event.at.y, event.radius * (0.5 + 0.5 * (1 - fade)))
        g.lineStyle(2, 0xffd27a, fade)
        g.strokeCircle(event.at.x, event.at.y, event.radius * (0.5 + 0.5 * (1 - fade)))
      } else if (event.type === 'summon' || event.type === 'rise') {
        g.lineStyle(4, 0x9fc38a, fade)
        g.strokeCircle(event.at.x, event.at.y, 30 + (1 - fade) * 70)
      } else if (event.type === 'mend') {
        // The golden thread from a moth to the foe it mends.
        g.lineStyle(2.5, 0xffe08a, 0.8 * fade)
        g.lineBetween(event.from.x, event.from.y, event.to.x, event.to.y)
        g.strokeCircle(event.to.x, event.to.y, 10 + (1 - fade) * 10)
      } else if (event.type === 'open') {
        g.lineStyle(3, 0xffe08a, fade)
        g.strokeCircle(event.at.x, event.at.y, 14 + (1 - fade) * 40)
      } else if (event.type === 'heal') {
        g.lineStyle(2.5, 0xa9efd9, fade)
        g.strokeCircle(b.player.x, b.player.y, 20 + (1 - fade) * 18)
      } else if (event.type === 'slash') {
        const { at, facing, range, arc } = event
        g.fillStyle(0xcfd8ff, 0.4 * fade)
        g.slice(at.x, at.y, range, facing - arc, facing + arc).fillPath()
        g.lineStyle(2.5, 0xf2f5ff, fade)
        g.beginPath().arc(at.x, at.y, range, facing - arc, facing + arc).strokePath()
      } else if (event.type === 'lash') {
        const { at, facing, range, arc } = event
        g.fillStyle(0xff9fbd, 0.55 * fade)
        g.slice(at.x, at.y, range, facing - arc, facing + arc).fillPath()
      } else if (event.type === 'toll') {
        const radius = event.radius * (0.35 + 0.65 * (1 - fade))
        g.fillStyle(0xe7bd78, 0.12 * fade)
        g.fillCircle(event.at.x, event.at.y, radius)
        g.lineStyle(3, 0xe7bd78, fade)
        g.strokeCircle(event.at.x, event.at.y, radius)
      }
    }
    g.lineStyle(1.5, b.immunity > 0 ? 0xff9c7b : 0xa2ebc4, 0.8)
    g.strokeCircle(b.player.x, b.player.y, 20)
    if (this.flash && this.flash.life > 0) {
      const { from, to } = this.flash.shot
      const fade = this.flash.life / 0.17
      const progress = 1 - fade
      g.fillStyle(0xe8c787, fade)
      for (let i = 0; i < 6; i++) {
        const t = Math.max(0, Math.min(1, progress * 1.6 - i * 0.07))
        const x = from.x + (to.x - from.x) * t
        const y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 8
        g.fillCircle(x, y, 3.6 - i * 0.45)
      }
      g.lineStyle(1.5, 0xffdb93, fade)
      g.strokeCircle(to.x, to.y, 4 + progress * 8)
    }
    // The flower on the Gardener's chest: white and wide while he can be struck.
    if (lord) {
      const open = lord.mode === 'open'
      g.fillStyle(open ? 0xf4f1e6 : 0x3d4a36, 1)
      g.fillCircle(lord.x, lord.y, open ? 13 + 2 * pulse : 7)
      if (open) {
        g.fillStyle(0xffe08a, 1)
        g.fillCircle(lord.x, lord.y, 5)
        g.lineStyle(2, 0xf4f1e6, 0.5 + 0.4 * pulse)
        g.strokeCircle(lord.x, lord.y, 48)
      }
    }
    const tip = b.phase !== 'playing' || b.stage !== 'court'
      ? ''
      : lord ? messages[language].trialHint : b.trial === 'ready' ? messages[language].bellHint : ''
    if (hint.textContent !== tip) hint.textContent = tip
    hint.hidden = !tip
    const timer = lady
      ? Math.ceil((100 * Math.max(0, lady.health)) / foes.duchess.health) + '%'
      : b.stage === 'garden'
        ? '0%'
        : timeText(Math.ceil(DURATION - b.elapsed))
    const count = String(b.kills).padStart(2, '0')
    if (clock.textContent !== timer) clock.textContent = timer
    if (kills.textContent !== count) kills.textContent = count
    const goal = xpGoal(b.level)
    const growth = b.level + ':' + b.xp
    if (this.lastGrowth !== growth) {
      level.textContent = String(b.level)
      xpFill.style.width = (100 * b.xp) / goal + '%'
      xp.setAttribute('aria-valuemax', String(goal))
      xp.setAttribute('aria-valuenow', String(b.xp))
      xp.setAttribute('aria-label', messages[language].xpValue(b.xp, goal))
      this.lastGrowth = growth
    }
    const learned = b.loadout.join() + JSON.stringify(b.relics) + JSON.stringify(b.blessed)
    if (this.lastSlots !== learned) {
      const copy = messages[language]
      const held = Object.entries(b.relics)
      relicList.replaceChildren(
        ...Array.from({ length: relicRule.slots }, (_, index) => {
          const slot = document.createElement('span')
          const relic = held[index]
          slot.setAttribute('role', 'listitem')
          slot.className = relic ? '' : 'empty'
          slot.textContent = relic ? `${copy.relics[relic[0] as RelicId].name} ${relic[1]}` : '—'
          if (!relic) slot.setAttribute('aria-label', copy.emptySlot)
          return slot
        }),
      )
      slots.replaceChildren(
        ...Array.from({ length: loadout.slots }, (_, index) => {
          const slot = document.createElement('span')
          const spell = b.loadout[index]
          slot.setAttribute('role', 'listitem')
          slot.className = spell ? '' : 'empty'
          slot.textContent = spell ? copy.spells[spell].name + (b.blessed[spell] ? ' ✦' : '') : '—'
          if (!spell) slot.setAttribute('aria-label', copy.emptySlot)
          return slot
        }),
      )
      this.lastSlots = learned
    }
    // The pilgrim's cloak adds pips, so the row is rebuilt to the current maximum.
    const pips = b.armor + b.maxArmor * 1000
    if (this.lastArmor !== pips) {
      armor.replaceChildren(
        ...Array.from({ length: Math.min(b.maxArmor, 12) }, (_, i) => {
          const pip = document.createElement('i')
          pip.classList.toggle('lost', i >= b.armor)
          return pip
        }),
      )
      armor.setAttribute('aria-label', messages[language].armorValue(b.armor, b.maxArmor))
      this.lastArmor = pips
    }
    if (this.lastPhase !== b.phase) {
      if (b.phase === 'choosing') this.keys.clear()
      this.showPhase()
      if (b.phase === 'paused' || b.phase === 'won' || b.phase === 'lost')
        action.focus({ preventScroll: true })
    }
    this.lastPhase = b.phase
  }

  private pick(index: number) {
    this.battle.choose(index)
    this.renderBattle()
    if (this.battle.phase === 'choosing') this.showCards()
  }

  private showCards() {
    const copy = messages[language]
    const chest = this.battle.openingChest
    const bless = this.battle.blessing
    cardsLabel.textContent = chest ? copy.chestLabel : bless ? copy.blessLabel : copy.chooseLabel
    status.textContent = chest ? copy.chestLabel : bless ? copy.blessLabel : copy.status.choosing
    cardsTitle.textContent = chest
      ? copy.chestTitle
      : bless ? copy.blessTitle : copy.levelTitle(this.battle.choiceLevel)
    cardsMessage.textContent = chest ? copy.chestMessage : bless ? copy.blessMessage : copy.chooseMessage
    choices.replaceChildren(
      ...this.battle.offer.map((card, index) => {
        const button = document.createElement('button')
        const key = document.createElement('kbd')
        const group = document.createElement('em')
        const name = document.createElement('b')
        const detail = document.createElement('span')
        button.type = 'button'
        key.textContent = String(index + 1)
        if (card.kind === 'bless') {
          button.className = 'bless'
          group.textContent = copy.blessGroup
          name.textContent = copy.spells[card.spell].name
          detail.textContent = copy.blessings[card.spell]
        } else if (card.kind === 'relic') {
          const relic = copy.relics[card.relic]
          button.className = 'relic'
          group.textContent = card.level === 1 ? copy.newRelic : copy.relicLevel(card.level)
          name.textContent = relic.name
          detail.textContent = relic.about
        } else if (card.kind === 'learn') {
          const spell = copy.spells[card.spell]
          button.className = 'learn'
          group.textContent = copy.newSpell
          name.textContent = spell.name
          detail.textContent = spell.about
        } else {
          const { title, stat } = copy.upgrades[card.id]
          group.textContent = copy.spells[card.spell].name
          name.textContent = title
          detail.textContent = `${stat} ${shown(card.from)} → ${shown(card.to)}`
        }
        button.append(key, group, name, detail)
        button.onclick = () => this.pick(index)
        return button
      }),
    )
    choices.querySelector('button')?.focus({ preventScroll: true })
  }

  private showPhase() {
    const b = this.battle
    const copy = messages[language]
    status.textContent =
      b.phase === 'playing' && b.stage === 'garden' ? copy.garden.status : copy.status[b.phase]
    panel.hidden = b.phase === 'playing' || b.phase === 'choosing'
    cards.hidden = b.phase !== 'choosing'
    pause.disabled = b.phase !== 'playing'
    if (b.phase === 'choosing') this.showCards()
    if (b.phase === 'playing' || b.phase === 'choosing') return
    heroList.hidden = b.phase === 'paused'
    const screen = copy[b.phase]
    label.textContent = screen.label
    title.textContent = screen.title
    if (b.phase === 'ready' || b.phase === 'paused') {
      message.textContent = copy[b.phase].message
      action.textContent = copy[b.phase].action
    } else {
      message.textContent = [
        copy.result(timeText(Math.floor(b.elapsed)), b.kills, b.level),
        copy.build(b.loadout.map(id => copy.spells[id].name).join(', ')),
        copy.heroLine(copy.heroes[b.hero].name),
        ...b.loadout.filter(id => b.blessed[id]).map(id => copy.blessLine(copy.spells[id].name)),
        ...(Object.keys(b.relics).length
          ? [copy.relicLine(Object.entries(b.relics).map(([id, level]) => `${copy.relics[id as RelicId].name} ${level}`).join(', '))]
          : []),
        ...(b.phase === 'lost' ? [copy.fell[b.stage]] : []),
      ].join(' ')
      action.textContent = copy.retry
    }
  }
}

function shown(value: number) {
  return String(Number(value.toFixed(1)))
}

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game',
  width: court.view.width,
  height: court.view.height,
  backgroundColor: '#30352d',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  audio: { noAudio: true },
  scene: Arena,
})
