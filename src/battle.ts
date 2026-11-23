import {
  archerVolley, boarCharge, court, fireflyRule, foes, garden, heroes, leveling, loadout, mothHeal, oil, relicIds,
  relicRule,
  relics, run, seedRule, shownValue, spellIds, spells, upgraded, upgradeIds, upgrades, waves,
} from './content.ts'
import type { FoeKind, HeroId, RelicId, SpellId, Stats, UpgradeId, Wave } from './content.ts'

// Positions and speeds are expressed in arena pixels and seconds.
export const DURATION = run.duration
export const MAX_ARMOR = 5
export const PICKUP_RADIUS = 48
export type Point = { x: number; y: number }
// A foe chases the warden by default. A boar goes chase → windup → charge →
// rest; an archer goes chase → aim → volley. `timer` counts down the current
// mode (or an archer's reload), `dir` is the locked direction of a charge or volley.
export type FoeMode = 'chase' | 'windup' | 'charge' | 'rest' | 'aim' | 'volley'
export type Foe = Point & {
  kind: FoeKind
  speed: number
  health: number
  // The health it came in with; a healer moth never mends beyond it.
  full: number
  mode: FoeMode
  timer: number
  dir: Point
  shots: number
  // Seconds until a firefly spirit may sting this foe again.
  stung: number
}
export type Arrow = Point & { vx: number; vy: number; life: number }
export type Seed = Point & { life: number }
export type Ember = Point & { value: number }
export type Shot = { from: Point; to: Point }
// Everything that happened during one step, in order, for the scene to show.
export type BattleEvent =
  | ({ type: 'shot' } & Shot)
  | { type: 'slash'; at: Point; facing: number; range: number; arc: number }
  | { type: 'toll'; at: Point; radius: number }
  | { type: 'kill'; at: Point }
  | { type: 'pickup'; at: Point }
  | { type: 'heal'; at: Point }
  | { type: 'chest'; at: Point }
  | { type: 'open'; at: Point }
  | { type: 'arrow'; at: Point }
  | ({ type: 'mend' } & Shot)
  | ({ type: 'chain' } & Shot)
  | { type: 'sow'; at: Point }
  | { type: 'burst'; at: Point; radius: number }
  | { type: 'sting'; at: Point }
  | { type: 'garden' }
  | { type: 'crown'; open: boolean }
  | { type: 'lash'; at: Point; facing: number; range: number; arc: number }
  | { type: 'level'; level: number }
// The run starts in the chapel court and ends in the throne garden.
export type Stage = 'court' | 'garden'
export type Phase = 'ready' | 'playing' | 'paused' | 'choosing' | 'won' | 'lost'
// One card: a new spell, the shown value of a spell stat before and after,
// or a relic at the level it would reach.
export type Choice =
  | { kind: 'learn'; spell: SpellId }
  | { kind: 'upgrade'; spell: SpellId; id: UpgradeId; from: number; to: number }
  | { kind: 'relic'; relic: RelicId; level: number }

// Experience needed to leave the given level.
export function xpGoal(level: number) {
  return leveling.first + (level - 1) * leveling.growth
}

export function makeFoe(kind: FoeKind, x: number, y: number, speed: number, health: number): Foe {
  return { kind, x, y, speed, health, full: health, mode: 'chase', timer: 0, dir: { x: 0, y: 0 }, shots: 0, stung: 0 }
}

// How many times the wave's group has been due by the given second of the run.
export function bursts(wave: Wave, elapsed: number) {
  if (elapsed < wave.from) return 0
  if (!wave.every || wave.to === undefined) return 1
  const last = Math.ceil((wave.to - wave.from) / wave.every) - 1
  return Math.min(Math.floor((elapsed - wave.from) / wave.every), last) + 1
}

export class Battle {
  phase: Phase = 'ready'
  stage: Stage = 'court'
  player: Point = { x: court.width / 2, y: court.height / 2 }
  facing = 0
  foes: Foe[] = []
  embers: Ember[] = []
  oils: Point[] = []
  reliquaries: Point[] = []
  // Relics held, in the order taken, with their levels; opened reliquaries awaiting a choice.
  relics: Partial<Record<RelicId, number>> = {}
  chests = 0
  arrows: Arrow[] = []
  xp = 0
  level = 1
  // Level-ups that still await a card, and the cards on offer for the first of them.
  pending = 0
  offer: Choice[] = []
  // Learned spells in slot order, their current stats and seconds until the next cast.
  loadout: SpellId[]
  spells: Partial<Record<SpellId, Stats>>
  timers: Record<SpellId, number> = { witchfire: 0, moonblade: 0, toll: 0, seeds: 0, fireflies: 0 }
  // Fire seeds lying in wait, the turn of the firefly ring, and witchfire sparks cast so far.
  seeds: Seed[] = []
  flyTurn = 0
  sparks = 0
  armor = MAX_ARMOR
  kills = 0
  elapsed = 0
  immunity = 0
  // The duel. `crownOpen` is how long the Duchess stays open to blows; `lash`
  // counts down to her next strike, or through its warning once `warned`.
  crownOpen = 0
  seals = 0
  lash = { timer: garden.lash.every, warned: false, facing: 0 }
  // How many groups each wave of the schedule has already sent in.
  private fired = waves.map(() => 0)

  private readonly random: () => number

  readonly hero: HeroId

  constructor(random: () => number = Math.random, hero: HeroId = 'warden') {
    this.random = random
    this.hero = hero
    const first = heroes[hero].spell
    this.loadout = [first]
    this.spells = { [first]: { ...spells[first] } }
  }

  // Top-left corner of the visible part of the court: centred on the warden
  // and stopped by the walls.
  camera(): Point {
    const { view } = court
    const { width, height } = this.stage === 'court' ? court : garden
    return {
      x: Math.max(0, Math.min(width - view.width, this.player.x - view.width / 2)),
      y: Math.max(0, Math.min(height - view.height, this.player.y - view.height / 2)),
    }
  }

  // A group steps in side by side just beyond one edge of the visible area,
  // never inside it.
  private spawn(kind: FoeKind, count: number) {
    const edge = Math.floor(this.random() * 4)
    const pos = this.random()
    const { width, height } = court.view
    const view = this.camera()
    const stats = foes[kind]
    for (let i = 0; i < count; i++) {
      const shift = (i - (count - 1) / 2) * 34
      const foe = makeFoe(
        kind,
        view.x + (edge === 0 ? -14 : edge === 1 ? width + 14 : pos * width + shift),
        view.y + (edge === 2 ? -14 : edge === 3 ? height + 14 : pos * height + shift),
        stats.speed + this.random() * stats.speedSpread + this.elapsed * stats.speedGrowth,
        stats.health + this.elapsed * stats.healthGrowth,
      )
      // Leave room to react when the warden is patrolling an entry point.
      if (Math.hypot(foe.x - this.player.x, foe.y - this.player.y) < 150) {
        if (edge < 2) foe.x = 2 * view.x + width - foe.x
        else foe.y = 2 * view.y + height - foe.y
      }
      this.foes.push(foe)
    }
  }

  // Thorns, tusks and arrows all take one pip, with a moment of mercy after.
  private wound() {
    if (this.immunity > 0) return
    this.armor--
    this.immunity = 1.25
    if (this.armor === 0) this.phase = 'lost'
  }

  private boar(foe: Foe, dt: number, distance: number, toward: Point) {
    if (foe.mode === 'chase') {
      if (distance < boarCharge.trigger) {
        foe.mode = 'windup'
        foe.timer = boarCharge.windup
        foe.dir = toward
      } else {
        foe.x += toward.x * dt * foe.speed
        foe.y += toward.y * dt * foe.speed
      }
    } else if (foe.mode === 'windup') {
      if (foe.timer > 0) return
      foe.mode = 'charge'
      foe.timer = boarCharge.length / boarCharge.speed
    } else if (foe.mode === 'charge') {
      foe.x += foe.dir.x * dt * boarCharge.speed
      foe.y += foe.dir.y * dt * boarCharge.speed
      if (foe.timer > 0) return
      foe.mode = 'rest'
      foe.timer = boarCharge.rest
    } else if (foe.timer === 0) {
      foe.mode = 'chase'
    }
  }

  private archer(foe: Foe, dt: number, distance: number, toward: Point, events: BattleEvent[]) {
    if (foe.mode === 'chase') {
      if (distance >= archerVolley.range) {
        foe.x += toward.x * dt * foe.speed
        foe.y += toward.y * dt * foe.speed
      } else if (foe.timer === 0) {
        foe.mode = 'aim'
        foe.timer = archerVolley.windup
        foe.dir = toward
      }
    } else if (foe.mode === 'aim') {
      if (foe.timer > 0) return
      foe.mode = 'volley'
      foe.shots = archerVolley.arrows
    } else if (foe.timer === 0) {
      this.arrows.push({
        x: foe.x,
        y: foe.y,
        vx: foe.dir.x * archerVolley.arrowSpeed,
        vy: foe.dir.y * archerVolley.arrowSpeed,
        life: archerVolley.arrowReach / archerVolley.arrowSpeed,
      })
      events.push({ type: 'arrow', at: { x: foe.x, y: foe.y } })
      foe.shots--
      foe.timer = archerVolley.interval
      if (foe.shots === 0) {
        foe.mode = 'chase'
        foe.timer = archerVolley.reload
      }
    }
  }

  // How many levels of a relic the hero holds.
  rank(id: RelicId) {
    return this.relics[id] ?? 0
  }

  get maxArmor() {
    return MAX_ARMOR + this.rank('cloak') * relics.cloak.amount
  }

  // A spell's stats as they play out with the relics held.
  stats(id: SpellId): Stats {
    const base = this.spells[id]!
    return {
      ...base,
      cooldown: base.cooldown * (1 - this.rank('hourglass') * relics.hourglass.amount),
      range: base.range * (1 + this.rank('ring') * relics.ring.amount),
    }
  }

  private mend() {
    this.armor = Math.min(this.maxArmor, this.armor + 1)
  }

  // The moth keeps its distance and mends the most wounded foe within its reach.
  private moth(foe: Foe, dt: number, distance: number, toward: Point, events: BattleEvent[]) {
    const { keep, range, beat, amount } = mothHeal
    const way = distance > keep ? 1 : distance < keep - 60 ? -1 : 0
    foe.x += toward.x * way * dt * foe.speed
    foe.y += toward.y * way * dt * foe.speed
    if (foe.timer > 0) return
    let patient: Foe | undefined
    let worst = 0
    for (const other of this.foes) {
      const lost = other.full - other.health
      const near = Math.hypot(other.x - foe.x, other.y - foe.y) < range
      if (other.kind !== 'moth' && near && lost > worst) {
        patient = other
        worst = lost
      }
    }
    if (!patient) return
    patient.health = Math.min(patient.full, patient.health + amount)
    foe.timer = beat
    events.push({ type: 'mend', from: { x: foe.x, y: foe.y }, to: { x: patient.x, y: patient.y } })
  }

  private collect(events: BattleEvent[]) {
    const reach = PICKUP_RADIUS + this.rank('beads') * relics.beads.amount
    const near = (thing: Point) =>
      Math.hypot(thing.x - this.player.x, thing.y - this.player.y) <= reach
    // A reliquary opens once, when the hero walks up to it.
    this.reliquaries = this.reliquaries.filter(chest => {
      if (!near(chest)) return true
      this.chests++
      events.push({ type: 'open', at: chest })
      return false
    })
    this.embers = this.embers.filter(ember => {
      const distance = Math.hypot(
        ember.x - this.player.x,
        ember.y - this.player.y,
      )
      if (distance > reach) return true
      this.xp += ember.value
      events.push({ type: 'pickup', at: { x: ember.x, y: ember.y } })
      while (this.xp >= xpGoal(this.level)) {
        this.xp -= xpGoal(this.level)
        this.level++
        this.pending++
        events.push({ type: 'level', level: this.level })
      }
      return false
    })
    // Lamp oil mends one pip and waits on the ground while the armor is whole.
    this.oils = this.oils.filter(drop => {
      if (!near(drop) || this.armor >= this.maxArmor) return true
      this.mend()
      events.push({ type: 'heal', at: drop })
      return false
    })
  }

  // Lays out the next cards the hero has earned and tells whether there are
  // any: reliquaries first, then level-ups.
  private deal() {
    while (this.chests) {
      // Relics the hero may take: a new one while a slot is free, or a held
      // one that can still grow.
      const held = Object.keys(this.relics).length
      const pool = relicIds.filter(id =>
        this.rank(id) ? this.rank(id) < relicRule.maxLevel : held < relicRule.slots,
      )
      const cards: Choice[] = []
      while (cards.length < relicRule.cards && pool.length) {
        const [relic] = pool.splice(Math.floor(this.random() * pool.length), 1)
        cards.push({ kind: 'relic', relic, level: this.rank(relic) + 1 })
      }
      if (cards.length) {
        this.offer = cards
        return true
      }
      // Nothing left to take: the reliquary mends a pip of armor instead.
      this.chests--
      this.mend()
    }
    if (!this.pending) return false
    this.dealSpells()
    return true
  }

  // While a slot is free a few random unlearned spells lead the cards;
  // random upgrades of learned spells fill the rest.
  private dealSpells() {
    const free = this.loadout.length < loadout.slots
    const unknown = spellIds.filter(spell => !this.spells[spell])
    const cards: Choice[] = []
    while (free && unknown.length && cards.length < loadout.learnCards) {
      const [spell] = unknown.splice(Math.floor(this.random() * unknown.length), 1)
      cards.push({ kind: 'learn', spell })
    }
    const pool = upgradeIds.filter(id => this.spells[upgrades[id].spell])
    while (cards.length < loadout.cards && pool.length) {
      const [id] = pool.splice(Math.floor(this.random() * pool.length), 1)
      const { spell } = upgrades[id]
      const stats = this.spells[spell]!
      cards.push({
        kind: 'upgrade',
        spell,
        id,
        from: shownValue(stats, id),
        to: shownValue(upgraded(stats, id), id),
      })
    }
    this.offer = cards
  }

  // Whether the cards on offer come from a reliquary rather than a level-up.
  get openingChest() {
    return this.chests > 0
  }

  // The level the current set of cards belongs to.
  get choiceLevel() {
    return this.level - this.pending + 1
  }

  choose(index: number) {
    const card = this.offer[index]
    if (this.phase !== 'choosing' || !card) return
    if (card.kind === 'relic') {
      this.relics[card.relic] = card.level
      // A new pip of the pilgrim's cloak arrives whole.
      if (card.relic === 'cloak') this.mend()
      this.chests--
    } else {
      if (card.kind === 'learn') {
        this.loadout.push(card.spell)
        this.spells[card.spell] = { ...spells[card.spell] }
      } else {
        this.spells[card.spell] = upgraded(this.spells[card.spell]!, card.id)
      }
      this.pending--
    }
    if (!this.deal()) {
      this.offer = []
      this.phase = 'playing'
    }
  }

  get duchess() {
    return this.foes.find(foe => foe.kind === 'duchess')
  }

  // The crown of vines guards the Duchess while a seal-flower lives.
  get shielded() {
    return this.foes.some(foe => foe.kind === 'seal')
  }

  private bloom() {
    const bed = garden.beds[this.seals++ % garden.beds.length]
    this.foes.push(makeFoe('seal', bed.x, bed.y, 0, foes.seal.health))
  }

  // The dawn bell: the waves end, and the warden carries armor and spells
  // through the gate to face the Duchess.
  private enterGarden(events: BattleEvent[]) {
    this.stage = 'garden'
    this.player = { ...garden.start }
    this.facing = -Math.PI / 2
    this.immunity = 1.5
    this.embers = []
    this.oils = []
    this.reliquaries = []
    this.arrows = []
    this.seeds = []
    this.foes = [makeFoe('duchess', garden.duchess.x, garden.duchess.y, 0, foes.duchess.health)]
    this.bloom()
    events.push({ type: 'garden' })
  }

  private duel(dt: number, events: BattleEvent[]) {
    const lady = this.duchess!
    const { lash } = garden
    if (this.crownOpen > 0) {
      // The lashes hang low while the next flower opens.
      this.crownOpen = Math.max(0, this.crownOpen - dt)
      if (this.crownOpen > 0) return
      this.bloom()
      this.lash = { timer: lash.every, warned: false, facing: 0 }
      events.push({ type: 'crown', open: false })
      return
    }
    this.lash.timer = Math.max(0, this.lash.timer - dt)
    if (this.lash.timer > 0) return
    const turn = Math.atan2(this.player.y - lady.y, this.player.x - lady.x)
    if (!this.lash.warned) {
      this.lash = { timer: lash.windup, warned: true, facing: turn }
      return
    }
    const aside = turn - this.lash.facing
    const arc = (lash.arc * Math.PI) / 180
    const inside =
      Math.abs(Math.atan2(Math.sin(aside), Math.cos(aside))) <= arc &&
      Math.hypot(this.player.x - lady.x, this.player.y - lady.y) < lash.range
    if (inside) this.wound()
    events.push({
      type: 'lash', at: { x: lady.x, y: lady.y }, facing: this.lash.facing, range: lash.range, arc,
    })
    this.lash = { timer: lash.every, warned: false, facing: 0 }
  }

  // Foes a spell may hit: a shielded Duchess cannot be hurt or even aimed at.
  private targets() {
    const guarded = this.shielded
    return this.foes.filter(foe => foe.kind !== 'duchess' || !guarded)
  }

  private strike(foe: Foe, damage: number, events: BattleEvent[]) {
    foe.health -= damage
    if (foe.health > 0) return
    const fallen = { x: foe.x, y: foe.y }
    this.foes.splice(this.foes.indexOf(foe), 1)
    this.kills++
    events.push({ type: 'kill', at: fallen })
    if (foe.kind === 'duchess') {
      this.phase = 'won'
    } else if (foe.kind === 'seal') {
      // The crown opens and any lash already raised is dropped.
      this.crownOpen = garden.window
      this.lash = { timer: garden.lash.every, warned: false, facing: 0 }
      events.push({ type: 'crown', open: true })
    } else {
      this.embers.push({ ...fallen, value: foes[foe.kind].ember })
      if (foe.kind === 'marked') {
        this.reliquaries.push(fallen)
        events.push({ type: 'chest', at: fallen })
      }
      if (this.random() < oil.chance) this.oils.push(fallen)
    }
  }

  // Seeds on the ground burst under the first foe to reach them.
  private burst(stats: Stats, dt: number, events: BattleEvent[]) {
    this.seeds = this.seeds.filter(seed => {
      seed.life -= dt
      const near = (reach: number) =>
        this.targets().filter(foe => Math.hypot(foe.x - seed.x, foe.y - seed.y) < reach)
      if (!near(seedRule.trigger).length) return seed.life > 0
      events.push({ type: 'burst', at: { x: seed.x, y: seed.y }, radius: stats.range })
      for (const foe of near(stats.range)) this.strike(foe, stats.damage, events)
      return false
    })
  }

  // The firefly ring turns all the time and stings whatever it crosses.
  private swarm(stats: Stats, dt: number, events: BattleEvent[]) {
    this.flyTurn += (stats.spin * Math.PI * dt) / 180
    for (let i = 0; i < fireflyRule.count; i++) {
      const turn = this.flyTurn + (i * 2 * Math.PI) / fireflyRule.count
      const x = this.player.x + Math.cos(turn) * stats.range
      const y = this.player.y + Math.sin(turn) * stats.range
      for (const foe of this.targets()) {
        if (foe.stung > 0 || Math.hypot(foe.x - x, foe.y - y) >= fireflyRule.hit) continue
        foe.stung = stats.cooldown
        events.push({ type: 'sting', at: { x: foe.x, y: foe.y } })
        this.strike(foe, stats.damage, events)
      }
    }
  }

  // Each learned spell keeps its own cooldown and casts as soon as it is ready.
  private cast(dt: number, moving: boolean, events: BattleEvent[]) {
    const at = { ...this.player }
    const gift = heroes[this.hero]
    const reach = (foe: Foe) => Math.hypot(foe.x - at.x, foe.y - at.y)
    for (const foe of this.foes) foe.stung = Math.max(0, foe.stung - dt)
    for (const id of this.loadout) {
      const stats = this.stats(id)
      if (id === 'seeds') this.burst(stats, dt, events)
      if (id === 'fireflies') {
        this.swarm(stats, dt, events)
        continue
      }
      this.timers[id] = Math.max(0, this.timers[id] - dt)
      if (this.timers[id] > 0) continue
      const open = this.targets()
      let struck: Foe[] = []
      if (id === 'witchfire') {
        // Witchfire waits for a target instead of wasting the spark.
        let target: Foe | undefined
        let nearest = stats.range
        for (const foe of open) {
          if (reach(foe) < nearest) {
            target = foe
            nearest = reach(foe)
          }
        }
        if (!target) continue
        const hit = target
        struck = [hit]
        events.push({ type: 'shot', from: at, to: { x: hit.x, y: hit.y } })
        // The warden's gift: every few sparks one leaps on to a neighbour.
        this.sparks++
        if (gift.chain && this.sparks % gift.chain === 0) {
          const far = (foe: Foe) => Math.hypot(foe.x - hit.x, foe.y - hit.y)
          const next = open
            .filter(foe => foe !== hit && far(foe) < gift.chainRange)
            .sort((a, b) => far(a) - far(b))[0]
          if (next) {
            struck.push(next)
            events.push({ type: 'chain', from: { x: hit.x, y: hit.y }, to: { x: next.x, y: next.y } })
          }
        }
      } else if (id === 'moonblade') {
        const arc = (stats.arc * Math.PI) / 180
        struck = open.filter(foe => {
          const turn = Math.atan2(foe.y - at.y, foe.x - at.x) - this.facing
          const aside = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))
          return reach(foe) < stats.range && aside <= arc
        })
        events.push({ type: 'slash', at, facing: this.facing, range: stats.range, arc })
      } else if (id === 'toll') {
        struck = open.filter(foe => reach(foe) < stats.range)
        events.push({ type: 'toll', at, radius: stats.range })
        for (const foe of struck) {
          // Rooted things take the blow but stay where they are.
          if (!foes[foe.kind].speed) continue
          const distance = reach(foe) || 1
          const push = stats.knockback * gift.knockback
          foe.x += ((foe.x - at.x) / distance) * push
          foe.y += ((foe.y - at.y) / distance) * push
        }
      } else {
        // Fire seeds fall only on the path of a hero who is moving.
        if (!moving) continue
        this.seeds.push({ ...at, life: seedRule.life })
        events.push({ type: 'sow', at })
      }
      this.timers[id] = stats.cooldown
      for (const foe of struck) this.strike(foe, stats.damage, events)
    }
  }

  step(dt: number, dx: number, dy: number): BattleEvent[] {
    const events: BattleEvent[] = []
    if (this.phase !== 'playing') return events
    this.elapsed += dt
    if (this.stage === 'court' && this.elapsed >= DURATION) {
      this.enterGarden(events)
      return events
    }
    const area = this.stage === 'court' ? court : garden
    const length = Math.hypot(dx, dy)
    const pace = heroes[this.hero].speed * (1 + this.rank('boots') * relics.boots.amount)
    if (length) {
      this.facing = Math.atan2(dy, dx)
      this.player.x = Math.max(
        22,
        Math.min(area.width - 22, this.player.x + (pace * dt * dx) / length),
      )
      this.player.y = Math.max(
        22,
        Math.min(area.height - 22, this.player.y + (pace * dt * dy) / length),
      )
    }
    this.collect(events)
    if (this.deal()) {
      // The run stands still until every earned card is chosen.
      this.phase = 'choosing'
      return events
    }

    // The schedule runs on the clock of the run, so a pause never shifts it
    // and every group enters exactly once.
    if (this.stage === 'garden') this.duel(dt, events)
    else waves.forEach((wave, index) => {
      const due = bursts(wave, this.elapsed)
      if (this.fired[index] < due) {
        this.spawn(wave.kind, wave.count)
        this.fired[index] = due
      }
    })

    this.immunity = Math.max(0, this.immunity - dt)
    for (const foe of this.foes) {
      const vx = this.player.x - foe.x
      const vy = this.player.y - foe.y
      const distance = Math.hypot(vx, vy)
      const toward = distance > 0 ? { x: vx / distance, y: vy / distance } : { x: 0, y: 0 }
      foe.timer = Math.max(0, foe.timer - dt)
      if (foe.kind === 'boar') {
        this.boar(foe, dt, distance, toward)
      } else if (foe.kind === 'archer') {
        this.archer(foe, dt, distance, toward, events)
      } else if (foe.kind === 'moth') {
        this.moth(foe, dt, distance, toward, events)
      } else {
        const travel = Math.min(distance, dt * foe.speed)
        foe.x += toward.x * travel
        foe.y += toward.y * travel
      }
      const remaining = Math.hypot(this.player.x - foe.x, this.player.y - foe.y)
      if (remaining < foes[foe.kind].reach) this.wound()
    }
    this.arrows = this.arrows.filter(arrow => {
      arrow.x += arrow.vx * dt
      arrow.y += arrow.vy * dt
      arrow.life -= dt
      const struck = Math.hypot(arrow.x - this.player.x, arrow.y - this.player.y) < archerVolley.hit
      if (struck) this.wound()
      return !struck && arrow.life > 0
    })
    if ((this.phase as Phase) === 'lost') return events

    this.cast(dt, length > 0, events)
    return events
  }
}
