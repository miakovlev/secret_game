import assert from 'node:assert/strict'
import test from 'node:test'
import { languageKey, messages, readLanguage, saveLanguage } from '../src/i18n.ts'

test('both catalogs have the same complete set of nonempty messages', () => {
  function compare(en, ru) {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort())
    for (const key of Object.keys(en)) {
      assert.equal(typeof ru[key], typeof en[key])
      if (typeof en[key] === 'object') compare(en[key], ru[key])
      if (typeof en[key] === 'string') {
        assert.ok(en[key].trim() && ru[key].trim())
        assert.notEqual(ru[key], en[key])
      }
    }
  }
  compare(messages.en, messages.ru)
  assert.equal(messages.en.armorValue(2, 5), 'Armor 2 of 5')
  assert.equal(messages.ru.armorValue(2, 5), 'Броня 2 из 5')
  assert.equal(messages.en.build('Witchfire, Funeral Toll'), 'Spells: Witchfire, Funeral Toll.')
  assert.equal(messages.ru.build('Ведьмин огонь'), 'Заклинания: Ведьмин огонь.')
  assert.equal(messages.en.heroLine('Duelist'), 'Hero: Duelist.')
  assert.equal(messages.ru.heroLine('Дуэлянт'), 'Герой: Дуэлянт.')
  assert.equal(messages.en.relicLevel(2), 'Level 2')
  assert.equal(messages.ru.relicLevel(2), 'Уровень 2')
  assert.equal(messages.en.relicLine('Hourglass 2'), 'Relics: Hourglass 2.')
  assert.equal(messages.ru.relicLine('Песочные часы 2'), 'Реликвии: Песочные часы 2.')
  assert.equal(messages.en.blessLine('Witchfire'), 'Blessed: Witchfire.')
  assert.equal(messages.ru.blessLine('Ведьмин огонь'), 'Благословлено: Ведьмин огонь.')
  assert.equal(messages.en.levelTitle(2), 'Level 2')
  assert.equal(messages.ru.levelTitle(2), 'Уровень 2')
  assert.equal(messages.en.xpValue(2, 5), 'Experience 2 of 5')
  assert.equal(messages.ru.xpValue(2, 5), 'Опыт 2 из 5')
  assert.equal(messages.en.result('00:34', 7, 3), 'Time survived: 00:34. Foes banished: 7. Level reached: 3.')
  assert.equal(messages.ru.result('00:34', 7, 3), 'Время в бою — 00:34. Изгнано врагов — 7. Достигнут уровень — 3.')
})

function withStorage(storage, check) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: storage})
  try { check() } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
}

test('preferences round-trip and missing or unsupported preferences default to English', () => {
  const values = new Map()
  withStorage({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }, () => {
    assert.equal(readLanguage(), 'en')
    values.set(languageKey, 'fr')
    assert.equal(readLanguage(), 'en')
    for (const lang of ['ru', 'en']) {
      saveLanguage(lang)
      assert.equal(values.get(languageKey), lang)
      assert.equal(readLanguage(), lang)
    }
  })
})

test('storage failures allow the game to continue', () => {
  const denied = () => { throw new Error('Storage denied') }
  withStorage({getItem: denied, setItem: denied}, () => {
    assert.equal(readLanguage(), 'en')
    assert.doesNotThrow(() => saveLanguage('ru'))
  })
})
