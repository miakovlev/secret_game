import assert from 'node:assert/strict'
import test from 'node:test'
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
  const foe = offset => ({ x: b.player.x + offset, y: b.player.y, speed: 0 })
  const near = foe(35), far = foe(120), outside = foe(160)
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
  b.foes = Array.from({ length: 20 }, () => ({ ...b.player, speed: 0 }))
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

for (const phase of ['ready', 'paused', 'won', 'lost']) {
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
  drop(xpGoal(2) + xpGoal(3))
  const levels = b.step(0, 0, 0).filter(event => event.type === 'level')
  assert.deepEqual(levels.map(event => event.level), [3, 4])
  assert.equal(b.xp, 2)
  assert.ok(xpGoal(2) > xpGoal(1))
})
