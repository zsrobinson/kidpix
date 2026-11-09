const TAU = Math.PI * 2

function dot(context, x, y, radius) {
  context.beginPath()
  context.arc(x, y, Math.max(0.2, radius), 0, TAU)
  context.fill()
}

export function brushOpacity({ tool, variant, opacity }) {
  if (opacity != null) return opacity
  if (tool === 'marker') return 0.45
  if (variant === 'watercolor' || variant === 'watercolour') return 0.53
  return 1
}

export function brushSpacing({ tool, variant, size }) {
  if (tool === 'mixer') return Math.max(3, size * 0.25)
  if (tool === 'spray' || tool === 'wacky' || variant === 'wacky') return Math.max(2, size * 0.31)
  return Math.max(0.5, size * 0.12)
}

function grain(context, point, size, random, chalk) {
  const dots = Math.max(4, Math.min(90, Math.ceil(size * (chalk ? 2 : 1.4))))
  const grainSize = chalk ? 0.85 : 1.25
  for (let i = 0; i < dots; i++) {
    const angle = random() * TAU
    const distance = Math.sqrt(random()) * size / 2
    context.globalAlpha = chalk ? 0.1 + 0.45 * random() : 0.35 + 0.65 * random()
    dot(
      context,
      point.x + distance * Math.cos(angle),
      point.y + distance * Math.sin(angle),
      grainSize * (random() + 0.28),
    )
  }
}

function softDot(context, point, size, color, strength) {
  const radius = size / 2
  const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, 'transparent')
  context.fillStyle = gradient
  context.globalAlpha = strength
  dot(context, point.x, point.y, radius)
}

function drawSpray(context, point, { size, color, variant }, image, random) {
  const angle = random() * TAU
  const distance = Math.sqrt(random()) * size / 2
  const x = point.x + Math.cos(angle) * distance
  const y = point.y + Math.sin(angle) * distance
  if (image) {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const scale = (0.7 + random() * 0.35) * Math.max(0.6, Math.sqrt(size / 8))
    context.translate(x, y)
    context.rotate((random() - 0.5) * 0.9)
    context.drawImage(image, -width * scale / 2, -height * scale / 2, width * scale, height * scale)
    return
  }
  if (variant === 'bubble' || variant === 'bubbles') {
    const radius = size * (0.1 + 0.24 * random())
    const gradient = context.createRadialGradient(x - radius / 3, y - radius / 3, 0, x, y, radius)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.55, color)
    gradient.addColorStop(1, 'transparent')
    context.fillStyle = gradient
    dot(context, x, y, radius)
    return
  }
  grain(context, point, size, random, true)
}

const wackyEffects = ['rainbow', 'stars', 'confetti', 'bubbles', 'splat', 'spiral', 'letters', 'drips']
const wackyAliases = {
  'abc-text': 'letters',
  'drippy-paint': 'drips',
  'rainbow-swirl': 'rainbow',
  'green-hoops': 'hoops',
  'leaky-pen': 'drips',
  'pixie-dust': 'confetti',
  'spiral-pen': 'spiral',
  'scratchy-pen': 'scratch',
  'dot-to-dots': 'dots',
  splats: 'splat',
  swirls: 'spiral',
  swirl: 'spiral',
}

function radialPath(context, x, y, radius, sides, angle = 0) {
  context.beginPath()
  for (let i = 0; i < sides; i++) {
    const step = i * TAU / sides + angle
    context.lineTo(x + radius * Math.cos(step), y + radius * Math.sin(step))
  }
  context.closePath()
}

function drawBuilding(context, kind, radius, color) {
  context.fillStyle = color
  context.strokeStyle = '#41222c'
  context.lineWidth = Math.max(1, radius / 13)
  if (kind === 'roof') {
    radialPath(context, 0, 0, radius, 3, -Math.PI / 2)
    context.fill()
    context.stroke()
    return
  }
  const rows = kind === 'window' || kind.includes('door') ? 2 : 3
  const columns = kind === 'logs' ? 1 : kind === 'bricks' ? 3 : 2
  const width = radius * 1.7 / columns
  const height = radius * 1.65 / rows
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * width - radius * 0.85
      const y = row * height - radius * 0.825
      context.fillRect(x, y, width, height)
      context.strokeRect(x, y, width, height)
    }
  }
}

function drawTree(context, radius, random, depth = 0) {
  const branch = radius * (depth ? 0.67 : 1)
  context.lineWidth = Math.max(0.5, branch / 6)
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(0, -branch)
  context.stroke()
  if (depth >= 3) return
  for (const direction of [-1, 1]) {
    context.save()
    context.translate(0, -branch * (0.7 + random() * 0.3))
    context.rotate(direction * (0.35 + random() * 0.65))
    drawTree(context, branch, random, depth + 1)
    context.restore()
  }
}

function drawWacky(context, point, options, image, random, step) {
  const { color, text } = options
  const size = Math.max(12, options.size * 2.4)
  const variant = options.variant.toLowerCase().replaceAll(' ', '-')
  const effect = variant === 'wacky' || variant === 'freehand'
    ? wackyEffects[(options.effectIndex || 0) % wackyEffects.length]
    : wackyAliases[variant] || variant
  const radius = size / 2
  const { x, y } = point
  const hue = step * 14 % 360
  if (image || effect === 'bubbles') {
    drawSpray(context, point, { size, color, variant: 'bubbles' }, image, random)
    return
  }
  context.fillStyle = color
  if (effect === 'letters') {
    const letters = [...(text || 'KID PIX')]
    context.font = `bold ${Math.max(12, size)}px sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(letters[step % letters.length], x, y)
    return
  }
  if (effect === 'rainbow') {
    context.fillStyle = `hsl(${hue} 92% 53%)`
    dot(context, x, y, radius * 0.8)
    return
  }
  if (effect === 'spiral') {
    context.strokeStyle = color
    context.lineWidth = Math.max(1, size * 0.07)
    context.beginPath()
    context.moveTo(x, y)
    for (let i = 1; i <= 30; i++) {
      const angle = i * TAU / 10 + step
      context.lineTo(x + Math.cos(angle) * radius * i / 30, y + Math.sin(angle) * radius * i / 30)
    }
    context.stroke()
    return
  }
  if (effect === 'splat' || effect === 'drips') {
    const dripping = effect === 'drips'
    dot(context, x, y, radius * 0.49)
    for (let i = 0; i < 8; i++) {
      const angle = random() * TAU
      const distance = radius * (0.45 + random())
      const offset = dripping ? radius * (0.5 + random() * 1.5) : 0
      dot(context, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance + offset, radius * (0.07 + random() * 0.2))
    }
    return
  }
  if (effect === 'confetti') {
    for (let i = 0; i < 6; i++) {
      context.fillStyle = `hsl(${(hue + i * 67) % 360} 93% 58%)`
      dot(context, x + (random() - 0.5) * size, y + (random() - 0.5) * size, radius * 0.17)
    }
    return
  }
  context.translate(x, y)
  context.strokeStyle = color
  context.lineWidth = Math.max(0.8, radius * 0.09)
  if (['bricks', 'logs', 'window', 'french-door', 'wood-door', 'roof'].includes(effect)) {
    drawBuilding(context, effect, radius, color)
    return
  }
  if (effect === 'fractal-trees') {
    context.translate(0, radius * 0.65)
    drawTree(context, radius, random)
    return
  }
  if (effect === 'hoops' || effect === 'dots' || effect === 'kooshie' || effect === 'kaleidoscope') {
    const count = effect === 'kooshie' ? 18 : 8
    for (let i = 0; i < count; i++) {
      context.save()
      context.rotate(step * 0.13 + i * TAU / count)
      if (effect === 'dots') {
        dot(context, radius * 0.65, 0, radius * 0.15)
      } else if (effect === 'hoops') {
        context.strokeStyle = '#379927'
        context.beginPath()
        context.ellipse(radius * 0.38, 0, radius * 0.65, radius * 0.16, 0, 0, TAU)
        context.stroke()
      } else {
        context.strokeStyle = `hsl(${(hue + i * 27) % 360} 80% 50%)`
        context.beginPath()
        context.moveTo(0, 0)
        context.quadraticCurveTo(radius * 0.7, -radius * 0.25, radius * (0.7 + random() * 0.5), radius * 0.35)
        context.stroke()
      }
      context.restore()
    }
    return
  }
  if (effect === 'pyramid' || effect === 'triangle-swirls' || effect === 'fracture' || effect === 'color-tiles') {
    const count = effect === 'color-tiles' ? 4 : 3
    for (let i = 0; i < count; i++) {
      context.fillStyle = `hsl(${(hue + i * 72) % 360} 83% 52%)`
      radialPath(context, (random() - 0.5) * radius, (random() - 0.5) * radius, radius * (0.95 - 0.15 * i), count, step + i)
      context.fill()
    }
    return
  }
  if (['zig-zag-pen', 'scratch', 'lightning', 'ribbon'].includes(effect)) {
    context.beginPath()
    context.moveTo(-radius, 0)
    for (let i = 1; i <= 5; i++) context.lineTo((i / 2.5 - 1) * radius, (i % 2 ? -1 : 1) * radius * random())
    context.stroke()
    return
  }
  context.rotate(step * 0.65)
  if (effect === 'hearts') {
    context.beginPath()
    context.moveTo(0, radius * 0.7)
    context.bezierCurveTo(-radius * 2, -radius * 0.6, -radius * 0.4, -radius, 0, -radius * 0.25)
    context.bezierCurveTo(radius * 0.4, -radius, radius * 2, -radius * 0.6, 0, radius * 0.7)
    context.fill()
    return
  }
  context.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = i * TAU / 10
    const length = radius * (i % 2 ? 0.37 : 0.85)
    context.lineTo(Math.cos(angle) * length, Math.sin(angle) * length)
  }
  context.closePath()
  context.fill()
}

const realisticEffects = ['wet', 'dry', 'tube', 'watercolor', 'airbrush', 'flat', 'roller', 'oil']

export function drawBrushDab(context, point, options, image, random, step) {
  const { tool, color, size, variant, mode } = options
  context.save()
  context.fillStyle = color
  if (tool === 'eraser') {
    if (variant === 'square') context.fillRect(point.x - size / 2, point.y - size / 2, size, size)
    else dot(context, point.x, point.y, size / 2)
  } else if (tool === 'chalk' || tool === 'crayon') {
    grain(context, point, size, random, tool === 'chalk')
  } else if (tool === 'spray') {
    drawSpray(context, point, options, image, random)
  } else if (tool === 'wacky' || mode === 'wacky' || variant === 'wacky') {
    drawWacky(context, point, options, image, random, step)
  } else if (tool === 'brush' || tool === 'paint') {
    const effect = variant === 'freehand' || variant === 'realistic'
      ? realisticEffects[(options.effectIndex || 0) % realisticEffects.length]
      : variant
    if (effect === 'airbrush' || effect === 'watercolor' || effect === 'watercolour') {
      softDot(context, point, size, color, effect === 'airbrush' ? 0.2 : 0.38)
    } else if (effect === 'dry') {
      grain(context, point, size, random, false)
    } else if (effect === 'tube' || effect === 'oil') {
      const radius = size / 2
      context.translate(point.x, point.y)
      const gradient = context.createLinearGradient(0, -radius, 0, radius)
      gradient.addColorStop(0, color)
      gradient.addColorStop(0.48, '#ffffff66')
      gradient.addColorStop(0.8, color)
      gradient.addColorStop(1, '#00000055')
      dot(context, 0, 0, radius)
      context.fillStyle = gradient
      dot(context, 0, 0, radius)
    } else if (effect === 'flat' || effect === 'roller') {
      context.translate(point.x, point.y)
      context.rotate(effect === 'flat' ? -0.45 : 0)
      context.fillRect(-size * 0.5, -size * 0.24, size, size * 0.48)
    } else {
      dot(context, point.x, point.y, size / 2)
    }
  } else {
    dot(context, point.x, point.y, size / 2)
  }
  context.restore()
}
