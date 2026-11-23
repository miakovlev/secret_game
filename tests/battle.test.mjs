import assert from 'node:assert/strict'
import test from 'node:test'
import { briarling, loadout, shownValue, spells, upgraded, upgradeIds, upgrades } from '../src/content.ts'

const witchfire = spells.witchfire
import { Battle, DURATION, WIDTH, HEIGHT, MAX_ARMOR, PICKUP_RADIUS, xpGoal } from '../src/battle.ts'

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

test('movement stops at each arena boundary', () => {
  const b = playing()
  // No kills, so no embers interrupt the walk with a level-up.
  b.spells.witchfire.range = 0
  advance(b, 480, -1, -1)
  assert.deepEqual(b.player, { x: 22, y: 22 })
  advance(b, 540, 1, 1)
  assert.deepEqual(b.player, { x: WIDTH - 22, y: HEIGHT - 22 })
})

for (const [edge, roll, axis, outside] of [
  ['left', 0, 'x', -14], ['right', .25, 'x', WIDTH + 14],
  ['top', .5, 'y', -14], ['bottom', .75, 'y', HEIGHT + 14],
]) {
  test('foes enter from the ' + edge + ' and chase the player', () => {
    const b = playing(() => roll)
    b.step(0, 0, 0)
    const foe = b.foes[0]
    assert.equal(foe[axis], outside)
    const distance = () => Math.hypot(foe.x - b.player.x, foe.y - b.player.y)
    const before = distance()
    advance(b, 20)
    assert.ok(distance() < before)
  })
}

test('nearby horizontal and vertical entry points move to the opposite side', () => {
  for (const [roll, player, axis, expected] of [
    [0, { x: 22, y: 22 }, 'x', WIDTH + 14],
    [.5, { x: WIDTH / 2, y: 22 }, 'y', HEIGHT + 14],
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
  assert.ok(count(50) > count(0))
})

test('witchfire hits the nearest in-range target once and respects its cooldown', () => {
  const b = playing()
  const foe = offset => ({ x: b.player.x + offset, y: b.player.y, speed: 0, health: 1 })
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
  b.foes = Array.from({ length: 20 }, () => ({ ...b.player, speed: 0, health: 1e9 }))
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
  const foe = { x: b.player.x + dx, y: b.player.y + dy, speed: 0, health: 1e9 }
  b.foes.push(foe)
  return foe
}

const hurt = foe => 1e9 - foe.health

test('a level-up freezes foes, the clock and the cooldowns until a card is chosen', () => {
  const b = playing()
  advance(b, 30)
  b.foes.push({ x: b.player.x + 300, y: b.player.y, speed: 60, health: 3 })
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
  b.foes.push({ x: b.player.x + 30, y: b.player.y, speed: 0, health: 0.1 })
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
