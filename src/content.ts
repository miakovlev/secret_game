// Tunable game content. Rules read these tables and never hard-code the numbers.

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
  moonblade: { cooldown: 0.8, damage: 3, range: 105, arc: 60, knockback: 0 },
  // A bell stroke that hurts and pushes back every foe around the warden.
  toll: { cooldown: 1.4, damage: 2, range: 90, arc: 0, knockback: 60 },
}

// The warden starts with the first spell and can hold this many.
export const loadout = { start: 'witchfire' as SpellId, slots: 3, cards: 3 }

// Experience needed to leave level 1, and how much more each later level asks.
export const leveling = { first: 5, growth: 3 }

export const briarling = {
  // Later briarlings are tougher: starting health plus growth per second of the run.
  health: 3,
  healthGrowth: 0.05,
  // Speed in pixels per second: base, random spread, and growth per second of the run.
  speed: 53,
  speedSpread: 15,
  speedGrowth: 0.25,
  ember: 1,
}

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
  rate: { spell: 'witchfire', stat: 'cooldown', change: v => v * 0.75, shown: v => 1 / v },
  damage: { spell: 'witchfire', stat: 'damage', change: v => v + 0.5 },
  bladeReach: { spell: 'moonblade', stat: 'range', change: v => v + 20 },
  bladeArc: { spell: 'moonblade', stat: 'arc', change: v => v + 15, shown: v => v * 2 },
  bladeDamage: { spell: 'moonblade', stat: 'damage', change: v => v + 1 },
  tollRadius: { spell: 'toll', stat: 'range', change: v => v + 20 },
  tollKnockback: { spell: 'toll', stat: 'knockback', change: v => v + 25 },
  tollDamage: { spell: 'toll', stat: 'damage', change: v => v + 1 },
}

export function upgraded(stats: Stats, id: UpgradeId): Stats {
  const { stat, change } = upgrades[id]
  return { ...stats, [stat]: change(stats[stat]) }
}

export function shownValue(stats: Stats, id: UpgradeId) {
  const { stat, shown } = upgrades[id]
  return shown ? shown(stats[stat]) : stats[stat]
}
