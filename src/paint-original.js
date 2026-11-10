import { makeSurface } from './paint-pixels.js'

// Resource IDs and dab parameters in the Mac trial's KPD3.cfg.
const paintBrushes = [
  [1004, 1, 0, 0, 0, 0, 0, 100],
  [1001, 0, 2, 0, 0, 4, 1, 0],
  [1022, 1, 0, 0, 0, 1, 0, 20],
  [1013, 1, 0, 0, 0, 0, 0, 0],
  [1052, 1, 3, 7, 3, 0, 0, 0],
  [1058, 1, 0, 3, 2, 0, 0, 0],
  [1016, 1, 0, 20, 2, 0, 0, 0],
  [1028, 1, 5, 2, 1, 0, 0, 0],
  [1031, 6, 6, 3, 0, 0, 0, 0],
  [1022, 4, 8, 2, 0, 0, 0, 0],
  [1004, 2, 4, 1, 1, 0, 0, 0],
  [1007, 5, 8, 3, 2, 0, 0, 0],
  [1019, 1, 5, 10, 2, 0, 0, 0],
  [1010, 0, 4, 8, 3, 0, 0, 0],
  [1013, 5, 5, 4, 1, 2, 0, 0],
  [1055, 2, 8, 4, 4, 5, 0, 10],
  [1034, 20, 30, 0, 0, 0, 0, 0],
  [1013, 1, 2, 3, 0, 0, 1, 0],
  [1001, 1, 0, 10, 4, 0, 3, 0],
  [1022, 0, 5, 0, 0, 2, 0, 2],
]
const paintBrushNames = [
  'oil-paint', 'air-brush', 'dry-brush', 'neon-tube', 'flower-spray',
  'sand', 'star-spray', 'smudge-with-shadow', 'fat-star-with-hilite', 'square-tube',
  'soft-star-scatter', 'oval-spatter', 'cottage-cheese', 'line-of-dots', 'shape-spatter',
  'row-of-dots-2', 'star-scatter', 'gel-tube', 'star-piles', 'finger-paint',
]
const materialBrushes = {
  chalk: [1001, 5, 0, 0, 0, 3, 1, 0],
  crayon: [1001, 1, 0, 0, 0, 0, 0, 0],
  marker: [1010, 2, 0, 0, 0, 1, 0, 0],
}
// CFG shadowBias/glintBias, separate from the geometric offsets above.
// CustomBrush1–16 follow the first four built-in paint classes.
const paintBiases = [
  [0, 0], [7, 0], [10, 0], [0, 0],
  [12, 1], [7, 2], [30, 3], [1, 1], [2, 0], [3, 0],
  [5, 1], [3, 2], [15, 1], [7, 1], [3, 1], [20, 3],
  [0, 0], [2, 0], [4, 1], [0, 0],
]
const fallbackNames = {
  oil: 'oil-paint',
  airbrush: 'air-brush',
  dry: 'dry-brush',
  tube: 'neon-tube',
}

export function paintBrushIndex({ variant, effectIndex }) {
  const name = variant?.toLowerCase().replaceAll(' ', '-')
  const index = paintBrushNames.indexOf(fallbackNames[name] || name)
  return index === -1 ? effectIndex ?? 0 : index
}

export function originalDab(options) {
  const { tool, mode, variant, sizeIndex, size } = options
  const realistic = ['brush', 'paint', 'paintbrush'].includes(tool) && mode !== 'wacky' && variant !== 'wacky'
  const index = paintBrushIndex(options)
  const data = realistic ? paintBrushes[index] : materialBrushes[tool]
  if (!data) return null
  const [baseId, spacing, jitter, shadow, glint, density, spatter, dryOut] = data
  const [shadowBias, glintBias] = realistic ? paintBiases[index] : [0, 0]
  const blendClass = tool === 'marker' ? 'marker' : realistic && index === 1 ? 'airbrush' : 'generic'
  const tier = Math.max(0, Math.min(2, Math.trunc(sizeIndex ?? (size <= 4 ? 0 : size <= 8 ? 1 : 2))))
  // All these CFG sections omit textureBias; constructor 0x1245e0 sets 1.
  return { id: baseId + tier, sizeOrdinal: tier + 1, spacing, jitter, shadow, glint, density, spatter, dryOut, shadowBias, glintBias, textureBias: 1, blendClass }
}

// RRealMedia +0x104 (0x124166) uses two integer random() remainders,
// not independent rectangular jitter or a uniformly distributed disk radius.
// randomInt permits replaying recorded native integer draws. The browser's
// normalized random stream is adapted below; its seed/sequence is not native.
export function nativeBrushOscillation(sizeOrdinal, oscillation, randomInt) {
  const range = sizeOrdinal * oscillation
  if (!range) return { x: 0, y: 0 }
  const radius = randomInt() % range
  if (!radius) return { x: 0, y: 0 }
  // Source constant 0x25ff54 = bytes 35 fa 8e 3c, followed by mulss.
  const radians = Math.fround((randomInt() % 360) * 0.01745329238474369)
  const integer = value => Math.trunc(value) || 0
  return { x: integer(radius * Math.cos(radians)), y: integer(radius * Math.sin(radians)) }
}

export function nativeDabPlacement(point, options, dab, image, random = Math.random) {
  const { scale = 1 } = options
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  // Loader 0x122b52 pads to a square, copying the bitmap at (0,0).
  // Begin 0x123df7 centers that square using integer division by two.
  const halfSide = Math.floor(Math.max(width, height) / 2)
  const randomInt = options.randomInt ?? (() => Math.min(0x7fffffff, Math.floor(random() * 0x80000000)))
  const offset = nativeBrushOscillation(dab.sizeOrdinal ?? 1, dab.jitter, randomInt)
  return {
    x: point.x + (offset.x - halfSide) * scale,
    y: point.y + (offset.y - halfSide) * scale,
    width: width * scale,
    height: height * scale,
  }
}

const colorMasks = new WeakMap()
const dynamicMasks = new WeakMap()
const sourceMasks = new WeakMap()
let cssColor

// Native generic pixel blend: 0x123ecc normalizes mask 255 to 254 and
// divides by 254*densityBias (0x12231e). Airbrush overrides the divisor
// per pixel at 0x11b876. textureAt optionally supplies a full-page texture
// byte for a source-mask pixel index; shadow/glint bypass that coefficient.
// Smear, dry-out and stroke-mask accumulation remain separate behavior.
export function nativeBrushMaskPixels(source, rgba, dab, pass = 'paint', random = Math.random, textureAt) {
  const pixels = new Uint8ClampedArray(source.length)
  for (let offset = 0; offset < source.length; offset += 4) {
    const mask = Math.min(source[offset], 254)
    if (!mask || !source[offset + 3]) continue
    // RRealMedia +0x100 (0x124246): keep a nonzero mask pixel only
    // when rounded random*spatter is zero. Airbrush has the same predicate.
    if (dab.spatter && roundedRandom(dab.spatter, random)) continue
    const bias = pass === 'shadow' ? dab.shadowBias : pass === 'glint' ? dab.glintBias : dab.density || 1
    const divisor = pass === 'paint' && dab.blendClass === 'airbrush'
      ? 255 * (1 + roundedRandom(dab.density, random))
      : 254 * bias
    let alpha = divisor > 0 ? Math.fround(mask / divisor) : 0
    if (divisor > 0 && pass === 'paint' && textureAt) {
      const texture = Math.fround(textureAt(offset / 4) * Math.fround(1 / (dab.textureBias ?? 1)))
      alpha = Math.fround(Math.fround(mask + texture) / Math.fround(divisor + 254))
    }
    pixels[offset] = rgba[0]
    pixels[offset + 1] = rgba[1]
    pixels[offset + 2] = rgba[2]
    pixels[offset + 3] = alpha * source[offset + 3] * rgba[3] / 255
  }
  return pixels
}

function roundedRandom(bias, random) {
  return Math.trunc(Math.fround(Math.fround(Math.fround(random()) * bias) + .5))
}

function tintMask(image, color, dab, pass, random, textureAt) {
  if (!colorMasks.has(image)) colorMasks.set(image, new Map())
  const variants = colorMasks.get(image)
  const { spatter } = dab
  const dynamic = spatter || dab.blendClass === 'airbrush' || (pass === 'paint' && textureAt)
  const key = `${color}:${dab.blendClass}:${pass}:${dab.density}:${dab.shadowBias}:${dab.glintBias}`
  if (!dynamic && variants.has(key)) return variants.get(key)

  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  let mask = dynamic && dynamicMasks.get(image)
  if (!mask) {
    mask = makeSurface(width, height, true)
    if (dynamic) dynamicMasks.set(image, mask)
  }
  // Loaded brush images are immutable. Keep their original raster separate
  // from the reusable upload buffer; random/paper coefficients still run for
  // every dab, but never require another canvas readback of the same image.
  let source = sourceMasks.get(image)
  if (!source) {
    mask.clearRect(0, 0, width, height)
    mask.drawImage(image, 0, 0)
    const pixels = mask.getImageData(0, 0, width, height)
    source = { pixels, data: pixels.data.slice() }
    sourceMasks.set(image, source)
  }
  const { pixels } = source
  cssColor ??= makeSurface(1, 1, true)
  cssColor.clearRect(0, 0, 1, 1)
  cssColor.fillStyle = color
  cssColor.fillRect(0, 0, 1, 1)
  const rgba = cssColor.getImageData(0, 0, 1, 1).data

  if (dab.blendClass === 'marker') {
    // Native Marker has a destination-dependent darken-only override at
    // 0x121500. The transparent stroke preview has no underlying art pixels;
    // retain its existing approximation rather than apply the generic blend.
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const alpha = source.data[offset]
      pixels.data.set([rgba[0], rgba[1], rgba[2], alpha * rgba[3] / 255], offset)
    }
  } else {
    pixels.data.set(nativeBrushMaskPixels(source.data, rgba, dab, pass, random, textureAt))
  }
  mask.putImageData(pixels, 0, 0)
  if (!dynamic) {
    if (variants.size >= 18) variants.delete(variants.keys().next().value)
    variants.set(key, mask.canvas)
  }
  return mask.canvas
}

export function drawOriginalDab(context, point, options, dab, image, random, step) {
  const { color, scale = 1 } = options
  const { x, y, width, height } = nativeDabPlacement(point, options, dab, image, random)
  const texture = options.nativeTexture
  const maskWidth = image.naturalWidth || image.width
  const textureStride = texture && texture.data.length === texture.width * texture.height ? 1 : 4
  const textureAt = texture && (index => {
    const pageX = Math.floor(x / scale) + index % maskWidth
    const pageY = Math.floor(y / scale) + Math.floor(index / maskWidth)
    // Native clips to the page before entering its pixel loop. Canvas clips
    // these source pixels later, so their out-of-page coverage is immaterial.
    if (pageX < 0 || pageY < 0 || pageX >= texture.width || pageY >= texture.height) return 0
    const value = texture.data[(pageY * texture.width + pageX) * textureStride]
    return options.invertTexture ? 255 - value : value
  })
  const faded = dab.dryOut ? 1 / (1 + step * dab.dryOut / 18000) : 1
  context.save()
  context.globalAlpha = faded
  if (dab.shadow) {
    context.drawImage(tintMask(image, '#000000', dab, 'shadow', random), x + dab.shadow * scale, y + dab.shadow * scale, width, height)
  }
  if (dab.glint) {
    context.drawImage(tintMask(image, '#ffffff', dab, 'glint', random), x - dab.glint * scale, y - dab.glint * scale, width, height)
  }
  if (dab.blendClass === 'marker') context.globalAlpha = faded / (1 + dab.density * .13)
  context.drawImage(tintMask(image, color, dab, 'paint', random, textureAt), x, y, width, height)
  context.restore()
}
