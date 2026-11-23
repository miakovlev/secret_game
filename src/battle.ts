import { briarling, leveling, upgradeIds, upgrades, witchfire } from './content.ts'
import type { Spell, UpgradeId } from './content.ts'

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
  | { type: 'kill'; at: Point }
  | { type: 'pickup'; at: Point }
  | { type: 'level'; level: number }

// Experience needed to leave the given level.
export function xpGoal(level: number) {
  return leveling.first + (level - 1) * leveling.growth
}
export type Phase = 'ready' | 'playing' | 'paused' | 'choosing' | 'won' | 'lost'
// One upgrade card: the shown value of a witchfire stat before and after.
export type Choice = { id: UpgradeId; from: number; to: number }

export class Battle {
  phase: Phase = 'ready'
  player: Point = { x: 625, y: 244 }
  facing = 0
  foes: Foe[] = []
  embers: Ember[] = []
  xp = 0
  level = 1
  // Level-ups that still await an upgrade choice.
  pending = 0
  witchfire: Spell = { ...witchfire }
  armor = MAX_ARMOR
  kills = 0
  elapsed = 0
  immunity = 0
  private nextSpawn = 0
  private nextShot = 0

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

  // The level the current set of cards belongs to.
  get choiceLevel() {
    return this.level - this.pending + 1
  }

  choices(): Choice[] {
    return upgradeIds.map(id => ({
      id,
      from: upgrades[id].value(this.witchfire),
      to: upgrades[id].value(upgrades[id].apply(this.witchfire)),
    }))
  }

  choose(id: UpgradeId) {
    if (this.phase !== 'choosing') return
    this.witchfire = upgrades[id].apply(this.witchfire)
    this.pending--
    if (this.pending === 0) this.phase = 'playing'
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
      // The run stands still until every earned upgrade is chosen.
      this.phase = 'choosing'
      return events
    }

    this.nextSpawn -= dt
    if (this.nextSpawn <= 0) {
      this.spawn()
      this.nextSpawn += Math.max(0.34, 0.89 - this.elapsed * 0.009)
    }

    this.immunity = Math.max(0, this.immunity - dt)
    let closest = -1
    let nearest = this.witchfire.range
    for (const [index, foe] of this.foes.entries()) {
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
      if (remaining < nearest) {
        closest = index
        nearest = remaining
      }
    }

    this.nextShot = Math.max(0, this.nextShot - dt)
    if (closest >= 0 && this.nextShot === 0) {
      const foe = this.foes[closest]
      const at = { x: foe.x, y: foe.y }
      this.nextShot = this.witchfire.cooldown
      events.push({ type: 'shot', from: { ...this.player }, to: at })
      foe.health -= this.witchfire.damage
      if (foe.health <= 0) {
        this.foes.splice(closest, 1)
        this.kills++
        this.embers.push({ ...at, value: briarling.ember })
        events.push({ type: 'kill', at })
      }
    }
    return events
  }
}
