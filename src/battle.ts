// Positions and speeds are expressed in arena pixels and seconds.
export const WIDTH = 1000
export const HEIGHT = 490
export const DURATION = 60
export const MAX_ARMOR = 5
export type Point = { x: number; y: number }
export type Foe = Point & { speed: number }
export type Shot = { from: Point; to: Point }
export type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost'

export class Battle {
  phase: Phase = 'ready'
  player: Point = { x: 625, y: 244 }
  facing = 0
  foes: Foe[] = []
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
      speed: 53 + this.random() * 15 + this.elapsed * 0.25,
    }
    // Leave room to react when the warden is patrolling an entry point.
    if (Math.hypot(foe.x - this.player.x, foe.y - this.player.y) < 150) {
      if (edge < 2) foe.x = WIDTH - foe.x
      else foe.y = HEIGHT - foe.y
    }
    this.foes.push(foe)
  }

  step(dt: number, dx: number, dy: number): Shot | undefined {
    if (this.phase !== 'playing') return
    this.elapsed += dt
    if (this.elapsed >= DURATION) {
      this.elapsed = DURATION
      this.phase = 'won'
      return
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

    this.nextSpawn -= dt
    if (this.nextSpawn <= 0) {
      this.spawn()
      this.nextSpawn += Math.max(0.34, 0.89 - this.elapsed * 0.009)
    }

    this.immunity = Math.max(0, this.immunity - dt)
    let closest = -1
    let nearest = 145
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
          return
        }
      }
      if (remaining < nearest) {
        closest = index
        nearest = remaining
      }
    }

    this.nextShot = Math.max(0, this.nextShot - dt)
    if (closest >= 0 && this.nextShot === 0) {
      const [foe] = this.foes.splice(closest, 1)
      this.kills++
      this.nextShot = 0.55
      return { from: { ...this.player }, to: { x: foe.x, y: foe.y } }
    }
  }
}
