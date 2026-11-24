import { court } from './content'
import type { HeroId } from './content'

type Pen = CanvasRenderingContext2D

function texture(width: number, height: number, paint: (pen: Pen) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  paint(canvas.getContext('2d')!)
  return canvas
}

function box(
  p: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  p.fillStyle = color
  p.fillRect(x, y, w, h)
}

function polygon(p: Pen, points: number[][], color: string) {
  p.fillStyle = color
  p.beginPath()
  points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
  p.closePath()
  p.fill()
}

function circle(p: Pen, x: number, y: number, radius: number, color: string) {
  p.beginPath()
  p.arc(x, y, radius, 0, Math.PI * 2)
  p.fillStyle = color
  p.fill()
}

function roseWindow(p: Pen, x: number, y: number) {
  p.save()
  p.translate(x, y)
  circle(p, 0, 0, 120, '#322d35')
  p.strokeStyle = '#796a64'
  for (const radius of [117, 111, 81]) {
    p.beginPath()
    p.arc(0, 0, radius, 0, Math.PI * 2)
    p.stroke()
  }
  for (let i = 0; i < 8; i++) {
    p.rotate(Math.PI / 4)
    p.beginPath()
    p.moveTo(0, -12)
    p.bezierCurveTo(-45, -54, -32, -68, 0, -103)
    p.bezierCurveTo(32, -68, 45, -54, 0, -12)
    p.fillStyle = i % 2 ? '#423a47' : '#44353e'
    p.fill()
    p.stroke()
    polygon(p, [[0,-91],[-6,-63],[0,-45],[6,-63]], '#6a595a')
  }
  circle(p, 0, 0, 15, '#81715f')
  circle(p, 0, 0, 10, '#493e45')
  p.restore()
}

// The old hedge grows in from one wall. Drawn along the top edge of a strip
// `length` long; the caller turns the canvas to place it on each wall.
function hedge(p: Pen, length: number, random: () => number) {
  for (let x = -28; x < length; x += 26) {
    const tip = 16 + random() * 38
    p.strokeStyle = '#332734'
    p.lineWidth = 4
    p.beginPath()
    p.moveTo(x, 0)
    p.quadraticCurveTo(x+32, tip+6, x+65, tip)
    p.stroke()
    polygon(p, [[x+29,tip],[x+22,tip+12],[x+39,tip]], '#55444a')
    for (let j = 0; j < 6; j++) {
      const lx = x + random()*48, ly = random()*22
      polygon(p, [[lx,ly],[lx+9,ly-5],[lx+22,ly-2],[lx+11,ly+4]], '#465044')
    }
  }
}

function candles(p: Pen, x: number, y: number) {
  const glow = p.createRadialGradient(x,y,2,x,y,48)
  glow.addColorStop(0,'#f3ba6966')
  glow.addColorStop(1,'#d68c4100')
  p.fillStyle = glow
  p.fillRect(x-48,y-48,96,96)
  polygon(p, [[x-13,y],[x,y-13],[x+13,y],[x,y+13]], '#74645b')
  for (const [dx,dy] of [[-4,0],[4,2],[0,-4]]) {
    box(p,x+dx-1,y+dy,3,6,'#d4c1a3')
    circle(p,x+dx,y+dy-1,2,'#ffe7a5')
  }
}

// The gate to the throne garden: a dark opening in the north hedge behind iron bars.
function gate(p: Pen, x: number, y: number) {
  const glow = p.createRadialGradient(x,y+40,10,x,y+40,170)
  glow.addColorStop(0,'#8d5f7a55')
  glow.addColorStop(1,'#8d5f7a00')
  p.fillStyle = glow
  p.fillRect(x-170,y,340,210)
  box(p, x-78, y, 156, 62, '#141018')
  for (let bar = -66; bar <= 66; bar += 22) {
    box(p, x+bar-2, y, 4, 58, '#5d5560')
    polygon(p, [[x+bar-5,y+58],[x+bar,y+68],[x+bar+5,y+58]], '#5d5560')
  }
  box(p, x-78, y+20, 156, 4, '#5d5560')
  for (const side of [-1, 1]) {
    box(p, x+side*92-16, y, 32, 78, '#57494f')
    box(p, x+side*92-20, y+72, 40, 10, '#6f5f62')
    circle(p, x+side*92, y+92, 5, '#ffe7a5')
  }
  for (let step = 0; step < 3; step++) {
    box(p, x-70+step*8, y+84+step*14, 140-step*16, 10, '#514950')
  }
}

// The Gardener's grave: a mound, a leaning headstone and a small bell on a post.
function grave(p: Pen, x: number, y: number) {
  p.save()
  p.translate(x, y)
  p.scale(1, 0.6)
  circle(p, 0, 26, 64, '#2a2420')
  circle(p, 0, 22, 54, '#3a3029')
  p.restore()
  polygon(p, [[x-20,y+4],[x-22,y-34],[x-10,y-48],[x+8,y-46],[x+18,y-32],[x+16,y+6]], '#7a7078')
  polygon(p, [[x-14,y],[x-16,y-31],[x-8,y-41],[x+5,y-40],[x+12,y-29],[x+11,y+2]], '#655c64')
  box(p, x-6, y-30, 12, 2, '#3e373f')
  box(p, x-1, y-36, 2, 22, '#3e373f')
  box(p, x+38, y-40, 3, 48, '#57494f')
  box(p, x+26, y-40, 15, 3, '#57494f')
  polygon(p, [[x+24,y-37],[x+32,y-37],[x+35,y-27],[x+21,y-27]], '#e7bd78')
  circle(p, x+28, y-25, 2, '#fce7a6')
}

export function floorTexture() {
  const { width, height } = court
  return texture(width, height, (p) => {
    let seed = 701
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    box(p, 0, 0, width, height, '#29272b')
    const stones = ['#413b40', '#433e43', '#454046', '#3c383e', '#403e41']
    for (let row = 0; row * 38 < height; row++) {
      for (let x = -80 + (row % 2) * 40; x < width; x += 80) {
        const y = row * 38
        const bevel = 2 + random() * 4
        polygon(p, [[x+bevel,y+1],[x+75,y+1],[x+79,y+5],[x+78,y+34],
          [x+72,y+37],[x+3,y+36],[x,y+30]], stones[Math.floor(random()*stones.length)])
        box(p, x + 7, y + 2, 62, 1, '#63595b77')
      }
    }

    // A worn side path leads from the rose to the grave.
    const centre = { x: width / 2, y: height / 2 }
    p.lineCap = 'round'
    for (const [line, color] of [[58, '#8a7c7222'], [40, '#9a8b7f1f']] as const) {
      p.strokeStyle = color
      p.lineWidth = line
      p.beginPath()
      p.moveTo(centre.x, centre.y)
      p.quadraticCurveTo(court.grave.x - 260, centre.y + 40, court.grave.x - 30, court.grave.y)
      p.stroke()
    }
    p.lineWidth = 1
    // What is left of the chapel: a paved round with pillar stumps, broken
    // walls and the altar where the last lantern was lit.
    circle(p, centre.x, centre.y, 196, '#3a343a55')
    p.strokeStyle = '#5a5058'
    p.lineWidth = 3
    p.beginPath()
    p.arc(centre.x, centre.y, 196, 0, Math.PI * 2)
    p.stroke()
    p.lineWidth = 9
    p.strokeStyle = '#4c444c'
    for (const [from, to] of [[3.5, 4.3], [4.9, 5.6], [0.3, 0.9], [2.2, 2.9]]) {
      p.beginPath()
      p.arc(centre.x, centre.y, 214, from, to)
      p.stroke()
    }
    p.lineWidth = 1
    for (let i = 0; i < 8; i++) {
      const turn = (i / 8) * Math.PI * 2 + Math.PI / 8
      const px = centre.x + Math.cos(turn) * 172, py = centre.y + Math.sin(turn) * 172
      circle(p, px + 2, py + 3, 14, '#1d1a22')
      circle(p, px, py, 13, '#6a6068')
      circle(p, px, py, 8, '#877c84')
    }
    const altar = { x: centre.x, y: centre.y - 150 }
    const shine = p.createRadialGradient(altar.x, altar.y, 4, altar.x, altar.y, 70)
    shine.addColorStop(0, '#f3ba6955')
    shine.addColorStop(1, '#f3ba6900')
    p.fillStyle = shine
    p.fillRect(altar.x - 70, altar.y - 70, 140, 140)
    box(p, altar.x - 30, altar.y - 12, 60, 24, '#5a5058')
    box(p, altar.x - 26, altar.y - 9, 52, 18, '#7b7078')
    polygon(p, [[altar.x - 6, altar.y - 6], [altar.x + 6, altar.y - 6], [altar.x + 8, altar.y + 6], [altar.x - 8, altar.y + 6]], '#c9a977')
    circle(p, altar.x, altar.y, 4, '#fce7a6')
    roseWindow(p, centre.x, centre.y)
    grave(p, court.grave.x, court.grave.y)
    for (let i = 0; i < 11500 * (width * height) / 490000; i++) {
      box(p, random()*width, random()*height, 2, 1,
        random() < .5 ? '#15121b1c' : '#d6beb315')
    }

    // The hedge leaves the fighting area readable and parts only for the gate.
    hedge(p, width, random)
    for (const turn of [[1,0,0,-1,0,height], [0,1,1,0,0,0], [0,1,-1,0,width,0]]) {
      p.save()
      p.transform(turn[0], turn[1], turn[2], turn[3], turn[4], turn[5])
      hedge(p, turn[0] ? width : height, random)
      p.restore()
    }
    gate(p, court.gate.x, court.gate.y)

    // Candles mark the edge of the court.
    for (let x = 57; x < width; x += (width - 114) / 6) {
      if (Math.abs(x - court.gate.x) > 150) candles(p, x, 81)
      candles(p, x, height - 81)
    }
    for (let y = 81 + (height - 162) / 3; y < height - 100; y += (height - 162) / 3) {
      candles(p, 57, y)
      candles(p, width - 57, y)
    }
  })
}

// Heroes share one figure: swept cloak, hood and a thing held in the leading hand.
const heroLooks: Record<HeroId, { cloak: string; fold: string; hood: string; held: (p: Pen) => void }> = {
  warden: {
    cloak: '#3e7871', fold: '#78b3a1', hood: '#aacbb3',
    // A lit lantern.
    held: p => {
      box(p,4,7,12,2,'#c9a977')
      polygon(p, [[15,3],[19,7],[16,13],[12,8]], '#fce7a6')
    },
  },
  duelist: {
    cloak: '#46557e', fold: '#8799c9', hood: '#c9d3ee',
    // A long pale blade.
    held: p => {
      box(p,3,6,7,3,'#c9a977')
      polygon(p, [[9,5],[24,7],[9,10]], '#eef2ff')
    },
  },
  ringer: {
    cloak: '#7a5636', fold: '#b98d5a', hood: '#e2c79a',
    // A handbell.
    held: p => {
      box(p,4,7,8,2,'#6b4a2c')
      polygon(p, [[11,4],[17,2],[20,8],[17,14],[11,12]], '#e7bd78')
      circle(p,19,8,2,'#fce7a6')
    },
  },
}

export function heroTexture(id: HeroId) {
  const look = heroLooks[id]
  return texture(50, 50, p => {
    p.translate(25,25)
    circle(p,-2,2,15,'#221f2b')
    polygon(p, [[9,0],[-2,-11],[-18,-13],[-13,-2],[-19,12],[-3,9]], look.cloak)
    polygon(p, [[4,1],[-9,6],[-19,12],[-11,0]], look.fold)
    polygon(p, [[-6,-7],[2,-9],[9,-5],[11,1],[4,7],[-5,6]], look.hood)
    polygon(p, [[4,-5],[10,-2],[9,3],[5,3]], '#51414c')
    look.held(p)
  })
}

export function briarlingTexture() {
  return texture(42, 42, p => {
    p.translate(21,21)
    for (const side of [-1,1]) {
      p.save()
      p.scale(1,side)
      polygon(p,[[-9,3],[-13,11],[-19,15],[-16,7],[-12,2]],'#ae7858')
      polygon(p,[[0,3],[5,12],[13,16],[10,8],[8,2]],'#c18a69')
      polygon(p,[[-5,2],[-9,8],[-6,14],[-13,8]],'#925e58')
      p.restore()
    }
    polygon(p,[[-15,0],[-8,-7],[0,-9],[8,-5],[13,0],[8,6],[0,9],[-9,6]],'#835954')
    polygon(p,[[-13,0],[-2,-5],[6,-3],[2,0],[6,3],[-3,4]],'#be8265')
    circle(p,7,-3,2,'#ffbf85')
    circle(p,7,3,2,'#ffbf85')
  })
}

export function emberTexture() {
  return texture(26, 26, p => {
    const glow = p.createRadialGradient(13, 13, 1, 13, 13, 13)
    glow.addColorStop(0, '#ff9a3caa')
    glow.addColorStop(1, '#ff7a2c00')
    p.fillStyle = glow
    p.fillRect(0, 0, 26, 26)
    polygon(p, [[13,7],[18,13],[13,19],[8,13]], '#ffb45e')
    polygon(p, [[13,10],[15,13],[13,16],[11,13]], '#fff0b8')
  })
}

// All foes are drawn facing right; the scene turns them.
export function boarTexture() {
  return texture(68, 68, p => {
    p.translate(34, 34)
    circle(p, -3, 3, 24, '#1d1a22')
    // Bristling back of thorns, heavy shoulders, lowered head and tusks.
    for (let i = -3; i <= 3; i++) {
      polygon(p, [[-20+i*2,i*6-3],[-32,i*7],[-20+i*2,i*6+3]], '#3d2c33')
    }
    polygon(p, [[-22,-14],[-8,-20],[10,-16],[22,-6],[22,6],[10,16],[-8,20],[-22,14]], '#5b3f3a')
    polygon(p, [[-14,-10],[-2,-14],[10,-10],[14,0],[10,10],[-2,14],[-14,10]], '#77524a')
    polygon(p, [[12,-11],[26,-7],[31,0],[26,7],[12,11]], '#4a3231')
    for (const side of [-1, 1]) {
      polygon(p, [[24,side*6],[34,side*11],[27,side*10]], '#f0e2c4')
      circle(p, 20, side*5, 2, '#ff6a4d')
    }
  })
}

export function archerTexture() {
  return texture(48, 48, p => {
    p.translate(24, 24)
    circle(p, -2, 2, 14, '#1d1a22')
    // Pale court coat, hood, and a drawn bow held forward.
    polygon(p, [[-14,-9],[2,-10],[8,0],[2,10],[-14,9],[-9,0]], '#8f8aa3')
    polygon(p, [[-10,-6],[1,-7],[5,0],[1,7],[-10,6]], '#c4bfd2')
    circle(p, 2, 0, 5, '#3b3346')
    p.strokeStyle = '#d9c08a'
    p.lineWidth = 2
    p.beginPath()
    p.arc(4, 0, 15, -1.15, 1.15)
    p.stroke()
    p.strokeStyle = '#f3ead2'
    p.lineWidth = 1
    p.beginPath()
    p.moveTo(10, -13.5)
    p.lineTo(10, 13.5)
    p.stroke()
    box(p, 4, -1, 18, 2, '#f3ead2')
  })
}

export function oilTexture() {
  return texture(30, 30, p => {
    const glow = p.createRadialGradient(15, 15, 1, 15, 15, 15)
    glow.addColorStop(0, '#8ff0d099')
    glow.addColorStop(1, '#8ff0d000')
    p.fillStyle = glow
    p.fillRect(0, 0, 30, 30)
    // A small lamp-oil flask with a cork.
    polygon(p, [[12,9],[18,9],[18,13],[22,18],[20,24],[10,24],[8,18],[12,13]], '#3f8f86')
    polygon(p, [[13,15],[17,15],[19,19],[18,22],[12,22],[11,19]], '#a9efd9')
    box(p, 12, 6, 6, 3, '#c9a977')
  })
}

export function duchessTexture() {
  return texture(128, 128, p => {
    p.translate(64, 64)
    circle(p, 0, 6, 46, '#17131c')
    // Two lashes of thorn rest at her sides.
    p.lineCap = 'round'
    for (const side of [-1, 1]) {
      p.strokeStyle = '#4b6b4a'
      p.lineWidth = 5
      p.beginPath()
      p.moveTo(side * 22, 4)
      p.bezierCurveTo(side * 52, -8, side * 60, 28, side * 44, 44)
      p.stroke()
      polygon(p, [[side*44,44],[side*52,54],[side*38,50]], '#9fc38a')
    }
    // Widow's gown, veil, pale face and the crown.
    polygon(p, [[-34,40],[-24,-6],[0,-22],[24,-6],[34,40],[0,50]], '#2d2233')
    polygon(p, [[-22,34],[-15,-2],[0,-14],[15,-2],[22,34],[0,42]], '#4a3552')
    polygon(p, [[-6,36],[-3,-4],[3,-4],[6,36]], '#7d5870')
    circle(p, 0, -14, 15, '#3a2c40')
    circle(p, 0, -12, 10, '#e6d6dc')
    box(p, -6, -14, 4, 2, '#3a2c40')
    box(p, 2, -14, 4, 2, '#3a2c40')
    for (let i = -3; i <= 3; i++) {
      polygon(p, [[i*6-3,-22],[i*6,-36+Math.abs(i)*3],[i*6+3,-22]], '#e7bd78')
    }
    box(p, -21, -24, 42, 4, '#c9a05a')
  })
}

export function sealTexture() {
  return texture(60, 60, p => {
    const glow = p.createRadialGradient(30, 30, 2, 30, 30, 30)
    glow.addColorStop(0, '#e58af599')
    glow.addColorStop(1, '#e58af500')
    p.fillStyle = glow
    p.fillRect(0, 0, 60, 60)
    p.translate(30, 30)
    for (let i = 0; i < 6; i++) {
      p.rotate(Math.PI / 3)
      polygon(p, [[0,-3],[-8,-13],[0,-23],[8,-13]], i % 2 ? '#b84fc8' : '#d877e6')
    }
    circle(p, 0, 0, 7, '#ffe7a5')
    circle(p, 0, 0, 3, '#c9a05a')
  })
}

// A marked briarling: larger, darker, with a glowing sigil on its back.
export function markedTexture() {
  return texture(58, 58, p => {
    p.translate(29, 29)
    circle(p, -2, 2, 22, '#1d1a22')
    p.scale(1.35, 1.35)
    for (const side of [-1,1]) {
      p.save()
      p.scale(1,side)
      polygon(p,[[-9,3],[-13,11],[-19,15],[-16,7],[-12,2]],'#7a4a52')
      polygon(p,[[0,3],[5,12],[13,16],[10,8],[8,2]],'#8d5a5c')
      polygon(p,[[-5,2],[-9,8],[-6,14],[-13,8]],'#63394a')
      p.restore()
    }
    polygon(p,[[-15,0],[-8,-7],[0,-9],[8,-5],[13,0],[8,6],[0,9],[-9,6]],'#5a3344')
    polygon(p,[[-13,0],[-2,-5],[6,-3],[2,0],[6,3],[-3,4]],'#8a4f5e')
    polygon(p,[[-6,0],[-2,-4],[2,0],[-2,4]],'#ffd27a')
    circle(p,7,-3,2,'#ffe08a')
    circle(p,7,3,2,'#ffe08a')
  })
}

export function reliquaryTexture() {
  return texture(44, 44, p => {
    const glow = p.createRadialGradient(22, 22, 2, 22, 22, 22)
    glow.addColorStop(0, '#ffe08a88')
    glow.addColorStop(1, '#ffe08a00')
    p.fillStyle = glow
    p.fillRect(0, 0, 44, 44)
    // A small casket with a peaked lid, gilt bands and a keyhole.
    polygon(p, [[9,18],[22,9],[35,18]], '#8a5a3a')
    box(p, 9, 18, 26, 15, '#6b4230')
    box(p, 9, 18, 26, 3, '#e7bd78')
    box(p, 20, 9, 4, 24, '#e7bd78')
    box(p, 9, 30, 26, 3, '#c9a05a')
    circle(p, 22, 24, 3, '#2a1c18')
  })
}

export function knightTexture() {
  return texture(72, 72, p => {
    p.translate(36, 36)
    circle(p, -3, 3, 27, '#1d1a22')
    // Broad stone pauldrons, a tower shield held forward and a slit helm.
    polygon(p, [[-20,-22],[-2,-26],[10,-18],[10,18],[-2,26],[-20,22],[-26,0]], '#6f6a72')
    polygon(p, [[-14,-16],[-2,-19],[6,-13],[6,13],[-2,19],[-14,16],[-18,0]], '#8d8790')
    circle(p, -2, 0, 10, '#a39da6')
    box(p, 2, -5, 5, 10, '#2a2530')
    polygon(p, [[12,-22],[24,-17],[27,0],[24,17],[12,22]], '#55505a')
    polygon(p, [[15,-16],[22,-12],[24,0],[22,12],[15,16]], '#7b7580')
    box(p, 17, -1, 6, 2, '#c9a05a')
    for (const y of [-20, 20]) circle(p, -16, y, 3, '#4a4650')
  })
}

export function mothTexture() {
  return texture(48, 48, p => {
    const glow = p.createRadialGradient(24, 24, 2, 24, 24, 24)
    glow.addColorStop(0, '#ffe08a55')
    glow.addColorStop(1, '#ffe08a00')
    p.fillStyle = glow
    p.fillRect(0, 0, 48, 48)
    p.translate(24, 24)
    // Pale dusty wings and a small golden body.
    for (const side of [-1, 1]) {
      polygon(p, [[2,side*2],[-6,side*18],[-18,side*16],[-12,side*4]], '#e9dcc0')
      polygon(p, [[2,side*2],[10,side*14],[16,side*8],[8,side*1]], '#f6ecd6')
      circle(p, -10, side*11, 3, '#c9a05a')
    }
    polygon(p, [[-10,0],[-2,-3],[10,0],[-2,3]], '#e7bd78')
    circle(p, 10, 0, 2.5, '#fff0b8')
  })
}

// A boss before it gets a look of its own: a stooped giant of roots, told
// from the others by the colour of its growth and eyes.
export function bossTexture(growth: string, eyes: string) {
  return texture(104, 104, p => {
    p.translate(52, 52)
    circle(p, -3, 4, 42, '#17131c')
    for (let i = 0; i < 9; i++) {
      const turn = (i / 9) * Math.PI * 2
      const x = Math.cos(turn) * 34, y = Math.sin(turn) * 34
      polygon(p, [[x*0.6,y*0.6],[x+8,y-4],[x*1.25,y*1.25],[x-6,y+6]], growth)
    }
    polygon(p, [[-30,-22],[-8,-36],[18,-30],[34,-6],[30,20],[8,34],[-18,32],[-34,8]], '#4a3a2e')
    polygon(p, [[-22,-16],[-6,-26],[13,-22],[24,-4],[21,14],[5,24],[-13,23],[-25,6]], '#5f4c3a')
    polygon(p, [[-26,-6],[-12,-18],[-2,-8],[-14,6]], growth)
    polygon(p, [[6,10],[20,2],[24,14],[10,22]], growth)
    circle(p, 14, -10, 9, '#3a2c26')
    circle(p, 17, -13, 2, eyes)
    circle(p, 19, -7, 2, eyes)
  })
}
