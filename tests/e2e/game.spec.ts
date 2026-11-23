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
  expect(time).not.toBe('05:00')
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
  await expect(page.getByRole('listitem', { name: 'Пустая ячейка' })).toHaveCount(1)
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

test('boars and archers join the later waves and mark their attacks', async ({ page }) => {
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
    battle.elapsed = 241.5
    battle.armor = 1e6
  })
  const seen = { boar: false, archer: false, windup: false, aim: false, arrows: false }
  for (let slice = 0; slice < 120 && Object.values(seen).includes(false); slice++) {
    await page.clock.runFor(250)
    if (await page.locator('#cards').isVisible()) await page.keyboard.press('Digit1')
    const now = await census()
    seen.boar ||= now.kinds.includes('boar')
    seen.archer ||= now.kinds.includes('archer')
    seen.windup ||= now.modes.includes('windup')
    seen.aim ||= now.modes.includes('aim')
    seen.arrows ||= now.arrows > 0
  }
  expect(seen).toEqual({ boar: true, archer: true, windup: true, aim: true, arrows: true })
  await expect(page.locator('#clock')).toHaveText(/^00:[0-5]\d$/)
  await expect(page.locator('footer')).toContainText('Thorn Boar')
  await expect(page.locator('footer')).toContainText('Court Archer')
  await expect(page.locator('footer')).toContainText('Lamp oil')
  expect(errors).toEqual([])
})

for (const outcome of ['victory', 'defeat in the court', 'defeat in the garden'] as const) {
  test(outcome + ' can be translated and restarted', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
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
        battle.elapsed = 298.5
        battle.armor = armor
      }, won ? 3 : 1)
      await playRun(page, false, 2500)

      // The bell carries the warden, the armor and the spells into the throne garden.
      await expect(page.getByRole('heading', { name: 'Throne Garden' })).toBeVisible()
      await expect(page.locator('#status')).toHaveText('THE DUEL')
      await expect(page.locator('#clock-label')).toHaveText('THE DUCHESS')
      await expect(page.locator('#clock')).toHaveText('100%')
      await expect(page.getByRole('img', { name: `Armor ${won ? 3 : 1} of 5` })).toBeVisible()
      await expect(page.locator('#slots [role=listitem]').first()).toHaveText('Witchfire')
      const garden = () => page.evaluate(() => {
        const { battle } = (window as any).arena
        return { stage: battle.stage, kinds: battle.foes.map((foe: { kind: string }) => foe.kind).sort(), shielded: battle.shielded }
      })
      expect(await garden()).toEqual({ stage: 'garden', kinds: ['duchess', 'seal'], shielded: true })
      await select(page, 'ru')
      await expect(page.getByRole('heading', { name: 'Тронный сад' })).toBeVisible()
      await expect(page.locator('#clock-label')).toHaveText('КНЯГИНЯ')
      await expect(page.locator('#status')).toHaveText('ДУЭЛЬ')
      await select(page, 'en')

      if (won) {
        // The crown holds while the seal-flower lives, however hard the witchfire burns.
        const seal = (health: number) => page.evaluate((value: number) => {
          const { battle } = (window as any).arena
          Object.assign(battle.spells.witchfire, { range: 2000, damage: 60 })
          battle.foes.find((foe: { kind: string }) => foe.kind === 'seal').health = value
        }, health)
        await seal(1e9)
        await page.clock.runFor(1500)
        await expect(page.locator('#clock')).toHaveText('100%')
        await seal(1)
        // Once the flower falls the crown opens and the Duchess can be struck down.
        for (let slice = 0; slice < 80 && await page.locator('#panel').isHidden(); slice++) {
          await page.clock.runFor(250)
          const now = await garden()
          if (!now.shielded && now.kinds.length) await expect(page.locator('#clock')).not.toHaveText('100%')
        }
      } else {
        // A warden who stands still in the marked sector is struck by the lash.
        await playRun(page, false, 8000)
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
    if (duel) expect(time).toMatch(/^05:[0-2]\d$/)
    if (won) {
      expect(report).not.toContain('The watch ended')
      await expect(page.locator('#clock')).toHaveText('0%')
    } else {
      expect(report).toContain(duel ? 'The watch ended in the throne garden.' : 'The watch ended in the chapel court.')
      await expect(page.getByRole('img', { name: 'Armor 0 of 5' })).toBeVisible()
    }

    await select(page, 'ru')
    await expect(page.locator('#title')).toHaveText(won ? 'Венец снят' : 'Терновник победил')
    await expect(page.locator('#message')).toContainText(`Время в бою — ${time}. Изгнано врагов — ${kills}. Достигнут уровень — ${level}. Заклинания: Ведьмин огонь`)
    if (!won) await expect(page.locator('#message')).toContainText(duel ? 'Дозор окончен в тронном саду.' : 'Дозор окончен у часовни.')
    await page.getByRole('button', { name: 'Ещё раз' }).click()
    await expect(page.locator('#status')).toHaveText('НОЧНОЙ ДОЗОР')
    await expect(page.getByRole('heading', { name: 'У часовни' })).toBeVisible()
    await expect(page.locator('#clock-label')).toHaveText('ДО РАССВЕТА')
    await expect(page.locator('#clock')).toHaveText('05:00')
    await expect(page.locator('#kills')).toHaveText('00')
    await expect(page.locator('#level')).toHaveText('1')
    await expect(page.locator('#slots [role=listitem]')).toHaveText(['Ведьмин огонь', '—', '—'])
    await expect(page.getByRole('progressbar', { name: 'Опыт 0 из 5' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Броня 5 из 5' })).toBeVisible()
    expect(await page.evaluate(() => (window as any).arena.battle.stage)).toBe('court')
    expect(errors).toEqual([])
  })
}
