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
  assert.equal(messages.en.phaseLine(2), 'Duel phase reached: 2 of 3.')
  assert.equal(messages.ru.phaseLine(1), 'Достигнута фаза дуэли: 1 из 3.')
  assert.equal(messages.en.bossIn('Briar Mass'), 'Briar Mass IN')
  assert.equal(messages.ru.bossIn('Терновый ком'), 'Терновый ком ЧЕРЕЗ')
  assert.equal(messages.en.lock(1), 'Locked. Fell any boss once.')
  assert.equal(messages.en.lock(2), 'Locked. Fell 2 bosses in one run.')
  assert.equal(messages.ru.lock(1), 'Закрыт. Победи любого босса.')
  assert.equal(messages.ru.lock(2), 'Закрыт. Победи двух боссов за один забег.')
  assert.equal(messages.en.felledLine(2, 5), 'Bosses felled: 2 of 5.')
  assert.equal(messages.ru.felledLine(2, 5), 'Побеждено боссов: 2 из 5.')
  for (const [lang, name, relic] of [['en', 'Two Gates', 'Hourglass'], ['ru', 'Двое ворот', 'Песочные часы']]) {
    const copy = messages[lang]
    for (const line of [
      copy.lockedDifficulty(name), copy.difficultyLine(name), copy.rewardDifficulty(name), copy.rewardHero(name),
    ]) assert.ok(line.includes(name))
    for (const line of [copy.variantLabel(relic), copy.variantLocked(relic), copy.rewardVariant(name, relic)]) {
      assert.ok(line.includes(relic))
    }
    assert.ok(copy.recordLine('10:12', 3).includes('10:12') && copy.recordLine('10:12', 3).includes('3'))
    assert.equal(copy.difficulties.length, 3)
  }
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

// --- Icons.

test('every spell and relic has its own icon', async () => {
  const { glyphs, iconMarkup } = await import('../src/icons.ts')
  const { spellIds, relicIds } = await import('../src/content.ts')
  const ids = [...spellIds, ...relicIds]
  assert.deepEqual(Object.keys(glyphs).sort(), [...ids].sort())
  const pictures = ids.map(id => iconMarkup(id))
  assert.equal(new Set(pictures).size, ids.length)
  for (const [index, picture] of pictures.entries()) {
    assert.match(picture, /^<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">.+<\/svg>$/)
    assert.match(glyphs[ids[index]].color, /^#[0-9a-f]{6}$/)
    // Nothing but shapes: no scripts, links or text.
    assert.doesNotMatch(picture, /<(script|a|text|image|use|foreignObject)\b|href|NaN|undefined/)
  }
  // The names shown beside the icons exist in both languages.
  for (const lang of ['en', 'ru']) {
    for (const id of spellIds) assert.ok(messages[lang].spells[id].name)
    for (const id of relicIds) assert.ok(messages[lang].relics[id].name)
  }
})
