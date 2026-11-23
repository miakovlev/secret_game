import {
  briarling, leveling, loadout, shownValue, spellIds, spells, upgraded, upgradeIds, upgrades,
} from './content.ts'
import type { SpellId, Stats, UpgradeId } from './content.ts'

// Positions and speeds are expressed in arena pixels and seconds.
export const WIDTH = 1000
export const HEIGHT = 490
export const DURATION = 60
export const MAX_ARMOR = 5
export const PICKUP_RADIUS = 48
export type Point = { x: number; y: number }
export type Foe = Point & { speed: number; health: number }
export type Ember = Point & { value: number }
export type Shot = { from: Point; to: Point }
// Everything that happened during one step, in order, for the scene to show.
export type BattleEvent =
  | ({ type: 'shot' } & Shot)
  | { type: 'slash'; at: Point; facing: number; range: number; arc: number }
  | { type: 'toll'; at: Point; radius: number }
  | { type: 'kill'; at: Point }
  | { type: 'pickup'; at: Point }
  | { type: 'level'; level: number }
export type Phase = 'ready' | 'playing' | 'paused' | 'choosing' | 'won' | 'lost'
// One level-up card: a new spell, or the shown value of a stat before and after.
export type Choice =
  | { kind: 'learn'; spell: SpellId }
  | { kind: 'upgrade'; spell: SpellId; id: UpgradeId; from: number; to: number }

// Experience needed to leave the given level.
export function xpGoal(level: number) {
  return leveling.first + (level - 1) * leveling.growth
}

export class Battle {
  phase: Phase = 'ready'
  player: Point = { x: 625, y: 244 }
  facing = 0
  foes: Foe[] = []
  embers: Ember[] = []
  xp = 0
  level = 1
  // Level-ups that still await a card, and the cards on offer for the first of them.
  pending = 0
  offer: Choice[] = []
  // Learned spells in slot order, their current stats and seconds until the next cast.
  loadout: SpellId[] = [loadout.start]
  spells: Partial<Record<SpellId, Stats>> = { [loadout.start]: { ...spells[loadout.start] } }
  timers: Record<SpellId, number> = { witchfire: 0, moonblade: 0, toll: 0 }
  armor = MAX_ARMOR
  kills = 0
  elapsed = 0
  immunity = 0
  private nextSpawn = 0

  private readonly random: () => number

  constructor(random: () => number = Math.random) {
    this.random = random
  }

  private spawn() {
    const edge = Math.floor(this.random() * 4)
    const pos = this.random()
    const foe = {
      x: edge === 0 ? -14 : edge === 1 ? WIDTH + 14 : pos * WIDTH,
      y: edge === 2 ? -14 : edge === 3 ? HEIGHT + 14 : pos * HEIGHT,
      speed:
        briarling.speed +
        this.random() * briarling.speedSpread +
        this.elapsed * briarling.speedGrowth,
      health: briarling.health + this.elapsed * briarling.healthGrowth,
    }
    // Leave room to react when the warden is patrolling an entry point.
    if (Math.hypot(foe.x - this.player.x, foe.y - this.player.y) < 150) {
      if (edge < 2) foe.x = WIDTH - foe.x
      else foe.y = HEIGHT - foe.y
    }
    this.foes.push(foe)
  }

  private collect(events: BattleEvent[]) {
    this.embers = this.embers.filter(ember => {
      const distance = Math.hypot(
        ember.x - this.player.x,
        ember.y - this.player.y,
      )
      if (distance > PICKUP_RADIUS) return true
      this.xp += ember.value
      events.push({ type: 'pickup', at: { x: ember.x, y: ember.y } })
      while (this.xp >= xpGoal(this.level)) {
        this.xp -= xpGoal(this.level)
        this.level++
        this.pending++
        events.push({ type: 'level', level: this.level })
      }
      return false
    })
  }

  // Unlearned spells come first while a slot is free; random upgrades of
  // learned spells fill the remaining cards.
  private deal() {
    const free = this.loadout.length < loadout.slots
    const cards: Choice[] = spellIds
      .filter(spell => free && !this.spells[spell])
      .slice(0, loadout.cards)
      .map(spell => ({ kind: 'learn', spell }))
    const pool = upgradeIds.filter(id => this.spells[upgrades[id].spell])
    while (cards.length < loadout.cards && pool.length) {
      const [id] = pool.splice(Math.floor(this.random() * pool.length), 1)
      const { spell } = upgrades[id]
      const stats = this.spells[spell]!
      cards.push({
        kind: 'upgrade',
        spell,
        id,
        from: shownValue(stats, id),
        to: shownValue(upgraded(stats, id), id),
      })
    }
    this.offer = cards
  }

  // The level the current set of cards belongs to.
  get choiceLevel() {
    return this.level - this.pending + 1
  }

  choose(index: number) {
    const card = this.offer[index]
    if (this.phase !== 'choosing' || !card) return
    if (card.kind === 'learn') {
      this.loadout.push(card.spell)
      this.spells[card.spell] = { ...spells[card.spell] }
    } else {
      this.spells[card.spell] = upgraded(this.spells[card.spell]!, card.id)
    }
    this.pending--
    if (this.pending) {
      this.deal()
    } else {
      this.offer = []
      this.phase = 'playing'
    }
  }

  // Each learned spell keeps its own cooldown and casts as soon as it is ready.
  private cast(dt: number, events: BattleEvent[]) {
    const at = { ...this.player }
    const reach = (foe: Foe) => Math.hypot(foe.x - at.x, foe.y - at.y)
    for (const id of this.loadout) {
      const stats = this.spells[id]!
      this.timers[id] = Math.max(0, this.timers[id] - dt)
      if (this.timers[id] > 0) continue
      let struck: Foe[]
      if (id === 'witchfire') {
        // Witchfire waits for a target instead of wasting the spark.
        let target: Foe | undefined
        let nearest = stats.range
        for (const foe of this.foes) {
          if (reach(foe) < nearest) {
            target = foe
            nearest = reach(foe)
          }
        }
        if (!target) continue
        struck = [target]
        events.push({ type: 'shot', from: at, to: { x: target.x, y: target.y } })
      } else if (id === 'moonblade') {
        const arc = (stats.arc * Math.PI) / 180
        struck = this.foes.filter(foe => {
          const turn = Math.atan2(foe.y - at.y, foe.x - at.x) - this.facing
          const aside = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))
          return reach(foe) < stats.range && aside <= arc
        })
        events.push({ type: 'slash', at, facing: this.facing, range: stats.range, arc })
      } else {
        struck = this.foes.filter(foe => reach(foe) < stats.range)
        events.push({ type: 'toll', at, radius: stats.range })
        for (const foe of struck) {
          const distance = reach(foe) || 1
          foe.x += ((foe.x - at.x) / distance) * stats.knockback
          foe.y += ((foe.y - at.y) / distance) * stats.knockback
        }
      }
      this.timers[id] = stats.cooldown
      for (const foe of struck) {
        foe.health -= stats.damage
        if (foe.health > 0) continue
        const fallen = { x: foe.x, y: foe.y }
        this.foes.splice(this.foes.indexOf(foe), 1)
        this.kills++
        this.embers.push({ ...fallen, value: briarling.ember })
        events.push({ type: 'kill', at: fallen })
      }
    }
  }

  step(dt: number, dx: number, dy: number): BattleEvent[] {
    const events: BattleEvent[] = []
    if (this.phase !== 'playing') return events
    this.elapsed += dt
    if (this.elapsed >= DURATION) {
      this.elapsed = DURATION
      this.phase = 'won'
      return events
    }
    const length = Math.hypot(dx, dy)
    if (length) {
      this.facing = Math.atan2(dy, dx)
      this.player.x = Math.max(
        22,
        Math.min(WIDTH - 22, this.player.x + (160 * dt * dx) / length),
      )
      this.player.y = Math.max(
        22,
        Math.min(HEIGHT - 22, this.player.y + (160 * dt * dy) / length),
      )
    }
    this.collect(events)
    if (this.pending) {
      // The run stands still until every earned card is chosen.
      this.deal()
      this.phase = 'choosing'
      return events
    }

    this.nextSpawn -= dt
    if (this.nextSpawn <= 0) {
      this.spawn()
      this.nextSpawn += Math.max(0.34, 0.89 - this.elapsed * 0.009)
    }

    this.immunity = Math.max(0, this.immunity - dt)
    for (const foe of this.foes) {
      const vx = this.player.x - foe.x
      const vy = this.player.y - foe.y
      const distance = Math.hypot(vx, vy)
      if (distance > 0) {
        const travel = Math.min(distance, dt * foe.speed)
        foe.x += (vx / distance) * travel
        foe.y += (vy / distance) * travel
      }
      const remaining = Math.hypot(
        this.player.x - foe.x,
        this.player.y - foe.y,
      )
      if (remaining < 18 && this.immunity === 0) {
        this.armor--
        this.immunity = 1.25
        if (this.armor === 0) {
          this.phase = 'lost'
          return events
        }
      }
    }

    this.cast(dt, events)
    return events
  }
}
