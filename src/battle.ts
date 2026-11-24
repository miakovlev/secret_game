import {
  archerVolley, blessings, boarCharge, bossIds, bossRule, court, difficulties, duelRule, fireflyRule, foes, heroes, leveling, loadout, mothHeal, oil, relicIds,
  relicRule,
  relics, seedRule, shownValue, spellIds, spells, upgraded, upgradeIds, upgrades, waves,
} from './content.ts'
import type { BossId, FoeKind, HeroId, RelicId, SpellId, Stats, UpgradeId, Wave } from './content.ts'

// Positions and speeds are expressed in arena pixels and seconds.
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
  | { type: 'boss'; boss: BossId }
  | { type: 'felled'; boss: BossId; at: Point }
  | { type: 'summon'; at: Point }
  | { type: 'bloom'; at: Point; radius: number }
  | { type: 'open'; at: Point }
  | { type: 'arrow'; at: Point }
  | ({ type: 'mend' } & Shot)
  | ({ type: 'chain' } & Shot)
  | { type: 'sow'; at: Point }
  | { type: 'burst'; at: Point; radius: number }
  | { type: 'sting'; at: Point }
  | { type: 'duel' }
  | { type: 'volley'; at: Point }
  | { type: 'erupt'; at: Point; radius: number }
  | { type: 'crown'; open: boolean }
  | { type: 'phase'; phase: number }
  | { type: 'lash'; at: Point; facing: number; range: number; arc: number }
  | { type: 'level'; level: number }
// The run has two stages in the same court: the waves, then the duel.
export type Stage = 'court' | 'duel'
export type Phase = 'ready' | 'playing' | 'paused' | 'choosing' | 'won' | 'lost'
// One card: a new spell, the shown value of a spell stat before and after,
// or a relic at the level it would reach.
export type Choice =
  | { kind: 'learn'; spell: SpellId }
  | { kind: 'upgrade'; spell: SpellId; id: UpgradeId; from: number; to: number }
  | { kind: 'relic'; relic: RelicId; level: number }
  | { kind: 'bless'; spell: SpellId }
// A blessed blade swing that lingers in the air.
export type Trail = { at: Point; facing: number; range: number; arc: number; cuts: number; beat: number }

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
  // Bosses: how many have come, seconds counted toward the next one (the count
  // stands still while a boss is in the court), and how many have been felled.
  bossIndex = 0
  calm = 0
  felled = 0
  // Blessings earned but not yet chosen, and the spells already blessed.
  boons = 0
  blessed: Partial<Record<SpellId, boolean>> = {}
  trails: Trail[] = []
  echoes: number[] = []
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
  armor: number
  kills = 0
  elapsed = 0
  immunity = 0
  // The duel. `crownOpen` is how long the Duchess stays open to blows; `lash`
  // counts down to her next strike, or through its warning once `warned`.
  crownOpen = 0
  seals = 0
  // The duel has a phase for each threshold of her health passed, from 1.
  duelPhase = 1
  // Each of her attacks counts down to its warning, then through it.
  lash = { timer: duelRule.lash.every, warned: false, facing: 0 }
  volley = { timer: duelRule.volley.every, warned: false, facing: 0 }
  // Seconds until the next briar patch and the next summons; packs called so far.
  patchIn = duelRule.patch.every
  summonIn = duelRule.summon.every
  summons = 0
  // Briar patches: `warn` counts down to the eruption, then `life` to the end.
  patches: (Point & { warn: number; life: number })[] = []
  // How many groups each wave of the schedule has already sent in.
  private fired = waves.map(() => 0)

  private readonly random: () => number

  readonly hero: HeroId

  // 1 to 3; see the difficulties table.
  readonly difficulty: number
  // The wave schedule as this difficulty plays it.
  private readonly schedule: Wave[]

  constructor(random: () => number = Math.random, hero: HeroId = 'warden', difficulty = 1, variant = false) {
    this.random = random
    this.hero = hero
    this.difficulty = difficulty
    const first = heroes[hero].spell
    this.loadout = [first]
    this.spells = { [first]: { ...spells[first] } }
    // A hero who has won before may set out with their own relic.
    if (variant) this.relics[heroes[hero].variant] = 1
    this.armor = this.maxArmor
    const { early } = difficulties[difficulty - 1]
    this.schedule = waves.map(wave => ({ ...wave, from: Math.max(0, wave.from - early) }))
  }

  // The health a foe of this kind comes in with right now.
  private vigor(kind: FoeKind) {
    const stats = foes[kind]
    return (stats.health + this.elapsed * stats.healthGrowth) * difficulties[this.difficulty - 1].toughness
  }

  // Top-left corner of the visible part of the court: centred on the warden
  // and stopped by the walls.
  camera(): Point {
    const { width, height, view } = court
    return {
      x: Math.max(0, Math.min(width - view.width, this.player.x - view.width / 2)),
      y: Math.max(0, Math.min(height - view.height, this.player.y - view.height / 2)),
    }
  }

  // A group steps in side by side just beyond one edge of the visible area,
  // never inside it.
  // `flank` sends the group in from the side opposite to the given edge.
  private spawn(kind: FoeKind, count: number, flank?: number) {
    const edge = flank === undefined ? Math.floor(this.random() * 4) : flank ^ 1
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
        this.vigor(kind),
      )
      // Leave room to react when the warden is patrolling an entry point.
      if (Math.hypot(foe.x - this.player.x, foe.y - this.player.y) < 150) {
        if (edge < 2) foe.x = 2 * view.x + width - foe.x
        else foe.y = 2 * view.y + height - foe.y
      }
      this.foes.push(foe)
    }
    return edge
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
      if (other.kind !== 'moth' && !this.isBoss(other) && near && lost > worst) {
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
    while (this.boons) {
      const cards: Choice[] = this.loadout
        .filter(spell => !this.blessed[spell])
        .map(spell => ({ kind: 'bless', spell }))
      if (cards.length) {
        this.offer = cards
        return true
      }
      this.boons--
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

  // Whether the cards on offer are the blessing for a felled boss.
  get blessing() {
    return !this.chests && this.boons > 0
  }

  get swarmSize() {
    return fireflyRule.count * (this.blessed.fireflies ? blessings.fireflies.swarms : 1)
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
    } else if (card.kind === 'bless') {
      this.blessed[card.spell] = true
      this.boons--
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
    const bed = duelRule.beds[this.seals++ % duelRule.beds.length]
    this.foes.push(makeFoe('seal', bed.x, bed.y, 0, this.vigor('seal')))
  }

  // How much faster she attacks in the current phase.
  private get tempo() {
    return duelRule.tempo ** (this.duelPhase - 1)
  }

  private rest() {
    const { lash, volley, patch, summon } = duelRule
    this.lash = { timer: lash.every * this.tempo, warned: false, facing: 0 }
    this.volley = { timer: volley.every * this.tempo, warned: false, facing: 0 }
    this.patchIn = patch.every * this.tempo
    this.summonIn = Math.min(this.summonIn, summon.every * this.tempo)
  }

  // The dawn bell: the waves stop, and the Duchess walks into the court
  // through the north gate. Everything else stays as it is.
  private beginDuel(events: BattleEvent[]) {
    this.stage = 'duel'
    this.foes.push(makeFoe('duchess', court.gate.x, court.gate.y + 70, duelRule.speed, this.vigor('duchess')))
    this.bloom()
    this.rest()
    events.push({ type: 'duel' })
  }

  private duel(dt: number, events: BattleEvent[]) {
    const lady = this.duchess!
    const { lash, volley, patch, summon } = duelRule
    const near = (spot: Point, reach: number) =>
      Math.hypot(this.player.x - spot.x, this.player.y - spot.y) < reach
    // Briar patches erupt and linger whatever else she is doing.
    this.patches = this.patches.filter(spot => {
      if (spot.warn > 0) {
        spot.warn -= dt
        if (spot.warn > 0) return true
        events.push({ type: 'erupt', at: { x: spot.x, y: spot.y }, radius: patch.radius })
      } else {
        spot.life -= dt
      }
      if (near(spot, patch.radius)) this.wound()
      return spot.life > 0
    })
    if (this.crownOpen > 0) {
      // She stands still with her lashes low while the next flower opens.
      lady.speed = 0
      this.crownOpen = Math.max(0, this.crownOpen - dt)
      if (this.crownOpen > 0) return
      this.bloom()
      this.rest()
      events.push({ type: 'crown', open: false })
      return
    }
    lady.speed = duelRule.speed
    const turn = Math.atan2(this.player.y - lady.y, this.player.x - lady.x)

    this.lash.timer = Math.max(0, this.lash.timer - dt)
    if (this.lash.timer === 0) {
      if (!this.lash.warned) {
        this.lash = { timer: lash.windup, warned: true, facing: turn }
      } else {
        const aside = turn - this.lash.facing
        const arc = (lash.arc * Math.PI) / 180
        if (Math.abs(Math.atan2(Math.sin(aside), Math.cos(aside))) <= arc && near(lady, lash.range)) this.wound()
        events.push({
          type: 'lash', at: { x: lady.x, y: lady.y }, facing: this.lash.facing, range: lash.range, arc,
        })
        this.lash = { timer: lash.every * this.tempo, warned: false, facing: 0 }
      }
    }

    this.volley.timer = Math.max(0, this.volley.timer - dt)
    if (this.volley.timer === 0) {
      if (!this.volley.warned) {
        this.volley = { timer: volley.windup, warned: true, facing: turn }
      } else {
        // A fan of thorns along the lines she marked.
        for (let i = 0; i < volley.thorns; i++) {
          const aim = this.volley.facing +
            (((i / (volley.thorns - 1)) * 2 - 1) * volley.spread * Math.PI) / 180
          this.arrows.push({
            x: lady.x,
            y: lady.y,
            vx: Math.cos(aim) * volley.speed,
            vy: Math.sin(aim) * volley.speed,
            life: volley.reach / volley.speed,
          })
        }
        events.push({ type: 'volley', at: { x: lady.x, y: lady.y } })
        this.volley = { timer: volley.every * this.tempo, warned: false, facing: 0 }
      }
    }

    this.patchIn -= dt
    if (this.patchIn <= 0) {
      this.patches.push({ x: this.player.x, y: this.player.y, warn: patch.windup, life: patch.life })
      this.patchIn = patch.every * this.tempo
    }

    this.summonIn -= dt
    if (this.summonIn <= 0) {
      this.summons++
      this.spawn('briarling', summon.pack)
      // From the second phase she also calls a boar or a pair of archers, in turn.
      if (this.duelPhase > 1) {
        if (this.summons % 2) this.spawn('boar', 1)
        else this.spawn('archer', 2)
      }
      this.summonIn = summon.every * this.tempo
      events.push({ type: 'summon', at: { x: lady.x, y: lady.y } })
    }
  }

  // Foes a spell may hit: a shielded Duchess cannot be hurt or even aimed at.
  private targets() {
    const guarded = this.shielded
    return this.foes.filter(foe => foe.kind !== 'duchess' || !guarded)
  }

  private isBoss(foe: Foe) {
    return (bossIds as readonly string[]).includes(foe.kind)
  }

  // The boss now in the court, if any.
  get boss() {
    return this.foes.find(foe => this.isBoss(foe))
  }

  // The boss that comes next, and the seconds left until then. Undefined once
  // the last one has come.
  get nextBoss(): { boss: BossId; inSeconds: number } | undefined {
    const boss = bossIds[this.bossIndex]
    return boss && { boss, inSeconds: Math.max(0, bossRule.every - this.calm) }
  }

  // Counts toward the next boss while the court is free of one, and brings it in.
  private trials(dt: number, events: BattleEvent[]) {
    if (this.boss || this.bossIndex >= bossIds.length) return
    this.calm += dt
    if (this.calm < bossRule.every) return
    this.calm = 0
    const boss = bossIds[this.bossIndex++]
    events.push({ type: 'boss', boss })
    // The Duchess ends the waves; the others walk in on top of them.
    if (boss === 'duchess') this.beginDuel(events)
    else this.spawn(boss, 1)
  }

  private strike(foe: Foe, damage: number, events: BattleEvent[]) {
    // One cast can name the same foe twice (a spark blooms on it, then leaps
    // to it); a foe already felled takes no second blow.
    if (!this.foes.includes(foe)) return
    foe.health -= damage
    // Each threshold of her health passed begins a new phase, once.
    while (
      foe.kind === 'duchess' && foe.health > 0 &&
      this.duelPhase <= duelRule.phases.length &&
      foe.health <= foe.full * duelRule.phases[this.duelPhase - 1]
    ) {
      this.duelPhase++
      events.push({ type: 'phase', phase: this.duelPhase })
    }
    if (foe.health > 0) return
    const fallen = { x: foe.x, y: foe.y }
    this.foes.splice(this.foes.indexOf(foe), 1)
    this.kills++
    events.push({ type: 'kill', at: fallen })
    if (foe.kind === 'duchess') {
      this.felled++
      events.push({ type: 'felled', boss: 'duchess', at: fallen })
      this.phase = 'won'
    } else if (foe.kind === 'seal') {
      // The crown opens and any lash already raised is dropped.
      this.crownOpen = duelRule.window
      this.rest()
      events.push({ type: 'crown', open: true })
    } else {
      this.embers.push({ ...fallen, value: foes[foe.kind].ember })
      if (this.isBoss(foe)) {
        // A felled boss blesses one learned spell; with every learned spell
        // already blessed it leaves a reliquary instead.
        this.felled++
        events.push({ type: 'felled', boss: foe.kind as BossId, at: fallen })
        const waiting = this.loadout.filter(spell => !this.blessed[spell]).length
        if (waiting > this.boons) {
          this.boons++
        } else {
          this.reliquaries.push(fallen)
          events.push({ type: 'chest', at: fallen })
        }
      }
      if (foe.kind === 'marked') {
        this.reliquaries.push(fallen)
        events.push({ type: 'chest', at: fallen })
      }
      if (this.random() < oil.chance) this.oils.push(fallen)
    }
  }

  // Seeds on the ground burst under the first foe to reach them. A blessed
  // burst wakes every seed near it, and those wake their own neighbours.
  private burst(stats: Stats, dt: number, events: BattleEvent[]) {
    const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
    for (const seed of this.seeds) seed.life -= dt
    // A walking foe must step on a seed; a rooted one sets it off from anywhere in the blast.
    const woken = this.seeds.filter(seed =>
      this.targets().some(foe =>
        gap(foe, seed) < (foes[foe.kind].speed ? seedRule.trigger : stats.range),
      ),
    )
    for (const seed of woken) {
      events.push({ type: 'burst', at: { x: seed.x, y: seed.y }, radius: stats.range })
      for (const foe of this.targets()) {
        if (gap(foe, seed) < stats.range) this.strike(foe, stats.damage, events)
      }
      if (!this.blessed.seeds) continue
      for (const other of this.seeds) {
        if (!woken.includes(other) && gap(other, seed) < blessings.seeds.radius) woken.push(other)
      }
    }
    this.seeds = this.seeds.filter(seed => seed.life > 0 && !woken.includes(seed))
  }

  // The firefly ring turns all the time and stings whatever it crosses.
  private swarm(stats: Stats, dt: number, events: BattleEvent[]) {
    this.flyTurn += (stats.spin * Math.PI * dt) / 180
    for (let i = 0; i < this.swarmSize; i++) {
      const turn = this.flyTurn + (i * 2 * Math.PI) / this.swarmSize
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
    const inSwing = (foe: Foe, from: Point, facing: number, range: number, arc: number) => {
      const turn = Math.atan2(foe.y - from.y, foe.x - from.x) - facing
      const aside = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))
      return Math.hypot(foe.x - from.x, foe.y - from.y) < range && aside <= arc
    }
    // The bell stroke itself, shared by the toll and its blessed echo.
    const toll = (stats: Stats, share: number) => {
      const struck = this.targets().filter(foe => reach(foe) < stats.range)
      events.push({ type: 'toll', at, radius: stats.range })
      for (const foe of struck) {
        // Rooted and heavy things take the blow but stay where they are.
        if (!foes[foe.kind].speed || this.isBoss(foe)) continue
        const distance = reach(foe) || 1
        const push = stats.knockback * gift.knockback
        foe.x += ((foe.x - at.x) / distance) * push
        foe.y += ((foe.y - at.y) / distance) * push
      }
      for (const foe of struck) this.strike(foe, stats.damage * share, events)
    }
    for (const foe of this.foes) foe.stung = Math.max(0, foe.stung - dt)
    // Blessed leftovers of earlier casts: silver trails and bell echoes.
    if (this.spells.moonblade) {
      const { beat, share } = blessings.moonblade
      const { damage } = this.stats('moonblade')
      this.trails = this.trails.filter(trail => {
        trail.beat -= dt
        if (trail.beat > 0) return true
        trail.beat += beat
        trail.cuts--
        for (const foe of this.targets()) {
          if (inSwing(foe, trail.at, trail.facing, trail.range, trail.arc)) this.strike(foe, damage * share, events)
        }
        return trail.cuts > 0
      })
    }
    if (this.spells.toll) {
      this.echoes = this.echoes.map(left => left - dt)
      for (const left of this.echoes) if (left <= 0) toll(this.stats('toll'), blessings.toll.share)
      this.echoes = this.echoes.filter(left => left > 0)
    }
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
        if (this.blessed.witchfire) {
          // Blessed: the spark blooms and scorches the neighbours.
          const { radius, share } = blessings.witchfire
          events.push({ type: 'bloom', at: { x: hit.x, y: hit.y }, radius })
          for (const foe of open) {
            if (foe !== hit && Math.hypot(foe.x - hit.x, foe.y - hit.y) < radius) {
              this.strike(foe, stats.damage * share, events)
            }
          }
        }
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
        struck = open.filter(foe => inSwing(foe, at, this.facing, stats.range, arc))
        events.push({ type: 'slash', at, facing: this.facing, range: stats.range, arc })
        if (this.blessed.moonblade) {
          const { life, beat } = blessings.moonblade
          this.trails.push({ at, facing: this.facing, range: stats.range, arc, cuts: Math.round(life / beat), beat })
        }
      } else if (id === 'toll') {
        toll(stats, 1)
        if (this.blessed.toll) this.echoes.push(blessings.toll.delay)
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
    if (this.stage === 'court') this.trials(dt, events)
    const area = court
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
    if (this.stage === 'duel') this.duel(dt, events)
    else this.schedule.forEach((wave, index) => {
      const due = bursts(wave, this.elapsed)
      if (this.fired[index] < due) {
        const edge = this.spawn(wave.kind, wave.count)
        const { flankEvery } = difficulties[this.difficulty - 1]
        if (flankEvery && due % flankEvery === 0) this.spawn(wave.kind, wave.count, edge)
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
