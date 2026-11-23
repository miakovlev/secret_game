import assert from 'node:assert/strict'
import test from 'node:test'
import { archerVolley, boarCharge, court, fireflyRule, foes, garden, heroes, heroIds, loadout, mothHeal, relicIds, relicRule,
  relics, seedRule, oil, run, waves, shownValue, spells, upgraded, upgradeIds, upgrades } from '../src/content.ts'

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

test('the dawn bell ends the waves and carries armor and spells into the throne garden', () => {
  const b = playing()
  learn(b, 'toll')
  b.spells.witchfire = upgraded(b.spells.witchfire, 'damage')
  b.armor = 3
  b.level = 4
  b.kills = 17
  b.foes = [makeFoe('boar', b.player.x + 300, b.player.y, 70, 50)]
  b.embers = [{ x: 40, y: 40, value: 1 }]
  b.oils = [{ x: 60, y: 60 }]
  b.arrows = [{ x: 900, y: 500, vx: 100, vy: 0, life: 1 }]
  const build = JSON.stringify([b.loadout, b.spells])
  b.elapsed = DURATION - .01
  assert.equal(b.stage, 'court')
  const events = []
  for (let i = 0; i < 2; i++) events.push(...b.step(1 / 60, 0, 0))
  assert.deepEqual(events.filter(event => event.type !== 'toll'), [{ type: 'garden' }])
  assert.equal(b.stage, 'garden')
  assert.equal(b.phase, 'playing')
  assert.equal(b.armor, 3)
  assert.equal(b.level, 4)
  assert.equal(b.kills, 17)
  assert.equal(JSON.stringify([b.loadout, b.spells]), build)
  assert.deepEqual(b.player, garden.start)
  assert.deepEqual([b.embers, b.oils, b.arrows], [[], [], []])
  assert.deepEqual(b.foes.map(foe => foe.kind), ['duchess', 'seal'])
  assert.deepEqual({ x: b.duchess.x, y: b.duchess.y }, garden.duchess)
  assert.ok(b.shielded)

  // No more waves: only the Duchess and her flower share the garden.
  b.armor = Infinity
  b.spells.witchfire.range = 0
  b.loadout = ['witchfire']
  advance(b, 600)
  assert.deepEqual(b.foes.map(foe => foe.kind), ['duchess', 'seal'])
  assert.ok(b.elapsed > DURATION + 9)
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

test('a whole run sends in exactly the groups the schedule lists', () => {
  const b = new Battle(seeded())
  b.phase = 'playing'
  b.spells.witchfire.range = 0
  b.armor = Infinity
  const seen = new Set()
  const entered = { briarling: 0, marked: 0, boar: 0, archer: 0, knight: 0, moth: 0 }
  let bells = 0
  while (b.elapsed < run.duration + 5) {
    bells += b.step(1 / 30, 0, 0).filter(event => event.type === 'garden').length
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
  assert.ok(first('archer') < first('knight') && first('knight') <= first('moth'))
  // The garden opens exactly once, when the nine minutes are up.
  assert.equal(bells, 1)
  assert.equal(b.stage, 'garden')
  assert.equal(run.duration, 540)
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

// --- Step 2.6: the duel with the Duchess.

// A warden who has just walked into the throne garden.
function inGarden(random = () => 0.5) {
  const b = playing(random)
  b.elapsed = DURATION
  b.step(1 / 60, 0, 0)
  b.immunity = 0
  const seal = b.foes.find(foe => foe.kind === 'seal')
  return { b, seal, lady: b.duchess }
}

test('the warden moves inside the garden and the camera stays put', () => {
  const { b } = inGarden()
  b.armor = Infinity
  b.spells.witchfire.range = 0
  advance(b, 600, -1, 1)
  assert.deepEqual(b.player, { x: 22, y: garden.height - 22 })
  assert.deepEqual(b.camera(), { x: 0, y: 0 })
  advance(b, 700, 1, 0)
  assert.equal(b.player.x, garden.width - 22)
  assert.deepEqual(b.camera(), { x: 0, y: 0 })
})

test('the crown of vines turns every spell aside while the seal-flower lives', () => {
  const { b, seal, lady } = inGarden()
  learn(b, 'moonblade')
  learn(b, 'toll')
  for (const id of b.loadout) Object.assign(b.spells[id], { range: 2000, arc: 180, cooldown: 0.1 })
  // Stand next to the Duchess, far from the flower: she is the nearest target.
  b.player = { x: lady.x, y: lady.y + 80 }
  b.armor = Infinity
  seal.health = 1e9
  const at = { x: lady.x, y: lady.y }
  const shots = []
  for (let i = 0; i < 120; i++) shots.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'shot'))
  assert.equal(lady.health, foes.duchess.health)
  assert.ok(seal.health < 1e9)
  assert.ok(shots.length > 5)
  for (const shot of shots) assert.deepEqual(shot.to, { x: seal.x, y: seal.y })
  // The bell hurts the flower but moves neither rooted thing.
  assert.deepEqual({ x: lady.x, y: lady.y }, at)
  assert.deepEqual({ x: seal.x, y: seal.y }, garden.beds[0])
})

test('breaking the seal opens the crown for a while, then the next flower blooms', () => {
  const { b, seal, lady } = inGarden()
  b.armor = Infinity
  b.player = { x: seal.x + 60, y: seal.y }
  seal.health = 0.5
  const events = b.step(1 / 60, 0, 0)
  assert.deepEqual(events.map(event => event.type), ['shot', 'kill', 'crown'])
  assert.deepEqual(events[2], { type: 'crown', open: true })
  assert.ok(!b.shielded)
  assert.equal(b.crownOpen, garden.window)
  assert.deepEqual([b.embers, b.oils], [[], []])

  // Now the Duchess is the only target and she bleeds.
  b.spells.witchfire.range = 2000
  const frames = Math.round(garden.window * 60) - 2
  let closed = []
  for (let i = 0; i < frames; i++) closed.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'crown'))
  assert.deepEqual(closed, [])
  assert.deepEqual(b.foes, [lady])
  const hurt = foes.duchess.health - lady.health
  assert.ok(hurt > 10)

  for (let i = 0; i < 4; i++) closed.push(...b.step(1 / 60, 0, 0).filter(event => event.type === 'crown'))
  assert.deepEqual(closed, [{ type: 'crown', open: false }])
  assert.ok(b.shielded)
  assert.equal(b.crownOpen, 0)
  const next = b.foes.filter(foe => foe.kind === 'seal')
  assert.equal(next.length, 1)
  assert.deepEqual({ x: next[0].x, y: next[0].y }, garden.beds[1])
  assert.equal(next[0].health, foes.seal.health)
  next[0].health = 1e9
  const before = lady.health
  advance(b, 120)
  assert.equal(lady.health, before)
})

test('the lash warns, then strikes the marked sector; stepping out of it is safe', () => {
  const strike = sidestep => {
    const { b, lady } = inGarden()
    b.spells.witchfire.range = 0
    b.player = { x: lady.x, y: lady.y + 250 }
    advance(b, Math.round(garden.lash.every * 60) - 2)
    assert.equal(b.lash.warned, false)
    advance(b, 4)
    assert.equal(b.lash.warned, true)
    assert.ok(Math.abs(b.lash.facing - Math.PI / 2) < 1e-9)
    const facing = b.lash.facing
    const lashes = []
    const warning = Math.round(garden.lash.windup * 60)
    for (let i = 0; i < warning - 6; i++) lashes.push(...b.step(1 / 60, sidestep, 0))
    assert.deepEqual(lashes, [])
    assert.equal(b.armor, MAX_ARMOR)
    // The marked sector does not follow the warden.
    assert.equal(b.lash.facing, facing)
    for (let i = 0; i < 10; i++) lashes.push(...b.step(1 / 60, sidestep, 0).filter(event => event.type === 'lash'))
    assert.deepEqual(lashes, [{
      type: 'lash', at: { x: lady.x, y: lady.y }, facing,
      range: garden.lash.range, arc: (garden.lash.arc * Math.PI) / 180,
    }])
    assert.equal(b.lash.warned, false)
    return b.armor
  }
  assert.equal(strike(0), MAX_ARMOR - 1)
  assert.equal(strike(1), MAX_ARMOR)
})

test('the lashes hang low while the crown is open', () => {
  const { b, seal } = inGarden()
  b.spells.witchfire.range = 0
  advance(b, Math.round(garden.lash.every * 60) + 5)
  assert.equal(b.lash.warned, true)
  seal.health = 0.1
  b.spells.witchfire.range = 2000
  b.step(1 / 60, 0, 0)
  assert.equal(b.lash.warned, false)
  b.spells.witchfire.range = 0
  const lashes = []
  for (let i = 0; i < Math.round(garden.window * 60) - 5; i++) lashes.push(...b.step(1 / 60, 0, 0))
  assert.deepEqual(lashes, [])
  assert.equal(b.armor, MAX_ARMOR)
  // The count starts over once the crown closes.
  advance(b, 10)
  assert.ok(b.shielded)
  assert.deepEqual(b.lash, { timer: b.lash.timer, warned: false, facing: 0 })
  assert.ok(b.lash.timer > garden.lash.every - 0.2)
})

test('the run is won only when the open Duchess falls, and can be lost in the garden', () => {
  const { b, seal, lady } = inGarden()
  b.spells.witchfire.range = 2000
  seal.health = 0.1
  lady.health = 0.1
  b.step(1 / 60, 0, 0)
  assert.equal(b.phase, 'playing')
  assert.equal(lady.health, 0.1)
  b.timers.witchfire = 0
  const events = b.step(1 / 60, 0, 0)
  assert.deepEqual(events.map(event => event.type), ['shot', 'kill'])
  assert.equal(b.phase, 'won')
  assert.equal(b.stage, 'garden')
  assert.ok(b.elapsed > DURATION)
  assert.deepEqual(b.embers, [])

  const fallen = inGarden().b
  fallen.spells.witchfire.range = 0
  fallen.armor = 1
  fallen.player = { x: fallen.duchess.x, y: fallen.duchess.y + 200 }
  advance(fallen, Math.round((garden.lash.every + garden.lash.windup) * 60) + 6)
  assert.equal(fallen.phase, 'lost')
  assert.equal(fallen.stage, 'garden')
  assert.equal(fallen.armor, 0)
})

test('touching the Duchess wounds like any other foe', () => {
  const { b, lady } = inGarden()
  b.spells.witchfire.range = 0
  b.player = { x: lady.x, y: lady.y + foes.duchess.reach - 4 }
  advance(b, 2)
  assert.equal(b.armor, MAX_ARMOR - 1)
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
    // Walk so that the foe ends up on the ring, then wait.
    advance(b, 75, 1, 0)
    assert.equal(hurt(foe), 0)
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

test('new spells stay out of the duel until learned and seeds do not follow into the garden', () => {
  const b = hero('duelist')
  learn(b, 'seeds')
  b.seeds = [{ x: 100, y: 100, life: 9 }]
  b.elapsed = DURATION
  b.step(1 / 60, 0, 0)
  assert.equal(b.stage, 'garden')
  assert.deepEqual(b.seeds, [])
  assert.deepEqual(b.loadout, ['moonblade', 'seeds'])
  assert.equal(b.hero, 'duelist')

  // A seed and a firefly cannot hurt the shielded Duchess.
  learn(b, 'fireflies')
  b.spells.moonblade.range = 0
  const lady = b.duchess
  b.foes.find(foe => foe.kind === 'seal').health = 1e9
  b.armor = Infinity
  b.player = { x: lady.x - spells.fireflies.range, y: lady.y }
  b.seeds = [{ x: lady.x, y: lady.y, life: 9 }]
  advance(b, 240)
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

test('relics go with the hero into the garden; a reliquary left behind is lost; a new run has none', () => {
  const b = playing()
  b.relics = { boots: 2, cloak: 1 }
  b.armor = 6
  b.reliquaries = [{ x: 50, y: 50 }]
  b.elapsed = DURATION
  b.step(1 / 60, 0, 0)
  assert.equal(b.stage, 'garden')
  assert.deepEqual(b.relics, { boots: 2, cloak: 1 })
  assert.equal(b.armor, 6)
  assert.deepEqual(b.reliquaries, [])
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
