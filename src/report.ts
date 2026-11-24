import { bossIds, guardRule, retinueRule, warderRule } from './content.ts'
import type { BossId, SpellId } from './content.ts'
import type { Battle, WoundSource } from './battle.ts'

// What of a boss can take armor: its touch and whatever it throws.
const hurts: Record<BossId, WoundSource[]> = {
  mass: ['mass'],
  sentinel: ['sentinel'],
  retinue: ['retinue'],
  guard: ['guard', 'bolt'],
  duchess: ['duchess', 'thorn', 'patch'],
}

// Every piece of the Stone Retinue there is to break, the great one included.
export const retinuePieces = retinueRule.tiers.reduce(
  (seen, tier) => ({ total: seen.total + seen.born, born: seen.born * tier.shards }),
  { total: 0, born: 1 },
).total

export type SpellRow = { id: SpellId; damage: number; share: number; kills: number; dps: number }
// `count` of `of` is what the boss's own mechanic came to: foes the Briar Mass
// swallowed, falls of the Warder, pieces of the Retinue, archers of the Guard,
// gates of the Duchess. `of` is 0 where there is no limit to count against.
export type BossRow = {
  id: BossId
  came: boolean
  felled: boolean
  time: number
  wounds: number
  count: number
  of: number
}
export type Report = {
  time: number
  kills: number
  level: number
  cards: number
  felled: number
  damage: number
  // Damage per second of the whole run.
  dps: number
  // Pips of armor lost.
  wounds: number
  // Learned spells, the strongest first; `dps` counts from the second a spell was learned.
  spells: SpellRow[]
  hardest: number
  bossDamage: number
  bosses: BossRow[]
  // Columns of the chapel brought down in the duel.
  pillars: number
  // What took the armor, the worst first.
  sources: { by: WoundSource; pips: number }[]
}

// The numbers of a run as the result screen shows them.
export function report(b: Battle): Report {
  const { tally } = b
  const damage = b.loadout.reduce((sum, id) => sum + tally.damage[id], 0)
  const sources = (Object.entries(tally.wounds) as [WoundSource, number][])
    .map(([by, pips]) => ({ by, pips }))
    .sort((a, b) => b.pips - a.pips)
  const counts: Record<BossId, [number, number]> = {
    mass: [tally.eaten, 0],
    sentinel: [tally.falls, warderRule.lives - 1],
    retinue: [tally.shards, retinuePieces],
    guard: [tally.archers, guardRule.count],
    duchess: [tally.portals, 0],
  }
  return {
    time: b.elapsed,
    kills: b.kills,
    level: b.level,
    cards: tally.cards,
    felled: b.felled,
    damage,
    dps: damage / Math.max(1, b.elapsed),
    wounds: sources.reduce((sum, source) => sum + source.pips, 0),
    spells: b.loadout
      .map(id => ({
        id,
        damage: tally.damage[id],
        share: tally.damage[id] / Math.max(1, damage),
        kills: tally.kills[id],
        dps: tally.damage[id] / Math.max(1, b.elapsed - tally.learned[id]!),
      }))
      .sort((a, b) => b.damage - a.damage),
    hardest: tally.hardest,
    bossDamage: tally.bossDamage,
    bosses: bossIds.map(id => {
      const fight = tally.bosses[id]
      return {
        id,
        came: !!fight,
        felled: !!fight?.felled,
        time: fight?.time ?? 0,
        wounds: hurts[id].reduce((sum, by) => sum + (tally.wounds[by] ?? 0), 0),
        count: counts[id][0],
        of: counts[id][1],
      }
    }),
    pillars: tally.pillars,
    sources,
  }
}
