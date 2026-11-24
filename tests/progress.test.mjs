import assert from 'node:assert/strict'
import test from 'node:test'
import { difficulties, heroes, heroIds } from '../src/content.ts'
import { languageKey, readLanguage, saveLanguage } from '../src/i18n.ts'
import { fresh, load, parse, saveKey, saveVersion, settle, store } from '../src/progress.ts'
import { tipIds, Tutor } from '../src/tutor.ts'

const run = (over = {}) => ({
  hero: 'warden', difficulty: 1, won: false, time: 300, kills: 80,
  felled: 0, ...over,
})

function withStorage(storage, check) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  try { check() } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
}

function memory() {
  const values = new Map()
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('a new player has the first difficulty, the warden and empty records', () => {
  const start = fresh()
  assert.equal(start.version, saveVersion)
  assert.equal(start.difficulty, 1)
  assert.deepEqual(start.heroes, ['warden'])
  assert.deepEqual(start.variants, [])
  assert.equal(start.volume, 0.6)
  assert.deepEqual(start.tips, [])
  assert.equal(start.records.length, difficulties.length)
  assert.equal(difficulties.length, 3)
  for (const record of start.records) assert.deepEqual(record, { wins: 0, best: null, kills: 0 })
  assert.equal(heroes.warden.opens, 0)
  assert.notDeepEqual(heroIds, start.heroes)
})

test('the first win opens the second difficulty and a win there opens the third', () => {
  let { progress, rewards } = settle(fresh(), run({ won: true, time: 612 }))
  assert.equal(progress.difficulty, 2)
  assert.deepEqual(rewards.filter(reward => reward.kind === 'difficulty'), [{ kind: 'difficulty', level: 2 }])

  // Winning the first difficulty again opens nothing further.
  const again = settle(progress, run({ won: true, time: 640 }))
  assert.equal(again.progress.difficulty, 2)
  assert.deepEqual(again.rewards, [])
  assert.equal(again.progress.records[0].wins, 2)
  assert.equal(again.progress.records[0].best, 612)

  ;({ progress, rewards } = settle(again.progress, run({ won: true, difficulty: 2, time: 700 })))
  assert.equal(progress.difficulty, 3)
  assert.ok(rewards.some(reward => reward.kind === 'difficulty' && reward.level === 3))
  // The last difficulty has nothing above it.
  const top = settle(progress, run({ won: true, difficulty: 3, time: 800 }))
  assert.equal(top.progress.difficulty, 3)
  assert.ok(!top.rewards.some(reward => reward.kind === 'difficulty'))
  assert.equal(top.progress.records[2].wins, 1)
})

test('a lost run opens no difficulty but still counts toward heroes and the banished record', () => {
  // One boss felled opens the Bellringer; nothing is opened by a run that fells none.
  const none = settle(fresh(), run({ kills: 30 }))
  assert.deepEqual(none.rewards, [])
  const lost = settle(none.progress, run({ kills: 140, felled: 1 }))
  assert.equal(lost.progress.difficulty, 1)
  assert.deepEqual(lost.rewards, [{ kind: 'hero', hero: 'ringer' }])
  assert.deepEqual(lost.progress.heroes, ['warden', 'ringer'])
  assert.deepEqual(lost.progress.records[0], { wins: 0, best: null, kills: 140 })
  // Fewer banished later does not lower the record, and the hero is not opened twice.
  const later = settle(lost.progress, run({ kills: 20, felled: 1 }))
  assert.equal(later.progress.records[0].kills, 140)
  assert.deepEqual(later.rewards, [])

  // Two bosses in one run open the Duelist.
  const two = settle(later.progress, run({ felled: 2 }))
  assert.deepEqual(two.rewards, [{ kind: 'hero', hero: 'duelist' }])
  assert.deepEqual(two.progress.heroes, ['warden', 'ringer', 'duelist'])
  assert.deepEqual([heroes.warden.opens, heroes.ringer.opens, heroes.duelist.opens], [0, 1, 2])
  // A first run that fells two opens both at once.
  assert.deepEqual(settle(fresh(), run({ felled: 2 })).rewards.map(reward => reward.hero), ['duelist', 'ringer'])
})

test('a win opens the starting relic of the hero who won, and a faster win sets a record', () => {
  // A won run has felled all five bosses, so it opens both locked heroes too.
  const first = settle(fresh(), run({ won: true, time: 650, felled: 5 }))
  assert.deepEqual(first.rewards, [
    { kind: 'record' }, { kind: 'difficulty', level: 2 }, { kind: 'variant', hero: 'warden' },
    { kind: 'hero', hero: 'duelist' }, { kind: 'hero', hero: 'ringer' },
  ])
  assert.deepEqual(first.progress.variants, ['warden'])
  const slower = settle(first.progress, run({ won: true, time: 700, hero: 'duelist', felled: 5 }))
  assert.deepEqual(slower.rewards, [{ kind: 'variant', hero: 'duelist' }])
  assert.equal(slower.progress.records[0].best, 650)
  const faster = settle(slower.progress, run({ won: true, time: 600 }))
  assert.deepEqual(faster.rewards, [{ kind: 'record' }])
  assert.equal(faster.progress.records[0].best, 600)
  // The save handed in is never changed in place.
  assert.deepEqual(first.progress.variants, ['warden'])
  assert.equal(first.progress.records[0].best, 650)
})

test('progress survives a reload through storage', () => {
  const storage = memory()
  withStorage(storage, () => {
    assert.deepEqual(load(), fresh())
    const { progress } = settle(fresh(), run({ won: true, time: 630, felled: 5 }))
    store(progress)
    assert.equal(JSON.parse(storage.values.get(saveKey)).version, saveVersion)
    assert.deepEqual(load(), progress)
    assert.deepEqual(load().heroes, ['warden', 'duelist', 'ringer'])
  })
})

test('the language chosen before saves existed is kept beside the save', () => {
  const storage = memory()
  storage.values.set(languageKey, 'ru')
  withStorage(storage, () => {
    assert.equal(readLanguage(), 'ru')
    store(settle(load(), run({ won: true })).progress)
    assert.equal(readLanguage(), 'ru')
    assert.equal(storage.values.get(languageKey), 'ru')
    saveLanguage('en')
    assert.equal(load().difficulty, 2)
  })
})

test('an old save with fields missing opens with fresh values for the rest', () => {
  const old = parse(JSON.stringify({ version: 0, difficulty: 2, heroes: ['duelist'] }))
  assert.equal(old.version, saveVersion)
  assert.equal(old.difficulty, 2)
  assert.deepEqual(old.heroes, ['warden', 'duelist'])
  assert.deepEqual(old.variants, [])
  assert.deepEqual(old.records, fresh().records)
  const partial = parse(JSON.stringify({ records: [{ wins: 3, best: 601.5 }], variants: ['ringer', 'nobody'] }))
  assert.deepEqual(partial.records[0], { wins: 3, best: 601.5, kills: 0 })
  assert.deepEqual(partial.records[1], { wins: 0, best: null, kills: 0 })
  assert.deepEqual(partial.variants, ['ringer'])
})

test('a damaged save never breaks the game', () => {
  for (const raw of [null, '', '{', 'null', '42', '"text"', '[]', '{"difficulty":"hard"}']) {
    assert.deepEqual(parse(raw), fresh(), String(raw))
  }
  const odd = parse(JSON.stringify({
    difficulty: 99, heroes: 'warden', variants: [7, null], records: [{ wins: -4, best: 'fast', kills: 12.9 }, 5, null],
  }))
  assert.equal(odd.difficulty, difficulties.length)
  assert.deepEqual(odd.heroes, ['warden'])
  assert.deepEqual(odd.variants, [])
  assert.deepEqual(odd.records[0], { wins: 0, best: null, kills: 12 })
  assert.deepEqual(odd.records[1], { wins: 0, best: null, kills: 0 })
  assert.equal(parse(JSON.stringify({ difficulty: 0 })).difficulty, 1)
  assert.equal(parse(JSON.stringify({ difficulty: 2.7 })).difficulty, 2)

  const denied = () => { throw new Error('Storage denied') }
  withStorage({ getItem: denied, setItem: denied }, () => {
    assert.deepEqual(load(), fresh())
    assert.doesNotThrow(() => store(fresh()))
  })
})

test('settings are saved with the progress and survive a damaged value', () => {
  const storage = memory()
  withStorage(storage, () => {
    const saved = { ...fresh(), volume: 0.25, tips: ['move', 'cards'] }
    store(saved)
    assert.deepEqual(load(), saved)
    // A finished run keeps them.
    const after = settle(load(), run({ won: true })).progress
    assert.equal(after.volume, 0.25)
    assert.deepEqual(after.tips, ['move', 'cards'])
    assert.notEqual(after.tips, saved.tips)
  })
  assert.equal(parse(JSON.stringify({ volume: 0 })).volume, 0)
  assert.equal(parse(JSON.stringify({ volume: 7 })).volume, 1)
  assert.equal(parse(JSON.stringify({ volume: 'loud' })).volume, 0.6)
  assert.equal(parse(JSON.stringify({ volume: -1 })).volume, 0.6)
  assert.deepEqual(parse(JSON.stringify({ tips: ['chest', 'dance', 3, 'move'] })).tips, ['move', 'chest'])
  assert.deepEqual(parse(JSON.stringify({ tips: 'move' })).tips, [])
})

// --- First-run tips.

const calm = { walked: 0, embers: 0, gathered: 0, choosing: false, pawing: false, aiming: false, chest: false }

test('a new player is told to move, then to gather an ember, then to pick a card', () => {
  const tutor = new Tutor()
  assert.deepEqual(tipIds, ['move', 'ember', 'cards', 'boar', 'archer', 'chest'])
  assert.equal(tutor.watch(calm), 'move')
  assert.equal(tutor.watch({ ...calm, walked: 30 }), 'move')
  assert.deepEqual([...tutor.seen], [])
  // Having walked, the tip is learned and nothing else needs saying yet.
  assert.equal(tutor.watch({ ...calm, walked: 80 }), undefined)
  assert.deepEqual([...tutor.seen], ['move'])
  // An ember appears: the tip stays until one is gathered.
  const walked = { ...calm, walked: 80 }
  assert.equal(tutor.watch({ ...walked, embers: 2 }), 'ember')
  assert.equal(tutor.watch({ ...walked, embers: 1 }), 'ember')
  assert.equal(tutor.watch({ ...walked, embers: 1, gathered: 1 }), undefined)
  // The first level-up: the tip stays while the cards are up.
  const gathered = { ...walked, gathered: 5 }
  assert.equal(tutor.watch({ ...gathered, choosing: true }), 'cards')
  assert.equal(tutor.watch({ ...gathered, choosing: true }), 'cards')
  assert.equal(tutor.watch(gathered), undefined)
  assert.deepEqual([...tutor.seen], ['move', 'ember', 'cards'])
  // None of them is said twice.
  assert.equal(tutor.watch({ ...calm, embers: 3, choosing: true }), undefined)
})

test('dangers and the reliquary are explained when they first appear, the most pressing first', () => {
  const tutor = new Tutor(['move', 'ember'])
  const busy = { ...calm, walked: 500, gathered: 9 }
  assert.equal(tutor.watch({ ...busy, chest: true, aiming: true, pawing: true }), 'boar')
  // The tip on the line is not swapped mid-sentence for a more pressing one.
  assert.equal(tutor.watch({ ...busy, chest: true, aiming: true, pawing: true, choosing: true }), 'boar')
  assert.equal(tutor.watch({ ...busy, chest: true, aiming: true }), 'archer')
  assert.equal(tutor.watch({ ...busy, chest: true }), 'chest')
  assert.equal(tutor.watch({ ...busy, chest: true }), 'chest')
  assert.equal(tutor.watch(busy), undefined)
  assert.deepEqual([...tutor.seen].sort(), ['archer', 'boar', 'chest', 'ember', 'move'])
  assert.equal(tutor.watch({ ...busy, pawing: true, aiming: true, chest: true }), undefined)
  assert.equal(tutor.watch({ ...busy, choosing: true }), 'cards')
})

test('a player who has learned everything sees no tips', () => {
  const tutor = new Tutor(tipIds)
  for (const now of [calm, { ...calm, embers: 4, choosing: true, pawing: true, aiming: true, chest: true }]) {
    assert.equal(tutor.watch(now), undefined)
  }
  assert.equal(tutor.showing, undefined)
})

test('a save from before the bosses keeps the Bellringer it had opened', () => {
  // Written when the Bellringer was earned from the Gardener: the save lists heroes, not how they were earned.
  const old = JSON.stringify({ version: 1, difficulty: 2, heroes: ['warden', 'ringer'], variants: ['ringer'] })
  const progress = parse(old)
  assert.deepEqual(progress.heroes, ['warden', 'ringer'])
  assert.deepEqual(progress.variants, ['ringer'])
  // Felling a boss again earns nothing new for that hero.
  assert.deepEqual(settle(progress, run({ felled: 1 })).rewards, [])
})
