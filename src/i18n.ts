export type Language = 'en' | 'ru'

const en = {
  pageTitle: 'Lower Circuit · Sector 07',
  brand: 'LOWER CIRCUIT',
  language: 'Interface language',
  console: 'Game console',
  station: 'UNDERGROUND STATION',
  sector: 'Sector 07',
  armor: 'ARMOR',
  timer: 'UNTIL RESET',
  kills: 'DRONES DOWN',
  arena: 'Station arena, top view',
  controls: 'or arrow keys to move',
  pause: 'Pause',
  engineer: 'Engineer',
  drone: 'Scout drone',
  weapon: 'Weapon',
  discharge: 'Arc discharge',
  loading: 'Loading arena…',
  status: {
    ready: 'STANDBY', playing: 'RESET IN PROGRESS', paused: 'PAUSED',
    won: 'RESET COMPLETE', lost: 'SIGNAL LOST',
  },
  ready: {
    label: 'SURVIVAL PROTOCOL', title: 'Emergency reset',
    message: 'Survive for 60 seconds while the station resets. Keep moving between drones. Your weapon automatically hits the nearest target.',
    action: 'Start run',
  },
  paused: {
    label: 'LINK ON HOLD', title: 'Paused',
    message: 'The station is on hold. Resume when you’re ready.', action: 'Resume',
  },
  won: { label: 'PROTOCOL COMPLETE', title: 'Sector secured' },
  lost: { label: 'PROTOCOL INTERRUPTED', title: 'Armor breached' },
  retry: 'Play again',
  armorValue: (value: number, max: number) => `Armor ${value} of ${max}`,
  result: (time: string, kills: number) => `Time survived: ${time}. Drones down: ${kills}.`,
}

const ru: typeof en = {
  pageTitle: 'Нижний контур · Сектор 07',
  brand: 'НИЖНИЙ КОНТУР',
  language: 'Язык интерфейса',
  console: 'Игровая консоль',
  station: 'ПОДЗЕМНАЯ СТАНЦИЯ',
  sector: 'Сектор 07',
  armor: 'БРОНЯ',
  timer: 'ДО СБРОСА',
  kills: 'СБИТО',
  arena: 'Арена станции, вид сверху',
  controls: 'или стрелки · движение',
  pause: 'Пауза',
  engineer: 'Инженер',
  drone: 'Дрон-разведчик',
  weapon: 'Оружие',
  discharge: 'Электроразряд',
  loading: 'Загрузка арены…',
  status: {
    ready: 'ОЖИДАНИЕ', playing: 'СБРОС ЗАПУЩЕН', paused: 'ПАУЗА',
    won: 'СБРОС ЗАВЕРШЁН', lost: 'СВЯЗЬ ПОТЕРЯНА',
  },
  ready: {
    label: 'ПРОТОКОЛ ВЫЖИВАНИЯ', title: 'Аварийный сброс',
    message: 'Продержись 60 секунд до перезапуска станции. Двигайся между дронами — разряд бьёт ближайшую цель автоматически.',
    action: 'Начать забег',
  },
  paused: {
    label: 'СВЯЗЬ ПРИОСТАНОВЛЕНА', title: 'Пауза',
    message: 'Станция ждёт. Продолжи забег, когда будешь готов.', action: 'Продолжить',
  },
  won: { label: 'ПРОТОКОЛ ВЫПОЛНЕН', title: 'Сектор спасён' },
  lost: { label: 'ПРОТОКОЛ ПРЕРВАН', title: 'Броня пробита' },
  retry: 'Ещё раз',
  armorValue: (value, max) => `Броня ${value} из ${max}`,
  result: (time, kills) => `Время в бою — ${time}. Сбито дронов — ${kills}.`,
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
