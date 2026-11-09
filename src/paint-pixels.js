export function makeSurface(width, height, readOften = false) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas.getContext('2d', { willReadFrequently: readOften })
}

export function cutoutContours(region, image) {
  if (!region && !image) return null
  const { width, height } = region || image
  const rows = Array.from({ length: height }, () => new Uint8Array(width))
  if (region) {
    for (const [left, top, right, bottom] of region.rects) {
      for (let y = top; y < bottom; y++) rows[y].fill(1, left, right)
    }
  } else {
    const source = makeSurface(width, height, true)
    source.drawImage(image, 0, 0)
    const { data } = source.getImageData(0, 0, width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) rows[y][x] = data[(y * width + x) * 4 + 3] < 128 ? 1 : 0
    }
  }

  const stride = width + 1
  const edges = new Map()
  function edge(x0, y0, x1, y1) {
    const start = y0 * stride + x0
    const end = y1 * stride + x1
    const paths = edges.get(start) || []
    paths.push(end)
    edges.set(start, paths)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!rows[y][x]) continue
      if (!rows[y - 1]?.[x]) edge(x, y, x + 1, y)
      if (!rows[y][x + 1]) edge(x + 1, y, x + 1, y + 1)
      if (!rows[y + 1]?.[x]) edge(x + 1, y + 1, x, y + 1)
      if (!rows[y][x - 1]) edge(x, y + 1, x, y)
    }
  }
  const paths = []
  while (edges.size) {
    const start = edges.keys().next().value
    let point = start
    const path = []
    do {
      path.push({ x: point % stride, y: Math.floor(point / stride) })
      const next = edges.get(point)
      if (!next?.length) break
      const end = next.pop()
      if (!next.length) edges.delete(point)
      point = end
    } while (point !== start)
    if (path.length > 2) paths.push(path)
  }
  return { width, height, paths }
}

function collectRegion(image, startX, startY, tolerance) {
  const { data, width, height } = image
  const origin = startY * width + startX
  const [red, green, blue] = data.subarray(origin * 4, origin * 4 + 3)
  const frontier = new Int32Array(width * height)
  const visited = new Uint8Array(width * height)
  let read = 0
  let count = 0

  function visit(pixel) {
    if (visited[pixel]) return
    visited[pixel] = 1
    const offset = pixel * 4
    const difference = Math.max(Math.abs(red - data[offset]), Math.abs(green - data[offset + 1]), Math.abs(blue - data[offset + 2]))
    if (difference <= tolerance) frontier[count++] = pixel
  }

  visit(origin)
  while (read < count) {
    const pixel = frontier[read++]
    const x = pixel % width
    if (x > 0) visit(pixel - 1)
    if (x < width - 1) visit(pixel + 1)
    if (pixel >= width) visit(pixel - width)
    if (pixel < width * (height - 1)) visit(pixel + width)
  }

  return frontier.subarray(0, count)
}

const colorBlends = [
  ['#ff262b', '#ffd218'],
  ['#fff42b', '#49cc42'],
  ['#4fe7f0', '#395ee7'],
  ['#ad49e5', '#f688c5'],
  ['#e64330', '#ff941c', '#fff53a', '#5dce3c', '#29a2ea', '#8563dc'],
  ['#031758', '#25cbd2'],
  ['#241131', '#fbea97'],
  ['#faffff', '#19386d'],
]

function patternTile(options, source) {
  const { color, variant, mode, effectIndex = 0 } = options
  const multicolor = mode === 'pattern' || mode === 'multicolor' || variant === 'multicolor'
  if (source && multicolor) return source
  if (source) {
    const tile = makeSurface(source.naturalWidth || source.width, source.naturalHeight || source.height, true)
    tile.drawImage(source, 0, 0)
    const pixels = tile.getImageData(0, 0, tile.canvas.width, tile.canvas.height)
    let hasTransparency = false
    for (let i = 3; i < pixels.data.length; i += 4) {
      if (pixels.data[i] < 250) {
        hasTransparency = true
        break
      }
    }
    if (!hasTransparency) {
      const assetPath = typeof options.asset === 'string' ? options.asset : options.asset?.url || options.asset?.src || ''
      const luminance = options.asset?.mask === 'luminance' || assetPath.includes('/mono-patterns/')
      for (let i = 0; i < pixels.data.length; i += 4) {
        const light = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3
        pixels.data[i + 3] = luminance ? light : 255 - light
      }
      tile.putImageData(pixels, 0, 0)
    }
    tile.globalCompositeOperation = 'source-in'
    tile.fillStyle = color
    tile.fillRect(0, 0, tile.canvas.width, tile.canvas.height)
    return tile.canvas
  }
  const tile = makeSurface(14, 14)
  if (multicolor) {
    tile.fillStyle = colorBlends[effectIndex % colorBlends.length][0]
    tile.fillRect(0, 0, 14, 14)
    tile.fillStyle = colorBlends[effectIndex % colorBlends.length][1]
  } else {
    tile.fillStyle = color
  }
  if (variant === 'dots' || effectIndex % 3 === 1) {
    tile.beginPath()
    tile.arc(7, 7, 3, 0, Math.PI * 2)
    tile.fill()
  } else if (variant === 'stripes' || effectIndex % 3 === 2) {
    tile.fillRect(0, 0, 6, 14)
  } else {
    tile.fillRect(0, 0, 7, 7)
    tile.fillRect(7, 7, 7, 7)
  }
  return tile.canvas
}

export function makeFillRenderer(scene, point, options, patternImage) {
  const { width, height } = scene.canvas
  const region = collectRegion(scene.getImageData(0, 0, width, height), point.x, point.y, options.tolerance ?? 25)
  const mask = makeSurface(width, height)
  const pixels = mask.createImageData(width, height)
  let minX = width
  let maxX = 0
  let minY = height
  let maxY = 0
  for (const pixel of region) {
    pixels.data[pixel * 4 + 3] = 255
    const x = pixel % width
    const y = Math.floor(pixel / width)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  mask.putImageData(pixels, 0, 0)

  const { variant, mode, color, effectIndex = 0 } = options
  const isBlend = mode === 'blend' || mode === 'gradient' || variant === 'gradient' || variant === 'blend'
  const useImage = patternImage && (isBlend || mode === 'pattern' || mode === 'multicolor' || variant === 'multicolor')
  const solid = !isBlend && !useImage && !patternImage && (variant === 'solid' || variant === 'freehand')
  const tile = !solid && (!isBlend || useImage) ? patternTile(options, patternImage) : null

  function originalGradient(context, end) {
    const { stops } = options.gradient
    const type = options.gradient.type ?? options.gradient.mode
    const dx = end.x - point.x
    const dy = end.y - point.y
    const x = minX + dx
    const y = minY + dy
    const xSpan = Math.max(1, maxX - minX)
    const ySpan = Math.max(1, maxY - minY)
    let gradient
    if (type === 0) {
      const cx = x + xSpan / 2
      const cy = y + ySpan / 2
      gradient = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(xSpan, ySpan) / 2)
    } else if (type === 1) {
      gradient = context.createLinearGradient(x, y, x, y + ySpan)
    } else {
      gradient = context.createLinearGradient(x, y, x + xSpan, y)
    }
    for (const [offset, color, green, blue, alpha] of stops) {
      if (typeof color === 'number') gradient.addColorStop(offset / 100, `rgba(${color}, ${green}, ${blue}, ${alpha / 255})`)
      else gradient.addColorStop(offset, color)
    }
    return gradient
  }

  return (context, end) => {
    context.clearRect(0, 0, width, height)
    context.save()
    context.drawImage(mask.canvas, 0, 0)
    context.globalCompositeOperation = 'source-in'
    if (isBlend && options.gradient?.stops?.length) {
      context.fillStyle = originalGradient(context, end)
    } else if (isBlend && !useImage) {
      const start = { x: point.x, y: point.y }
      const finish = end.x === start.x && end.y === start.y
        ? { x: Math.max(width / 2, start.x + 120), y: start.y }
        : end
      const gradient = context.createLinearGradient(start.x, start.y, finish.x, finish.y)
      const colors = options.colors || colorBlends[effectIndex % colorBlends.length]
      colors.forEach((stop, index) => gradient.addColorStop(index / Math.max(1, colors.length - 1), stop))
      context.fillStyle = gradient
    } else if (solid) {
      context.fillStyle = color
    } else {
      const pattern = context.createPattern(tile, 'repeat')
      pattern.setTransform(new DOMMatrix().translate(end.x - point.x, end.y - point.y))
      context.fillStyle = pattern
    }
    context.fillRect(0, 0, width, height)
    context.restore()
  }
}

const mixerEffects = ['swirl', 'blur', 'invert', 'pixelate', 'wave', 'flip', 'emboss', 'mosaic']
const mixerAliases = {
  'color-remover': 'grayscale',
  'color-shifter': 'color-cycle',
  colorizer: 'colorize',
  embosser: 'emboss',
  greyscale: 'grayscale',
  inverter: 'invert',
  mirror: 'flip',
  pixellate: 'pixelate',
  posterizer: 'posterize',
  solarizer: 'solarize',
  smooth: 'blur',
  spin: 'swirl',
  weave: 'wave',
}

function mixerTransform(variant, x, y, center, intensity) {
  switch (variant) {
    case 'flip':
      return { x: 2 * center.x - x, y }
    case 'pixelate':
    case 'mosaic':
      return {
        x: Math.floor(x / intensity) * intensity,
        y: Math.floor(y / intensity) * intensity,
      }
    case 'wave':
      return { x: x + Math.sin(y / (intensity + 4)) * intensity, y }
    case 'shatter':
      return { x: x + Math.sin(Math.floor(y / 13)) * intensity * 2, y }
    case 'smear':
      return { x: x - intensity, y: y + intensity / 2 }
    case 'pinch':
    case 'spherize':
    case 'bubble': {
      const dx = x - center.x
      const dy = y - center.y
      const edge = Math.min(1, Math.hypot(dx, dy) / center.radius)
      const warp = variant === 'pinch' ? 1 + (1 - edge) * 1.35 : 0.42 + 0.58 * edge
      return { x: center.x + dx * warp, y: center.y + dy * warp }
    }
    case 'swirl': {
      const dx = x - center.x
      const dy = y - center.y
      const spin = Math.max(0, 1 - Math.hypot(dx, dy) / center.radius) * intensity * 0.1
      return {
        x: center.x + dx * Math.cos(spin) - dy * Math.sin(spin),
        y: center.y + dx * Math.sin(spin) + dy * Math.cos(spin),
      }
    }
    default:
      return { x, y }
  }
}

export function mixPixels(scene, output, point, { variant, mode, size, effectIndex = 0 }) {
  const width = scene.canvas.width
  const height = scene.canvas.height
  const mega = mode === 'mega' || variant === 'mega'
  const radius = mega ? Math.hypot(width, height) / 2 : Math.max(4, size / 2)
  const intensity = Math.min(40, Math.max(2, Math.round(size / (mega ? 2 : 8))))
  const center = mega ? { x: width / 2, y: height / 2, radius } : { ...point, radius }
  const label = variant.toLowerCase().replaceAll(' ', '-')
  const effect = mixerAliases[label] || (['freehand', 'mega', 'wand'].includes(label) ? mixerEffects[effectIndex % mixerEffects.length] : label)
  const x0 = mega ? 0 : Math.max(0, Math.floor(point.x - radius))
  const y0 = mega ? 0 : Math.max(0, Math.floor(point.y - radius))
  const x1 = mega ? width : Math.min(width, Math.ceil(point.x + radius))
  const y1 = mega ? height : Math.min(height, Math.ceil(point.y + radius))
  if (x1 <= x0 || y1 <= y0) return

  const margin = mega ? 0 : intensity + 2
  const left = Math.max(0, x0 - margin)
  const top = Math.max(0, y0 - margin)
  const right = Math.min(width, x1 + margin)
  const bottom = Math.min(height, y1 + margin)
  const source = scene.getImageData(left, top, right - left, bottom - top)
  const result = output.createImageData(x1 - x0, y1 - y0)

  function sample(x, y, channel) {
    const sx = Math.max(0, Math.min(source.width - 1, Math.round(x - left)))
    const sy = Math.max(0, Math.min(source.height - 1, Math.round(y - top)))
    return source.data[(sy * source.width + sx) * 4 + channel]
  }

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const distance = Math.hypot(x - center.x, y - center.y)
      if (!mega && distance > radius) continue
      const spot = mixerTransform(effect, x, y, center, intensity)
      const target = ((y - y0) * result.width + x - x0) * 4
      const luminance = sample(spot.x, spot.y, 0) * 0.299 + sample(spot.x, spot.y, 1) * 0.587 + sample(spot.x, spot.y, 2) * 0.114
      for (let channel = 0; channel < 3; channel++) {
        let value = sample(spot.x, spot.y, channel)
        switch (effect) {
          case 'invert':
          case 'negative':
            value = 255 - value
            break
          case 'blur':
            value = (
              value + sample(x - intensity, y, channel) + sample(x + intensity, y, channel)
              + sample(x, y - intensity, channel) + sample(x, y + intensity, channel)
            ) / 5
            break
          case 'emboss':
            value = 128 + value - sample(x - 2, y - 2, channel)
            break
          case 'edge-detector':
            value = Math.abs(value - sample(x - 2, y - 2, channel)) * 4
            break
          case 'grayscale':
            value = luminance
            break
          case 'sepia':
            value = luminance * [1.25, 1.02, 0.77][channel]
            break
          case 'solarize':
            value = value >= 128 ? 255 - value : value
            break
          case 'posterize':
            value = Math.round(value / 64) * 64
            break
          case 'color-cycle':
            value = sample(spot.x, spot.y, (channel + 1) % 3)
            break
          case 'colorize':
            value = luminance * [1.35, 0.62, 1.05][channel]
            break
          case 'lighten':
            value += intensity * 2
            break
          case 'nuclear':
            value = 255 - (value ^ ((x + y) % 16) * 16)
            break
          case 'noise':
            value += (Math.imul(x + 1, y + 5) * 173 % 37 - 18) * intensity / 4
            break
          case 'burlap':
            value += ((x + y) % 4 > 1 ? 1 : -1) * 22
            break
          case 'sharpen':
            value = 5 * value - sample(x - 1, y, channel) - sample(x + 1, y, channel)
              - sample(x, y - 1, channel) - sample(x, y + 1, channel)
            break
        }
        result.data[target + channel] = value
      }
      result.data[target + 3] = mega ? 255 : Math.min(255, (radius - distance) * 130)
    }
  }
  const patch = makeSurface(result.width, result.height)
  patch.putImageData(result, 0, 0)
  output.drawImage(patch.canvas, x0, y0)
}
