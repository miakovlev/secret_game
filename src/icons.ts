import type { RelicId, SpellId } from './content.ts'

// A small picture for every spell and relic, drawn on a 24 by 24 grid. Shapes
// take the icon's own colour; `ink` lines are drawn rather than filled.
type Glyph = { color: string; body: string }

const ink = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

export const glyphs: Record<SpellId | RelicId, Glyph> = {
  // A flame.
  witchfire: {
    color: '#e8c787',
    body: '<path d="M12 2c1 4 5.5 6 5.5 11.5a5.5 5.5 0 0 1-11 0c0-2.2 1-3.5 2.2-4.5 0 2 .800 3.2 2 3.2 0-4-1.2-6.2 1.3-10.200z"/>',
  },
  // A crescent blade.
  moonblade: {
    color: '#cfd8ff',
    body: '<path d="M16.5 2.500a9.5 9.5 0 1 0 5 13.500A7.8 7.8 0 0 1 16.5 2.500z"/>',
  },
  // A bell.
  toll: {
    color: '#e7bd78',
    body: '<path d="M12 2.500a1.5 1.5 0 0 1 1.5 1.500v.700A6 6 0 0 1 18 10.500v4.500l2 3H4l2-3v-4.500a6 6 0 0 1 4.5-5.800V4A1.5 1.5 0 0 1 12 2.500zM9.8 19.500h4.400a2.2 2.2 0 0 1-4.4 0z"/>',
  },
  // A seed bursting.
  seeds: {
    color: '#ff5a3c',
    body: `<circle cx="12" cy="15" r="4.5"/><path ${ink} d="M12 3v4.500M4.5 6.500l3.2 3.200M19.5 6.500l-3.2 3.2"/>`,
  },
  // Three spirits on their ring.
  fireflies: {
    color: '#d8f59a',
    body: `<circle ${ink} stroke-width="1" opacity=".5" cx="12" cy="12" r="7.5"/><circle cx="12" cy="4.5" r="2.4"/><circle cx="18.5" cy="15.7" r="2.4"/><circle cx="5.5" cy="15.7" r="2.4"/>`,
  },
  // A shoe with a wing at the heel.
  boots: {
    color: '#b9f3d4',
    body: `<path d="M9 4h4.500v8l5 2.500a2.5 2.5 0 0 1 1.5 2.300V20H7v-5.500l2-2z"/><path ${ink} d="M6 6.500L2.5 5M6 10L2.5 9.5"/>`,
  },
  // A loop of amber beads with a tassel.
  beads: {
    color: '#ffb347',
    body: `${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle cx="${(12 + 6.5 * Math.cos((i * Math.PI) / 4)).toFixed(2)}" cy="${(10 + 6.5 * Math.sin((i * Math.PI) / 4)).toFixed(2)}" r="1.9"/>`).join('')}<path ${ink} d="M12 16.500V22"/>`,
  },
  // A hooded cloak.
  cloak: {
    color: '#c4bfd2',
    body: '<path d="M12 2.500a4 4 0 0 1 4 4c3 2 4.5 7 4.5 14H13V9.500h-2V20.500H3.500c0-7 1.5-12 4.5-14a4 4 0 0 1 4-4z"/>',
  },
  // An hourglass.
  hourglass: {
    color: '#f1e3b8',
    body: '<path d="M5.5 2.500h13v2.500c0 3-3 5-4.3 7 1.3 2 4.3 4 4.3 7v2.500h-13V19c0-3 3-5 4.3-7-1.3-2-4.3-4-4.3-7z"/>',
  },
  // A ring with a stone.
  ring: {
    color: '#9fc38a',
    body: `<circle ${ink} stroke-width="2.6" cx="12" cy="15.5" r="5.5"/><path d="M12 2.500l3.5 3.500L12 10.5 8.5 6z"/>`,
  },
}

export function iconMarkup(id: SpellId | RelicId) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${glyphs[id].body}</svg>`
}
