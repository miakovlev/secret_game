import { court } from './content'

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

export function wardenTexture() {
  return texture(50, 50, p => {
    p.translate(25,25)
    circle(p,-2,2,15,'#221f2b')
    // Swept cloak, hood, and a lit lantern on the leading hand.
    polygon(p, [[9,0],[-2,-11],[-18,-13],[-13,-2],[-19,12],[-3,9]], '#3e7871')
    polygon(p, [[4,1],[-9,6],[-19,12],[-11,0]], '#78b3a1')
    polygon(p, [[-6,-7],[2,-9],[9,-5],[11,1],[4,7],[-5,6]], '#aacbb3')
    polygon(p, [[4,-5],[10,-2],[9,3],[5,3]], '#51414c')
    box(p,4,7,12,2,'#c9a977')
    polygon(p, [[15,3],[19,7],[16,13],[12,8]], '#fce7a6')
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
