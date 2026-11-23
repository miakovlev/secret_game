import assert from 'node:assert/strict'
import test from 'node:test'
import { archerVolley, boarCharge, court, foes, loadout, oil, run, waves, shownValue, spells, upgraded, upgradeIds, upgrades } from '../src/content.ts'

const witchfire = spells.witchfire
const briarling = foes.briarling
const { view } = court
import { Battle, bursts, DURATION, makeFoe, MAX_ARMOR, PICKUP_RADIUS, xpGoal } from '../src/battle.ts'

function playing(random = () => 0) {
  const battle = new Battle(random)
  battle.phase = 'playing'
  return battle
}

function advance(battle, frames, dx = 0, dy = 0) {
  for (let i = 0; i < frames; i++) battle.step(1 / 60, dx, dy)
}

test('new runs have full armor, an empty arena and independent state', () => {
  const old = playing()
  advance(old, 90, -1, 1)
  const fresh = new Battle()
  assert.equal(fresh.phase, 'ready')
  assert.equal(fresh.armor, MAX_ARMOR)
  assert.equal(fresh.elapsed, 0)
  assert.equal(fresh.kills, 0)
  assert.equal(fresh.immunity, 0)
  assert.deepEqual(fresh.foes, [])
  assert.deepEqual(fresh.embers, [])
  assert.equal(fresh.xp, 0)
  assert.equal(fresh.level, 1)
  assert.notDeepEqual(fresh.player, old.player)
})

test('diagonal and axial movement cover the same distance and turn the warden', () => {
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 1], [-1, -1]]) {
    const b = playing()
    const start = { ...b.player }
    advance(b, 60, dx, dy)
    assert.ok(Math.abs(Math.hypot(b.player.x - start.x, b.player.y - start.y) - 160) < 1e-8)
    assert.equal(b.facing, Math.atan2(dy, dx))
  }
})

// A warden who can cross the whole court: no kills, so no level-up interrupts
// the walk, and no amount of thorns ends it.
function walker() {
  const b = playing()
  b.spells.witchfire.range = 0
  b.armor = Infinity
  return b
}

test('movement stops at each wall of the court', () => {
  const b = walker()
  advance(b, 600, -1, -1)
  assert.deepEqual(b.player, { x: 22, y: 22 })
  advance(b, 1100, 1, 1)
  assert.deepEqual(b.player, { x: court.width - 22, y: court.height - 22 })
})

test('the camera follows the warden and stops at the walls with the warden in frame', () => {
  const b = walker()
  assert.ok(court.width > view.width && court.height > view.height)
  assert.deepEqual(b.camera(), { x: b.player.x - view.width / 2, y: b.player.y - view.height / 2 })
  advance(b, 30, 1, 1)
  assert.deepEqual(b.camera(), { x: b.player.x - view.width / 2, y: b.player.y - view.height / 2 })
  const corners = { '-1': 0, 1: 1 }
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, 0], [0, -1], [1, 0], [0, 1]]) {
    // Each leg is long; keep the minute from running out mid-walk.
    b.elapsed = 0
    advance(b, 1100, dx, dy)
    const camera = b.camera()
    if (dx) assert.equal(camera.x, corners[dx] * (court.width - view.width))
    if (dy) assert.equal(camera.y, corners[dy] * (court.height - view.height))
    assert.ok(camera.x >= 0 && camera.x + view.width <= court.width)
    assert.ok(camera.y >= 0 && camera.y + view.height <= court.height)
    assert.ok(b.player.x > camera.x && b.player.x < camera.x + view.width)
    assert.ok(b.player.y > camera.y && b.player.y < camera.y + view.height)
  }
})

test('foes never appear inside the visible area, wherever the warden stands', () => {
  let seed = 7
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let run = 0; run < 400; run++) {
    const b = new Battle(random)
    b.phase = 'playing'
    b.player = { x: 22 + random() * (court.width - 44), y: 22 + random() * (court.height - 44) }
    b.step(0, 0, 0)
    const [foe] = b.foes
    const camera = b.camera()
    const inside =
      foe.x > camera.x && foe.x < camera.x + view.width &&
      foe.y > camera.y && foe.y < camera.y + view.height
    assert.ok(!inside, JSON.stringify({ foe, camera }))
    assert.ok(Math.hypot(foe.x - b.player.x, foe.y - b.player.y) >= 150)
  }
})

test('an ember left out of sight waits there and is collected on return', () => {
  const b = walker()
  const ember = { x: b.player.x + 30, y: b.player.y + PICKUP_RADIUS + 20, value: 1 }
  b.embers = [ember]
  advance(b, 300, -1, 0)
  assert.ok(ember.x > b.camera().x + view.width)
  assert.deepEqual(b.embers, [ember])
  advance(b, 300, 1, 0)
  assert.deepEqual(b.embers, [ember])
  advance(b, 20, 0, 1)
  assert.deepEqual(b.embers, [])
  assert.equal(b.xp, 1)
})

for (const [edge, roll, axis, outside] of [
  ['left', 0, 'x', -14], ['right', .25, 'x', view.width + 14],
  ['top', .5, 'y', -14], ['bottom', .75, 'y', view.height + 14],
]) {
  test('foes enter just beyond the ' + edge + ' edge of the view and chase the player', () => {
    const b = playing(() => roll)
    b.step(0, 0, 0)
    const foe = b.foes[0]
    assert.equal(foe[axis], b.camera()[axis] + outside)
    const distance = () => Math.hypot(foe.x - b.player.x, foe.y - b.player.y)
    const before = distance()
    advance(b, 20)
    assert.ok(distance() < before)
  })
}

test('nearby horizontal and vertical entry points move to the opposite side', () => {
  for (const [roll, player, axis, expected] of [
    [0, { x: 22, y: 22 }, 'x', view.width + 14],
    [.5, { x: court.width / 2, y: 22 }, 'y', view.height + 14],
  ]) {
    const b = playing(() => roll)
    b.player = player
    b.step(0, 0, 0)
    assert.equal(b.foes[0][axis], expected)
  }
})

test('late waves spawn more foes over an equal interval', () => {
  const count = start => {
    const b = playing()
    b.elapsed = start
    advance(b, 240)
    return b.kills + b.foes.length
  }
  assert.ok(count(250) > count(10))
})

test('witchfire hits the nearest in-range target once and respects its cooldown', () => {
  const b = playing()
  const foe = offset => makeFoe('briarling', b.player.x + offset, b.player.y, 0, 1)
  const near = foe(35), far = foe(120), outside = foe(160)
  b.spells.witchfire.cooldown = 0.55
  b.foes = [outside, far, near]
  const at = { x: near.x, y: near.y }
  assert.deepEqual(b.step(0, 0, 0), [
    { type: 'shot', from: { ...b.player }, to: at },
    { type: 'kill', at },
  ])
  assert.equal(b.kills, 1)
  assert.deepEqual(b.embers, [{ ...at, value: 1 }])
  advance(b, 32)
  assert.ok(b.foes.includes(far))
  advance(b, 2)
  assert.equal(b.kills, 2)
  advance(b, 45)
  assert.ok(b.foes.includes(outside))
  assert.equal(b.kills, 2)
})

test('overlapping foes share a damage cooldown and can eventually destroy armor', () => {
  const b = playing()
  b.foes = Array.from({ length: 20 }, () => makeFoe('briarling', b.player.x, b.player.y, 0, 1e9))
  advance(b, 1)
  assert.equal(b.armor, MAX_ARMOR - 1)
  advance(b, 70)
  assert.equal(b.armor, MAX_ARMOR - 1)
  advance(b, 8)
  assert.equal(b.armor, MAX_ARMOR - 2)
  advance(b, 300)
  assert.equal(b.armor, 0)
  assert.equal(b.phase, 'lost')
})

test('surviving the deadline ends the run at exactly one minute', () => {
  const b = playing()
  b.elapsed = DURATION - .01
  advance(b, 2)
  assert.equal(b.elapsed, DURATION)
  assert.equal(b.phase, 'won')
})

for (const phase of ['ready', 'paused', 'choosing', 'won', 'lost']) {
  test('simulation is frozen while ' + phase, () => {
    const b = playing()
    advance(b, 15)
    b.phase = phase
    const before = JSON.stringify(b)
    assert.deepEqual(b.step(1 / 60, 1, 1), [])
    advance(b, 120, 1, 1)
    assert.equal(JSON.stringify(b), before)
  })
}

test('a distant ember stays on the ground and is collected once within reach', () => {
  const b = playing()
  const ember = { x: b.player.x + PICKUP_RADIUS + 60, y: b.player.y, value: 1 }
  b.embers = [ember]
  advance(b, 30)
  assert.deepEqual(b.embers, [ember])
  assert.equal(b.xp, 0)
  const events = []
  for (let i = 0; i < 30; i++) events.push(...b.step(1 / 60, 1, 0))
  assert.deepEqual(events, [{ type: 'pickup', at: { x: ember.x, y: ember.y } }])
  assert.deepEqual(b.embers, [])
  advance(b, 30, -1, 0)
  assert.equal(b.xp, 1)
  assert.equal(b.level, 1)
})

test('experience beyond the goal carries over, even across two levels', () => {
  const b = playing()
  const drop = value => { b.embers.push({ ...b.player, value }) }
  drop(xpGoal(1) + 2)
  assert.deepEqual(b.step(0, 0, 0).map(event => event.type), ['pickup', 'level'])
  assert.equal(b.level, 2)
  assert.equal(b.xp, 2)
  b.choose(0)
  drop(xpGoal(2) + xpGoal(3))
  const levels = b.step(0, 0, 0).filter(event => event.type === 'level')
  assert.deepEqual(levels.map(event => event.level), [3, 4])
  assert.equal(b.xp, 2)
  assert.ok(xpGoal(2) > xpGoal(1))
})

test('a briarling survives witchfire until its health runs out', () => {
  const b = playing()
  assert.ok(briarling.health > witchfire.damage)
  b.step(0, 0, 0)
  const foe = b.foes[0]
  assert.equal(foe.health, briarling.health)
  Object.assign(foe, { x: b.player.x + 60, y: b.player.y, speed: 0 })
  const hits = Math.ceil(briarling.health / witchfire.damage)
  for (let hit = 1; hit <= hits; hit++) {
    b.timers.witchfire = 0
    const types = b.step(0, 0, 0).map(event => event.type)
    assert.deepEqual(types, hit < hits ? ['shot'] : ['shot', 'kill'])
    assert.equal(b.foes.includes(foe), hit < hits)
  }
  assert.equal(b.kills, 1)
  assert.equal(b.embers.length, 1)
})

test('briarlings that enter later in the run are tougher', () => {
  const b = playing()
  b.elapsed = 40
  b.step(0, 0, 0)
  assert.equal(b.foes[0].health, briarling.health + 40 * briarling.healthGrowth)
  assert.ok(briarling.healthGrowth > 0)
})

function levelUp(b, levels = 1) {
  let value = 0
  for (let i = 0; i < levels; i++) value += xpGoal(b.level + i)
  b.embers.push({ ...b.player, value })
  return b.step(1 / 60, 0, 0)
}

function learn(b, spell) {
  b.loadout.push(spell)
  b.spells[spell] = { ...spells[spell] }
}

// A foe that stands still and never dies, placed relative to the warden.
function dummy(b, dx, dy = 0) {
  const foe = makeFoe('briarling', b.player.x + dx, b.player.y + dy, 0, 1e9)
  b.foes.push(foe)
  return foe
}

const hurt = foe => 1e9 - foe.health

test('a level-up freezes foes, the clock and the cooldowns until a card is chosen', () => {
  const b = playing()
  advance(b, 30)
  b.foes.push(makeFoe('briarling', b.player.x + 300, b.player.y, 60, 3))
  b.timers.witchfire = 0.1
  levelUp(b)
  assert.equal(b.phase, 'choosing')
  assert.equal(b.choiceLevel, 2)
  const before = JSON.stringify(b)
  assert.deepEqual(b.step(1 / 60, 1, 0), [])
  advance(b, 120, 1, 1)
  assert.equal(JSON.stringify(b), before)
  b.choose(0)
  assert.equal(b.phase, 'playing')
  assert.deepEqual(b.offer, [])
  advance(b, 1)
  assert.notEqual(JSON.stringify(b), before)
})

test('the first cards offer both new spells and one upgrade of the known spell', () => {
  const b = playing(() => 0.5)
  assert.deepEqual(b.loadout, ['witchfire'])
  levelUp(b)
  assert.deepEqual(b.offer.slice(0, 2), [
    { kind: 'learn', spell: 'moonblade' },
    { kind: 'learn', spell: 'toll' },
  ])
  assert.equal(b.offer.length, loadout.cards)
  const card = b.offer[2]
  assert.equal(card.kind, 'upgrade')
  assert.equal(card.spell, 'witchfire')
  assert.equal(card.from, shownValue(witchfire, card.id))
  assert.equal(card.to, shownValue(upgraded(witchfire, card.id), card.id))
})

test('one choice applies exactly once and learned spells fill the slots in order', () => {
  const b = playing(() => 0.5)
  b.choose(0)
  assert.deepEqual(b.loadout, ['witchfire'])
  levelUp(b)
  b.choose(7)
  assert.equal(b.phase, 'choosing')
  b.choose(1)
  b.choose(1)
  assert.equal(b.phase, 'playing')
  assert.deepEqual(b.loadout, ['witchfire', 'toll'])
  assert.deepEqual(b.spells.toll, spells.toll)
  assert.notEqual(b.spells.toll, spells.toll)

  levelUp(b)
  assert.deepEqual(b.offer[0], { kind: 'learn', spell: 'moonblade' })
  const card = b.offer[1]
  const before = { ...b.spells[card.spell] }
  b.choose(1)
  assert.deepEqual(b.spells[card.spell], upgraded(before, card.id))
  assert.deepEqual(b.loadout, ['witchfire', 'toll'])
})

test('two levels at once give two sets of cards in a row', () => {
  const b = playing(() => 0.5)
  levelUp(b, 2)
  assert.equal(b.level, 3)
  assert.equal(b.choiceLevel, 2)
  b.choose(0)
  assert.equal(b.phase, 'choosing')
  assert.equal(b.choiceLevel, 3)
  assert.deepEqual(b.offer[0], { kind: 'learn', spell: 'toll' })
  assert.equal(b.offer.length, loadout.cards)
  b.choose(0)
  assert.equal(b.phase, 'playing')
  assert.deepEqual(b.loadout, ['witchfire', 'moonblade', 'toll'])
})

test('with every slot taken the cards are distinct upgrades of learned spells', () => {
  const slots = loadout.slots
  loadout.slots = 2
  try {
    for (const roll of [0, 0.5, 0.99]) {
      const b = playing(() => roll)
      learn(b, 'toll')
      levelUp(b)
      assert.equal(b.offer.length, loadout.cards)
      assert.equal(new Set(b.offer.map(card => card.id)).size, loadout.cards)
      for (const card of b.offer) {
        assert.equal(card.kind, 'upgrade')
        assert.ok(b.loadout.includes(card.spell))
        assert.notEqual(card.to, card.from)
      }
    }
  } finally {
    loadout.slots = slots
  }
})

test('every upgrade belongs to a spell and changes the number its card shows', () => {
  for (const id of upgradeIds) {
    const stats = spells[upgrades[id].spell]
    const better = upgraded(stats, id)
    assert.notDeepEqual(better, stats)
    assert.ok(shownValue(better, id) > shownValue(stats, id))
  }
})

test('range, rate and damage upgrades each change the witchfire', () => {
  const shots = (upgrade, distance, frames) => {
    const b = playing()
    if (upgrade) b.spells.witchfire = upgraded(b.spells.witchfire, upgrade)
    const foe = dummy(b, distance)
    let count = 0
    for (let i = 0; i < frames; i++) {
      count += b.step(1 / 60, 0, 0).filter(event => event.type === 'shot').length
      b.foes.length = 1
    }
    return { count, health: hurt(foe) }
  }
  assert.equal(shots(null, witchfire.range + 10, 60).count, 0)
  assert.ok(shots('range', witchfire.range + 10, 60).count > 0)
  assert.ok(shots('rate', 60, 120).count > shots(null, 60, 120).count)
  const plain = shots(null, 60, 120), hot = shots('damage', 60, 120)
  assert.equal(hot.count, plain.count)
  const gain = upgraded(witchfire, 'damage').damage / witchfire.damage
  assert.ok(Math.abs(hot.health / plain.health - gain) < 1e-6)
})

test('the moon blade cuts along the last direction of movement, even after stopping', () => {
  const b = playing()
  b.spells.witchfire.range = 0
  learn(b, 'moonblade')
  b.timers.moonblade = 1
  advance(b, 6, -1, 0)
  advance(b, 6)
  const { range, arc, damage } = spells.moonblade
  const ahead = dummy(b, -range + 10)
  const second = dummy(b, -40, 20)
  const behind = dummy(b, range - 10)
  const beside = dummy(b, 0, -40)
  const beyond = dummy(b, -range - 10)
  b.timers.moonblade = 0
  const [slash] = b.step(0, 0, 0)
  assert.deepEqual(slash, {
    type: 'slash', at: { ...b.player }, facing: Math.PI, range, arc: (arc * Math.PI) / 180,
  })
  assert.deepEqual([ahead, second, behind, beside, beyond].map(hurt), [damage, damage, 0, 0, 0])

  // A wider swing reaches the foe at the warden's side.
  b.spells.moonblade.arc = 95
  b.timers.moonblade = 0
  b.step(0, 0, 0)
  assert.equal(hurt(beside), damage)
  assert.equal(hurt(behind), 0)
})

test('the funeral toll hurts and pushes back every foe inside its radius only', () => {
  const b = playing()
  b.spells.witchfire.range = 0
  learn(b, 'toll')
  const { range, knockback, damage } = spells.toll
  const left = dummy(b, -range + 5)
  const below = dummy(b, 0, 30)
  const under = dummy(b, 0)
  const outside = dummy(b, range + 5)
  const events = b.step(0, 0, 0)
  assert.deepEqual(events, [{ type: 'toll', at: { ...b.player }, radius: range }])
  assert.deepEqual([left, below, under, outside].map(hurt), [damage, damage, damage, 0])
  assert.equal(left.x, b.player.x - range + 5 - knockback)
  assert.equal(below.y, b.player.y + 30 + knockback)
  assert.deepEqual({ x: under.x, y: under.y }, b.player)
  assert.equal(outside.x, b.player.x + range + 5)
})

test('each spell keeps its own cooldown and area spells leave embers too', () => {
  const b = playing()
  learn(b, 'moonblade')
  learn(b, 'toll')
  dummy(b, 60)
  b.foes.push(makeFoe('briarling', b.player.x + 30, b.player.y, 0, 0.1))
  const counts = { shot: 0, slash: 0, toll: 0, kill: 0 }
  const seconds = 4
  for (let i = 0; i < seconds * 60; i++) {
    for (const event of b.step(1 / 60, 0, 0)) counts[event.type]++
    b.foes.length = Math.min(b.foes.length, 2)
  }
  for (const [type, id] of [['shot', 'witchfire'], ['slash', 'moonblade'], ['toll', 'toll']]) {
    const expected = seconds / spells[id].cooldown
    assert.ok(Math.abs(counts[type] - expected) <= 2, type + ' ' + counts[type])
  }
  assert.ok(counts.shot > counts.slash && counts.slash > counts.toll)
  assert.equal(counts.kill, 1)
  assert.equal(b.kills, 1)
  // The ember fell within reach and was collected on the next step.
  assert.equal(b.embers.length + b.xp, 1)
})

// --- Step 2.5: the wave schedule, boars, archers and lamp oil.

function seeded(seed = 11) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647
}

// Jumps a quiet, unkillable run to just before the given second.
function runAt(second, random = seeded()) {
  const b = new Battle(random)
  b.phase = 'playing'
  b.spells.witchfire.range = 0
  b.armor = Infinity
  b.elapsed = second - 0.05
  b.step(0, 0, 0)
  b.foes = []
  return b
}

test('a wave sends its group once at its start and then on its own beat until it ends', () => {
  const once = { kind: 'briarling', from: 240, count: 8 }
  assert.deepEqual([0, 239.9, 240, 241, 300].map(t => bursts(once, t)), [0, 0, 1, 1, 1])
  const beat = { kind: 'boar', from: 60, to: 90, every: 10, count: 1 }
  assert.deepEqual([59.9, 60, 69.9, 70, 80, 89.9, 90, 200].map(t => bursts(beat, t)), [0, 1, 1, 2, 3, 3, 3, 3])
  const uneven = { kind: 'archer', from: 0, to: 25, every: 10, count: 2 }
  assert.deepEqual([0, 10, 20, 24.9, 25, 30].map(t => bursts(uneven, t)), [1, 2, 3, 3, 3, 3])
})

test('at a wave boundary survivors stay and each new group enters exactly once', () => {
  const b = runAt(240)
  const survivor = makeFoe('boar', b.player.x + 900, b.player.y, 0, 1e9)
  b.foes.push(survivor)
  advance(b, 2)
  assert.deepEqual(b.foes, [survivor])
  while (b.foes.length === 1) b.step(1 / 60, 0, 0)
  assert.ok(b.elapsed >= 240 && b.elapsed < 240.02)
  const starting = waves.filter(wave => wave.from === 240)
  const expected = starting.reduce((sum, wave) => sum + wave.count, 0)
  assert.ok(starting.some(wave => wave.count > 1))
  assert.equal(b.foes.length, 1 + expected)
  assert.ok(b.foes.includes(survivor))
  // The pack enters side by side along one edge of the view.
  const pack = b.foes.slice(1, 9)
  const spread = axis => Math.max(...pack.map(foe => foe[axis])) - Math.min(...pack.map(foe => foe[axis]))
  assert.ok(Math.min(spread('x'), spread('y')) < 20)
  assert.ok(Math.abs(Math.max(spread('x'), spread('y')) - 7 * 34) < 20)
  advance(b, 12)
  assert.equal(b.foes.length, 1 + expected)
})

test('a whole run sends in exactly the groups the schedule lists', () => {
  const b = new Battle(seeded())
  b.phase = 'playing'
  b.spells.witchfire.range = 0
  b.armor = Infinity
  const seen = new Set()
  const entered = { briarling: 0, boar: 0, archer: 0 }
  while (b.phase === 'playing') {
    b.step(1 / 30, 0, 0)
    for (const foe of b.foes) {
      if (seen.has(foe)) continue
      seen.add(foe)
      entered[foe.kind]++
    }
    // Keep the court from filling up: foes that have been counted may go.
    if (b.foes.length > 40) b.foes = []
    b.arrows = []
  }
  assert.equal(b.phase, 'won')
  assert.equal(DURATION, run.duration)
  for (const kind of Object.keys(entered)) {
    const listed = waves
      .filter(wave => wave.kind === kind)
      .reduce((sum, wave) => sum + bursts(wave, run.duration) * wave.count, 0)
    assert.equal(entered[kind], listed, kind)
    assert.ok(listed > 0)
  }
  const first = kind => Math.min(...waves.filter(wave => wave.kind === kind).map(wave => wave.from))
  assert.ok(first('briarling') < first('boar') && first('boar') < first('archer'))
})

test('after a pause the schedule continues from the same second', () => {
  const play = pauseAt => {
    const b = new Battle(seeded(5))
    b.phase = 'playing'
    b.spells.witchfire.range = 0
    b.armor = Infinity
    b.elapsed = 58
    for (let frame = 0; frame < 300; frame++) {
      if (frame === pauseAt) {
        b.phase = 'paused'
        advance(b, 500, 1, 1)
        b.phase = 'playing'
      }
      b.step(1 / 60, 0, 0)
    }
    return JSON.stringify(b)
  }
  const straight = play(-1)
  assert.equal(play(100), straight)
  assert.equal(play(121), straight)
  assert.ok(JSON.parse(straight).foes.some(foe => foe.kind === 'boar'))
})

// A lone foe of the given kind beside a warden who cannot kill it.
function duel(kind, dx, dy = 0) {
  const b = runAt(1)
  b.armor = MAX_ARMOR
  const foe = makeFoe(kind, b.player.x + dx, b.player.y + dy, foes[kind].speed, 1e9)
  b.foes = [foe]
  // Hold the schedule still so nothing else walks in.
  const step = (frames, mx = 0, my = 0) => {
    for (let i = 0; i < frames; i++) {
      b.elapsed = 1
      b.step(1 / 60, mx, my)
      b.foes = [foe]
    }
  }
  return { b, foe, step }
}

test('a boar warns before it charges down the lane it marked', () => {
  const { b, foe, step } = duel('boar', boarCharge.trigger + 60)
  step(30)
  assert.equal(foe.mode, 'chase')
  assert.ok(foe.x < b.player.x + boarCharge.trigger + 60)
  while (foe.mode === 'chase') step(1)
  assert.equal(foe.mode, 'windup')
  assert.ok(b.player.x + boarCharge.trigger - foe.x < 3)
  assert.deepEqual(foe.dir, { x: -1, y: 0 })
  const from = { x: foe.x, y: foe.y }

  // The boar stands still for the whole warning while the warden steps aside.
  const warning = Math.round(boarCharge.windup * 60)
  step(warning - 8, 0, 1)
  assert.equal(foe.mode, 'windup')
  assert.deepEqual({ x: foe.x, y: foe.y }, from)
  assert.ok(b.player.y > from.y + 100)

  // The charge keeps the marked direction instead of following the warden.
  step(12, 0, 1)
  assert.equal(foe.mode, 'charge')
  assert.deepEqual(foe.dir, { x: -1, y: 0 })
  step(Math.round((boarCharge.length / boarCharge.speed) * 60) + 4)
  assert.equal(foe.mode, 'rest')
  assert.equal(foe.y, from.y)
  assert.ok(Math.abs(from.x - foe.x - boarCharge.length) < 20)
  assert.equal(b.armor, MAX_ARMOR)
  const rested = { x: foe.x, y: foe.y }
  step(Math.round(boarCharge.rest * 60) - 10)
  assert.deepEqual({ x: foe.x, y: foe.y }, rested)
  step(30)
  assert.notEqual(foe.mode, 'rest')
})

test('a warden who stays in the lane is run down once', () => {
  const { b, foe, step } = duel('boar', boarCharge.trigger - 10)
  step(Math.round(boarCharge.windup * 60) - 4)
  assert.equal(foe.mode, 'windup')
  assert.equal(b.armor, MAX_ARMOR)
  step(60)
  assert.equal(b.armor, MAX_ARMOR - 1)
})

test('an archer stops at range, warns, then looses a volley along the aimed line', () => {
  const { b, foe, step } = duel('archer', archerVolley.range + 80)
  step(30)
  assert.equal(foe.mode, 'chase')
  while (foe.mode === 'chase') step(1)
  assert.equal(foe.mode, 'aim')
  assert.deepEqual(foe.dir, { x: -1, y: 0 })
  const stand = { x: foe.x, y: foe.y }
  assert.ok(stand.x - b.player.x > archerVolley.range - 10)

  // No arrow flies during the warning; the warden leaves the line meanwhile.
  step(Math.round(archerVolley.windup * 60) - 8, 0, -1)
  assert.equal(foe.mode, 'aim')
  assert.deepEqual(b.arrows, [])
  const seen = []
  const watch = frames => {
    for (let i = 0; i < frames; i++) {
      b.elapsed = 1
      seen.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'arrow'))
      b.foes = [foe]
    }
  }
  watch(Math.round(archerVolley.interval * archerVolley.arrows * 60) + 12)
  assert.equal(seen.length, archerVolley.arrows)
  for (const arrow of seen) assert.deepEqual(arrow.at, stand)
  for (const arrow of b.arrows) {
    assert.equal(arrow.y, stand.y)
    assert.equal(arrow.vy, 0)
    assert.equal(arrow.vx, -archerVolley.arrowSpeed)
  }
  // The arrows pass the place the warden left and die out at the end of their reach.
  watch(Math.round((archerVolley.arrowReach / archerVolley.arrowSpeed) * 60) + 4)
  assert.deepEqual(b.arrows, [])
  assert.equal(b.armor, MAX_ARMOR)

  // The archer reloads before aiming again, and follows a warden who walks away.
  assert.equal(foe.mode, 'chase')
  watch(30)
  assert.equal(seen.length, archerVolley.arrows)
  watch(Math.round(archerVolley.reload * 60))
  assert.ok(['aim', 'volley'].includes(foe.mode) || seen.length > archerVolley.arrows)
  const { step: away } = { step }
  foe.mode = 'chase'
  foe.timer = 0
  b.player.x -= 300
  const before = foe.x
  away(10)
  assert.ok(foe.x < before)
})

test('a warden who stays on the aimed line is struck by the volley once', () => {
  const { b, foe, step } = duel('archer', archerVolley.range - 20)
  step(Math.round(archerVolley.windup * 60))
  assert.equal(b.armor, MAX_ARMOR)
  assert.deepEqual(b.arrows, [])
  step(150)
  assert.equal(b.armor, MAX_ARMOR - 1)
  assert.equal(foe.shots, 0)
})

test('tougher foes leave richer embers', () => {
  for (const kind of ['boar', 'archer']) {
    const b = playing(() => 0.5)
    b.foes = [makeFoe(kind, b.player.x + 60, b.player.y, 0, 0.1)]
    const events = b.step(0, 0, 0)
    assert.deepEqual(events.map(event => event.type), ['shot', 'kill'])
    assert.equal(b.embers[0].value, foes[kind].ember)
    assert.ok(foes[kind].ember > foes.briarling.ember)
    assert.ok(foes[kind].health > foes.briarling.health)
  }
})

test('lamp oil mends one pip, never past the maximum, and waits while the armor is whole', () => {
  const kill = random => {
    const b = playing(random)
    b.foes = [makeFoe('briarling', b.player.x + 100, b.player.y, 0, 0.1)]
    b.step(0, 0, 0)
    return b
  }
  assert.ok(oil.chance > 0 && oil.chance < 0.2)
  assert.deepEqual(kill(() => 0.9).oils, [])
  const b = kill(() => 0)
  const drop = { x: b.player.x + 100, y: b.player.y }
  assert.deepEqual(b.oils, [drop])

  // Whole armor: the warden walks over the oil and it stays.
  b.spells.witchfire.range = 0
  b.embers = []
  b.foes = []
  b.player = { ...drop }
  b.step(0, 0, 0)
  assert.deepEqual(b.oils, [drop])
  assert.equal(b.armor, MAX_ARMOR)

  b.armor = MAX_ARMOR - 1
  b.oils.push({ ...drop })
  const events = b.step(0, 0, 0)
  assert.deepEqual(events.filter(event => event.type === 'heal'), [{ type: 'heal', at: drop }])
  assert.equal(b.armor, MAX_ARMOR)
  assert.equal(b.oils.length, 1)

  b.armor = 1
  b.oils.push({ x: drop.x + PICKUP_RADIUS + 30, y: drop.y })
  b.foes = []
  b.step(0, 0, 0)
  assert.equal(b.armor, 2)
  assert.equal(b.oils.length, 1)
})
