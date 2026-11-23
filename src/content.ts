// Tunable game content. Rules read these tables and never hard-code the numbers.

// The court is larger than the screen. The camera shows a `view`-sized part of
// it around the warden. Landmarks are drawn now and come alive in later steps.
export const court = {
  width: 2000,
  height: 1100,
  view: { width: 1000, height: 490 },
  // The gate to the throne garden, in the north wall.
  gate: { x: 1000, y: 0 },
  // The Gardener's grave, at the end of a side path.
  grave: { x: 1780, y: 860 },
}

// Every spell shares one set of stats; a spell ignores the ones it has no use for.
export type Stats = {
  cooldown: number
  damage: number
  // Reach in pixels: witchfire range, blade length, toll radius.
  range: number
  // Half-width of the moon blade swing, in degrees.
  arc: number
  // How far the funeral toll pushes foes away, in pixels.
  knockback: number
}

export const spellIds = ['witchfire', 'moonblade', 'toll'] as const
export type SpellId = (typeof spellIds)[number]

export const spells: Record<SpellId, Stats> = {
  // A spark at the nearest foe in range.
  witchfire: { cooldown: 0.19, damage: 1, range: 145, arc: 0, knockback: 0 },
  // A swing that cuts every foe ahead of the warden.
  moonblade: { cooldown: 0.7, damage: 5, range: 105, arc: 60, knockback: 0 },
  // A bell stroke that hurts and pushes back every foe around the warden.
  toll: { cooldown: 1.2, damage: 4, range: 90, arc: 0, knockback: 60 },
}

// The warden starts with the first spell and can hold this many.
export const loadout = { start: 'witchfire' as SpellId, slots: 3, cards: 3 }

// Experience needed to leave level 1, and how much more each later level asks.
export const leveling = { first: 5, growth: 3 }

// Seconds of waves before dawn.
export const run = { duration: 300 }

export const foeKinds = ['briarling', 'boar', 'archer'] as const
export type FoeKind = (typeof foeKinds)[number]

// Later foes are tougher and quicker: each value grows per second of the run.
// `reach` is how close a foe must be to wound the warden; `ember` is the
// experience it leaves.
type FoeStats = {
  health: number
  healthGrowth: number
  speed: number
  speedSpread: number
  speedGrowth: number
  reach: number
  ember: number
}

export const foes: Record<FoeKind, FoeStats> = {
  // Crawls straight at the warden.
  briarling: { health: 3, healthGrowth: 0.02, speed: 95, speedSpread: 15, speedGrowth: 0.05, reach: 18, ember: 1 },
  // Walks up, paws the ground, then charges down a marked lane.
  boar: { health: 16, healthGrowth: 0.08, speed: 70, speedSpread: 10, speedGrowth: 0.05, reach: 26, ember: 4 },
  // Stops at a distance, takes aim, then looses a volley along the aimed line.
  archer: { health: 7, healthGrowth: 0.04, speed: 85, speedSpread: 10, speedGrowth: 0.05, reach: 18, ember: 3 },
}

// The boar starts pawing within `trigger` pixels, warns for `windup` seconds,
// runs `length` pixels in a straight line and then catches its breath.
export const boarCharge = { trigger: 250, windup: 0.9, speed: 430, length: 360, rest: 1.3, width: 44 }

// The archer aims within `range`, warns for `windup` seconds and then looses
// `arrows` arrows, one per `interval`. An arrow wounds within `hit` pixels.
export const archerVolley = {
  range: 340, windup: 0.8, arrows: 3, interval: 0.2, reload: 2.4,
  arrowSpeed: 330, arrowReach: 480, hit: 14,
}

// A banished foe sometimes leaves lamp oil that restores one pip of armor.
export const oil = { chance: 0.04 }

// The wave schedule. From `from`, a group of `count` foes of one kind enters
// together, and again every `every` seconds until `to`. Without `every` and
// `to` the group enters once. Schedules overlap.
export type Wave = { kind: FoeKind; from: number; count: number; to?: number; every?: number }

export const waves: Wave[] = [
  // 0:00–1:00 — briarlings alone.
  { kind: 'briarling', from: 0, to: 60, every: 1.3, count: 1 },
  // 1:00–2:30 — thorn boars join.
  { kind: 'briarling', from: 60, to: 150, every: 1.05, count: 1 },
  { kind: 'boar', from: 60, to: 150, every: 10, count: 1 },
  // 2:30–4:00 — court archers join.
  { kind: 'briarling', from: 150, to: 240, every: 0.9, count: 1 },
  { kind: 'archer', from: 150, to: 240, every: 9, count: 1 },
  { kind: 'boar', from: 155, to: 240, every: 15, count: 1 },
  // 4:00–5:00 — everything at once.
  { kind: 'briarling', from: 240, count: 8 },
  { kind: 'briarling', from: 240, to: 300, every: 0.7, count: 1 },
  { kind: 'boar', from: 245, to: 300, every: 9, count: 1 },
  { kind: 'archer', from: 242, to: 300, every: 7, count: 2 },
]

export const upgradeIds = [
  'range', 'rate', 'damage',
  'bladeReach', 'bladeArc', 'bladeDamage',
  'tollRadius', 'tollKnockback', 'tollDamage',
] as const
export type UpgradeId = (typeof upgradeIds)[number]

// One upgrade changes one stat of one spell. `shown` converts the stat to the
// number a card displays, when the raw stat would read poorly.
type Upgrade = {
  spell: SpellId
  stat: keyof Stats
  change: (value: number) => number
  shown?: (value: number) => number
}

export const upgrades: Record<UpgradeId, Upgrade> = {
  range: { spell: 'witchfire', stat: 'range', change: v => v + 30 },
  rate: { spell: 'witchfire', stat: 'cooldown', change: v => v * 0.85, shown: v => 1 / v },
  damage: { spell: 'witchfire', stat: 'damage', change: v => v + 0.4 },
  bladeReach: { spell: 'moonblade', stat: 'range', change: v => v + 20 },
  bladeArc: { spell: 'moonblade', stat: 'arc', change: v => v + 15, shown: v => v * 2 },
  bladeDamage: { spell: 'moonblade', stat: 'damage', change: v => v + 3 },
  tollRadius: { spell: 'toll', stat: 'range', change: v => v + 20 },
  tollKnockback: { spell: 'toll', stat: 'knockback', change: v => v + 25 },
  tollDamage: { spell: 'toll', stat: 'damage', change: v => v + 3 },
}

export function upgraded(stats: Stats, id: UpgradeId): Stats {
  const { stat, change } = upgrades[id]
  return { ...stats, [stat]: change(stats[stat]) }
}

export function shownValue(stats: Stats, id: UpgradeId) {
  const { stat, shown } = upgrades[id]
  return shown ? shown(stats[stat]) : stats[stat]
}
