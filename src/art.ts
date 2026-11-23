import { WIDTH, HEIGHT } from './battle'

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

export function floorTexture() {
  return texture(WIDTH, HEIGHT, (p) => {
    let seed = 701
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    box(p, 0, 0, WIDTH, HEIGHT, '#29272b')
    const stones = ['#413b40', '#433e43', '#454046', '#3c383e', '#403e41']
    for (let row = 0; row < 14; row++) {
      for (let x = -80 + (row % 2) * 40; x < WIDTH; x += 80) {
        const y = row * 38
        const bevel = 2 + random() * 4
        polygon(p, [[x+bevel,y+1],[x+75,y+1],[x+79,y+5],[x+78,y+34],
          [x+72,y+37],[x+3,y+36],[x,y+30]], stones[Math.floor(random()*stones.length)])
        box(p, x + 7, y + 2, 62, 1, '#63595b77')
      }
    }
    roseWindow(p, 625, 244)
    for (let i = 0; i < 11500; i++) {
      box(p, random()*WIDTH, random()*HEIGHT, 2, 1,
        random() < .5 ? '#15121b1c' : '#d6beb315')
    }

    // The old hedge grows in from the border, leaving the fighting area readable.
    for (const side of [0, HEIGHT]) {
      const inward = side === 0 ? 1 : -1
      for (let x = -28; x < WIDTH; x += 26) {
        const tip = side + inward * (16 + random() * 38)
        p.strokeStyle = '#332734'
        p.lineWidth = 4
        p.beginPath()
        p.moveTo(x, side)
        p.quadraticCurveTo(x+32, tip+inward*6, x+65, tip)
        p.stroke()
        polygon(p, [[x+29,tip],[x+22,tip+inward*12],[x+39,tip]], '#55444a')
        for (let j = 0; j < 6; j++) {
          const lx = x + random()*48, ly = side + inward*random()*22
          polygon(p, [[lx,ly],[lx+9,ly-5],[lx+22,ly-2],[lx+11,ly+4]], '#465044')
        }
      }
    }
    for (const x of [57, WIDTH-57]) {
      for (const y of [81, HEIGHT-81]) {
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
