import { difficulties, heroes, heroIds } from './content.ts'
import type { HeroId } from './content.ts'
import { tipIds } from './tutor.ts'
import type { TipId } from './tutor.ts'

// What a player keeps between runs. Stored as JSON under one key, with a
// version so that later shapes can be told from this one.
export const saveKey = 'secret_game.save'
export const saveVersion = 1

// `kills`, `damage` and `dps` are the best of any run, won or lost.
export type Record = { wins: number; best: number | null; kills: number; damage: number; dps: number }
// A number of a run that can beat the player's own best.
export type BestId = 'kills' | 'damage' | 'dps'
export type Progress = {
  version: number
  // The highest difficulty open to the player, from 1.
  difficulty: number
  // Heroes open to the player, and heroes who may start with their relic.
  heroes: HeroId[]
  variants: HeroId[]
  // One record per difficulty, first difficulty first.
  records: Record[]
  // Settings: sound volume from 0 to 1, and the first-run tips already learned.
  volume: number
  tips: TipId[]
}

// What one finished run tells the save.
export type Outcome = {
  hero: HeroId
  difficulty: number
  won: boolean
  // Seconds from the start of the run to its end.
  time: number
  kills: number
  // How many bosses fell during the run.
  felled: number
  // Health taken from foes over the whole run.
  damage: number
}

export type Reward =
  | { kind: 'difficulty'; level: number }
  | { kind: 'hero'; hero: HeroId }
  | { kind: 'variant'; hero: HeroId }
  | { kind: 'record' }

export function fresh(): Progress {
  return {
    version: saveVersion,
    difficulty: 1,
    heroes: heroIds.filter(id => heroes[id].opens === 0),
    variants: [],
    records: difficulties.map(() => ({ wins: 0, best: null, kills: 0, damage: 0, dps: 0 })),
    volume: 0.6,
    tips: [],
  }
}

// Reads a stored save of any age or state. Anything missing, of the wrong
// kind or out of range falls back to a fresh value, so a save written by an
// older version, edited by hand or cut short still opens.
export function parse(raw: string | null): Progress {
  const base = fresh()
  let stored: unknown
  try {
    stored = JSON.parse(raw ?? 'null')
  } catch {
    return base
  }
  if (typeof stored !== 'object' || stored === null) return base
  const save = stored as { [key: string]: unknown }
  const known = (list: unknown) =>
    heroIds.filter(id => Array.isArray(list) && list.includes(id))
  const whole = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
  const level = whole(save.difficulty)
  const records = Array.isArray(save.records) ? save.records : []
  return {
    version: saveVersion,
    difficulty: Math.max(1, Math.min(difficulties.length, Math.floor(level ?? 1))),
    heroes: heroIds.filter(id => base.heroes.includes(id) || known(save.heroes).includes(id)),
    variants: known(save.variants),
    records: base.records.map((empty, index) => {
      const record = (records[index] ?? {}) as { [key: string]: unknown }
      return {
        wins: Math.floor(whole(record.wins) ?? empty.wins),
        best: whole(record.best) ?? null,
        kills: Math.floor(whole(record.kills) ?? empty.kills),
        damage: whole(record.damage) ?? empty.damage,
        dps: whole(record.dps) ?? empty.dps,
      }
    }),
    volume: Math.min(1, whole(save.volume) ?? base.volume),
    tips: tipIds.filter(id => Array.isArray(save.tips) && save.tips.includes(id)),
  }
}

export function load(): Progress {
  try {
    return parse(localStorage.getItem(saveKey))
  } catch {
    return fresh()
  }
}

export function store(progress: Progress) {
  try {
    localStorage.setItem(saveKey, JSON.stringify(progress))
  } catch {
    // Progress still applies to this tab when storage is unavailable.
  }
}

// Adds a finished run to the save and lists what it has newly earned, and
// which of the player's own bests it has beaten. A first result beats nothing.
export function settle(
  before: Progress, run: Outcome,
): { progress: Progress; rewards: Reward[]; bests: BestId[] } {
  const progress: Progress = {
    ...before,
    heroes: [...before.heroes],
    variants: [...before.variants],
    records: before.records.map(record => ({ ...record })),
    tips: [...before.tips],
  }
  const rewards: Reward[] = []
  const record = progress.records[run.difficulty - 1]
  const values = { kills: run.kills, damage: run.damage, dps: run.damage / Math.max(1, run.time) }
  const bests = (['kills', 'damage', 'dps'] as const).filter(id => record[id] > 0 && values[id] > record[id])
  for (const id of ['kills', 'damage', 'dps'] as const) record[id] = Math.max(record[id], values[id])
  if (run.won) {
    record.wins++
    if (record.best === null || run.time < record.best) {
      record.best = run.time
      rewards.push({ kind: 'record' })
    }
    if (run.difficulty === progress.difficulty && progress.difficulty < difficulties.length) {
      progress.difficulty++
      rewards.push({ kind: 'difficulty', level: progress.difficulty })
    }
    if (!progress.variants.includes(run.hero)) {
      progress.variants.push(run.hero)
      rewards.push({ kind: 'variant', hero: run.hero })
    }
  }
  for (const id of heroIds) {
    const earned = run.felled >= heroes[id].opens
    if (earned && !progress.heroes.includes(id)) {
      progress.heroes.push(id)
      rewards.push({ kind: 'hero', hero: id })
    }
  }
  return { progress, rewards, bests }
}
