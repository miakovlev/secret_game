// First-run tips. Each is shown while the thing it explains is in front of the
// player, and counts as learned once that moment has passed, so it never shows
// again, in this run or a later one.
export const tipIds = ['move', 'ember', 'cards', 'boar', 'archer', 'chest'] as const
export type TipId = (typeof tipIds)[number]

// What the tutor looks at, each frame.
export type Lesson = {
  // Pixels the hero has walked since the run began.
  walked: number
  // Embers lying on the ground, and embers gathered so far.
  embers: number
  gathered: number
  // A level-up card is on offer, a boar is pawing, an archer is aiming.
  choosing: boolean
  pawing: boolean
  aiming: boolean
  // A reliquary lies on the ground or stands open.
  chest: boolean
}

// In order of priority: the first tip whose moment is now wins the line.
const moments: Record<TipId, (now: Lesson) => boolean> = {
  cards: now => now.choosing,
  boar: now => now.pawing,
  archer: now => now.aiming,
  chest: now => now.chest,
  move: now => now.walked < 60,
  ember: now => now.embers > 0 && now.gathered === 0,
}

export class Tutor {
  readonly seen: Set<TipId>
  // The tip on the line right now.
  showing?: TipId

  constructor(seen: Iterable<TipId> = []) {
    this.seen = new Set(seen)
  }

  // Returns the tip to show now, if any, and remembers the ones that have passed.
  watch(now: Lesson): TipId | undefined {
    if (this.showing && !moments[this.showing](now)) {
      this.seen.add(this.showing)
      this.showing = undefined
    }
    if (!this.showing) {
      const order = Object.keys(moments) as TipId[]
      this.showing = order.find(tip => !this.seen.has(tip) && moments[tip](now))
    }
    return this.showing
  }
}
