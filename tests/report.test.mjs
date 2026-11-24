import assert from 'node:assert/strict'
import test from 'node:test'
import { Battle, makeFoe, xpGoal } from '../src/battle.ts'
import { bossIds, bossRule, duelRule, foes, guardRule, massRule, spells, warderRule } from '../src/content.ts'
import { fresh, settle } from '../src/progress.ts'
import { report, retinuePieces } from '../src/report.ts'

function playing(random = () => 0.5) {
  const b = new Battle(random)
  b.phase = 'playing'
  b.schedule.splice(0)
  b.calm = -1e9
  return b
}

// Steps until the check holds, taking the first card whenever one is offered.
function until(b, done, limit = 60 * 60) {
  for (let i = 0; i < limit && !done(); i++) {
    if (b.phase === 'choosing') b.choose(0)
    b.step(1 / 60, 0, 0)
  }
  assert.ok(done())
}

// Brings in the boss with the given place in the order on the next step.
function summon(b, index) {
  b.bossIndex = index
  b.calm = bossRule.every
  b.step(1 / 60, 0, 0)
}

test('a new run has an empty tally and a report of zeroes', () => {
  const b = new Battle()
  assert.deepEqual(b.tally.learned, { witchfire: 0 })
  assert.deepEqual(new Battle(undefined, 'ringer').tally.learned, { toll: 0 })
  const r = report(b)
  assert.deepEqual(
    [r.time, r.kills, r.cards, r.felled, r.damage, r.dps, r.wounds, r.hardest, r.bossDamage, r.pillars],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  )
  assert.equal(r.level, 1)
  assert.deepEqual(r.spells, [{ id: 'witchfire', damage: 0, share: 0, kills: 0, dps: 0 }])
  assert.deepEqual(r.sources, [])
  assert.deepEqual(r.bosses.map(row => row.id), bossIds)
  for (const row of r.bosses) {
    assert.deepEqual([row.came, row.felled, row.time, row.wounds, row.count], [false, false, 0, 0, 0])
  }
  assert.equal(retinuePieces, 22)
  assert.deepEqual(r.bosses.map(row => row.of), [0, warderRule.lives - 1, retinuePieces, guardRule.count, 0])
})

test('damage is counted by spell, never beyond the health a foe had left', () => {
  const b = playing()
  const { damage } = spells.witchfire
  const wall = makeFoe('briarling', b.player.x + 60, b.player.y, 0, 1e9)
  b.foes.push(wall)
  b.step(1 / 60, 0, 0)
  assert.equal(b.tally.damage.witchfire, damage)
  assert.equal(b.tally.hardest, damage)
  assert.equal(b.tally.kills.witchfire, 0)
  // A foe with one point of health left gives one point, however hard the blow.
  b.foes = [makeFoe('briarling', b.player.x + 60, b.player.y, 0, 1)]
  until(b, () => b.kills === 1)
  assert.equal(b.tally.damage.witchfire, damage + 1)
  assert.equal(b.tally.hardest, damage)
  assert.equal(b.tally.kills.witchfire, 1)
  assert.equal(b.tally.bossDamage, 0)
  const r = report(b)
  assert.equal(r.damage, damage + 1)
  assert.equal(r.dps, r.damage / 1)
  assert.deepEqual(r.spells, [{ id: 'witchfire', damage: damage + 1, share: 1, kills: 1, dps: damage + 1 }])
  // The run's damage per second is spread over the whole run.
  b.elapsed = 100
  assert.equal(report(b).dps, (damage + 1) / 100)
})

test('each spell is rated from the second it was learned, the strongest first', () => {
  const b = playing(() => 0)
  b.spells.witchfire.range = 0
  b.elapsed = 40
  b.embers.push({ ...b.player, value: xpGoal(1) })
  b.step(1 / 60, 0, 0)
  assert.equal(b.phase, 'choosing')
  const card = b.offer.findIndex(choice => choice.kind === 'learn')
  const { spell } = b.offer[card]
  b.choose(card)
  assert.equal(b.tally.cards, 1)
  assert.equal(b.tally.learned[spell], b.elapsed)
  // A card that is not on offer counts for nothing.
  b.choose(0)
  assert.equal(b.tally.cards, 1)
  b.tally.damage[spell] = 300
  b.tally.damage.witchfire = 100
  b.elapsed = b.tally.learned[spell] + 60
  const r = report(b)
  assert.deepEqual(r.spells.map(row => row.id), [spell, 'witchfire'])
  assert.equal(r.damage, 400)
  assert.equal(r.spells[0].share, 0.75)
  assert.equal(r.spells[0].dps, 5)
  assert.equal(r.spells[1].dps, 100 / b.elapsed)
  assert.equal(r.cards, 1)
})

test('lost armor is counted by what took it, the worst first', () => {
  const b = playing()
  b.spells.witchfire.range = 0
  const hit = arrange => {
    b.immunity = 0
    arrange()
    b.step(1 / 60, 0, 0)
  }
  hit(() => { b.foes = [makeFoe('briarling', b.player.x, b.player.y, 0, 1e9)] })
  assert.deepEqual(b.tally.wounds, { briarling: 1 })
  // The mercy after a wound costs nothing more.
  b.step(1 / 60, 0, 0)
  assert.deepEqual(b.tally.wounds, { briarling: 1 })
  b.foes = []
  for (const by of ['arrow', 'bolt', 'bolt', 'thorn']) {
    hit(() => b.arrows.push({ x: b.player.x, y: b.player.y, vx: 0, vy: 0, life: 1, by }))
  }
  assert.deepEqual(b.tally.wounds, { briarling: 1, arrow: 1, bolt: 2, thorn: 1 })
  assert.equal(b.armor, b.maxArmor - 5)
  const r = report(b)
  assert.equal(r.wounds, 5)
  assert.deepEqual(r.sources[0], { by: 'bolt', pips: 2 })
  assert.equal(r.sources.length, 4)
  assert.equal(r.bosses.find(row => row.id === 'guard').wounds, 2)
  assert.equal(r.bosses.find(row => row.id === 'duchess').wounds, 1)
  assert.equal(r.bosses.find(row => row.id === 'mass').wounds, 0)
})

test('a bite deeper than the armor left costs only what was left', () => {
  const b = playing()
  b.spells.witchfire.range = 0
  const mass = makeFoe('mass', b.player.x, b.player.y, 0, foes.mass.health)
  mass.grown = massRule.biteEvery
  b.foes = [mass]
  b.armor = 1
  b.step(1 / 60, 0, 0)
  assert.equal(b.phase, 'lost')
  assert.deepEqual(b.tally.wounds, { mass: 1 })
  const row = report(b).bosses[0]
  assert.deepEqual([row.came, row.felled, row.wounds], [true, false, 1])
  assert.ok(Math.abs(row.time - 1 / 60) < 1e-9)
})

test('the Briar Mass counts its meals and the Warder its falls', () => {
  const b = playing()
  b.spells.witchfire.range = 0
  const at = { x: b.player.x + 400, y: b.player.y }
  b.foes = [makeFoe('mass', at.x, at.y, 0, foes.mass.health), makeFoe('briarling', at.x, at.y, 0, 5)]
  b.step(1 / 60, 0, 0)
  assert.equal(b.tally.eaten, 1)
  assert.equal(report(b).bosses[0].count, 1)
  // A swallowed foe is nobody's kill.
  assert.equal(b.kills, 0)

  const w = playing()
  w.immunity = 1e9
  const warder = makeFoe('sentinel', w.player.x + 120, w.player.y, 0, foes.sentinel.health)
  warder.health = 1
  w.foes = [warder]
  until(w, () => w.tally.falls === 1)
  assert.equal(warder.mode, 'down')
  assert.equal(w.tally.damage.witchfire, 1)
  assert.equal(w.tally.bossDamage, 1)
  assert.equal(w.tally.kills.witchfire, 0)
  const row = report(w).bosses[1]
  assert.deepEqual([row.came, row.felled, row.count, row.of], [true, false, 1, 2])
})

test('the Stone Retinue counts every piece broken and the time the fight took', () => {
  const b = playing()
  b.immunity = 1e9
  b.foes = [makeFoe('retinue', b.player.x + 120, b.player.y, 0, foes.retinue.health)]
  Object.assign(b.spells.witchfire, { range: 4000, damage: 1e6, cooldown: 0.01 })
  until(b, () => b.felled === 1)
  assert.equal(b.tally.shards, retinuePieces)
  assert.equal(b.tally.kills.witchfire, retinuePieces)
  assert.equal(b.tally.hardest, 1e6)
  const row = report(b).bosses[2]
  assert.deepEqual([row.came, row.felled, row.count, row.of], [true, true, retinuePieces, retinuePieces])
  assert.ok(row.time > 0 && row.time <= b.elapsed)
  // Everything dealt went into the boss, and none of it beyond its health.
  assert.equal(b.tally.bossDamage, b.tally.damage.witchfire)
  assert.ok(b.tally.bossDamage < 1e5)
  // The clock of the fight stops with the boss.
  const { time } = row
  b.step(1 / 60, 0, 0)
  assert.equal(report(b).bosses[2].time, time)
})

test('the Candle Guard counts its archers, whatever spell banished them', () => {
  const b = playing()
  b.spells.witchfire.range = 0
  b.immunity = 1e9
  summon(b, 3)
  const health = b.lit.health
  for (let i = 0; i < guardRule.count; i++) b.strike(b.lit, 1e6, [], 'toll')
  assert.equal(b.tally.archers, guardRule.count)
  assert.equal(b.tally.kills.toll, guardRule.count)
  assert.equal(b.tally.damage.toll, health * guardRule.count)
  assert.equal(b.tally.bossDamage, health * guardRule.count)
  const row = report(b).bosses[3]
  assert.deepEqual([row.came, row.felled, row.count, row.of], [true, true, 5, 5])
  // A spell that was never learned stays out of the table and the total.
  assert.deepEqual(report(b).spells.map(spell => spell.id), ['witchfire'])
  assert.equal(report(b).damage, 0)
})

test('the duel counts broken gates, fallen columns, patches and the felling of the Duchess', () => {
  const b = playing()
  b.spells.witchfire.range = 0
  summon(b, 4)
  assert.equal(b.stage, 'duel')
  b.immunity = 0
  b.patches.push({ x: b.player.x, y: b.player.y, warn: 0, life: 1 })
  b.step(1 / 60, 0, 0)
  assert.deepEqual(b.tally.wounds, { patch: 1 })
  const gate = makeFoe('portal', b.player.x + 300, b.player.y, 0, 90)
  b.foes.push(gate)
  b.strike(gate, 1e6, [], 'witchfire')
  assert.equal(b.tally.portals, 1)
  assert.equal(b.tally.bossDamage, 0)
  const [spot] = duelRule.pillars
  for (let i = 0; i < duelRule.pillar.hits; i++) {
    assert.equal(b.tally.pillars, 0)
    b.arrows.push({ x: spot.x, y: spot.y, vx: 0, vy: 0, life: 1, by: 'thorn' })
    b.step(1 / 60, 0, 0)
  }
  assert.equal(b.tally.pillars, 1)
  b.strike(b.duchess, 1e9, [], 'witchfire')
  assert.equal(b.phase, 'won')
  const r = report(b)
  const row = r.bosses[4]
  assert.deepEqual([row.came, row.felled, row.count, row.of, row.wounds], [true, true, 1, 0, 1])
  assert.equal(r.pillars, 1)
  assert.equal(r.felled, 1)
})

test('a run beats the player’s own bests only when there was a best to beat', () => {
  const run = (over = {}) => ({
    hero: 'warden', difficulty: 1, won: false, time: 200, kills: 50, felled: 0, damage: 4000, ...over,
  })
  const first = settle(fresh(), run())
  assert.deepEqual(first.bests, [])
  assert.deepEqual(first.progress.records[0], { wins: 0, best: null, kills: 50, damage: 4000, dps: 20 })
  const worse = settle(first.progress, run({ kills: 40, damage: 3000 }))
  assert.deepEqual(worse.bests, [])
  assert.deepEqual(worse.progress.records[0], first.progress.records[0])
  // More damage over a longer run: a best in damage, not in damage per second.
  const longer = settle(first.progress, run({ time: 400, damage: 6000 }))
  assert.deepEqual(longer.bests, ['damage'])
  assert.deepEqual(longer.progress.records[0], { wins: 0, best: null, kills: 50, damage: 6000, dps: 20 })
  const better = settle(longer.progress, run({ kills: 51, damage: 6001, time: 100 }))
  assert.deepEqual(better.bests, ['kills', 'damage', 'dps'])
  // Another difficulty keeps its own bests.
  assert.deepEqual(settle(better.progress, run({ difficulty: 2, kills: 999, damage: 1e6 })).bests, [])
  // A run that ended at once is still rated over a whole second.
  assert.equal(settle(fresh(), run({ time: 0, damage: 30 })).progress.records[0].dps, 30)
})
