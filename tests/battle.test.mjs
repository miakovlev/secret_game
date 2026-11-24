import assert from 'node:assert/strict'
import test from 'node:test'
import { bossIds, bossRule, massRule, warderRule, spellIds, archerVolley, blessings, boarCharge, court, difficulties, duelRule, fireflyRule, foes, heroes, heroIds, loadout, mothHeal, relicIds, relicRule,
  relics, seedRule, oil, waves, shownValue, spells, upgraded, upgradeIds, upgrades } from '../src/content.ts'

const witchfire = spells.witchfire
const briarling = foes.briarling
const { view } = court

// Brings the last boss, the Duchess, in on the next step.
function dawn(b) {
  b.bossIndex = bossIds.length - 1
  b.calm = bossRule.every
}
import { Battle, bursts, makeFoe, MAX_ARMOR, PICKUP_RADIUS, xpGoal } from '../src/battle.ts'

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
  assert.equal(fresh.stage, 'court')
  assert.equal(fresh.crownOpen, 0)
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

test('the dawn bell stops the waves and brings the Duchess into the same court', () => {
  const b = playing()
  learn(b, 'toll')
  b.spells.toll.range = 0
  b.spells.witchfire = upgraded(b.spells.witchfire, 'damage')
  b.spells.witchfire.range = 0
  b.armor = 3
  b.level = 4
  b.kills = 17
  const boar = makeFoe('boar', b.player.x + 700, b.player.y, 0, 50)
  b.foes = [boar]
  b.embers = [{ x: 40, y: 40, value: 1 }]
  b.oils = [{ x: 60, y: 60 }]
  b.reliquaries = [{ x: 80, y: 80 }]
  const build = JSON.stringify([b.loadout, b.spells])
  const stood = { ...b.player }
  dawn(b)
  b.calm -= .01
  assert.equal(b.stage, 'court')
  const events = []
  for (let i = 0; i < 2; i++) events.push(...b.step(1 / 60, 0, 0))
  assert.deepEqual(events.filter(event => event.type === 'duel'), [{ type: 'duel' }])
  assert.equal(b.stage, 'duel')
  assert.equal(b.phase, 'playing')
  // Nothing about the hero or the court changes: same place, armor, build and loot on the ground.
  assert.deepEqual(b.player, stood)
  assert.equal(b.armor, 3)
  assert.equal(b.level, 4)
  assert.equal(b.kills, 17)
  assert.equal(JSON.stringify([b.loadout, b.spells]), build)
  assert.deepEqual([b.embers.length, b.oils.length, b.reliquaries.length], [1, 1, 1])
  // Foes already in the court stay; the Duchess enters by the north gate and a seal-flower blooms.
  assert.deepEqual(b.foes.map(foe => foe.kind).sort(), ['boar', 'duchess', 'seal'])
  const lady = b.duchess
  assert.equal(lady.x, court.gate.x)
  assert.ok(lady.y < 100)
  const seal = b.foes.find(foe => foe.kind === 'seal')
  assert.deepEqual({ x: seal.x, y: seal.y }, duelRule.beds[0])
  assert.ok(b.shielded)

  // The wave schedule is over: only what she calls herself comes in from now on.
  b.armor = Infinity
  seal.health = seal.full = 1e9
  const before = b.summons
  const frames = Math.round((duelRule.summon.every - 1) * 60)
  for (let i = 0; i < frames; i++) b.step(1 / 60, 0, 0)
  assert.equal(b.summons, before)
  assert.deepEqual(b.foes.map(foe => foe.kind).sort(), ['boar', 'duchess', 'seal'])
  // And she has walked toward the hero meanwhile.
  assert.ok(Math.hypot(lady.x - b.player.x, lady.y - b.player.y) < Math.hypot(court.gate.x - stood.x, 70 - stood.y) - 100)
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

test('the first cards offer two different new spells and one upgrade of the known spell', () => {
  const seen = new Set()
  for (const roll of [0, 0.3, 0.5, 0.8, 0.99]) {
    const b = playing(() => roll)
    assert.deepEqual(b.loadout, ['witchfire'])
    levelUp(b)
    assert.equal(b.offer.length, loadout.cards)
    const [first, second, card] = b.offer
    assert.deepEqual([first.kind, second.kind, card.kind], ['learn', 'learn', 'upgrade'])
    assert.equal(loadout.learnCards, 2)
    assert.notEqual(first.spell, second.spell)
    for (const learn of [first, second]) {
      assert.ok(learn.spell !== 'witchfire' && learn.spell in spells)
      seen.add(learn.spell)
    }
    assert.equal(card.spell, 'witchfire')
    assert.equal(card.from, shownValue(witchfire, card.id))
    assert.equal(card.to, shownValue(upgraded(witchfire, card.id), card.id))
  }
  // Different rolls bring every other spell to the table sooner or later.
  assert.deepEqual([...seen].sort(), ['fireflies', 'moonblade', 'seeds', 'toll'])
})

test('one choice applies exactly once and learned spells fill the slots in order', () => {
  const b = playing(() => 0.5)
  b.choose(0)
  assert.deepEqual(b.loadout, ['witchfire'])
  levelUp(b)
  b.choose(7)
  assert.equal(b.phase, 'choosing')
  const learned = b.offer[1].spell
  b.choose(1)
  b.choose(1)
  assert.equal(b.phase, 'playing')
  assert.deepEqual(b.loadout, ['witchfire', learned])
  assert.deepEqual(b.spells[learned], spells[learned])
  assert.notEqual(b.spells[learned], spells[learned])

  // The learned spell is not offered again; its upgrades now are.
  levelUp(b)
  assert.ok(b.offer.every(card => card.kind !== 'learn' || card.spell !== learned))
  const index = b.offer.findIndex(card => card.kind === 'upgrade')
  const card = b.offer[index]
  const before = { ...b.spells[card.spell] }
  b.choose(index)
  assert.deepEqual(b.spells[card.spell], upgraded(before, card.id))
  assert.deepEqual(b.loadout, ['witchfire', learned])
})

test('two levels at once give two sets of cards in a row', () => {
  const b = playing(() => 0.5)
  levelUp(b, 2)
  assert.equal(b.level, 3)
  assert.equal(b.choiceLevel, 2)
  const first = b.offer[0].spell
  b.choose(0)
  assert.equal(b.phase, 'choosing')
  assert.equal(b.choiceLevel, 3)
  assert.equal(b.offer.length, loadout.cards)
  assert.equal(b.offer[0].kind, 'learn')
  const second = b.offer[0].spell
  assert.notEqual(second, first)
  b.choose(0)
  assert.equal(b.phase, 'playing')
  assert.deepEqual(b.loadout, ['witchfire', first, second])
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
  const packWave = waves.find(wave => !wave.every && wave.count > 1)
  const bell = packWave.from
  const b = runAt(bell)
  const survivor = makeFoe('boar', b.player.x + 900, b.player.y, 0, 1e9)
  b.foes.push(survivor)
  advance(b, 2)
  assert.deepEqual(b.foes, [survivor])
  while (b.foes.length === 1) b.step(1 / 60, 0, 0)
  assert.ok(b.elapsed >= bell && b.elapsed < bell + 0.02)
  const starting = waves.filter(wave => wave.from === bell)
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

test('the waves send in exactly the groups the schedule lists', () => {
  const b = new Battle(seeded())
  b.phase = 'playing'
  b.spells.witchfire.range = 0
  b.armor = Infinity
  const seen = new Set()
  const entered = { briarling: 0, marked: 0, boar: 0, archer: 0, knight: 0, moth: 0 }
  // Twelve minutes and a bit: every stretch of the schedule has begun.
  const until = 760
  while (b.elapsed < until) {
    b.step(1 / 30, 0, 0)
    for (const foe of b.foes) {
      if (seen.has(foe) || !(foe.kind in entered)) continue
      seen.add(foe)
      entered[foe.kind]++
    }
    // Keep the court from filling up: foes that have been counted may go.
    if (b.foes.length > 40) b.foes = []
    b.arrows = []
  }
  assert.equal(b.phase, 'playing')
  assert.equal(b.stage, 'court')
  for (const kind of Object.keys(entered)) {
    const listed = waves
      .filter(wave => wave.kind === kind)
      .reduce((sum, wave) => sum + bursts(wave, b.elapsed) * wave.count, 0)
    assert.equal(entered[kind], listed, kind)
    assert.ok(listed > 0)
  }
  const first = kind => Math.min(...waves.filter(wave => wave.kind === kind).map(wave => wave.from))
  assert.ok(first('briarling') < first('boar') && first('boar') < first('archer'))
  assert.ok(first('archer') < first('knight') && first('knight') <= first('moth'))
  // The last stretch has no end of its own: it lasts until the Duchess comes.
  assert.ok(waves.some(wave => wave.to === Infinity))
  assert.equal(bursts({ kind: 'boar', from: 10, to: Infinity, every: 5, count: 1 }, 1010), 201)
})

test('after a pause the schedule continues from the same second', () => {
  const play = pauseAt => {
    const b = new Battle(seeded(5))
    b.phase = 'playing'
    b.spells.witchfire.range = 0
    b.armor = Infinity
    b.elapsed = waves.find(wave => wave.kind === 'boar').from - 2
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

// --- Step 2.6: the duel with the Duchess, fought in the court.

// The hero at the moment the Duchess walks in.
function inDuel(random = () => 0.5) {
  const b = playing(random)
  dawn(b)
  b.step(1 / 60, 0, 0)
  b.immunity = 0
  const seal = b.foes.find(foe => foe.kind === 'seal')
  return { b, seal, lady: b.duchess }
}

// The duel with the seal-flower unbreakable, the hero unkillable and silent,
// and every attack but the named one put off for good.
function only(attack, phase = 1) {
  const { b, seal, lady } = inDuel()
  b.spells.witchfire.range = 0
  b.armor = Infinity
  seal.health = seal.full = 1e9
  b.duelPhase = phase
  const far = 1e9
  const hold = () => {
    if (attack !== 'lash' && !b.lash.warned) b.lash.timer = far
    if (attack !== 'volley' && !b.volley.warned) b.volley.timer = far
    if (attack !== 'patch') b.patchIn = far
    if (attack !== 'summon') b.summonIn = far
  }
  const run = (frames, dx = 0, dy = 0) => {
    const events = []
    for (let i = 0; i < frames; i++) {
      hold()
      events.push(...b.step(1 / 60, dx, dy))
    }
    return events
  }
  hold()
  return { b, seal, lady, run }
}

test('the duel is fought in the court: the hero walks its whole breadth and the camera follows', () => {
  const { b } = inDuel()
  b.armor = Infinity
  b.spells.witchfire.range = 0
  advance(b, 1100, -1, 1)
  assert.deepEqual(b.player, { x: 22, y: court.height - 22 })
  assert.deepEqual(b.camera(), { x: 0, y: court.height - view.height })
  assert.equal(b.stage, 'duel')
})

test('the crown of vines turns every spell aside while the seal-flower lives', () => {
  const { b, seal, lady } = inDuel()
  learn(b, 'moonblade')
  learn(b, 'toll')
  for (const id of b.loadout) Object.assign(b.spells[id], { range: 4000, arc: 180, cooldown: 0.1 })
  b.armor = Infinity
  seal.health = seal.full = 1e9
  lady.speed = 0
  // Stand next to the Duchess, far from the flower: she is the nearest target.
  const shots = []
  for (let i = 0; i < 120; i++) {
    b.player = { x: lady.x, y: lady.y + 80 }
    shots.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'shot'))
    b.foes = [lady, seal]
  }
  assert.equal(lady.health, foes.duchess.health)
  assert.ok(seal.health < 1e9)
  assert.ok(shots.length > 5)
  for (const shot of shots) assert.deepEqual(shot.to, { x: seal.x, y: seal.y })
  // The bell hurts the flower but does not move it.
  assert.deepEqual({ x: seal.x, y: seal.y }, duelRule.beds[0])
})

test('while her crown is closed the Duchess walks after the hero and wounds by touch', () => {
  const { b, lady, run } = only('nothing')
  const gap = () => Math.hypot(lady.x - b.player.x, lady.y - b.player.y)
  const start = gap()
  run(120)
  assert.ok(Math.abs(start - gap() - 2 * duelRule.speed) < 1)
  // The toll does not throw her back.
  learn(b, 'toll')
  b.spells.toll.range = 4000
  const before = gap()
  run(2)
  assert.ok(gap() < before)

  const touched = inDuel()
  touched.b.spells.witchfire.range = 0
  touched.b.player = { x: touched.lady.x, y: touched.lady.y + foes.duchess.reach - 4 }
  advance(touched.b, 2)
  assert.equal(touched.b.armor, MAX_ARMOR - 1)
})

test('breaking the seal opens the crown for a while: she stands still, then the next flower blooms', () => {
  const { b, seal, lady } = inDuel()
  b.armor = Infinity
  b.player = { x: seal.x + 60, y: seal.y }
  seal.health = 0.5
  const events = b.step(1 / 60, 0, 0)
  assert.deepEqual(events.map(event => event.type), ['shot', 'kill', 'crown'])
  assert.deepEqual(events[2], { type: 'crown', open: true })
  assert.ok(!b.shielded)
  assert.equal(b.crownOpen, duelRule.window)
  assert.deepEqual(b.embers, [])

  // Now the Duchess is the only target, she does not move, and she bleeds.
  b.spells.witchfire.range = 4000
  const stood = { x: lady.x, y: lady.y }
  const frames = Math.round(duelRule.window * 60) - 3
  const quiet = []
  for (let i = 0; i < frames; i++) quiet.push(...b.step(1 / 60, 0, 0))
  assert.ok(!quiet.some(event => ['crown', 'lash', 'volley', 'summon'].includes(event.type)))
  assert.deepEqual({ x: lady.x, y: lady.y }, stood)
  assert.ok(foes.duchess.health - lady.health > 10)
  assert.ok(!b.foes.some(foe => foe.kind === 'seal'))

  const closing = []
  for (let i = 0; i < 6; i++) closing.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'crown'))
  assert.deepEqual(closing, [{ type: 'crown', open: false }])
  assert.ok(b.shielded)
  const next = b.foes.filter(foe => foe.kind === 'seal')
  assert.equal(next.length, 1)
  assert.deepEqual({ x: next[0].x, y: next[0].y }, duelRule.beds[1])
  next[0].health = 1e9
  const before = lady.health
  advance(b, 120)
  assert.equal(lady.health, before)
  // She is on the move again.
  assert.notDeepEqual({ x: lady.x, y: lady.y }, stood)
})

test('the lash warns, then strikes the marked sector; stepping out of it is safe', () => {
  const strike = sidestep => {
    const { b, lady, run } = only('lash')
    lady.speed = 0
    b.player = { x: lady.x, y: lady.y + 250 }
    b.lash.timer = 0.05
    run(4)
    assert.equal(b.lash.warned, true)
    assert.ok(Math.abs(b.lash.facing - Math.PI / 2) < 0.02)
    const facing = b.lash.facing
    const warning = Math.round(duelRule.lash.windup * 60)
    b.armor = MAX_ARMOR
    const early = run(warning - 8, sidestep, 0)
    assert.ok(!early.some(event => event.type === 'lash'))
    assert.equal(b.armor, MAX_ARMOR)
    // The marked sector does not follow the hero.
    assert.equal(b.lash.facing, facing)
    const lashes = run(12, sidestep, 0).filter(event => event.type === 'lash')
    assert.equal(lashes.length, 1)
    assert.equal(lashes[0].facing, facing)
    assert.equal(lashes[0].range, duelRule.lash.range)
    assert.equal(b.lash.warned, false)
    return b.armor
  }
  assert.equal(strike(0), MAX_ARMOR - 1)
  assert.equal(strike(1), MAX_ARMOR)
})

test('the thorn volley warns, then flies along the marked fan and can be sidestepped', () => {
  const { thorns, spread, speed, windup, reach } = duelRule.volley
  const loose = dodge => {
    const { b, lady, run } = only('volley')
    lady.speed = 0
    b.player = { x: lady.x, y: lady.y + 300 }
    b.volley.timer = 0.05
    run(4)
    assert.equal(b.volley.warned, true)
    const facing = b.volley.facing
    assert.deepEqual(b.arrows, [])
    b.armor = MAX_ARMOR
    // Nothing flies during the warning.
    run(Math.round(windup * 60) - 8, dodge, 0)
    assert.deepEqual(b.arrows, [])
    const events = run(10, dodge, 0)
    assert.equal(events.filter(event => event.type === 'volley').length, 1)
    assert.equal(b.arrows.length, thorns)
    const turns = b.arrows.map(arrow => Math.atan2(arrow.vy, arrow.vx) - facing)
    assert.ok(Math.abs(turns[0] + (spread * Math.PI) / 180) < 1e-9)
    assert.ok(Math.abs(turns.at(-1) - (spread * Math.PI) / 180) < 1e-9)
    assert.ok(Math.abs(turns[(thorns - 1) / 2]) < 1e-9)
    for (const arrow of b.arrows) assert.ok(Math.abs(Math.hypot(arrow.vx, arrow.vy) - speed) < 1e-9)
    run(Math.round((reach / speed) * 60) + 4, dodge, 0)
    assert.deepEqual(b.arrows, [])
    return b.armor
  }
  // Standing still, the middle thorn finds the hero; walking out between the lines is safe.
  assert.equal(loose(0), MAX_ARMOR - 1)
  assert.equal(loose(1), MAX_ARMOR)
})

test('a briar patch is marked under the hero, erupts after its warning and then lingers', () => {
  const { radius, windup, life } = duelRule.patch
  const grow = leave => {
    const { b, run } = only('patch')
    b.patchIn = 0.03
    const stood = { ...b.player }
    run(3)
    // One patch is enough for this test: no more are marked after it.
    b.patchIn = 1e9
    assert.equal(b.patches.length, 1)
    assert.deepEqual({ x: b.patches[0].x, y: b.patches[0].y }, stood)
    b.armor = MAX_ARMOR
    const early = run(Math.round(windup * 60) - 6, leave, 0)
    assert.ok(!early.some(event => event.type === 'erupt'))
    assert.equal(b.armor, MAX_ARMOR)
    const erupt = run(10, leave, 0).filter(event => event.type === 'erupt')
    assert.deepEqual(erupt, [{ type: 'erupt', at: stood, radius }])
    return { b, run, stood }
  }
  // Staying on the mark is wounded by the eruption; walking off it is not.
  assert.equal(grow(0).b.armor, MAX_ARMOR - 1)
  const { b, run, stood } = grow(1)
  assert.equal(b.armor, MAX_ARMOR)
  assert.ok(Math.hypot(b.player.x - stood.x, b.player.y - stood.y) > radius)
  // The thicket stays: walking back into it wounds, until it withers.
  b.player = { ...stood }
  b.immunity = 0
  run(2)
  assert.equal(b.armor, MAX_ARMOR - 1)
  b.player = { x: stood.x + radius + 60, y: stood.y }
  run(Math.round(life * 60))
  assert.deepEqual(b.patches, [])
  b.player = { ...stood }
  b.immunity = 0
  run(4)
  assert.equal(b.armor, MAX_ARMOR - 1)
})

test('she calls in packs of briarlings, and from the second phase boars and archers in turn', () => {
  const call = phase => {
    const { b, lady, run } = only('summon', phase)
    lady.speed = 0
    const kinds = []
    for (let pack = 0; pack < 2; pack++) {
      b.foes = b.foes.filter(foe => foe.kind === 'duchess' || foe.kind === 'seal')
      b.summonIn = 0.03
      const events = run(3)
      assert.equal(events.filter(event => event.type === 'summon').length, 1)
      const camera = b.camera()
      const called = b.foes.filter(foe => foe.kind !== 'duchess' && foe.kind !== 'seal')
      // Everyone she calls steps in from beyond the view.
      for (const foe of called) {
        assert.ok(foe.x < camera.x + 5 || foe.x > camera.x + view.width - 5 || foe.y < camera.y + 5 || foe.y > camera.y + view.height - 5)
      }
      kinds.push(called.map(foe => foe.kind).sort().join())
    }
    return kinds
  }
  const pack = Array(duelRule.summon.pack).fill('briarling').join()
  assert.deepEqual(call(1), [pack, pack])
  assert.deepEqual(call(2), ['boar,' + pack, 'archer,archer,' + pack])
})

test('each third of her health lost begins a faster phase, once, even after one great blow', () => {
  const wound = blows => {
    const { b, seal, lady } = inDuel()
    b.armor = Infinity
    b.spells.witchfire.range = 4000
    b.spells.witchfire.cooldown = 0.1
    seal.health = 0.1
    b.step(1 / 60, 0, 0)
    const phases = []
    for (const damage of blows) {
      b.spells.witchfire.damage = damage
      b.timers.witchfire = 0
      phases.push(b.step(1 / 60, 0, 0).filter(event => event.type === 'phase').map(event => event.phase))
    }
    return { b, lady, phases }
  }
  const full = foes.duchess.health
  assert.deepEqual(duelRule.phases, [0.66, 0.33])
  const slow = wound([full * 0.2, full * 0.2, full * 0.2, full * 0.2, full * 0.1])
  assert.deepEqual(slow.phases, [[], [2], [], [3], []])
  assert.equal(slow.b.duelPhase, 3)
  assert.equal(slow.b.phase, 'playing')
  // One blow across both lines begins both phases at once and no more later.
  const leap = wound([full * 0.1, full * 0.7, full * 0.05])
  assert.deepEqual(leap.phases, [[], [2, 3], []])
  // A blow that fells her outright wins without any phase.
  const felled = wound([full * 0.2, full])
  assert.deepEqual(felled.phases, [[], []])
  assert.equal(felled.b.phase, 'won')
  assert.equal(felled.b.duelPhase, 1)
  assert.equal(new Battle().duelPhase, 1)

  // In a later phase the same attack comes round sooner.
  const beat = phase => {
    const { b, run } = only('lash', phase)
    b.lash.timer = 0.01
    run(Math.round(duelRule.lash.windup * 60) + 6)
    return b.lash.timer
  }
  assert.ok(Math.abs(beat(2) / beat(1) - duelRule.tempo) < 0.05)
  assert.ok(beat(3) < beat(2))
})

test('the run is won only when the open Duchess falls, and can be lost in the duel', () => {
  const { b, seal, lady } = inDuel()
  b.spells.witchfire.range = 4000
  seal.health = 0.1
  lady.health = 0.1
  b.step(1 / 60, 0, 0)
  assert.equal(b.phase, 'playing')
  assert.equal(lady.health, 0.1)
  b.timers.witchfire = 0
  const events = b.step(1 / 60, 0, 0)
  assert.deepEqual(events.map(event => event.type), ['shot', 'kill', 'felled'])
  assert.equal(b.phase, 'won')
  assert.equal(b.stage, 'duel')

  const fallen = only('lash')
  fallen.lady.speed = 0
  fallen.b.armor = 1
  fallen.b.player = { x: fallen.lady.x, y: fallen.lady.y + 200 }
  fallen.b.lash.timer = 0.05
  fallen.run(Math.round(duelRule.lash.windup * 60) + 12)
  assert.equal(fallen.b.phase, 'lost')
  assert.equal(fallen.b.stage, 'duel')
  assert.equal(fallen.b.armor, 0)
})

// --- Step 3.1: heroes, fire seeds and firefly spirits.

function hero(id, random = () => 0.5) {
  const b = new Battle(random, id)
  b.phase = 'playing'
  return b
}

test('each hero starts with their own spell and a new run forgets the last hero', () => {
  assert.deepEqual(heroIds, ['warden', 'duelist', 'ringer'])
  assert.equal(new Battle().hero, 'warden')
  for (const id of heroIds) {
    const b = hero(id)
    assert.equal(b.hero, id)
    assert.deepEqual(b.loadout, [heroes[id].spell])
    assert.deepEqual(b.spells, { [heroes[id].spell]: spells[heroes[id].spell] })
    assert.equal(b.sparks, 0)
    // The starting spell is never offered as a new one.
    levelUp(b)
    assert.ok(b.offer.every(card => card.kind !== 'learn' || card.spell !== heroes[id].spell))
  }
  assert.deepEqual(heroIds.map(id => heroes[id].spell), ['witchfire', 'moonblade', 'toll'])
})

test('the duelist moves faster than the others', () => {
  const walked = id => {
    const b = hero(id)
    const start = b.player.x
    advance(b, 60, 1, 0)
    return b.player.x - start
  }
  assert.ok(Math.abs(walked('warden') - heroes.warden.speed) < 1e-8)
  assert.ok(Math.abs(walked('duelist') - heroes.duelist.speed) < 1e-8)
  assert.ok(walked('duelist') > walked('warden'))
  assert.equal(walked('ringer'), walked('warden'))
})

test('the bellringer pushes foes farther with the same toll', () => {
  const pushed = id => {
    const b = hero(id)
    if (id !== 'ringer') learn(b, 'toll')
    for (const spell of b.loadout) if (spell !== 'toll') b.spells[spell].range = 0
    const foe = dummy(b, 40)
    b.step(0, 0, 0)
    return foe.x - b.player.x - 40
  }
  assert.equal(pushed('warden'), spells.toll.knockback)
  assert.equal(pushed('duelist'), spells.toll.knockback)
  assert.equal(pushed('ringer'), spells.toll.knockback * heroes.ringer.knockback)
  assert.ok(heroes.ringer.knockback > 1)
})

test('every third spark of the warden leaps to the nearest neighbour in reach', () => {
  const volley = (id, neighbour) => {
    const b = hero(id)
    if (id !== 'warden') {
      learn(b, 'witchfire')
      b.spells[heroes[id].spell].range = 0
    }
    const target = dummy(b, 50)
    const near = dummy(b, 50 + neighbour)
    const far = dummy(b, 50, heroes.warden.chainRange + 30)
    const events = []
    for (let spark = 0; spark < 6; spark++) {
      b.timers.witchfire = 0
      events.push(b.step(0, 0, 0).map(event => event.type).filter(type => type === 'shot' || type === 'chain'))
    }
    return { events, hits: [target, near, far].map(hurt), b, target, near }
  }
  const { events, hits, b, target, near } = volley('warden', 60)
  assert.deepEqual(events, [['shot'], ['shot'], ['shot', 'chain'], ['shot'], ['shot'], ['shot', 'chain']])
  assert.deepEqual(hits, [6 * witchfire.damage, 2 * witchfire.damage, 0])
  b.timers.witchfire = 0
  b.sparks = 2
  const leap = b.step(0, 0, 0).find(event => event.type === 'chain')
  assert.deepEqual(leap, { type: 'chain', from: { x: target.x, y: target.y }, to: { x: near.x, y: near.y } })

  // Nobody close enough: the spark just lands.
  assert.deepEqual(volley('warden', heroes.warden.chainRange + 10).hits, [6 * witchfire.damage, 0, 0])
  // The gift belongs to the warden, not to the spell.
  for (const other of ['duelist', 'ringer']) {
    const plain = volley(other, 60)
    assert.ok(plain.events.every(types => types.join() === 'shot'))
    assert.deepEqual(plain.hits, [6 * witchfire.damage, 0, 0])
  }
})

test('fire seeds fall behind a moving hero and burst under the first foe to reach one', () => {
  const b = hero('warden')
  b.spells.witchfire.range = 0
  learn(b, 'seeds')
  const { cooldown, damage, range } = spells.seeds

  // Standing still sows nothing. Briarlings of the first wave are waved away.
  for (let i = 0; i < 90; i++) {
    b.step(1 / 60, 0, 0)
    b.foes = []
  }
  assert.deepEqual(b.seeds, [])
  const sown = []
  const start = { ...b.player }
  for (let i = 0; i < 120; i++) {
    sown.push(...b.step(1 / 60, 1, 0).filter(event => event.type === 'sow'))
    b.foes = []
  }
  assert.ok(Math.abs(sown.length - 2 / cooldown) <= 1)
  assert.equal(b.seeds.length, sown.length)
  // The first seed lies where the hero set off; the others trail along the path.
  assert.ok(Math.abs(b.seeds[0].x - start.x) < 4)
  assert.equal(b.seeds[0].y, start.y)
  assert.ok(b.seeds.at(-1).x > b.seeds[0].x + 100)

  // A foe well away from every seed sets nothing off.
  const seed = b.seeds[0]
  const count = b.seeds.length
  const bystander = dummy(b, 0, 200)
  advance(b, 2)
  assert.equal(b.seeds.length, count)
  assert.equal(hurt(bystander), 0)

  // One foe touches the seed; everything inside the blast burns, the rest does not.
  const walker = makeFoe('briarling', seed.x - seedRule.trigger + 4, seed.y, 0, 1e9)
  const inside = makeFoe('briarling', seed.x, seed.y - range + 6, 0, 1e9)
  const outside = makeFoe('briarling', seed.x - range - 12, seed.y, 0, 1e9)
  b.foes.push(walker, inside, outside)
  const events = b.step(1 / 60, 0, 0)
  assert.deepEqual(events, [{ type: 'burst', at: { x: seed.x, y: seed.y }, radius: range }])
  assert.deepEqual([walker, inside, outside].map(hurt), [damage, damage, 0])
  assert.equal(b.seeds.length, count - 1)
  assert.ok(!b.seeds.includes(seed))

  // A seed nobody reaches withers after a while.
  for (let i = 0; i < Math.round(seedRule.life * 60); i++) {
    b.step(1 / 60, 0, 0)
    b.foes = []
  }
  assert.deepEqual(b.seeds, [])
})

test('a seed burst can fell a foe and leave its ember', () => {
  const b = hero('warden')
  b.spells.witchfire.range = 0
  learn(b, 'seeds')
  b.seeds = [{ x: b.player.x + 300, y: b.player.y, life: 5 }]
  b.foes = [makeFoe('boar', b.player.x + 300, b.player.y, 0, 1)]
  const types = b.step(1 / 60, 0, 0).map(event => event.type)
  assert.deepEqual(types, ['burst', 'kill'])
  assert.deepEqual(b.embers, [{ x: b.player.x + 300, y: b.player.y, value: foes.boar.ember }])
})

test('firefly spirits circle the hero and sting a foe they cross, then leave it be for a while', () => {
  const b = hero('warden')
  b.spells.witchfire.range = 0
  learn(b, 'fireflies')
  const { cooldown, damage, range, spin } = spells.fireflies
  const onRing = dummy(b, range)
  const inside = dummy(b, range - fireflyRule.hit - 20)
  const outside = dummy(b, range + fireflyRule.hit + 20)
  const stings = []
  // The first spirit starts on the ring where the foe stands.
  stings.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'sting'))
  assert.deepEqual(stings, [{ type: 'sting', at: { x: onRing.x, y: onRing.y } }])
  assert.equal(hurt(onRing), damage)
  // Still overlapping on the next frames, but the same foe is not stung twice.
  advance(b, 3)
  assert.equal(hurt(onRing), damage)

  // Over whole turns each spirit crosses the foe once per turn.
  const turns = 3
  const frames = Math.round((turns * 360) / spin * 60)
  for (let i = 0; i < frames; i++) b.step(1 / 60, 0, 0)
  const crossings = turns * fireflyRule.count
  assert.ok(Math.abs(hurt(onRing) / damage - 1 - crossings) <= 1, String(hurt(onRing) / damage))
  assert.ok((360 / spin / fireflyRule.count) > cooldown)
  assert.deepEqual([inside, outside].map(hurt), [0, 0])
  assert.ok(Math.abs(b.flyTurn - ((frames + 4) / 60) * (spin * Math.PI) / 180) < 1e-6)
})

test('the ring follows the hero and a faster ring stings more often', () => {
  const stung = upgrade => {
    const b = hero('warden')
    b.spells.witchfire.range = 0
    learn(b, 'fireflies')
    if (upgrade) b.spells.fireflies = upgraded(b.spells.fireflies, upgrade)
    b.armor = Infinity
    const foe = makeFoe('briarling', b.player.x + 200 + b.spells.fireflies.range, b.player.y, 0, 1e9)
    b.foes = [foe]
    // Walk so that the foe ends up on the ring, then wait. Well short of it nothing stings.
    advance(b, 45, 1, 0)
    assert.equal(hurt(foe), 0)
    advance(b, 30, 1, 0)
    for (let i = 0; i < 360; i++) {
      b.step(1 / 60, 0, 0)
      b.foes = [foe]
    }
    return hurt(foe)
  }
  const base = stung(null)
  assert.ok(base > 0)
  assert.ok(stung('fliesSpin') > base)
  assert.ok(stung('fliesDamage') > base)
})

test('seeds and fireflies cannot hurt the shielded Duchess, and seeds already sown stay for the duel', () => {
  const b = hero('duelist')
  learn(b, 'seeds')
  b.seeds = [{ x: 100, y: 100, life: 9 }]
  dawn(b)
  b.step(1 / 60, 0, 0)
  assert.equal(b.stage, 'duel')
  assert.equal(b.seeds.length, 1)
  assert.deepEqual(b.loadout, ['moonblade', 'seeds'])
  assert.equal(b.hero, 'duelist')

  learn(b, 'fireflies')
  b.spells.moonblade.range = 0
  const lady = b.duchess
  const seal = b.foes.find(foe => foe.kind === 'seal')
  seal.health = seal.full = 1e9
  b.armor = Infinity
  const stood = { x: lady.x, y: lady.y }
  for (let i = 0; i < 240; i++) {
    // Hold her and the hero in place so the ring keeps crossing her.
    Object.assign(lady, stood)
    b.player = { x: stood.x - spells.fireflies.range, y: stood.y }
    b.seeds = [{ x: stood.x, y: stood.y, life: 9 }]
    b.step(1 / 60, 0, 0)
    b.foes = [lady, seal]
    b.arrows = []
    b.patches = []
  }
  assert.equal(lady.health, foes.duchess.health)
  assert.equal(b.seeds.length, 1)
})

// --- Step 3.2: the marked briarling, reliquaries and relics.

// A quiet run with a reliquary lying at the hero's feet.
function atChest(random = () => 0.5, held = {}) {
  const b = playing(random)
  b.spells.witchfire.range = 0
  Object.assign(b.relics, held)
  b.reliquaries = [{ ...b.player }]
  const events = b.step(1 / 60, 0, 0)
  return { b, events }
}

test('a marked briarling walks in on schedule, is tougher, and drops one reliquary when it falls', () => {
  const wave = waves.find(entry => entry.kind === 'marked')
  assert.ok(wave && wave.every && wave.from > 0)
  assert.ok(foes.marked.health > 5 * foes.briarling.health)
  const b = runAt(wave.from)
  advance(b, 6)
  const marked = b.foes.filter(foe => foe.kind === 'marked')
  assert.equal(marked.length, 1)
  assert.ok(marked[0].health >= foes.marked.health)

  const fight = playing(() => 0.5)
  const elite = makeFoe('marked', fight.player.x + 100, fight.player.y, 0, 0.1)
  const plain = makeFoe('briarling', fight.player.x + 120, fight.player.y, 0, 0.1)
  fight.foes = [elite, plain]
  const first = fight.step(0, 0, 0)
  assert.deepEqual(first.map(event => event.type), ['shot', 'kill', 'chest'])
  assert.deepEqual(first[2], { type: 'chest', at: { x: elite.x, y: elite.y } })
  assert.deepEqual(fight.reliquaries, [{ x: elite.x, y: elite.y }])
  assert.equal(fight.embers[0].value, foes.marked.ember)
  fight.timers.witchfire = 0
  assert.deepEqual(fight.step(0, 0, 0).map(event => event.type), ['shot', 'kill'])
  assert.equal(fight.reliquaries.length, 1)
})

test('a reliquary waits to be reached, opens once and offers distinct new relics', () => {
  const b = playing(() => 0.5)
  b.spells.witchfire.range = 0
  const chest = { x: b.player.x + PICKUP_RADIUS + 70, y: b.player.y }
  b.reliquaries = [chest]
  advance(b, 20)
  assert.deepEqual(b.reliquaries, [chest])
  assert.equal(b.phase, 'playing')
  const events = []
  for (let i = 0; i < 40 && b.phase === 'playing'; i++) events.push(...b.step(1 / 60, 1, 0))
  assert.deepEqual(events, [{ type: 'open', at: chest }])
  assert.equal(b.phase, 'choosing')
  assert.ok(b.openingChest)
  assert.deepEqual(b.reliquaries, [])
  assert.equal(b.chests, 1)
  assert.equal(b.offer.length, relicRule.cards)
  assert.equal(new Set(b.offer.map(card => card.relic)).size, relicRule.cards)
  for (const card of b.offer) {
    assert.equal(card.kind, 'relic')
    assert.ok(relicIds.includes(card.relic))
    assert.equal(card.level, 1)
  }

  // Frozen until a relic is taken; one choice takes exactly one.
  const before = JSON.stringify(b)
  advance(b, 60, 1, 1)
  assert.equal(JSON.stringify(b), before)
  const taken = b.offer[1].relic
  b.choose(1)
  b.choose(1)
  assert.equal(b.phase, 'playing')
  assert.deepEqual(b.relics, { [taken]: 1 })
  assert.equal(b.chests, 0)
  assert.ok(!b.openingChest)
  assert.deepEqual(b.offer, [])
  // The run goes on without another reliquary appearing from nowhere.
  advance(b, 30)
  assert.equal(b.phase, 'playing')
})

test('taking a relic again raises its level up to the maximum', () => {
  let level = 0
  while (level < relicRule.maxLevel) {
    const { b } = atChest(() => 0, level ? { boots: level } : {})
    const card = b.offer.find(entry => entry.relic === 'boots')
    assert.deepEqual(card, { kind: 'relic', relic: 'boots', level: level + 1 })
    b.choose(b.offer.indexOf(card))
    level = b.rank('boots')
  }
  assert.equal(level, relicRule.maxLevel)
  const { b } = atChest(() => 0, { boots: relicRule.maxLevel })
  assert.ok(b.offer.length > 0)
  assert.ok(b.offer.every(card => card.relic !== 'boots'))
})

test('with every relic slot taken only held relics that can still grow are offered', () => {
  for (const roll of [0, 0.5, 0.99]) {
    const { b } = atChest(() => roll, { boots: 1, cloak: relicRule.maxLevel, ring: 2 })
    assert.equal(Object.keys(b.relics).length, relicRule.slots)
    assert.deepEqual(b.offer.map(card => card.relic).sort(), ['boots', 'ring'])
    assert.deepEqual(b.offer.find(card => card.relic === 'ring'), { kind: 'relic', relic: 'ring', level: 3 })
    b.choose(0)
    assert.equal(Object.keys(b.relics).length, relicRule.slots)
    assert.equal(b.phase, 'playing')
  }
})

test('a reliquary with nothing left to give mends a pip instead of stopping the run', () => {
  const full = { boots: relicRule.maxLevel, cloak: relicRule.maxLevel, ring: relicRule.maxLevel }
  const b = playing(() => 0.5)
  b.spells.witchfire.range = 0
  Object.assign(b.relics, full)
  b.armor = 2
  b.reliquaries = [{ ...b.player }, { ...b.player }]
  const events = b.step(1 / 60, 0, 0)
  assert.deepEqual(events.map(event => event.type), ['open', 'open'])
  assert.equal(b.phase, 'playing')
  assert.equal(b.armor, 4)
  assert.equal(b.chests, 0)
  assert.deepEqual(b.relics, full)
  // Never past the maximum.
  b.armor = b.maxArmor
  b.reliquaries = [{ ...b.player }]
  b.step(1 / 60, 0, 0)
  assert.equal(b.armor, b.maxArmor)
})

test('a reliquary and a level-up in the same step give two sets of cards, the relics first', () => {
  const b = playing(() => 0.5)
  b.spells.witchfire.range = 0
  b.reliquaries = [{ ...b.player }]
  b.embers = [{ ...b.player, value: xpGoal(1) }]
  b.step(1 / 60, 0, 0)
  assert.equal(b.phase, 'choosing')
  assert.ok(b.openingChest)
  assert.ok(b.offer.every(card => card.kind === 'relic'))
  b.choose(0)
  assert.equal(b.phase, 'choosing')
  assert.ok(!b.openingChest)
  assert.equal(b.choiceLevel, 2)
  assert.ok(b.offer.every(card => card.kind !== 'relic'))
  b.choose(0)
  assert.equal(b.phase, 'playing')
  assert.equal(Object.keys(b.relics).length, 1)
})

test('courier shoes quicken the hero and amber beads widen the reach', () => {
  const walked = level => {
    const b = playing()
    if (level) b.relics.boots = level
    const start = b.player.x
    advance(b, 60, 1, 0)
    return b.player.x - start
  }
  assert.ok(Math.abs(walked(0) - heroes.warden.speed) < 1e-8)
  assert.ok(Math.abs(walked(1) - heroes.warden.speed * (1 + relics.boots.amount)) < 1e-8)
  assert.ok(Math.abs(walked(3) - heroes.warden.speed * (1 + 3 * relics.boots.amount)) < 1e-8)

  const gathered = level => {
    const b = playing()
    b.spells.witchfire.range = 0
    if (level) b.relics.beads = level
    b.embers = [{ x: b.player.x + PICKUP_RADIUS + 30, y: b.player.y, value: 1 }]
    b.reliquaries = [{ x: b.player.x, y: b.player.y + PICKUP_RADIUS + 30 }]
    b.step(1 / 60, 0, 0)
    return [b.xp, b.chests]
  }
  assert.ok(relics.beads.amount > 30)
  assert.deepEqual(gathered(0), [0, 0])
  assert.deepEqual(gathered(1), [1, 1])
})

test('the pilgrim cloak adds a whole pip that oil can refill', () => {
  const { b } = atChest(() => 0, { cloak: 1 })
  assert.equal(b.maxArmor, MAX_ARMOR + 1)
  b.armor = 3
  const card = b.offer.find(entry => entry.relic === 'cloak')
  b.choose(b.offer.indexOf(card))
  assert.equal(b.maxArmor, MAX_ARMOR + 2)
  assert.equal(b.armor, 4)
  b.oils = Array.from({ length: 6 }, () => ({ ...b.player }))
  b.step(1 / 60, 0, 0)
  assert.equal(b.armor, MAX_ARMOR + 2)
  assert.equal(b.oils.length, 3)
  assert.equal(new Battle().maxArmor, MAX_ARMOR)
})

test('the hourglass shortens every cooldown and the gardener ring lengthens every reach', () => {
  const b = playing()
  for (const spell of ['moonblade', 'toll', 'seeds', 'fireflies']) learn(b, spell)
  for (const id of b.loadout) assert.deepEqual(b.stats(id), spells[id])
  b.relics.hourglass = 2
  b.relics.ring = 3
  for (const id of b.loadout) {
    const tuned = b.stats(id)
    assert.ok(Math.abs(tuned.cooldown - spells[id].cooldown * (1 - 2 * relics.hourglass.amount)) < 1e-9)
    assert.ok(Math.abs(tuned.range - spells[id].range * (1 + 3 * relics.ring.amount)) < 1e-9)
    assert.equal(tuned.damage, spells[id].damage)
    // The spell itself is untouched, so cards keep showing its own numbers.
    assert.deepEqual(b.spells[id], spells[id])
  }

  const fight = held => {
    const battle = playing()
    Object.assign(battle.relics, held)
    const foe = dummy(battle, witchfire.range + 10)
    let shots = 0
    for (let i = 0; i < 120; i++) {
      shots += battle.step(1 / 60, 0, 0).filter(event => event.type === 'shot').length
      battle.foes = [foe]
    }
    return shots
  }
  assert.equal(fight({}), 0)
  const reach = fight({ ring: 1 })
  assert.ok(reach > 0)
  assert.ok(fight({ ring: 1, hourglass: 2 }) > reach)
})

test('relics and an unopened reliquary are still there when the Duchess comes; a new run has none', () => {
  const b = playing()
  b.relics = { boots: 2, cloak: 1 }
  b.armor = 6
  b.reliquaries = [{ x: 50, y: 50 }]
  dawn(b)
  b.step(1 / 60, 0, 0)
  assert.equal(b.stage, 'duel')
  assert.deepEqual(b.relics, { boots: 2, cloak: 1 })
  assert.equal(b.armor, 6)
  assert.deepEqual(b.reliquaries, [{ x: 50, y: 50 }])
  const fresh = new Battle()
  assert.deepEqual(fresh.relics, {})
  assert.deepEqual(fresh.reliquaries, [])
  assert.equal(fresh.chests, 0)
})

// --- Step 3.3: stone knights, healer moths and the nine-minute schedule.

test('a stone knight is slow, very tough and worth a rich ember', () => {
  assert.ok(foes.knight.health > 2 * foes.marked.health)
  assert.ok(foes.knight.speed < foes.briarling.speed)
  assert.ok(foes.knight.ember > foes.boar.ember)
  const { b, foe, step } = duel('knight', 300)
  step(60)
  assert.ok(Math.abs(300 - (foe.x - b.player.x) - foes.knight.speed) < 1e-6)
  assert.equal(foe.full, 1e9)
})

// A quiet court with one healer moth and the given wounded foes around it.
function ward(patients) {
  const b = runAt(1)
  const moth = makeFoe('moth', b.player.x + mothHeal.keep - 20, b.player.y, 0, 12)
  const others = patients.map(([kind, dx, lost, full = 100]) => {
    const foe = makeFoe(kind, moth.x + dx, moth.y, 0, full)
    foe.health = full - lost
    return foe
  })
  b.foes = [moth, ...others]
  const beat = () => {
    const events = []
    for (let i = 0; i < Math.round(mothHeal.beat * 60); i++) {
      b.elapsed = 1
      events.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'mend'))
      b.foes = b.foes.filter(foe => foe === moth || others.includes(foe))
    }
    return events
  }
  return { b, moth, others, beat }
}

test('a healer moth mends the most wounded foe within its reach, one beat at a time', () => {
  const { b, moth, others, beat } = ward([
    ['knight', 100, 10], ['knight', -120, 40], ['boar', mothHeal.range + 40, 90], ['briarling', 60, 0, 5],
  ])
  const [scratched, hurt, far, whole] = others
  const first = beat()
  assert.deepEqual(first, [{ type: 'mend', from: { x: moth.x, y: moth.y }, to: { x: hurt.x, y: hurt.y } }])
  assert.equal(hurt.health, 60 + mothHeal.amount)
  assert.deepEqual([scratched.health, far.health, whole.health], [90, 10, 5])

  // It keeps to whoever is worst off, and never mends beyond the health a foe came in with.
  for (let i = 0; i < 12; i++) beat()
  assert.equal(hurt.health, 100)
  assert.equal(scratched.health, 100)
  assert.equal(far.health, 10)
  assert.deepEqual(beat(), [])
  assert.equal(b.armor, Infinity)
})

test('a moth does not mend itself or other moths, and the mending stops when it falls', () => {
  const { b, moth, others, beat } = ward([['moth', 80, 6, 12], ['knight', 90, 50]])
  const [sister, knight] = others
  sister.timer = 1e9
  moth.health = 4
  beat()
  assert.equal(sister.health, 6)
  assert.equal(moth.health, 4)
  assert.equal(knight.health, 50 + mothHeal.amount)

  // The warden's fire reaches the moth; once it is gone the knight stays wounded.
  b.spells.witchfire.range = 2000
  moth.health = 0.1
  knight.health = 50
  b.player = { x: moth.x - 30, y: moth.y }
  b.elapsed = 1
  b.step(1 / 60, 0, 0)
  assert.ok(!b.foes.includes(moth))
  b.spells.witchfire.range = 0
  b.foes = [knight]
  knight.health = 50
  for (let i = 0; i < 240; i++) {
    b.elapsed = 1
    assert.deepEqual(b.step(1 / 60, 0, 0).filter(event => event.type === 'mend'), [])
    b.foes = [knight]
  }
  assert.equal(knight.health, 50)
})

test('a moth hangs back at its distance instead of charging in', () => {
  const far = duel('moth', mothHeal.keep + 150)
  far.step(240)
  assert.ok(Math.abs(far.foe.x - far.b.player.x - mothHeal.keep) < 4)
  const near = duel('moth', 40)
  near.step(240)
  const gap = near.foe.x - near.b.player.x
  assert.ok(gap >= mothHeal.keep - 62 && gap <= mothHeal.keep)
  assert.equal(near.b.armor, MAX_ARMOR)
})

// --- Blessings.

test('a blessing is never offered twice for the same spell, and waits behind a reliquary', () => {
  const b = playing(() => 0.5)
  b.spells.witchfire.range = 0
  b.blessed.witchfire = true
  b.boons = 1
  b.step(1 / 60, 0, 0)
  // Nothing left to bless: the boon lapses without stopping the run.
  assert.equal(b.phase, 'playing')
  assert.equal(b.boons, 0)

  learn(b, 'seeds')
  b.boons = 1
  b.reliquaries = [{ ...b.player }]
  b.step(1 / 60, 0, 0)
  assert.ok(b.openingChest && !b.blessing)
  b.choose(0)
  assert.ok(b.blessing)
  assert.deepEqual(b.offer, [{ kind: 'bless', spell: 'seeds' }])
  b.choose(0)
  assert.equal(b.phase, 'playing')
})

test('blessed witchfire blooms on the target and scorches the foes beside it', () => {
  const fire = blessed => {
    const b = hero('duelist')
    learn(b, 'witchfire')
    b.spells.moonblade.range = 0
    if (blessed) b.blessed.witchfire = true
    const target = dummy(b, 50)
    const beside = dummy(b, 50 + blessings.witchfire.radius - 10)
    const apart = dummy(b, 50, blessings.witchfire.radius + 10)
    const events = b.step(0, 0, 0).filter(event => event.type === 'bloom')
    return { hits: [target, beside, apart].map(hurt), events, target }
  }
  assert.deepEqual(fire(false).hits, [witchfire.damage, 0, 0])
  assert.deepEqual(fire(false).events, [])
  const { hits, events, target } = fire(true)
  assert.deepEqual(hits, [witchfire.damage, witchfire.damage * blessings.witchfire.share, 0])
  assert.deepEqual(events, [{ type: 'bloom', at: { x: target.x, y: target.y }, radius: blessings.witchfire.radius }])
})

test('a blessed moon blade leaves a trail that keeps cutting where the swing was', () => {
  const swing = blessed => {
    const b = hero('duelist')
    if (blessed) b.blessed.moonblade = true
    b.armor = Infinity
    const ahead = dummy(b, spells.moonblade.range - 20)
    const behind = dummy(b, -40)
    b.step(0, 0, 0)
    // Stop the blade from swinging again, then walk away from the place of the swing.
    b.timers.moonblade = 99
    for (let i = 0; i < 90; i++) {
      b.timers.moonblade = 99
      b.step(1 / 60, 0, -1)
      b.foes = [ahead, behind]
    }
    return { hits: [ahead, behind].map(hurt), b }
  }
  const { damage } = spells.moonblade
  assert.deepEqual(swing(false).hits, [damage, 0])
  const { hits, b } = swing(true)
  const { life, beat, share } = blessings.moonblade
  const cuts = Math.round(life / beat)
  assert.ok(Math.abs(hits[0] - damage * (1 + cuts * share)) < 1e-9, String(hits[0]))
  assert.equal(hits[1], 0)
  assert.deepEqual(b.trails, [])
})

test('a blessed toll sends a second, weaker stroke from where the hero stands then', () => {
  const ring = blessed => {
    const b = hero('ringer')
    if (blessed) b.blessed.toll = true
    b.armor = Infinity
    const foe = dummy(b, 30)
    const tolls = []
    for (let i = 0; i < Math.round(blessings.toll.delay * 60) + 4; i++) {
      tolls.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'toll'))
      b.timers.toll = 99
      b.foes = [foe]
      // Keep the foe in reach of the echo despite the push.
      foe.x = b.player.x + 30
    }
    return { tolls: tolls.length, hurt: hurt(foe), b }
  }
  const { damage } = spells.toll
  assert.deepEqual([ring(false).tolls, ring(false).hurt], [1, damage])
  const echo = ring(true)
  assert.equal(echo.tolls, 2)
  assert.ok(Math.abs(echo.hurt - damage * (1 + blessings.toll.share)) < 1e-9)
  assert.deepEqual(echo.b.echoes, [])
})

test('a blessed seed burst wakes the seeds near it, and those wake theirs', () => {
  const sow = blessed => {
    const b = hero('warden')
    b.spells.witchfire.range = 0
    learn(b, 'seeds')
    if (blessed) b.blessed.seeds = true
    const gap = blessings.seeds.radius - 20
    const x = b.player.x + 300
    b.seeds = [0, 1, 2].map(i => ({ x: x + i * gap, y: b.player.y, life: 9 }))
    b.seeds.push({ x: x + 2 * gap + blessings.seeds.radius + 40, y: b.player.y, life: 9 })
    const first = makeFoe('briarling', x, b.player.y, 0, 1e9)
    const third = makeFoe('briarling', x + 2 * gap, b.player.y + 20, 0, 1e9)
    // Standing near the third seed but not close enough to set it off itself.
    third.y = b.player.y + spells.seeds.range - 10
    b.foes = [first, third]
    const bursts = b.step(1 / 60, 0, 0).filter(event => event.type === 'burst')
    return { bursts: bursts.length, left: b.seeds.length, hits: [first, third].map(hurt) }
  }
  assert.ok(spells.seeds.range - 10 > seedRule.trigger)
  assert.deepEqual(sow(false), { bursts: 1, left: 3, hits: [spells.seeds.damage, 0] })
  assert.deepEqual(sow(true), { bursts: 3, left: 1, hits: [spells.seeds.damage, spells.seeds.damage] })
})

test('blessed fireflies light a second swarm across the ring', () => {
  const b = hero('warden')
  b.spells.witchfire.range = 0
  learn(b, 'fireflies')
  assert.equal(b.swarmSize, fireflyRule.count)
  b.blessed.fireflies = true
  assert.equal(b.swarmSize, fireflyRule.count * blessings.fireflies.swarms)
  // Twice as many spirits, evenly spaced: a foe under the first and one under
  // the next are both stung at once, and a foe halfway between them is not.
  const { range, damage } = spells.fireflies
  const gap = (2 * Math.PI) / b.swarmSize
  const at = turn => dummy(b, Math.cos(turn) * range, Math.sin(turn) * range)
  const first = at(0), next = at(gap), between = at(gap / 2)
  assert.ok(2 * range * Math.sin(gap / 4) > fireflyRule.hit)
  b.step(0, 0, 0)
  assert.deepEqual([first, next, between].map(hurt), [damage, damage, 0])
})

// --- Step 3.5: reaching the Duchess and her flower with every spell.

test('every spell can reach the seal-flower and the open Duchess without touching them', () => {
  for (const spell of ['witchfire', 'moonblade', 'toll', 'seeds', 'fireflies']) {
    for (const target of ['seal', 'duchess']) {
      const { b, seal, lady, run } = only('nothing')
      const first = b.loadout[0]
      if (spell !== first) learn(b, spell)
      else b.spells[first] = { ...spells[first] }
      b.armor = MAX_ARMOR
      lady.speed = 0
      if (target === 'duchess') {
        b.foes = [lady]
        b.crownOpen = 1e9
        lady.health = lady.full = 1e9
      }
      const foe = target === 'seal' ? seal : lady
      // Stand a safe step outside the target's reach, facing it.
      const stand = spell === 'fireflies' ? spells.fireflies.range : foes[target].reach + 14
      b.player = { x: foe.x, y: foe.y + stand }
      b.facing = -Math.PI / 2
      const start = foe.health
      // Seeds need a hero on the move: pace sideways beside the target.
      for (let i = 0; i < 180; i++) {
        run(1, spell === 'seeds' ? (Math.floor(i / 20) % 2 ? -1 : 1) : 0, 0)
        if (spell === 'moonblade') b.facing = -Math.PI / 2
        if (target === 'duchess') b.foes = [lady]
      }
      assert.ok(foe.health < start, spell + ' cannot hurt the ' + target)
      assert.equal(b.armor, MAX_ARMOR, spell + ' had to touch the ' + target)
    }
  }
})

test('a seed sets off under a rooted target from anywhere in its blast, but still needs a walker to step on it', () => {
  const { b, seal } = inDuel()
  b.spells.witchfire.range = 0
  learn(b, 'seeds')
  seal.health = seal.full = 1e9
  const { range, damage } = spells.seeds
  assert.ok(range > seedRule.trigger)
  b.seeds = [
    { x: seal.x + range - 6, y: seal.y, life: 9 },
    { x: seal.x + range + 30, y: seal.y, life: 9 },
  ]
  const walker = makeFoe('briarling', seal.x + range + 30 + seedRule.trigger + 10, seal.y, 0, 1e9)
  b.foes.push(walker)
  const bursts = b.step(1 / 60, 0, 0).filter(event => event.type === 'burst')
  assert.equal(bursts.length, 1)
  assert.equal(seal.full - seal.health, damage)
  assert.equal(b.seeds.length, 1)
  assert.equal(hurt(walker), 0)
})

test('blessings and relics earned before dawn still work in the duel', () => {
  const b = playing()
  b.blessed.witchfire = true
  b.relics.ring = 2
  dawn(b)
  b.step(1 / 60, 0, 0)
  assert.deepEqual(b.blessed, { witchfire: true })
  assert.deepEqual(b.relics, { ring: 2 })
  // A spark at the seal-flower blooms onto a briarling standing beside it.
  const seal = b.foes.find(foe => foe.kind === 'seal')
  seal.health = seal.full = 1e9
  const beside = makeFoe('briarling', seal.x + 30, seal.y, 0, 1e9)
  b.foes.push(beside)
  b.player = { x: seal.x - 60, y: seal.y }
  b.timers.witchfire = 0
  b.immunity = 9
  const events = b.step(1 / 60, 0, 0)
  assert.ok(events.some(event => event.type === 'bloom'))
  assert.equal(hurt(beside), witchfire.damage * blessings.witchfire.share)
})

// --- Step 3.6: difficulties and starting relics.

test('a harder difficulty makes every foe tougher', () => {
  assert.deepEqual(difficulties.map(level => level.toughness > 0), [true, true, true])
  assert.ok(difficulties[1].toughness > difficulties[0].toughness)
  assert.ok(difficulties[2].toughness > difficulties[1].toughness)
  for (const [index, { toughness }] of difficulties.entries()) {
    const b = new Battle(() => 0.5, 'warden', index + 1)
    b.phase = 'playing'
    assert.equal(b.difficulty, index + 1)
    b.elapsed = 40
    b.step(0, 0, 0)
    const first = b.foes.find(foe => foe.kind === 'briarling')
    assert.ok(Math.abs(first.health - (briarling.health + 40 * briarling.healthGrowth) * toughness) < 1e-9)
    dawn(b)
    b.step(1 / 60, 0, 0)
    assert.ok(Math.abs(b.duchess.health - foes.duchess.health * toughness) < 1e-9)
    assert.ok(Math.abs(b.foes.find(foe => foe.kind === 'seal').full - foes.seal.health * toughness) < 1e-9)
  }
  assert.equal(new Battle().difficulty, 1)
})

test('from the second difficulty every third group is matched from the opposite side', () => {
  const groups = level => {
    const b = new Battle(seeded(3), 'warden', level)
    b.phase = 'playing'
    b.spells.witchfire.range = 0
    b.armor = Infinity
    const sides = []
    // Count briarlings of the first wave, burst by burst, and note where each stands.
    const every = waves[0].every
    for (let burst = 1; burst <= 6; burst++) {
      b.foes = []
      while (b.foes.length === 0) b.step(1 / 60, 0, 0)
      const camera = b.camera()
      sides.push(b.foes.map(foe =>
        foe.x < camera.x ? 'left' : foe.x > camera.x + view.width ? 'right' : foe.y < camera.y ? 'top' : 'bottom',
      ))
      assert.ok(b.elapsed < burst * every + 0.1)
    }
    return sides
  }
  assert.equal(difficulties[0].flankEvery, 0)
  assert.equal(difficulties[1].flankEvery, 3)
  assert.deepEqual(groups(1).map(sides => sides.length), [1, 1, 1, 1, 1, 1])
  const flanked = groups(2)
  assert.deepEqual(flanked.map(sides => sides.length), [1, 1, 2, 1, 1, 2])
  const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }
  for (const sides of flanked.filter(entry => entry.length === 2)) assert.equal(sides[1], opposite[sides[0]])
})

test('on the third difficulty every wave starts earlier and overlaps the one before', () => {
  const { early } = difficulties[2]
  assert.ok(early > 0)
  assert.equal(difficulties[1].early, 0)
  const boars = waves.find(wave => wave.kind === 'boar').from
  const seen = level => {
    const b = new Battle(seeded(), 'warden', level)
    b.phase = 'playing'
    b.spells.witchfire.range = 0
    b.armor = Infinity
    b.elapsed = boars - early - 1
    b.step(0, 0, 0)
    b.foes = []
    advance(b, 120)
    return b.foes.some(foe => foe.kind === 'boar')
  }
  assert.deepEqual([seen(1), seen(2), seen(3)], [false, false, true])
})

test('a hero who has won before may start with their own relic', () => {
  for (const id of heroIds) {
    const plain = new Battle(() => 0.5, id)
    assert.deepEqual(plain.relics, {})
    assert.equal(plain.armor, MAX_ARMOR)
    const geared = new Battle(() => 0.5, id, 1, true)
    assert.deepEqual(geared.relics, { [heroes[id].variant]: 1 })
    assert.ok(relicIds.includes(heroes[id].variant))
    assert.equal(geared.armor, geared.maxArmor)
  }
  // The bellringer's cloak arrives as a whole sixth pip.
  assert.equal(new Battle(() => 0.5, 'ringer', 1, true).armor, MAX_ARMOR + 1)
  assert.equal(new Set(heroIds.map(id => heroes[id].variant)).size, heroIds.length)
})

// --- Found by simulation: one cast striking the same foe twice.

test('a foe felled by the bloom of a spark is not struck again when the spark leaps to it', () => {
  const b = hero('warden')
  b.blessed.witchfire = true
  // The third spark both blooms and leaps: the frail neighbour is named twice.
  b.sparks = heroes.warden.chain - 1
  const target = dummy(b, 50)
  const frail = makeFoe('briarling', b.player.x + 50 + 30, b.player.y, 0, 0.1)
  b.foes.push(frail)
  // A bystander far away, last in the list, must not vanish in the frail foe's place.
  const bystander = dummy(b, 0, 900)
  const events = b.step(0, 0, 0)
  assert.deepEqual(events.map(event => event.type), ['shot', 'bloom', 'kill', 'chain'])
  assert.ok(b.foes.includes(target) && b.foes.includes(bystander))
  assert.ok(!b.foes.includes(frail))
  assert.equal(b.kills, 1)
  assert.equal(b.embers.length, 1)
  assert.equal(hurt(bystander), 0)
})

// --- Step 5.1: a boss every three minutes.

// A quiet, unkillable hero a moment before the given boss is due.
function before(index, random = seeded()) {
  const b = new Battle(random)
  b.phase = 'playing'
  b.spells.witchfire.range = 0
  b.armor = Infinity
  b.bossIndex = index
  b.calm = bossRule.every - 0.05
  return b
}

test('the bosses come in a fixed order, three minutes apart, the Duchess last', () => {
  assert.deepEqual(bossIds, ['mass', 'sentinel', 'retinue', 'guard', 'duchess'])
  assert.equal(bossRule.every, 180)
  const b = new Battle(seeded())
  b.phase = 'playing'
  b.spells.witchfire.range = 0
  b.armor = Infinity
  assert.deepEqual(b.nextBoss, { boss: 'mass', inSeconds: 180 })
  assert.equal(b.boss, undefined)
  // Nothing comes early.
  const early = []
  while (b.elapsed < 179.9) early.push(...b.step(1 / 30, 0, 0).filter(event => event.type === 'boss'))
  assert.deepEqual(early, [])
  assert.ok(Math.abs(b.nextBoss.inSeconds - (180 - b.elapsed)) < 1e-6)
  const arrival = []
  while (b.elapsed < 180.2) arrival.push(...b.step(1 / 30, 0, 0).filter(event => event.type === 'boss'))
  assert.deepEqual(arrival, [{ type: 'boss', boss: 'mass' }])
  assert.equal(b.boss.kind, 'mass')
  assert.equal(b.bossIndex, 1)
  assert.equal(b.stage, 'court')
  // It walks in from beyond the view like any other foe.
  for (const id of ['mass', 'sentinel', 'retinue', 'guard']) {
    assert.ok(foes[id].health > 10 * foes.knight.health / 4)
    assert.ok(foes[id].speed > 0)
  }
})

test('the count to the next boss stands still while a boss is in the court', () => {
  const b = before(0)
  advance(b, 6)
  const boss = b.boss
  assert.equal(boss.kind, 'mass')
  assert.equal(b.calm, 0)
  assert.deepEqual(b.nextBoss, { boss: 'sentinel', inSeconds: 180 })
  // Four minutes with the boss alive: no second boss, no count, but the waves go on.
  const others = () => b.foes.filter(foe => foe !== boss).length
  const start = others()
  const events = []
  for (let i = 0; i < 240 * 30; i++) {
    events.push(...b.step(1 / 30, 0, 0).filter(event => event.type === 'boss'))
    if (b.foes.length > 40) b.foes = [boss]
  }
  assert.deepEqual(events, [])
  assert.equal(b.calm, 0)
  assert.equal(b.bossIndex, 1)
  assert.ok(b.elapsed > 240)
  assert.ok(others() + start > 0)
  assert.ok(b.foes.some(foe => foe.kind === 'briarling'))

  // Felled: the count starts from nothing and the next boss comes three minutes later.
  boss.health = 0.1
  b.spells.witchfire.range = 4000
  b.foes = [boss]
  b.timers.witchfire = 0
  const felled = b.step(1 / 30, 0, 0)
  assert.deepEqual(felled.filter(event => event.type === 'felled').map(event => event.boss), ['mass'])
  assert.equal(b.felled, 1)
  assert.equal(b.boss, undefined)
  b.spells.witchfire.range = 0
  const at = b.elapsed
  const next = []
  for (let i = 0; i < 200 * 30 && !next.length; i++) {
    if (b.phase === 'choosing') b.choose(0)
    next.push(...b.step(1 / 30, 0, 0).filter(event => event.type === 'boss'))
    b.embers = []
    if (b.foes.length > 40) b.foes = b.foes.filter(foe => foe.kind === 'sentinel')
  }
  assert.deepEqual(next, [{ type: 'boss', boss: 'sentinel' }])
  assert.ok(Math.abs(b.elapsed - at - 180) < 0.2)
})

test('after a pause the count to the boss continues from the same second', () => {
  const play = pauseAt => {
    const b = before(1, seeded(9))
    b.calm = bossRule.every - 2
    for (let frame = 0; frame < 300; frame++) {
      if (frame === pauseAt) {
        b.phase = 'paused'
        advance(b, 400, 1, 1)
        b.phase = 'playing'
      }
      b.step(1 / 60, 0, 0)
    }
    return JSON.stringify(b)
  }
  const straight = play(-1)
  assert.equal(play(60), straight)
  assert.equal(play(125), straight)
  assert.ok(JSON.parse(straight).foes.some(foe => foe.kind === 'sentinel'))
})

test('a felled boss blesses one learned spell, and leaves a reliquary when none is left to bless', () => {
  const fell = blessed => {
    const b = playing(() => 0.5)
    learn(b, 'toll')
    b.timers.toll = 9
    Object.assign(b.blessed, blessed)
    const boss = makeFoe('retinue', b.player.x + 80, b.player.y, 0, 0.1)
    b.foes = [boss]
    b.spells.witchfire.range = 2000
    const events = b.step(0, 0, 0)
    return { b, events, at: { x: boss.x, y: boss.y } }
  }
  const first = fell({})
  assert.deepEqual(first.events.map(event => event.type), ['shot', 'kill', 'felled'])
  assert.equal(first.b.boons, 1)
  assert.deepEqual(first.b.reliquaries, [])
  assert.equal(first.b.embers.at(-1).value, foes.retinue.ember)
  // The blessing is offered on the next step, one card per learned spell.
  first.b.embers = []
  first.b.spells.witchfire.range = 0
  first.b.step(1 / 60, 0, 0)
  assert.ok(first.b.blessing)
  assert.deepEqual(first.b.offer, [{ kind: 'bless', spell: 'witchfire' }, { kind: 'bless', spell: 'toll' }])
  first.b.choose(1)
  first.b.choose(1)
  assert.equal(first.b.phase, 'playing')
  assert.deepEqual(first.b.blessed, { toll: true })

  // One spell still unblessed: a blessing. Both blessed: a reliquary.
  assert.equal(fell({ toll: true }).b.boons, 1)
  const full = fell({ toll: true, witchfire: true })
  assert.equal(full.b.boons, 0)
  assert.deepEqual(full.b.reliquaries, [full.at])
  assert.deepEqual(full.events.map(event => event.type), ['shot', 'bloom', 'kill', 'felled', 'chest'])
})

test('a boss is not mended by a moth nor thrown back by the toll, and a run can be lost to it', () => {
  const { b, moth, beat } = ward([['mass', 60, 50]])
  const boss = b.foes[1]
  assert.deepEqual(beat(), [])
  assert.equal(boss.health, 50)
  assert.ok(b.foes.includes(moth))

  const ringer = hero('ringer')
  const big = makeFoe('guard', ringer.player.x + 40, ringer.player.y, 0, 1e9)
  ringer.foes = [big]
  ringer.immunity = 9
  ringer.step(0, 0, 0)
  assert.equal(big.x, ringer.player.x + 40)
  assert.equal(1e9 - big.health, spells.toll.damage)

  const doomed = before(2)
  doomed.armor = 1
  advance(doomed, 6)
  const boss2 = doomed.boss
  Object.assign(boss2, doomed.player)
  doomed.step(1 / 60, 0, 0)
  assert.equal(doomed.phase, 'lost')
  assert.equal(doomed.stage, 'court')
})

test('the Duchess is the fifth boss: she comes when her turn is due and felling her wins the run', () => {
  const b = before(4)
  const events = []
  for (let i = 0; i < 6; i++) events.push(...b.step(1 / 60, 0, 0))
  assert.deepEqual(events.map(event => event.type).filter(type => type === 'boss' || type === 'duel'), ['boss', 'duel'])
  assert.equal(b.stage, 'duel')
  assert.equal(b.boss.kind, 'duchess')
  assert.equal(b.nextBoss, undefined)
  assert.equal(b.bossIndex, bossIds.length)
  // No boss after her, however long the duel lasts.
  b.foes.find(foe => foe.kind === 'seal').health = 1e9
  const later = []
  for (let i = 0; i < 400 * 30; i++) later.push(...b.step(1 / 30, 0, 0).filter(event => event.type === 'boss'))
  assert.deepEqual(later, [])

  const { b: won, seal, lady } = inDuel()
  won.spells.witchfire.range = 4000
  won.felled = 4
  seal.health = 0.1
  lady.health = 0.1
  won.step(1 / 60, 0, 0)
  won.timers.witchfire = 0
  const last = won.step(1 / 60, 0, 0)
  assert.deepEqual(last.map(event => event.type), ['shot', 'kill', 'felled'])
  assert.equal(won.phase, 'won')
  assert.equal(won.felled, 5)
  assert.equal(new Battle().felled, 0)
  assert.equal(new Battle().bossIndex, 0)
})

// --- Step 5.2: the Briar Mass.

// A still court with the Briar Mass standing far from the warden, and no waves.
function rolling(grown = 0) {
  const b = playing(() => 0.5)
  b.spells.witchfire.range = 0
  b.schedule.splice(0)
  b.calm = -1e9
  const mass = makeFoe('mass', b.player.x + 400, b.player.y, 0, foes.mass.health)
  for (let i = 0; i < grown; i++) {
    mass.grown++
    mass.health += massRule.health
    mass.full += massRule.health
  }
  b.foes = [mass]
  return { b, mass }
}

test('the Briar Mass swallows a briarling it rolls over, but nothing bigger', () => {
  const { b, mass } = rolling()
  const near = kind => makeFoe(kind, mass.x + 10, mass.y, 0, 50)
  const others = ['boar', 'knight', 'marked', 'archer', 'moth'].map(near)
  // A briarling just beyond its reach is safe; one inside is swallowed.
  const far = makeFoe('briarling', mass.x - foes.mass.reach - 2, mass.y, 0, 50)
  b.foes.push(...others, far)
  for (const foe of others) foe.timer = 1e9
  assert.deepEqual(b.step(0, 0, 0), [])
  assert.equal(mass.grown, 0)
  far.x += 4
  const events = b.step(0, 0, 0)
  assert.deepEqual(events, [{ type: 'absorb', from: { x: far.x, y: far.y }, to: { x: mass.x, y: mass.y } }])
  assert.deepEqual(b.foes, [mass, ...others])
  // The swallowed foe is not banished: no ember, no kill.
  assert.deepEqual(b.embers, [])
  assert.equal(b.kills, 0)
  assert.deepEqual(massRule.eats, ['briarling'])
  // Any other foe that touches a briarling leaves it alone.
  const plain = rolling()
  plain.b.foes = [makeFoe('knight', 300, 300, 0, 50), makeFoe('briarling', 300, 300, 0, 50)]
  plain.b.step(0, 0, 0)
  assert.equal(plain.b.foes.length, 2)
})

test('each swallowed briarling changes the size, health, speed and bite of the Briar Mass once', () => {
  const { b, mass } = rolling()
  mass.speed = foes.mass.speed
  mass.health = 100
  const state = () => [mass.grown, b.reach(mass), mass.health, mass.full, mass.speed, b.bite(mass)]
  assert.deepEqual(state(), [0, foes.mass.reach, 100, foes.mass.health, foes.mass.speed, 1])
  const feed = () => b.foes.push(makeFoe('briarling', mass.x, mass.y, 0, 1), makeFoe('briarling', mass.x, mass.y, 0, 1))
  feed()
  b.step(0, 0, 0)
  const once = [1, foes.mass.reach + massRule.reach, 100 + massRule.health, foes.mass.health + massRule.health, foes.mass.speed - massRule.slow, 1]
  assert.deepEqual(state(), once)
  assert.equal(b.foes.length, 2)
  // The second waits for the mass to finish the first.
  b.step(0, 0, 0)
  assert.deepEqual(state(), once)
  for (let i = 0; i < Math.round(massRule.pause * 60) - 1; i++) b.step(1 / 60, 0, 0)
  assert.equal(mass.grown, 1)
  mass.x = b.player.x + 400
  b.foes[1].x = mass.x
  b.step(2 / 60, 0, 0)
  assert.equal(mass.grown, 2)
  assert.equal(b.foes.length, 1)

  // Its touch takes one more pip for every `biteEvery` swallowed.
  for (const [grown, bite] of [[0, 1], [massRule.biteEvery - 1, 1], [massRule.biteEvery, 2], [massRule.cap, 1 + Math.floor(massRule.cap / massRule.biteEvery)]]) {
    const { b, mass } = rolling(grown)
    assert.equal(b.bite(mass), bite)
    // It reaches the warden from as far as it has grown.
    mass.x = b.player.x + b.reach(mass) + 1
    b.step(0, 0, 0)
    assert.equal(b.armor, MAX_ARMOR)
    mass.x -= 2
    b.step(0, 0, 0)
    assert.equal(b.armor, MAX_ARMOR - bite)
    // The moment of mercy holds against the next touch.
    b.step(0.1, 0, 0)
    assert.equal(b.armor, MAX_ARMOR - bite)
    assert.equal(b.phase, 'playing')
  }
  // A bite deeper than the armor left ends the run at nothing, not below.
  const last = rolling(massRule.cap)
  last.b.armor = 1
  Object.assign(last.mass, last.b.player)
  last.b.step(0, 0, 0)
  assert.equal(last.b.armor, 0)
  assert.equal(last.b.phase, 'lost')
  // Ordinary foes still take one pip.
  assert.equal(b.bite(makeFoe('knight', 0, 0, 0, 1)), 1)
  assert.equal(b.reach(makeFoe('knight', 0, 0, 0, 1)), foes.knight.reach)
})

test('the Briar Mass stops growing at its cap, and does not grow in an empty court', () => {
  const { b, mass } = rolling()
  mass.speed = foes.mass.speed
  for (let i = 0; i < 30 * 60; i++) {
    if (b.foes.length < 4) b.foes.push(makeFoe('briarling', mass.x, mass.y, 0, 1))
    mass.x = b.player.x + 400
    b.step(1 / 60, 0, 0)
  }
  assert.equal(mass.grown, massRule.cap)
  assert.equal(b.reach(mass), foes.mass.reach + massRule.cap * massRule.reach)
  assert.equal(mass.full, foes.mass.health + massRule.cap * massRule.health)
  assert.equal(mass.speed, foes.mass.speed - massRule.cap * massRule.slow)
  // Grown, it is slow enough to walk around, and still moves.
  assert.ok(mass.speed > 0 && mass.speed < Math.min(...heroIds.map(id => heroes[id].speed)) / 3)
  assert.equal(b.bite(mass), 2)
  assert.ok(b.bite(mass) < MAX_ARMOR)
  // Briarlings lying on it are left alone now.
  assert.ok(b.foes.filter(foe => foe.kind === 'briarling').length >= 3)

  const empty = rolling()
  empty.mass.speed = foes.mass.speed
  const events = []
  for (let i = 0; i < 20 * 60; i++) {
    events.push(...empty.b.step(1 / 60, 0, 0))
    empty.mass.x = Math.max(empty.mass.x, empty.b.player.x + 200)
  }
  assert.deepEqual(events, [])
  assert.deepEqual([empty.mass.grown, empty.mass.health, empty.mass.speed], [0, foes.mass.health, foes.mass.speed])
  assert.equal(empty.b.foes.length, 1)
})

test('the third minute brings the Briar Mass among the wave, and it feeds on it', () => {
  const b = before(0, seeded(4))
  const events = []
  for (let i = 0; i < 40 * 30 && (b.boss?.grown ?? 0) < 3; i++) events.push(...b.step(1 / 30, 0, 0))
  assert.equal(b.boss.kind, 'mass')
  assert.equal(b.boss.grown, 3)
  assert.equal(events.filter(event => event.type === 'absorb').length, 3)
  assert.equal(b.boss.full, foes.mass.health + 3 * massRule.health)
  // Felling a grown mass is felling the boss all the same.
  b.boss.health = 0.1
  b.spells.witchfire.range = 4000
  b.timers.witchfire = 0
  b.foes = [b.boss]
  assert.ok(b.step(1 / 30, 0, 0).some(event => event.type === 'felled' && event.boss === 'mass'))
})

// --- Step 5.3: the Sleepless Warder.

// A still court with the Warder beside the warden, no waves, and witchfire ready to fire.
function watch(health = 1) {
  const b = playing(() => 0.5)
  b.schedule.splice(0)
  b.calm = -1e9
  b.immunity = 1e9
  const warder = makeFoe('sentinel', b.player.x + 120, b.player.y, 0, foes.sentinel.health)
  warder.health = health
  b.foes = [warder]
  b.spells.witchfire.range = 2000
  b.timers.witchfire = 0
  return { b, warder }
}
// Steps until an event of the given type comes, and returns everything seen on the way.
function until(b, type, limit = 60 * 60) {
  const seen = []
  for (let i = 0; i < limit && !seen.some(event => event.type === type); i++) {
    if (b.phase === 'choosing') b.choose(0)
    seen.push(...b.step(1 / 60, 0, 0))
  }
  return seen
}

test('the Sleepless Warder rises exactly twice, whole and quicker each time, and blesses only after the third fall', () => {
  assert.deepEqual(warderRule.lives, 3)
  const { b, warder } = watch()
  const speeds = []
  for (let life = 1; life < warderRule.lives; life++) {
    const fall = until(b, 'fall')
    assert.deepEqual(fall.filter(event => event.type !== 'shot'), [{ type: 'fall', at: { x: warder.x, y: warder.y }, falls: life }])
    assert.deepEqual([warder.mode, warder.health, warder.falls, warder.timer], ['down', 0, life, warderRule.rest])
    // Not banished, not felled, nothing dropped, no blessing yet.
    assert.deepEqual([b.kills, b.felled, b.boons, b.embers.length, b.reliquaries.length], [0, 0, 0, 0, 0])
    assert.equal(b.boss, warder)
    const at = b.elapsed
    const rise = until(b, 'rise')
    assert.deepEqual(rise.filter(event => event.type !== 'shot'), [{ type: 'rise', at: { x: warder.x, y: warder.y } }])
    assert.ok(Math.abs(b.elapsed - at - warderRule.rest) < 0.02)
    // Whole again; the spark of the same step may already have landed.
    const sparks = rise.filter(event => event.type === 'shot').length
    assert.deepEqual([warder.mode, warder.health], ['chase', foes.sentinel.health - sparks * b.spells.witchfire.damage])
    assert.equal(warder.full, foes.sentinel.health)
    speeds.push(warder.speed)
    warder.speed = 0
    warder.health = 1
  }
  assert.deepEqual(speeds, [1 + warderRule.quicken, 1 + 2 * warderRule.quicken].map(by => foes.sentinel.speed * by))
  assert.ok(foes.sentinel.speed < speeds[0] && speeds[0] < speeds[1])
  // Even on its last life the warden can still outrun it.
  assert.ok(speeds[1] < Math.min(...heroIds.map(id => heroes[id].speed)))

  // The third fall is the end of it.
  const last = until(b, 'felled')
  assert.deepEqual(last.filter(event => event.type !== 'shot').map(event => event.type), ['kill', 'felled'])
  assert.deepEqual([b.kills, b.felled, b.boons, b.embers.length], [1, 1, 1, 1])
  assert.equal(b.boss, undefined)
  assert.deepEqual(b.foes, [])
  assert.deepEqual(until(b, 'rise', 600).filter(event => event.type === 'rise' || event.type === 'fall'), [])
})

test('a blow far beyond its health costs the Sleepless Warder one life, not two', () => {
  const { b, warder } = watch(foes.sentinel.health)
  b.spells.witchfire.damage = 1e6
  // A blessed spark blooms on it and leaps: several blows land in the same cast.
  b.blessed.witchfire = true
  const other = makeFoe('knight', warder.x + 20, warder.y, 0, 1e9)
  b.foes.push(other)
  b.sparks = 2
  const events = b.step(0, 0, 0)
  assert.equal(events.filter(event => event.type === 'fall').length, 1)
  assert.deepEqual([warder.falls, warder.health, warder.mode], [1, 0, 'down'])
  assert.ok(b.foes.includes(warder))
})

test('nothing aims at or wounds the Sleepless Warder while it lies, and it wounds no one', () => {
  for (const spell of spellIds) {
    const { b, warder } = watch()
    b.immunity = 0
    until(b, 'fall')
    assert.equal(warder.mode, 'down')
    // Stand on top of it with every spell tuned to hit.
    learn(b, spell)
    Object.assign(b.spells[spell], { damage: 50, range: 400, cooldown: 0.05 })
    b.blessed[spell] = true
    Object.assign(b.player, { x: warder.x, y: warder.y })
    const events = []
    for (let i = 0; i < Math.round((warderRule.rest - 0.5) * 60); i++) events.push(...b.step(1 / 60, i % 2 ? 1 : -1, 0))
    assert.deepEqual([warder.mode, warder.health, warder.falls], ['down', 0, 1], spell)
    assert.deepEqual(events.filter(event => ['shot', 'kill', 'fall', 'burst', 'sting', 'chain'].includes(event.type)), [], spell)
    assert.equal(b.armor, MAX_ARMOR, spell)
    assert.ok(Math.hypot(warder.x - b.player.x, warder.y - b.player.y) < 2)
    // A foe beside it is still fair game.
    const near = makeFoe('briarling', warder.x + 30, warder.y, 0, 1)
    b.foes.push(near)
    until(b, 'kill', 60)
    assert.ok(!b.foes.includes(near), spell)
    assert.equal(warder.health, 0, spell)
  }
  // Risen on top of the warden, it wounds again.
  const { b, warder } = watch()
  b.immunity = 0
  b.spells.witchfire.damage = 0.5
  until(b, 'fall')
  b.spells.witchfire.range = 0
  Object.assign(b.player, { x: warder.x, y: warder.y })
  until(b, 'rise')
  assert.equal(b.armor, MAX_ARMOR - 1)
})

test('the sixth minute brings the Sleepless Warder, and the count to the next boss waits through all its lives', () => {
  const b = before(1)
  b.schedule.splice(0)
  advance(b, 6)
  const warder = b.boss
  assert.equal(warder.kind, 'sentinel')
  assert.equal(warder.full, foes.sentinel.health)
  b.spells.witchfire.range = 4000
  b.spells.witchfire.damage = 1e6
  until(b, 'fall')
  until(b, 'rise')
  assert.equal(b.calm, 0)
  assert.equal(b.boss, warder)
  until(b, 'felled')
  assert.equal(warder.falls, warderRule.lives - 1)
  assert.equal(b.felled, 1)
  b.spells.witchfire.range = 0
  until(b, 'none', 60)
  assert.ok(b.calm > 0)
  assert.deepEqual(b.nextBoss.boss, 'retinue')
})
