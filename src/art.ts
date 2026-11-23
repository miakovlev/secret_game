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

function stripes(p: Pen, x: number, y: number, w: number, h: number) {
  p.save()
  p.beginPath()
  p.rect(x, y, w, h)
  p.clip()
  box(p, x, y, w, h, '#302e25')
  for (let i = -h; i < w + h; i += 17) {
    polygon(
      p,
      [
        [x + i, y + h],
        [x + i + h, y],
        [x + i + h + 8, y],
        [x + i + 8, y + h],
      ],
      '#a17c40',
    )
  }
  p.restore()
}

function vent(p: Pen, x: number, y: number) {
  box(p, x + 2, y + 3, 76, 27, '#20241f')
  box(p, x, y, 76, 26, '#545949')
  box(p, x + 3, y + 3, 70, 20, '#222621')
  for (let i = 5; i < 72; i += 5) {
    box(p, x + i, y + 4, 2, 17, '#41473b')
  }
}

export function floorTexture() {
  return texture(WIDTH, HEIGHT, (p) => {
    let seed = 701
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    box(p, 0, 0, WIDTH, HEIGHT, '#262a25')
    const tones = ['#3e433a', '#40453b', '#42463c', '#3d4238']
    for (let y = -28; y < HEIGHT; y += 64) {
      for (let x = -44; x < WIDTH; x += 80) {
        box(p, x, y, 79, 63, tones[Math.floor(random() * tones.length)])
        box(p, x + 1, y + 1, 77, 1, '#4c5044')
        for (const bx of [x + 4, x + 74]) box(p, bx, y + 4, 2, 2, '#30352b')
      }
    }
    for (let i = 0; i < 12000; i++) {
      box(
        p,
        random() * WIDTH,
        random() * HEIGHT,
        random() * 2 + 0.3,
        1,
        random() < 0.5 ? '#10181113' : '#c7c5a611',
      )
    }

    // Painted service lane and inspection hatch, flush with the floor.
    p.strokeStyle = '#797b58'
    p.lineWidth = 2
    p.setLineDash([14, 9])
    p.strokeRect(84, 66, 832, 358)
    p.setLineDash([])
    const cx = 640,
      cy = 242
    p.save()
    p.translate(cx, cy)
    for (const [r, color, width] of [
      [126, '#292e27', 4],
      [120, '#646954', 2],
      [108, '#515745', 5],
      [86, '#666a52', 2],
    ] as const) {
      p.beginPath()
      p.arc(0, 0, r, 0, Math.PI * 2)
      p.strokeStyle = color
      p.lineWidth = width
      p.stroke()
    }
    for (let i = 0; i < 32; i++) {
      p.rotate(Math.PI / 16)
      box(p, -1, -122, 2, i % 4 === 0 ? 9 : 4, '#87896b')
    }
    p.restore()
    p.fillStyle = '#6c7058'
    p.font = 'bold 66px Arial'
    p.fillText('07', 800, 351)
    box(p, 802, 361, 70, 3, '#71755d')
    for (const x of [106, 818]) {
      vent(p, x, 92)
      vent(p, x, 384)
    }
    for (const x of [24, WIDTH - 55]) {
      for (let y = 42; y < HEIGHT - 12; y += 109) {
        box(p, x, y, 31, 71, '#242922')
        box(p, x + 2, y + 2, 27, 65, '#505648')
        stripes(p, x + 6, y + 8, 19, 51)
      }
    }
    for (const y of [0, HEIGHT - 27]) {
      box(p, 0, y, WIDTH, 27, '#1f241f')
      for (let x = 0; x < WIDTH; x += 100) {
        box(p, x + 2, y + 2, 96, 22, '#464c40')
        box(p, x + 4, y + 4, 91, 2, '#666c59')
        box(p, x + 10, y + 9, 58, 8, '#292f27')
        box(p, x + 77, y + 9, 10, 4, '#c89a5a')
      }
    }
    const shade = p.createRadialGradient(520, 225, 150, 510, 230, 570)
    shade.addColorStop(0, '#11171100')
    shade.addColorStop(1, '#1016106b')
    p.fillStyle = shade
    p.fillRect(0, 0, WIDTH, HEIGHT)
  })
}

export function operatorTexture() {
  return texture(50, 50, (p) => {
    p.translate(25, 25)
    circle(p, 0, 1, 16, '#202a22')
    box(p, -12, -13, 18, 7, '#8eb99e')
    box(p, -12, 6, 18, 7, '#709980')
    box(p, -11, -7, 19, 15, '#365449')
    box(p, 3, 4, 19, 5, '#202b27')
    box(p, 7, 4, 15, 2, '#c6e6cc')
    polygon(
      p,
      [
        [-8, -6],
        [-3, -10],
        [6, -8],
        [10, -3],
        [9, 5],
        [3, 8],
        [-6, 7],
        [-10, 1],
      ],
      '#cbe7cc',
    )
    polygon(
      p,
      [
        [2, -6],
        [8, -4],
        [10, 1],
        [7, 4],
        [3, 3],
      ],
      '#294941',
    )
    box(p, 6, -3, 3, 4, '#94ffde')
    box(p, -13, -5, 3, 10, '#e0ac6e')
  })
}

export function droneTexture() {
  return texture(42, 42, (p) => {
    p.translate(21, 21)
    for (const side of [-1, 1]) {
      p.save()
      p.scale(1, side)
      polygon(
        p,
        [
          [-13, 12],
          [-10, 5],
          [-4, 4],
          [-6, 12],
        ],
        '#c77650',
      )
      polygon(
        p,
        [
          [1, 6],
          [10, 4],
          [14, 11],
          [8, 12],
        ],
        '#ad6649',
      )
      box(p, -11, 10, 4, 3, '#383a30')
      p.restore()
    }
    polygon(
      p,
      [
        [-13, -3],
        [-9, -8],
        [4, -8],
        [13, -2],
        [13, 3],
        [3, 8],
        [-8, 7],
      ],
      '#292c27',
    )
    polygon(
      p,
      [
        [-9, -4],
        [-4, -7],
        [5, -5],
        [9, -1],
        [4, 4],
        [-7, 4],
      ],
      '#a76f50',
    )
    box(p, 5, -3, 7, 5, '#ff9a71')
    box(p, 9, -2, 3, 3, '#ffe2a7')
  })
}
