import Phaser from 'phaser'
import { Battle, DURATION, HEIGHT, MAX_ARMOR, WIDTH, xpGoal } from './battle'
import type { BattleEvent, Phase, Shot } from './battle'
import { loadout } from './content'
import { briarlingTexture, emberTexture, floorTexture, wardenTexture } from './art'
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
  private battle = new Battle()
  private keys = new Set<string>()
  private warden!: Phaser.GameObjects.Image
  private foes: Phaser.GameObjects.Image[] = []
  private embers: Phaser.GameObjects.Image[] = []
  private effects!: Phaser.GameObjects.Graphics
  private flash?: { shot: Shot; life: number }
  // Short-lived pictures of pickups, blade swings and bell strokes.
  private pictures: { event: BattleEvent; life: number; span: number }[] = []
  private lastPhase?: Phase
  private lastArmor = -1
  private lastGrowth = ''
  private lastSlots = ''

  create() {
    this.textures.addCanvas('floor', floorTexture())
    this.textures.addCanvas('warden', wardenTexture())
    this.textures.addCanvas('briarling', briarlingTexture())
    this.textures.addCanvas('ember', emberTexture())
    this.add.image(0, 0, 'floor').setOrigin(0)
    this.warden = this.add.image(0, 0, 'warden').setDepth(2)
    this.effects = this.add.graphics().setDepth(3)
    this.battle.foes = [
      { x: 756, y: 138, speed: 0, health: 1 },
      { x: 815, y: 188, speed: 0, health: 1 },
      { x: 713, y: 348, speed: 0, health: 1 },
    ]

    const selectLanguage = (next: Language) => {
      language = next
      saveLanguage(next)
      localizePage()
      this.lastArmor = -1
      this.lastGrowth = ''
      this.lastSlots = ''
      this.renderBattle()
      this.showPhase()
    }
    languageButtons.en.onclick = () => selectLanguage('en')
    languageButtons.ru.onclick = () => selectLanguage('ru')

    action.onclick = () => {
      if (this.battle.phase === 'paused') {
        this.battle.phase = 'playing'
      } else {
        this.battle = new Battle()
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
        const span = { pickup: 0.25, slash: 0.16, toll: 0.32 }[event.type as string]
        if (span) this.pictures.push({ event, life: span, span })
      }
      remaining -= dt
    }
    this.pictures = this.pictures.filter(effect => effect.life > 0)
    this.renderBattle()
  }

  private renderBattle() {
    const b = this.battle
    this.warden.setPosition(b.player.x, b.player.y).setRotation(b.facing)
    this.warden.setAlpha(
      b.immunity > 0 && Math.floor(b.immunity * 12) % 2 ? 0.45 : 1,
    )
    while (this.foes.length < b.foes.length) {
      this.foes.push(this.add.image(0, 0, 'briarling').setDepth(1))
    }
    this.foes.forEach((image, index) => {
      const foe = b.foes[index]
      image.setVisible(!!foe)
      if (foe)
        image
          .setPosition(foe.x, foe.y)
          .setRotation(Math.atan2(b.player.y - foe.y, b.player.x - foe.x))
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
    for (const { event, life, span } of this.pictures) {
      const fade = life / span
      if (event.type === 'pickup') {
        g.lineStyle(1.5, 0xffc46b, fade)
        g.strokeCircle(event.at.x, event.at.y, 6 + (1 - fade) * 14)
      } else if (event.type === 'slash') {
        const { at, facing, range, arc } = event
        g.fillStyle(0xcfd8ff, 0.4 * fade)
        g.slice(at.x, at.y, range, facing - arc, facing + arc).fillPath()
        g.lineStyle(2.5, 0xf2f5ff, fade)
        g.beginPath().arc(at.x, at.y, range, facing - arc, facing + arc).strokePath()
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
    const timer = timeText(Math.ceil(DURATION - b.elapsed))
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
    const learned = b.loadout.join()
    if (this.lastSlots !== learned) {
      const copy = messages[language]
      slots.replaceChildren(
        ...Array.from({ length: loadout.slots }, (_, index) => {
          const slot = document.createElement('span')
          const spell = b.loadout[index]
          slot.setAttribute('role', 'listitem')
          slot.className = spell ? '' : 'empty'
          slot.textContent = spell ? copy.spells[spell].name : '—'
          if (!spell) slot.setAttribute('aria-label', copy.emptySlot)
          return slot
        }),
      )
      this.lastSlots = learned
    }
    if (this.lastArmor !== b.armor) {
      Array.from(armor.children).forEach((pip, i) =>
        pip.classList.toggle('lost', i >= b.armor),
      )
      armor.setAttribute('aria-label', messages[language].armorValue(b.armor, MAX_ARMOR))
      this.lastArmor = b.armor
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
    cardsTitle.textContent = copy.levelTitle(this.battle.choiceLevel)
    choices.replaceChildren(
      ...this.battle.offer.map((card, index) => {
        const button = document.createElement('button')
        const key = document.createElement('kbd')
        const group = document.createElement('em')
        const name = document.createElement('b')
        const detail = document.createElement('span')
        const spell = copy.spells[card.spell]
        button.type = 'button'
        key.textContent = String(index + 1)
        if (card.kind === 'learn') {
          button.className = 'learn'
          group.textContent = copy.newSpell
          name.textContent = spell.name
          detail.textContent = spell.about
        } else {
          const { title, stat } = copy.upgrades[card.id]
          group.textContent = spell.name
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
    status.textContent = copy.status[b.phase]
    panel.hidden = b.phase === 'playing' || b.phase === 'choosing'
    cards.hidden = b.phase !== 'choosing'
    pause.disabled = b.phase !== 'playing'
    if (b.phase === 'choosing') this.showCards()
    if (b.phase === 'playing' || b.phase === 'choosing') return
    const screen = copy[b.phase]
    label.textContent = screen.label
    title.textContent = screen.title
    if (b.phase === 'ready' || b.phase === 'paused') {
      message.textContent = copy[b.phase].message
      action.textContent = copy[b.phase].action
    } else {
      message.textContent = copy.result(timeText(Math.floor(b.elapsed)), b.kills, b.level)
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
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#30352d',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  audio: { noAudio: true },
  scene: Arena,
})
