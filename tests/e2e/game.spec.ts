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
  await expect(page).toHaveTitle('Lower Circuit · Sector 07')
  await expect(page.getByRole('button', { name: 'Start run' })).toBeEnabled()
  await expect(page.getByRole('img', { name: 'Armor 5 of 5' })).toBeVisible()

  await select(page, 'ru')
  await expect(page).toHaveTitle('Нижний контур · Сектор 07')
  await expect(page.getByRole('group', { name: 'Язык интерфейса' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Аварийный сброс' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Игровая консоль' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Арена станции, вид сверху' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Броня 5 из 5' })).toBeVisible()
  await expect(page.locator('footer')).toContainText('Электроразряд')
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
  await expect(page.locator('#status')).toHaveText('СБРОС ЗАПУЩЕН')
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
  expect(time).not.toBe('01:00')
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

for (const outcome of ['victory', 'defeat'] as const) {
  test(outcome + ' can be translated and restarted', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await frozenClock(page)
    // Fixed entry points keep both end-to-end scenarios repeatable.
    await page.evaluate((win: boolean) => { Math.random = () => win ? 0.05 : 0.55 }, outcome === 'victory')
    await page.getByRole('button', { name: 'Start run' }).click()
    await page.clock.runFor(61_200)
    const won = outcome === 'victory'
    await expect(page.locator('#title')).toHaveText(won ? 'Sector secured' : 'Armor breached')
    const kills = Number(await page.locator('#kills').innerText())
    expect(kills).toBeGreaterThan(0)
    const report = await page.locator('#message').innerText()
    const time = report.match(/\d\d:\d\d/)![0]
    expect(report).toContain('Drones down: ' + kills)
    if (won) expect(time).toBe('01:00')
    else await expect(page.getByRole('img', { name: 'Armor 0 of 5' })).toBeVisible()

    await select(page, 'ru')
    await expect(page.locator('#title')).toHaveText(won ? 'Сектор спасён' : 'Броня пробита')
    await expect(page.locator('#message')).toHaveText(`Время в бою — ${time}. Сбито дронов — ${kills}.`)
    await page.getByRole('button', { name: 'Ещё раз' }).click()
    await expect(page.locator('#status')).toHaveText('СБРОС ЗАПУЩЕН')
    await expect(page.locator('#clock')).toHaveText('01:00')
    await expect(page.locator('#kills')).toHaveText('00')
    await expect(page.getByRole('img', { name: 'Броня 5 из 5' })).toBeVisible()
    expect(errors).toEqual([])
  })
}
