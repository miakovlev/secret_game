export type Language = 'en' | 'ru'

const en = {
  pageTitle: 'Court of Briars · Chapel Court',
  brand: 'COURT OF BRIARS',
  language: 'Interface language',
  console: 'Game console',
  realm: 'THE WIDOW’S GARDEN',
  sector: 'Chapel Court',
  armor: 'ARMOR',
  timer: 'UNTIL DAWN',
  kills: 'BANISHED',
  level: 'LEVEL',
  arena: 'Chapel courtyard, top view',
  controls: 'or arrow keys to move',
  pause: 'Pause',
  warden: 'Dawn Warden',
  briarling: 'Briarling',
  ember: 'Ember',
  slots: 'Spells',
  emptySlot: 'Empty slot',
  newSpell: 'New spell',
  loading: 'Loading arena…',
  status: {
    ready: 'NIGHTFALL', playing: 'NIGHT WATCH', paused: 'PAUSED', choosing: 'LEVEL UP',
    won: 'DAYBREAK', lost: 'FALLEN',
  },
  ready: {
    label: 'THE FIRST VIGIL', title: 'Until first light',
    message: 'Hold the chapel court for 60 seconds until dawn. Keep clear of the briarlings. Your lantern casts witchfire at the nearest foe, and the embers left behind raise your level and teach new spells.',
    action: 'Start run',
  },
  paused: {
    label: 'A MOMENT OF REST', title: 'Paused',
    message: 'The vigil will continue when you’re ready.', action: 'Resume',
  },
  won: { label: 'THE BELLS RING', title: 'The chapel stands' },
  lost: { label: 'THE BELLS FALL SILENT', title: 'The briars prevail' },
  retry: 'Play again',
  chooseLabel: 'THE LANTERN FLARES',
  chooseMessage: 'Choose how your lantern grows.',
  levelTitle: (level: number) => `Level ${level}`,
  upgrades: {
    range: { title: 'Longer reach', stat: 'Range' },
    rate: { title: 'Quicker flame', stat: 'Casts per second' },
    damage: { title: 'Hotter fire', stat: 'Damage' },
    bladeReach: { title: 'Longer blade', stat: 'Reach' },
    bladeArc: { title: 'Wider swing', stat: 'Swing width, degrees' },
    bladeDamage: { title: 'Keener edge', stat: 'Damage' },
    tollRadius: { title: 'Louder bell', stat: 'Radius' },
    tollKnockback: { title: 'Heavier stroke', stat: 'Pushback' },
    tollDamage: { title: 'Mourning bronze', stat: 'Damage' },
  },
  spells: {
    witchfire: { name: 'Witchfire', about: 'A spark at the nearest foe.' },
    moonblade: { name: 'Moon Blade', about: 'Cuts every foe ahead of you. Aim by moving.' },
    toll: { name: 'Funeral Toll', about: 'Strikes all around you and pushes foes back.' },
  },
  armorValue: (value: number, max: number) => `Armor ${value} of ${max}`,
  xpValue: (value: number, goal: number) => `Experience ${value} of ${goal}`,
  result: (time: string, kills: number, level: number) =>
    `Time survived: ${time}. Briarlings banished: ${kills}. Level reached: ${level}.`,
}

const ru: typeof en = {
  pageTitle: 'Шипов двор · У часовни',
  brand: 'ШИПОВ ДВОР',
  language: 'Язык интерфейса',
  console: 'Игровая консоль',
  realm: 'САД КНЯГИНИ',
  sector: 'У часовни',
  armor: 'БРОНЯ',
  timer: 'ДО РАССВЕТА',
  kills: 'ИЗГНАНО',
  level: 'УРОВЕНЬ',
  arena: 'Двор часовни, вид сверху',
  controls: 'или стрелки · движение',
  pause: 'Пауза',
  warden: 'Дозорная',
  briarling: 'Корневик',
  ember: 'Уголёк',
  slots: 'Заклинания',
  emptySlot: 'Пустая ячейка',
  newSpell: 'Новое заклинание',
  loading: 'Загрузка арены…',
  status: {
    ready: 'СУМЕРКИ', playing: 'НОЧНОЙ ДОЗОР', paused: 'ПАУЗА', choosing: 'НОВЫЙ УРОВЕНЬ',
    won: 'РАССВЕТ', lost: 'ДОЗОР ПАЛ',
  },
  ready: {
    label: 'ПЕРВЫЙ ДОЗОР', title: 'До первых лучей',
    message: 'Продержись 60 секунд до рассвета. Уходи от корневиков. Фонарь сам выпускает ведьмин огонь в ближайшего врага, а угольки на земле повышают уровень и открывают новые заклинания.',
    action: 'Начать забег',
  },
  paused: {
    label: 'ПЕРЕДЫШКА', title: 'Пауза',
    message: 'Вернись к дозору, когда будешь готов.', action: 'Продолжить',
  },
  won: { label: 'ЗВОН КОЛОКОЛОВ', title: 'Часовня устояла' },
  lost: { label: 'КОЛОКОЛА УМОЛКЛИ', title: 'Терновник победил' },
  retry: 'Ещё раз',
  chooseLabel: 'ФОНАРЬ РАЗГОРАЕТСЯ',
  chooseMessage: 'Выбери, чем усилить фонарь.',
  levelTitle: level => `Уровень ${level}`,
  upgrades: {
    range: { title: 'Дальний свет', stat: 'Дальность' },
    rate: { title: 'Быстрое пламя', stat: 'Вспышек в секунду' },
    damage: { title: 'Жаркий огонь', stat: 'Урон' },
    bladeReach: { title: 'Длинный клинок', stat: 'Длина взмаха' },
    bladeArc: { title: 'Широкий взмах', stat: 'Ширина взмаха, градусы' },
    bladeDamage: { title: 'Острая кромка', stat: 'Урон клинка' },
    tollRadius: { title: 'Громкий колокол', stat: 'Радиус' },
    tollKnockback: { title: 'Тяжёлый удар', stat: 'Отталкивание' },
    tollDamage: { title: 'Скорбная бронза', stat: 'Урон звона' },
  },
  spells: {
    witchfire: { name: 'Ведьмин огонь', about: 'Искра в ближайшего врага.' },
    moonblade: { name: 'Лунный клинок', about: 'Рассекает всех врагов перед тобой. Целься движением.' },
    toll: { name: 'Погребальный звон', about: 'Бьёт вокруг тебя и отталкивает врагов.' },
  },
  armorValue: (value, max) => `Броня ${value} из ${max}`,
  xpValue: (value, goal) => `Опыт ${value} из ${goal}`,
  result: (time, kills, level) =>
    `Время в бою — ${time}. Изгнано корневиков — ${kills}. Достигнут уровень — ${level}.`,
}

export const messages = { en, ru }
export const languageKey = 'secret_game.language'
export function readLanguage(): Language {
  try {
    return localStorage.getItem(languageKey) === 'ru' ? 'ru' : 'en'
  } catch {
    return 'en'
  }
}

export function saveLanguage(language: Language) {
  try {
    localStorage.setItem(languageKey, language)
  } catch {
    // The selected language still applies to this tab when storage is unavailable.
  }
}
