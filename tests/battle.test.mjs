import assert from 'node:assert/strict'
import test from 'node:test'
import { Battle, DURATION, WIDTH, HEIGHT, MAX_ARMOR } from '../src/battle.ts'

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
  assert.deepEqual(b.step(0, 0, 0)?.to, { x: near.x, y: near.y })
  assert.equal(b.kills, 1)
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
    advance(b, 120, 1, 1)
    assert.equal(JSON.stringify(b), before)
  })
}
