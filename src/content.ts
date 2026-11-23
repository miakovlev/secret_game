// Tunable game content. Rules read these tables and never hard-code the numbers.
export type Spell = { range: number; cooldown: number; damage: number }

export const witchfire: Spell = { range: 145, cooldown: 0.19, damage: 1 }

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

export const upgradeIds = ['range', 'rate', 'damage'] as const
export type UpgradeId = (typeof upgradeIds)[number]

// `value` is the number a card shows before and after `apply`.
export const upgrades: Record<
  UpgradeId,
  { apply: (spell: Spell) => Spell; value: (spell: Spell) => number }
> = {
  range: {
    apply: spell => ({ ...spell, range: spell.range + 30 }),
    value: spell => spell.range,
  },
  rate: {
    apply: spell => ({ ...spell, cooldown: spell.cooldown * 0.75 }),
    value: spell => 1 / spell.cooldown,
  },
  damage: {
    apply: spell => ({ ...spell, damage: spell.damage + 0.5 }),
    value: spell => spell.damage,
  },
}
