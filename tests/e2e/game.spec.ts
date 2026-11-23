import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// A new player always starts in English, including on a Russian system.
test.use({ locale: 'ru-RU' })

async function startPage(page: Page) {
  await page.goto('/')
  await expect(page.locator('#action')).toBeEnabled()
}

async function select(page: Page, locale: 'en' | 'ru') {
  const button = page.getByRole('button', { name: locale === 'en' ? 'English' : 'Русский', exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
}

test('starts in English, translates the console, and remembers either choice', async ({ page }) => {
  await startPage(page)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('Court of Briars · Chapel Court')
  await expect(page.locator('footer')).toContainText('Dawn Warden')
  await expect(page.locator('footer')).toContainText('Briarling')
  await expect(page.locator('footer')).toContainText('Witchfire')
  await expect(page.getByRole('button', { name: 'Start run' })).toBeEnabled()
  await expect(page.getByRole('img', { name: 'Armor 5 of 5' })).toBeVisible()

  await select(page, 'ru')
  await expect(page).toHaveTitle('Шипов двор · У часовни')
  await expect(page.getByRole('group', { name: 'Язык интерфейса' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'До первых лучей' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Игровая консоль' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Двор часовни, вид сверху' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Броня 5 из 5' })).toBeVisible()
  await expect(page.locator('footer')).toContainText('Дозорная')
  await expect(page.locator('footer')).toContainText('Корневик')
  await expect(page.locator('footer')).toContainText('Ведьмин огонь')
  await expect(page.locator('.keys')).toContainText('или стрелки')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Начать забег' })).toBeEnabled()
  await select(page, 'en')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start run' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
})

test('storage denied still permits switching and playing', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    get() { throw new DOMException('Storage blocked', 'SecurityError') },
  }))
  await startPage(page)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await select(page, 'ru')
  await page.getByRole('button', { name: 'Начать забег' }).click()
  await expect(page.locator('#status')).toHaveText('НОЧНОЙ ДОЗОР')
})

// Starts the page with the given save already in storage, unless one is there:
// a reload must find what the game itself has stored.
async function seedSave(page: Page, save: object) {
  await page.addInitScript((json: string) => {
    if (!localStorage.getItem('secret_game.save')) localStorage.setItem('secret_game.save', json)
  }, JSON.stringify(save))
}

const everything = {
  version: 1, difficulty: 3, heroes: ['warden', 'duelist', 'ringer'], variants: ['warden', 'duelist', 'ringer'],
  records: [{ wins: 1, best: 700, kills: 200 }, { wins: 1, best: 720, kills: 200 }, { wins: 0, best: null, kills: 0 }],
  volume: 0.6, tips: ['move', 'ember', 'cards', 'boar', 'archer', 'chest'],
}

async function frozenClock(page: Page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await startPage(page)
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'))
}

test('switching during a run or pause preserves the HUD and the simulation', async ({ page }) => {
  await frozenClock(page)
  await page.getByRole('button', { name: 'Start run' }).click()
  await page.keyboard.down('ArrowUp')
  await page.clock.runFor(1300)
  await page.keyboard.up('ArrowUp')
  const time = await page.locator('#clock').innerText()
  expect(time).not.toBe('09:00')
  await select(page, 'ru')
  await expect(page.locator('#clock')).toHaveText(time)
  await expect(page.locator('#panel')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeVisible()
  await select(page, 'en')
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible()
  await page.clock.runFor(2000)
  await expect(page.locator('#clock')).toHaveText(time)
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.clock.runFor(1500)
  await expect(page.locator('#clock')).not.toHaveText(time)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#panel')).toBeHidden()
  await page.getByRole('button', { name: /Esc.*Pause/ }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
})

test('walking to the embers of banished briarlings earns a level', async ({ page }) => {
  await frozenClock(page)
  // Every briarling enters from the same spot, so the embers pile up up-left of the warden.
  await page.evaluate(() => { Math.random = () => 0.05 })
  await page.getByRole('button', { name: 'Start run' }).click()
  await page.clock.runFor(14_000)
  expect(Number(await page.locator('#kills').innerText())).toBeGreaterThan(4)
  await expect(page.locator('#level')).toHaveText('1')
  await expect(page.getByRole('progressbar', { name: 'Experience 0 of 5' })).toBeVisible()

  await page.keyboard.down('ArrowLeft')
  await page.clock.runFor(620)
  await page.keyboard.up('ArrowLeft')
  await page.keyboard.down('ArrowUp')
  await page.clock.runFor(270)
  await page.keyboard.up('ArrowUp')
  await expect(page.locator('#level')).toHaveText(/^[2-9]$/)
  await expect(page.getByRole('progressbar', { name: /^Experience \d+ of [7-9]/ })).toBeVisible()

  // The level-up stops the run and offers both new spells and a witchfire upgrade.
  const cards = page.locator('#choices button')
  const slots = page.locator('#slots [role=listitem]')
  await expect(page.getByRole('heading', { name: 'Level 2' })).toBeVisible()
  await expect(page.locator('#status')).toHaveText('LEVEL UP')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toContainText('New spell')
  await expect(cards.nth(0)).toContainText('Moon Blade')
  await expect(cards.nth(1)).toContainText('Funeral Toll')
  await expect(cards.nth(2)).toContainText('Witchfire')
  await expect(cards.nth(2)).toContainText('Range 145 → 175')
  await expect(slots).toHaveText(['Witchfire', '—', '—'])
  const time = await page.locator('#clock').innerText()
  const banished = await page.locator('#kills').innerText()
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.clock.runFor(3000)
  await expect(cards).toHaveCount(3)
  await expect(page.locator('#panel')).toBeHidden()
  await expect(page.locator('#clock')).toHaveText(time)
  await expect(page.locator('#kills')).toHaveText(banished)
  await select(page, 'ru')
  await expect(page.getByRole('heading', { name: 'Уровень 2' })).toBeVisible()
  await expect(cards.nth(1)).toContainText('Новое заклинание')
  await expect(cards.nth(2)).toContainText('Дальность 145 → 175')
  await expect(page.getByRole('progressbar', { name: /^Опыт \d+ из [7-9]/ })).toBeVisible()

  // One click learns the spell once and the run goes on with it in the second slot.
  await cards.nth(1).click()
  await expect(page.locator('#cards')).toBeHidden()
  await expect(page.locator('#status')).toHaveText('НОЧНОЙ ДОЗОР')
  await expect(slots).toHaveText(['Ведьмин огонь', 'Погребальный звон', '—'])
  await expect(page.locator('#slots').getByRole('listitem', { name: 'Пустая ячейка' })).toHaveCount(1)
  await page.clock.runFor(1500)
  await expect(page.locator('#clock')).not.toHaveText(time)
  // Keep circling the spot where briarlings fall until the next ember fills the bar.
  for (let lap = 0; lap < 80 && await page.locator('#cards').isHidden(); lap++) {
    const key = lap % 2 ? 'ArrowRight' : 'ArrowLeft'
    await page.keyboard.down(key)
    await page.clock.runFor(500)
    await page.keyboard.up(key)
  }
  // The learned spell is no longer offered; its place goes to another upgrade.
  await expect(page.getByRole('heading', { name: 'Уровень 3' })).toBeVisible()
  await expect(cards.nth(0)).toContainText('Лунный клинок')
  await expect(cards.nth(1)).toContainText('Огненные семена')
  await expect(cards.nth(1)).toContainText('Новое заклинание')
  await expect(cards.nth(2)).toContainText('Дальность 145 → 175')
  await page.keyboard.press('Digit1')
  await expect(page.locator('#cards')).toBeHidden()
  await expect(slots).toHaveText(['Ведьмин огонь', 'Погребальный звон', 'Лунный клинок'])
})

// Plays a whole run in small slices. Whenever cards are offered it learns a new spell,
// or else takes a damage or rate upgrade. A patrolling warden walks a wide loop around
// the court, which keeps the briarlings behind. Stops after `limit` milliseconds of play.
async function playRun(page: Page, patrol: boolean, limit: number) {
  let held: string | undefined
  let picks = 0
  for (let ms = 0; ms < limit; ms += 100) {
    const [choosing, over] = await page.evaluate(() => [
      !document.querySelector<HTMLElement>('#cards')!.hidden,
      !document.querySelector<HTMLElement>('#panel')!.hidden,
    ])
    if (over) break
    if (choosing) {
      if (held) await page.keyboard.up(held)
      held = undefined
      const texts = await page.locator('#choices button').allInnerTexts()
      const wanted = ['Funeral Toll', 'Moon Blade', picks++ % 2 ? 'Quicker flame' : 'Hotter fire']
      const found = wanted.map(text => texts.findIndex(card => card.includes(text))).find(index => index >= 0)
      await page.locator('#choices button').nth(found ?? 0).click()
    }
    const beat = ms % 12_000
    const key = !patrol ? undefined
      : beat < 4500 ? 'ArrowLeft' : beat < 6000 ? 'ArrowDown' : beat < 10_500 ? 'ArrowRight' : 'ArrowUp'
    if (key !== held) {
      if (held) await page.keyboard.up(held)
      if (key) await page.keyboard.down(key)
      held = key
    }
    await page.clock.runFor(100)
  }
  if (held) await page.keyboard.up(held)
  return picks
}

test('the hero picked on the title screen sets the starting spell, and can be changed between runs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await seedSave(page, everything)
  await frozenClock(page)
  await expect(page.getByRole('radiogroup', { name: 'Who keeps the watch' })).toBeVisible()
  const heroes = page.locator('#heroes').getByRole('radio')
  const slots = page.locator('#slots [role=listitem]')
  const hero = () => page.evaluate(() => (window as any).arena.battle.hero)
  await expect(heroes).toHaveCount(3)
  await expect(heroes.nth(0)).toContainText('Dawn Warden')
  await expect(heroes.nth(0)).toContainText('Witchfire')
  await expect(heroes.nth(0)).toHaveAttribute('aria-checked', 'true')
  await expect(slots).toHaveText(['Witchfire', '—', '—'])

  // Picking the duelist changes the title screen straight away.
  await heroes.nth(1).click()
  await expect(heroes.nth(1)).toHaveAttribute('aria-checked', 'true')
  await expect(heroes.nth(0)).toHaveAttribute('aria-checked', 'false')
  await expect(heroes.nth(1)).toContainText('Moves faster')
  await expect(slots).toHaveText(['Moon Blade', '—', '—'])
  await expect(page.locator('#hero-name')).toHaveText('Duelist')
  await select(page, 'ru')
  await expect(page.getByRole('radiogroup', { name: 'Кто несёт дозор' })).toBeVisible()
  await expect(heroes.nth(1)).toContainText('Дуэлянт')
  await expect(heroes.nth(1)).toContainText('Лунный клинок')
  await expect(heroes.nth(1)).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('#hero-name')).toHaveText('Дуэлянт')
  await select(page, 'en')

  // The duelist starts with the blade and covers more ground than the warden would.
  await page.getByRole('button', { name: 'Start run' }).click()
  expect(await hero()).toBe('duelist')
  const x = () => page.evaluate(() => (window as any).arena.battle.player.x)
  const from = await x()
  await page.keyboard.down('ArrowRight')
  await page.clock.runFor(1000)
  await page.keyboard.up('ArrowRight')
  expect((await x()) - from).toBeGreaterThan(175)
  await expect(slots).toHaveText(['Moon Blade', '—', '—'])

  // The picker is hidden on pause and comes back on the result screen.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await expect(page.locator('#heroes')).toBeHidden()
  await page.keyboard.press('Escape')
  await page.evaluate(() => { (window as any).arena.battle.armor = 1 })
  await playRun(page, false, 150_000)
  await expect(page.locator('#title')).toHaveText('The briars prevail')
  await expect(page.locator('#message')).toContainText('Spells: Moon Blade')
  await expect(page.locator('#message')).toContainText('Hero: Duelist.')
  await expect(page.locator('#heroes')).toBeVisible()

  // Picking another hero there keeps the report and applies to the next run only.
  await heroes.nth(2).click()
  await expect(heroes.nth(2)).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('#message')).toContainText('Hero: Duelist.')
  expect(await hero()).toBe('duelist')
  await page.getByRole('button', { name: 'Play again' }).click()
  expect(await hero()).toBe('ringer')
  await expect(slots).toHaveText(['Funeral Toll', '—', '—'])
  await expect(page.locator('#hero-name')).toHaveText('Bellringer')
  expect(await page.evaluate(() => (window as any).arena.battle.sparks)).toBe(0)
  expect(errors).toEqual([])
})

test('a reliquary offers relics that fill their own slots, level up and last the whole run', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await frozenClock(page)
  await page.evaluate(() => { Math.random = () => 0.05 })
  await page.getByRole('button', { name: 'Start run' }).click()
  const relics = page.locator('#relics [role=listitem]')
  const cards = page.locator('#choices button')
  await expect(relics).toHaveText(['—', '—', '—'])
  // A marked briarling has just fallen at the warden's feet.
  const dropChest = () => page.evaluate(() => {
    const { battle } = (window as any).arena
    battle.reliquaries.push({ ...battle.player })
  })
  await dropChest()
  await page.clock.runFor(200)
  await expect(page.getByRole('heading', { name: 'Reliquary' })).toBeVisible()
  await expect(page.locator('#cards-label')).toHaveText('A RELIQUARY OPENS')
  await expect(page.locator('#status')).toHaveText('A RELIQUARY OPENS')
  await expect(page.locator('#cards-message')).toContainText('Take one relic')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toContainText('New relic')
  await expect(cards.nth(0)).toContainText('Courier’s Shoes')
  await expect(cards.nth(1)).toContainText('Amber Beads')
  await expect(cards.nth(2)).toContainText('Pilgrim’s Cloak')
  await expect(cards.nth(2)).toContainText('One more pip of armor.')
  await select(page, 'ru')
  await expect(page.getByRole('heading', { name: 'Реликварий' })).toBeVisible()
  await expect(cards.nth(2)).toContainText('Плащ паломника')
  await expect(cards.nth(2)).toContainText('Новая реликвия')
  await select(page, 'en')

  // The cloak adds a whole pip and takes the first relic slot; spells keep theirs.
  await cards.nth(2).click()
  await expect(page.locator('#cards')).toBeHidden()
  await expect(relics).toHaveText(['Pilgrim’s Cloak 1', '—', '—'])
  await expect(page.getByRole('img', { name: 'Armor 6 of 6' })).toBeVisible()
  await expect(page.locator('#armor i')).toHaveCount(6)
  await expect(page.locator('#slots [role=listitem]')).toHaveText(['Witchfire', '—', '—'])

  // The same relic from a second reliquary raises its level.
  await dropChest()
  await page.clock.runFor(200)
  await expect(cards.nth(2)).toContainText('Pilgrim’s Cloak')
  await expect(cards.nth(2)).toContainText('Level 2')
  await page.keyboard.press('Digit3')
  await expect(relics).toHaveText(['Pilgrim’s Cloak 2', '—', '—'])
  await expect(page.getByRole('img', { name: 'Armor 7 of 7' })).toBeVisible()
  await dropChest()
  await page.clock.runFor(200)
  await cards.nth(0).click()
  await expect(relics).toHaveText(['Pilgrim’s Cloak 2', 'Courier’s Shoes 1', '—'])

  // The relics are still there when the run ends, and gone when the next one starts.
  await page.evaluate(() => { (window as any).arena.battle.armor = 1 })
  await playRun(page, false, 150_000)
  await expect(page.locator('#title')).toHaveText('The briars prevail')
  await expect(page.locator('#message')).toContainText('Relics: Pilgrim’s Cloak 2, Courier’s Shoes 1.')
  await select(page, 'ru')
  await expect(page.locator('#message')).toContainText('Реликвии: Плащ паломника 2, Башмачки гонца 1.')
  await expect(relics).toHaveText(['Плащ паломника 2', 'Башмачки гонца 1', '—'])
  await page.getByRole('button', { name: 'Ещё раз' }).click()
  await expect(relics).toHaveText(['—', '—', '—'])
  await expect(page.getByRole('img', { name: 'Броня 5 из 5' })).toBeVisible()
  await expect(page.locator('#armor i')).toHaveCount(5)
  expect(errors).toEqual([])
})

test('ringing the bell on the grave calls the Gardener, and felling him blesses one spell', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  // A seasoned player: the first-run tips are behind them.
  await seedSave(page, { ...everything, heroes: ['warden'], variants: [] })
  await frozenClock(page)
  await page.evaluate(() => { Math.random = () => 0.05 })
  await page.getByRole('button', { name: 'Start run' }).click()
  const hint = page.locator('#hint')
  const state = () => page.evaluate(() => {
    const { battle } = (window as any).arena
    const lord = battle.foes.find((foe: { kind: string }) => foe.kind === 'gardener')
    return { trial: battle.trial, mode: lord?.mode, elapsed: battle.elapsed }
  })
  await expect(hint).toBeHidden()
  // The fourth minute: the bell wakes, and the hint says the trial is a choice.
  await page.evaluate(() => {
    const { battle } = (window as any).arena
    battle.elapsed = 239.8
    battle.armor = 1e6
  })
  await page.clock.runFor(500)
  await expect(hint).toHaveText(/bell on the Gardener’s grave is awake.*or walk on/)
  expect((await state()).trial).toBe('ready')
  await select(page, 'ru')
  await expect(hint).toHaveText(/На могиле Садовника проснулся колокольчик/)
  await select(page, 'en')

  // Standing beside the grave long enough calls him out; the waves go on.
  await page.evaluate(() => {
    const { battle } = (window as any).arena
    // The grave stands at (1780, 860) in the court.
    battle.player = { x: 1800, y: 860 }
  })
  await page.clock.runFor(1000)
  expect((await state()).trial).toBe('ready')
  await page.clock.runFor(900)
  expect(await state()).toMatchObject({ trial: 'fighting', mode: 'summon' })
  await expect(hint).toHaveText('Strike the Gardener while the white flower on his chest is open.')
  const before = (await state()).elapsed
  await page.clock.runFor(1000)
  expect((await state()).elapsed).toBeGreaterThan(before)
  await expect(page.locator('footer')).toContainText('The Gardener')

  // He falls once his flower is open; the blessing is offered for the one spell known.
  for (let slice = 0; slice < 40 && (await state()).mode !== 'open'; slice++) await page.clock.runFor(200)
  await page.evaluate(() => {
    const { battle } = (window as any).arena
    battle.foes.find((foe: { kind: string }) => foe.kind === 'gardener').health = 0.5
    Object.assign(battle.spells.witchfire, { range: 2000 })
    battle.foes = battle.foes.filter((foe: { kind: string }) => foe.kind === 'gardener')
  })
  const cards = page.locator('#choices button')
  for (let slice = 0; slice < 20 && await page.locator('#cards').isHidden(); slice++) await page.clock.runFor(100)
  // Level-ups from the fight may come first; the blessing follows them.
  for (let turn = 0; turn < 6 && !(await page.locator('#cards-title').innerText()).includes('blessing'); turn++) {
    await cards.last().click()
    for (let slice = 0; slice < 20 && await page.locator('#cards').isHidden(); slice++) await page.clock.runFor(100)
  }
  await expect(page.getByRole('heading', { name: 'The Gardener’s blessing' })).toBeVisible()
  await expect(page.locator('#status')).toHaveText('THE GRAVE FALLS QUIET')
  const blessing = cards.filter({ hasText: 'Witchfire' })
  await expect(blessing).toContainText('Blessing')
  await expect(blessing).toContainText('Each spark blooms')
  await select(page, 'ru')
  await expect(page.getByRole('heading', { name: 'Благословение Садовника' })).toBeVisible()
  await expect(cards.filter({ hasText: 'Ведьмин огонь' })).toContainText('Каждая искра расцветает')
  await select(page, 'en')
  await blessing.click()
  await expect(page.locator('#slots [role=listitem]').first()).toHaveText('Witchfire ✦')
  expect((await state()).trial).toBe('won')
  await expect(hint).toBeHidden()

  // The blessing is on the report, and the next run starts without it.
  await page.evaluate(() => { (window as any).arena.battle.armor = 1 })
  await playRun(page, false, 150_000)
  await expect(page.locator('#title')).toHaveText('The briars prevail')
  await expect(page.locator('#message')).toContainText('Blessed: Witchfire.')
  await page.getByRole('button', { name: 'Play again' }).click()
  await expect(page.locator('#slots [role=listitem]').first()).toHaveText('Witchfire')
  expect((await state()).trial).toBe('asleep')
  expect(errors).toEqual([])
})

test('winning opens the next difficulty and a starting relic, and the save survives a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await frozenClock(page)
  const levels = page.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio')
  const heroes = page.locator('#heroes').getByRole('radio')
  const variant = page.locator('#variant-box')

  // A new player: one difficulty, one hero, no starting relic, no record.
  await expect(levels).toHaveText(['First Watch', 'Two Gates', 'Early Bells'])
  await expect(levels.nth(0)).toHaveAttribute('aria-checked', 'true')
  await expect(levels.nth(1)).toBeDisabled()
  await expect(levels.nth(2)).toBeDisabled()
  await expect(page.locator('#record')).toContainText('No win yet.')
  await expect(page.locator('#record')).toContainText('Win on First Watch to open.')
  await expect(heroes.nth(0)).toBeEnabled()
  await expect(heroes.nth(1)).toBeDisabled()
  await expect(heroes.nth(1)).toContainText('Locked. Hold out until the Duchess comes.')
  await expect(heroes.nth(2)).toContainText('Locked. Fell the Gardener once.')
  await expect(variant).toBeDisabled()
  await expect(page.locator('#variant')).toContainText('Win with this hero to start with Amber Beads.')
  await select(page, 'ru')
  await expect(page.locator('#record')).toContainText('Побед пока нет.')
  await expect(heroes.nth(2)).toContainText('Закрыт. Победи Садовника.')
  await select(page, 'en')

  // Win the run: reach the garden with the Gardener felled on the way, then fell the Duchess.
  await page.getByRole('button', { name: 'Start run' }).click()
  await page.evaluate(() => {
    const { battle } = (window as any).arena
    battle.trial = 'won'
    battle.elapsed = 539.5
    battle.armor = 5
  })
  await page.clock.runFor(1500)
  await page.evaluate(() => {
    const { battle } = (window as any).arena
    Object.assign(battle.spells.witchfire, { range: 4000, damage: 400 })
    battle.immunity = 60
  })
  for (let slice = 0; slice < 200 && await page.locator('#panel').isHidden(); slice++) {
    await page.clock.runFor(100)
    if (await page.locator('#cards').isVisible()) await page.keyboard.press('Digit1')
  }
  await expect(page.locator('#title')).toHaveText('The crown is lifted')
  const report = page.locator('#message')
  await expect(report).toContainText('Difficulty: First Watch.')
  await expect(report).toContainText('New best time.')
  await expect(report).toContainText('New difficulty: Two Gates.')
  await expect(report).toContainText('Dawn Warden may now start with Amber Beads.')
  await expect(report).toContainText('New hero: Duelist.')
  await expect(report).toContainText('New hero: Bellringer.')
  await select(page, 'ru')
  await expect(report).toContainText('Новая сложность: Двое ворот.')
  await expect(report).toContainText('Дозорная теперь может начинать с реликвией «Янтарные чётки».')
  await select(page, 'en')

  // The reward is usable at once on the result screen.
  await expect(levels.nth(1)).toBeEnabled()
  await expect(levels.nth(2)).toBeDisabled()
  await expect(heroes.nth(1)).toBeEnabled()
  await expect(heroes.nth(2)).toBeEnabled()
  await expect(variant).toBeEnabled()
  await expect(page.locator('#record')).toContainText(/Best time 09:\d\d · wins 1\./)

  // And it is still there after the page is loaded again.
  await page.reload()
  await expect(page.locator('#action')).toBeEnabled()
  await expect(levels.nth(1)).toBeEnabled()
  await expect(levels.nth(1)).toHaveAttribute('aria-checked', 'true')
  await expect(heroes.nth(2)).toBeEnabled()
  await levels.nth(0).click()
  await expect(page.locator('#record')).toContainText(/Best time 09:\d\d · wins 1\./)
  await expect(variant).toBeEnabled()
  await variant.check()
  await expect(page.locator('#relics [role=listitem]')).toHaveText(['Amber Beads 1', '—', '—'])

  // A new run on the second difficulty starts the build over but keeps the unlocks.
  await levels.nth(1).click()
  await page.getByRole('button', { name: 'Start run' }).click()
  expect(await page.evaluate(() => {
    const { battle } = (window as any).arena
    return [battle.difficulty, battle.level, battle.loadout.join(), JSON.stringify(battle.relics)]
  })).toEqual([2, 1, 'witchfire', '{"beads":1}'])
  // Losing it changes nothing that was earned.
  await page.evaluate(() => { (window as any).arena.battle.armor = 1 })
  await page.clock.pauseAt(new Date('2026-01-01T00:05:00Z'))
  for (let slice = 0; slice < 900 && await page.locator('#panel').isHidden(); slice++) {
    await page.clock.runFor(250)
    if (await page.locator('#cards').isVisible()) await page.keyboard.press('Digit1')
  }
  await expect(page.locator('#title')).toHaveText('The briars prevail')
  await expect(report).toContainText('Difficulty: Two Gates.')
  await expect(report).not.toContainText('New ')
  await expect(levels.nth(1)).toBeEnabled()
  await expect(levels.nth(2)).toBeDisabled()
  expect(errors).toEqual([])
})

test('a damaged save does not stop the game from starting', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await page.addInitScript(() => {
    localStorage.setItem('secret_game.save', '{"version":1,"difficulty":"all","heroes":[42')
    localStorage.setItem('secret_game.language', 'ru')
  })
  await startPage(page)
  // The language chosen earlier is kept; everything else starts fresh.
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.locator('#levels').getByRole('radio').nth(1)).toBeDisabled()
  await expect(page.locator('#record')).toContainText('Побед пока нет.')
  await page.getByRole('button', { name: 'Начать забег' }).click()
  await expect(page.locator('#status')).toHaveText('НОЧНОЙ ДОЗОР')
  expect(errors).toEqual([])
})

test('first-run tips lead a new player to move, gather an ember and pick a card, once', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await frozenClock(page)
  await page.evaluate(() => { Math.random = () => 0.05 })
  const hint = page.locator('#hint')
  const learned = () => page.evaluate(() => JSON.parse(localStorage.getItem('secret_game.save') ?? '{}').tips ?? [])
  await expect(hint).toBeHidden()
  await page.getByRole('button', { name: 'Start run' }).click()
  await page.clock.runFor(100)
  await expect(hint).toHaveText('Move with W A S D or the arrow keys.')
  await select(page, 'ru')
  await expect(hint).toHaveText('Двигайся клавишами W A S D или стрелками.')
  await select(page, 'en')

  // A few steps there and back: the tip is learned and saved at once.
  for (const key of ['ArrowRight', 'ArrowLeft']) {
    await page.keyboard.down(key)
    await page.clock.runFor(250)
    await page.keyboard.up(key)
  }
  await page.clock.runFor(100)
  await expect(hint).toBeHidden()
  expect(await learned()).toEqual(['move'])

  // Briarlings fall and leave embers: the next tip says what to do with them.
  await page.clock.runFor(14_000)
  await expect(hint).toHaveText('Banished foes leave embers. Walk over one to gather it.')
  await page.keyboard.down('ArrowLeft')
  await page.clock.runFor(620)
  await page.keyboard.up('ArrowLeft')
  await page.keyboard.down('ArrowUp')
  await page.clock.runFor(270)
  await page.keyboard.up('ArrowUp')

  // The embers bring the first level-up, and the tip explains the cards while they are up.
  await expect(page.locator('#cards')).toBeVisible()
  await expect(hint).toHaveText('A new level. Choose a card with a click or with keys 1, 2, 3.')
  expect(await learned()).toEqual(['move', 'ember'])
  await page.keyboard.press('Digit3')
  await page.clock.runFor(100)
  if (await page.locator('#cards').isVisible()) await page.keyboard.press('Digit3')
  await page.clock.runFor(200)
  await expect(page.locator('#cards')).toBeHidden()
  await expect(hint).toBeHidden()
  expect(await learned()).toEqual(['move', 'ember', 'cards'])

  // The same player never reads them again.
  await page.reload()
  await expect(page.locator('#action')).toBeEnabled()
  await page.getByRole('button', { name: 'Start run' }).click()
  await page.clock.runFor(500)
  await expect(hint).toBeHidden()
  expect(errors).toEqual([])
})

test('sound plays by default, the volume is remembered, and a wound still shows with the sound off', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await frozenClock(page)
  await page.evaluate(() => { Math.random = () => 0.05 })
  const slider = page.getByRole('slider', { name: 'Sound' })
  const sounded = () => page.evaluate(() => ({ ...(window as any).arena.sfx.sounded }))
  await expect(slider).toHaveValue('60')
  await page.getByRole('button', { name: 'Start run' }).click()
  await page.clock.runFor(8000)
  const loud = await sounded()
  // The audio clock runs in real time, not in the test's skipped time, so only the count being above zero is certain.
  expect(loud.shot).toBeGreaterThan(0)

  // Silence: nothing more is sent to the speakers, and the setting is saved.
  await select(page, 'ru')
  await expect(page.getByRole('slider', { name: 'Звук' })).toBeVisible()
  await select(page, 'en')
  await slider.fill('0')
  const quiet = await sounded()
  await page.clock.runFor(5000)
  expect(await sounded()).toEqual(quiet)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('secret_game.save')!).volume)).toBe(0)

  // A briarling reaches the warden: the frame of the arena flashes without any sound.
  await expect(page.locator('#arena')).not.toHaveClass(/hurt/)
  await page.evaluate(() => {
    const { battle } = (window as any).arena
    battle.immunity = 0
    battle.foes[0] ? Object.assign(battle.foes[0], battle.player) : null
  })
  await page.clock.runFor(60)
  await expect(page.locator('#arena')).toHaveClass(/hurt/)
  await expect(page.getByRole('img', { name: 'Armor 4 of 5' })).toBeVisible()
  await page.clock.runFor(400)
  await expect(page.locator('#arena')).not.toHaveClass(/hurt/)
  expect(await sounded()).toEqual(quiet)

  await page.reload()
  await expect(page.locator('#action')).toBeEnabled()
  await expect(slider).toHaveValue('0')
  await slider.fill('35')
  await page.reload()
  await expect(slider).toHaveValue('35')
  expect(errors).toEqual([])
})

test('boars, archers, knights and moths fill the last minute and mark their attacks', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await frozenClock(page)
  await page.getByRole('button', { name: 'Start run' }).click()
  // Skip to the last minute with armor to spare, and stand still among the full court.
  const census = () => page.evaluate(() => {
    const { battle } = (window as any).arena
    const kinds = battle.foes.map((foe: { kind: string }) => foe.kind)
    const modes = battle.foes.map((foe: { mode: string }) => foe.mode)
    return { kinds, modes, arrows: battle.arrows.length, armor: battle.armor, elapsed: battle.elapsed }
  })
  await page.evaluate(() => {
    const { battle } = (window as any).arena
    battle.elapsed = 481.5
    battle.armor = 1e6
  })
  const seen = { boar: false, archer: false, knight: false, moth: false, windup: false, aim: false, arrows: false }
  for (let slice = 0; slice < 120 && Object.values(seen).includes(false); slice++) {
    await page.clock.runFor(250)
    if (await page.locator('#cards').isVisible()) await page.keyboard.press('Digit1')
    const now = await census()
    seen.boar ||= now.kinds.includes('boar')
    seen.archer ||= now.kinds.includes('archer')
    seen.knight ||= now.kinds.includes('knight')
    seen.moth ||= now.kinds.includes('moth')
    seen.windup ||= now.modes.includes('windup')
    seen.aim ||= now.modes.includes('aim')
    seen.arrows ||= now.arrows > 0
  }
  expect(seen).toEqual({ boar: true, archer: true, knight: true, moth: true, windup: true, aim: true, arrows: true })
  await expect(page.locator('#clock')).toHaveText(/^00:[0-5]\d$/)
  await expect(page.locator('footer')).toContainText('Thorn Boar')
  await expect(page.locator('footer')).toContainText('Court Archer')
  await expect(page.locator('footer')).toContainText('Stone Knight')
  await expect(page.locator('footer')).toContainText('Healer Moth')
  await expect(page.locator('footer')).toContainText('Lamp oil')
  expect(errors).toEqual([])
})

for (const outcome of ['victory', 'defeat in the court', 'defeat in the duel'] as const) {
  test(outcome + ' can be translated and restarted', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    // The first-run tips are behind this player, so the hint line is free for the duel.
    await seedSave(page, { tips: everything.tips })
    await frozenClock(page)
    // Fixed entry points keep the end-to-end scenarios repeatable.
    const won = outcome === 'victory'
    const duel = outcome !== 'defeat in the court'
    await page.evaluate((win: boolean) => { Math.random = () => win ? 0.05 : 0.55 }, duel)
    await page.getByRole('button', { name: 'Start run' }).click()
    if (duel) {
      // Play the opening for real, then skip to the last seconds before the dawn bell.
      await playRun(page, true, 12_000)
      await page.evaluate((armor: number) => {
        const { battle } = (window as any).arena
        battle.elapsed = 538.5
        battle.armor = armor
      }, won ? 3 : 1)
      await playRun(page, false, 2500)

      // The dawn bell: the Duchess walks into the same court, and nothing about the warden changes.
      await expect(page.getByRole('heading', { name: 'Chapel Court' })).toBeVisible()
      await expect(page.locator('#status')).toHaveText('THE DUCHESS COMES')
      await expect(page.locator('#clock-label')).toHaveText('THE DUCHESS')
      await expect(page.locator('#clock')).toHaveText('100%')
      await expect(page.getByRole('img', { name: `Armor ${won ? 3 : 1} of 5` })).toBeVisible()
      await expect(page.locator('#slots [role=listitem]').first()).toHaveText('Witchfire')
      await expect(page.locator('#hint')).toHaveText(/Her crown is closed\. Break the seal-flower/)
      const duelNow = () => page.evaluate(() => {
        const { battle } = (window as any).arena
        const kinds = battle.foes.map((foe: { kind: string }) => foe.kind)
        return {
          stage: battle.stage, shielded: battle.shielded,
          duchess: kinds.includes('duchess'), seal: kinds.includes('seal'),
          inCourt: battle.player.x > 22 && battle.player.y > 22,
        }
      })
      expect(await duelNow()).toEqual({ stage: 'duel', shielded: true, duchess: true, seal: true, inCourt: true })
      await select(page, 'ru')
      await expect(page.getByRole('heading', { name: 'У часовни' })).toBeVisible()
      await expect(page.locator('#clock-label')).toHaveText('КНЯГИНЯ')
      await expect(page.locator('#status')).toHaveText('КНЯГИНЯ ПРИШЛА')
      await expect(page.locator('#hint')).toHaveText(/Её венец закрыт/)
      await select(page, 'en')

      if (won) {
        // The crown holds while the seal-flower lives, however hard the witchfire burns.
        const seal = (health: number) => page.evaluate((value: number) => {
          const { battle } = (window as any).arena
          Object.assign(battle.spells.witchfire, { range: 4000, damage: 400 })
          // Armor to spare: this part is about the crown, not about dodging.
          battle.armor = 5
          battle.immunity = 60
          battle.foes.find((foe: { kind: string }) => foe.kind === 'seal').health = value
        }, health)
        await seal(1e9)
        await page.clock.runFor(1500)
        await expect(page.locator('#clock')).toHaveText('100%')
        await seal(1)
        // Once the flower falls the crown opens, the hint changes, and she can be struck down.
        let open = false
        for (let slice = 0; slice < 120 && await page.locator('#panel').isHidden(); slice++) {
          await page.clock.runFor(100)
          if (await page.locator('#cards').isVisible()) await page.keyboard.press('Digit1')
          open ||= (await page.locator('#hint').innerText()).startsWith('Her crown is open')
        }
        expect(open).toBe(true)
      } else {
        // A warden who stands still is struck down by her lash, thorns and briars.
        await playRun(page, false, 15_000)
      }
    } else {
      // A warden who never moves holds out until the boars arrive.
      expect(await playRun(page, false, 150_000)).toBeGreaterThan(0)
    }
    await expect(page.locator('#title')).toHaveText(won ? 'The crown is lifted' : 'The briars prevail')
    const kills = Number(await page.locator('#kills').innerText())
    expect(kills).toBeGreaterThan(0)
    const report = await page.locator('#message').innerText()
    const time = report.match(/\d\d:\d\d/)![0]
    expect(report).toContain('Foes banished: ' + kills)
    const level = await page.locator('#level').innerText()
    expect(report).toContain('Level reached: ' + level)
    expect(report).toContain('Spells: Witchfire')
    if (duel) expect(report).toContain(`Duel phase reached: ${won ? 3 : 1} of 3.`)
    else expect(report).not.toContain('Duel phase')
    if (duel) expect(time).toMatch(/^09:[0-2]\d$/)
    if (won) {
      expect(report).not.toContain('The watch ended')
      await expect(page.locator('#clock')).toHaveText('0%')
    } else {
      expect(report).toContain(duel ? 'The watch ended in the duel with the Duchess.' : 'The watch ended before dawn.')
      // The maximum may have grown if a pilgrim's cloak turned up on the way.
      await expect(page.getByRole('img', { name: /^Armor 0 of \d$/ })).toBeVisible()
    }

    await select(page, 'ru')
    await expect(page.locator('#title')).toHaveText(won ? 'Венец снят' : 'Терновник победил')
    await expect(page.locator('#message')).toContainText(`Время в бою — ${time}. Изгнано врагов — ${kills}. Достигнут уровень — ${level}. Заклинания: Ведьмин огонь`)
    if (duel) await expect(page.locator('#message')).toContainText(`Достигнута фаза дуэли: ${won ? 3 : 1} из 3.`)
    if (!won) await expect(page.locator('#message')).toContainText(duel ? 'Дозор окончен в дуэли с Княгиней.' : 'Дозор окончен до рассвета.')
    await page.getByRole('button', { name: 'Ещё раз' }).click()
    await expect(page.locator('#status')).toHaveText('НОЧНОЙ ДОЗОР')
    await expect(page.getByRole('heading', { name: 'У часовни' })).toBeVisible()
    await expect(page.locator('#clock-label')).toHaveText('ДО РАССВЕТА')
    await expect(page.locator('#clock')).toHaveText('09:00')
    await expect(page.locator('#kills')).toHaveText('00')
    await expect(page.locator('#level')).toHaveText('1')
    await expect(page.locator('#slots [role=listitem]')).toHaveText(['Ведьмин огонь', '—', '—'])
    await expect(page.getByRole('progressbar', { name: 'Опыт 0 из 5' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Броня 5 из 5' })).toBeVisible()
    expect(await page.evaluate(() => (window as any).arena.battle.stage)).toBe('court')
    expect(errors).toEqual([])
  })
}
