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
  // How fast the firefly spirits circle, in degrees per second.
  spin: number
}

export const spellIds = ['witchfire', 'moonblade', 'toll', 'seeds', 'fireflies'] as const
export type SpellId = (typeof spellIds)[number]

export const spells: Record<SpellId, Stats> = {
  // A spark at the nearest foe in range.
  witchfire: { cooldown: 0.19, damage: 1, range: 145, arc: 0, knockback: 0, spin: 0 },
  // A swing that cuts every foe ahead of the hero.
  moonblade: { cooldown: 0.7, damage: 5, range: 105, arc: 60, knockback: 0, spin: 0 },
  // A bell stroke that hurts and pushes back every foe around the hero.
  toll: { cooldown: 1, damage: 5, range: 100, arc: 0, knockback: 60, spin: 0 },
  // A seed dropped behind a moving hero every `cooldown`; it bursts under the
  // first foe to reach it and burns everything within `range`.
  seeds: { cooldown: 1.1, damage: 4, range: 54, arc: 0, knockback: 0, spin: 0 },
  // Spirits circling at `range`; one stings a foe it crosses, and the same foe
  // again only after `cooldown`.
  fireflies: { cooldown: 0.5, damage: 2.5, range: 78, arc: 0, knockback: 0, spin: 190 },
}

// A seed waits `life` seconds for a foe to come within `trigger` pixels.
export const seedRule = { trigger: 26, life: 14 }
// How many spirits circle the hero and how close one must pass to sting.
export const fireflyRule = { count: 2, hit: 24 }

// Each hero starts with one spell and has one gift that no card can give.
export const heroIds = ['warden', 'duelist', 'ringer'] as const
export type HeroId = (typeof heroIds)[number]
export type Hero = {
  spell: SpellId
  // Movement speed in pixels per second.
  speed: number
  // Every `chain`-th witchfire spark leaps to a foe within `chainRange` of the target. 0 = never.
  chain: number
  chainRange: number
  // Multiplies how far the funeral toll pushes foes.
  knockback: number
  // What opens the hero: available from the start, after first holding out
  // until the Duchess comes, or after first felling the Gardener.
  opens: 'start' | 'duel' | 'gardener'
  // The relic the hero may start with once a run has been won with them.
  variant: RelicId
}

export const heroes: Record<HeroId, Hero> = {
  warden: { spell: 'witchfire', speed: 160, chain: 3, chainRange: 120, knockback: 1, opens: 'start', variant: 'beads' },
  duelist: { spell: 'moonblade', speed: 190, chain: 0, chainRange: 0, knockback: 1, opens: 'duel', variant: 'boots' },
  ringer: { spell: 'toll', speed: 160, chain: 0, chainRange: 0, knockback: 1.6, opens: 'gardener', variant: 'cloak' },
}

// A hero can hold `slots` spells. A level-up shows `cards` cards, at most
// `learnCards` of them new spells while a slot is free.
export const loadout = { slots: 3, cards: 3, learnCards: 2 }

// Experience needed to leave level 1, and how much more each later level asks.
export const leveling = { first: 5, growth: 3 }

// Three difficulties, opened one by one by winning. `toughness` multiplies
// the health of every foe. With `flankEvery`, every such group of a wave is
// matched by a second one from the opposite side. `early` moves the start of
// every wave that many seconds forward, so later waves overlap earlier ones.
export const difficulties = [
  { toughness: 1, flankEvery: 0, early: 0 },
  { toughness: 1.35, flankEvery: 3, early: 0 },
  { toughness: 1.45, flankEvery: 3, early: 20 },
]

// Seconds of waves before dawn.
export const run = { duration: 540 }

export const foeKinds = [
  'briarling', 'marked', 'boar', 'archer', 'knight', 'moth', 'gardener', 'seal', 'duchess',
] as const
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
  briarling: { health: 3, healthGrowth: 0.038, speed: 95, speedSpread: 15, speedGrowth: 0.05, reach: 18, ember: 1 },
  // A marked briarling: slower, much tougher, and it carries a reliquary.
  marked: { health: 26, healthGrowth: 0.12, speed: 78, speedSpread: 8, speedGrowth: 0.04, reach: 22, ember: 3 },
  // Walks up, paws the ground, then charges down a marked lane.
  boar: { health: 19, healthGrowth: 0.08, speed: 70, speedSpread: 10, speedGrowth: 0.05, reach: 26, ember: 4 },
  // Stops at a distance, takes aim, then looses a volley along the aimed line.
  archer: { health: 9, healthGrowth: 0.04, speed: 85, speedSpread: 10, speedGrowth: 0.05, reach: 18, ember: 3 },
  // A stone knight: slow and very hard to wear down.
  knight: { health: 80, healthGrowth: 0.1, speed: 58, speedSpread: 6, speedGrowth: 0.02, reach: 26, ember: 6 },
  // A healer moth: frail, hangs back and mends the most wounded foe near it.
  moth: { health: 12, healthGrowth: 0.02, speed: 105, speedSpread: 10, speedGrowth: 0, reach: 16, ember: 4 },
  // The Gardener rises only if the hero rings the bell on his grave.
  gardener: { health: 190, healthGrowth: 0.12, speed: 26, speedSpread: 0, speedGrowth: 0, reach: 34, ember: 10 },
  // The seal-flower is rooted; the Duchess walks at her own pace (see duelRule). Neither leaves embers.
  seal: { health: 140, healthGrowth: 0, speed: 0, speedSpread: 0, speedGrowth: 0, reach: 16, ember: 0 },
  duchess: { health: 850, healthGrowth: 0, speed: 0, speedSpread: 0, speedGrowth: 0, reach: 36, ember: 0 },
}

// The Gardener's trial is optional. From `from` seconds the bell on his grave
// is awake; a hero who stands within `reach` pixels of it for `ring` seconds
// calls him out. He stoops for `summon` seconds, safe from every blow, and
// pulls `pack` briarlings out of the ground; then he straightens and the white
// flower on his chest stays open for `open` seconds. The waves go on meanwhile.
export const gardenerRule = { from: 240, reach: 60, ring: 1.5, summon: 2.2, open: 6, pack: 3 }

// Felling the Gardener blesses one learned spell.
export const blessings = {
  // Witchfire: foes within `radius` of the target take `share` of the spark.
  witchfire: { radius: 60, share: 0.5 },
  // Moon blade: the swing lingers for `life` seconds, cutting again every `beat` for `share` of its damage.
  moonblade: { life: 0.9, beat: 0.3, share: 0.3 },
  // Funeral toll: a second stroke `delay` seconds later for `share` of the damage.
  toll: { delay: 0.45, share: 0.6 },
  // Fire seeds: a burst sets off every seed within `radius`.
  seeds: { radius: 130 },
  // Firefly spirits: the swarm is multiplied by `swarms`.
  fireflies: { swarms: 2 },
}

// The duel. When the dawn bell rings the waves stop and the Widow Duchess
// walks into the same court through the north gate. A seal-flower blooms on
// one of the `beds` around the chapel ruins, then on the next. While a flower
// lives her crown of vines turns every blow aside, she walks after the hero at
// `speed` and attacks. When the flower falls she stands still and open for
// `window` seconds.
export const duelRule = {
  beds: [{ x: 700, y: 430 }, { x: 1300, y: 430 }, { x: 1300, y: 710 }, { x: 700, y: 710 }],
  window: 6,
  speed: 58,
  // Each attack comes every `every` seconds after `windup` seconds of warning.
  // The lash strikes a sector `arc` degrees to each side of the hero, `range` long.
  lash: { every: 3, windup: 1, arc: 26, range: 520 },
  // A volley of `thorns` thorns, fanned `spread` degrees to each side, flying `reach` pixels.
  volley: { every: 3.8, windup: 0.7, thorns: 7, spread: 30, speed: 300, reach: 640 },
  // A briar patch marked under the hero: it erupts and then wounds anyone inside for `life` seconds.
  patch: { every: 4, windup: 1.1, radius: 80, life: 5 },
  // A pack of briarlings called in from beyond the view; from the second phase a boar or archers too.
  summon: { every: 8, pack: 5 },
  // A new phase begins at each of these shares of her health; every phase
  // multiplies the time between her attacks by `tempo`.
  phases: [0.66, 0.33],
  tempo: 0.8,
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

// Relics are passive. A marked briarling drops a reliquary; opening it offers
// up to `cards` relics. A hero holds `slots` different relics, and taking one
// again raises its level up to `maxLevel`. `amount` is the gain per level.
export const relicIds = ['boots', 'beads', 'cloak', 'hourglass', 'ring'] as const
export type RelicId = (typeof relicIds)[number]
export const relicRule = { slots: 3, maxLevel: 3, cards: 3 }

export const relics: Record<RelicId, { amount: number }> = {
  // Courier's shoes: share of movement speed added.
  boots: { amount: 0.12 },
  // Amber beads: pixels added to the pickup radius.
  beads: { amount: 40 },
  // Pilgrim's cloak: pips of armor added, each arriving whole.
  cloak: { amount: 1 },
  // Hourglass: share of every spell cooldown removed.
  hourglass: { amount: 0.08 },
  // Gardener's ring: share added to the reach of every spell.
  ring: { amount: 0.1 },
}

// The moth hovers about `keep` pixels from the hero. Every `beat` seconds it
// restores `amount` health to the most wounded foe within `range` of itself.
export const mothHeal = { keep: 200, range: 280, beat: 1, amount: 6 }

// A banished foe sometimes leaves lamp oil that restores one pip of armor.
export const oil = { chance: 0.04 }

// The wave schedule. From `from`, a group of `count` foes of one kind enters
// together, and again every `every` seconds until `to`. Without `every` and
// `to` the group enters once. Schedules overlap.
export type Wave = { kind: FoeKind; from: number; count: number; to?: number; every?: number }

export const waves: Wave[] = [
  // 0:00–2:00 — briarlings alone.
  { kind: 'briarling', from: 0, to: 120, every: 1.1, count: 1 },
  // From 0:45 a marked briarling walks in now and then, carrying a reliquary.
  { kind: 'marked', from: 45, to: 540, every: 80, count: 1 },
  // 2:00–4:00 — thorn boars join.
  { kind: 'briarling', from: 120, to: 240, every: 0.9, count: 1 },
  { kind: 'boar', from: 120, to: 240, every: 11, count: 1 },
  // 4:00–6:00 — court archers join.
  { kind: 'briarling', from: 240, to: 360, every: 0.8, count: 1 },
  { kind: 'archer', from: 240, to: 360, every: 10, count: 1 },
  { kind: 'boar', from: 246, to: 360, every: 17, count: 1 },
  // 6:00–8:00 — stone knights hold the front and healer moths mend them.
  { kind: 'briarling', from: 360, to: 480, every: 0.8, count: 1 },
  { kind: 'knight', from: 360, to: 480, every: 13, count: 1 },
  { kind: 'moth', from: 368, to: 480, every: 24, count: 1 },
  { kind: 'archer', from: 366, to: 480, every: 16, count: 1 },
  // 8:00–9:00 — everything at once, briarlings in packs.
  { kind: 'briarling', from: 480, count: 8 },
  { kind: 'briarling', from: 480, to: 540, every: 0.65, count: 1 },
  { kind: 'briarling', from: 500, to: 540, every: 20, count: 6 },
  { kind: 'knight', from: 484, to: 540, every: 11, count: 1 },
  { kind: 'moth', from: 490, to: 540, every: 22, count: 1 },
  { kind: 'boar', from: 486, to: 540, every: 10, count: 1 },
  { kind: 'archer', from: 482, to: 540, every: 8, count: 2 },
]

export const upgradeIds = [
  'range', 'rate', 'damage',
  'bladeReach', 'bladeArc', 'bladeDamage',
  'tollRadius', 'tollKnockback', 'tollDamage',
  'seedsRate', 'seedsRadius', 'seedsDamage',
  'fliesSpin', 'fliesOrbit', 'fliesDamage',
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
  seedsRate: { spell: 'seeds', stat: 'cooldown', change: v => v * 0.8, shown: v => 1 / v },
  seedsRadius: { spell: 'seeds', stat: 'range', change: v => v + 16 },
  seedsDamage: { spell: 'seeds', stat: 'damage', change: v => v + 3 },
  fliesSpin: { spell: 'fireflies', stat: 'spin', change: v => v + 60, shown: v => v / 360 },
  fliesOrbit: { spell: 'fireflies', stat: 'range', change: v => v + 16 },
  fliesDamage: { spell: 'fireflies', stat: 'damage', change: v => v + 1.5 },
}

export function upgraded(stats: Stats, id: UpgradeId): Stats {
  const { stat, change } = upgrades[id]
  return { ...stats, [stat]: change(stats[stat]) }
}

export function shownValue(stats: Stats, id: UpgradeId) {
  const { stat, shown } = upgrades[id]
  return shown ? shown(stats[stat]) : stats[stat]
}
