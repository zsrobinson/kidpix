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
  const data = realistic ? paintBrushes[paintBrushIndex(options)] : materialBrushes[tool]
  if (!data) return null
  const [baseId, spacing, jitter, shadow, glint, density, spatter, dryOut] = data
  const tier = sizeIndex ?? (size <= 4 ? 0 : size <= 8 ? 1 : 2)
  return { id: baseId + Math.max(0, Math.min(2, tier)), spacing, jitter, shadow, glint, density, spatter, dryOut }
}

const colorMasks = new WeakMap()
const cssColor = makeSurface(1, 1, true)

function tintMask(image, color, spatter) {
  if (!colorMasks.has(image)) colorMasks.set(image, new Map())
  const variants = colorMasks.get(image)
  const key = `${color}:${spatter}`
  if (variants.has(key)) return variants.get(key)

  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const mask = makeSurface(width, height, true)
  mask.drawImage(image, 0, 0)
  const pixels = mask.getImageData(0, 0, width, height)
  cssColor.clearRect(0, 0, 1, 1)
  cssColor.fillStyle = color
  cssColor.fillRect(0, 0, 1, 1)
  const rgba = cssColor.getImageData(0, 0, 1, 1).data

  for (let i = 0; i < pixels.data.length; i += 4) {
    const alpha = pixels.data[i]
    const scatter = spatter && ((i * 113 + Math.floor(i / width) * 55) % 100) < spatter * 11
    pixels.data.set([rgba[0], rgba[1], rgba[2], scatter ? alpha * 0.1 : alpha * rgba[3] / 255], i)
  }
  mask.putImageData(pixels, 0, 0)
  if (variants.size >= 18) variants.delete(variants.keys().next().value)
  variants.set(key, mask.canvas)
  return mask.canvas
}

export function drawOriginalDab(context, point, options, dab, image, random, step) {
  const { tool, color, size, scale = 1 } = options
  const jitter = dab.jitter * scale
  const drawScale = drawingMaterial(tool) ? Math.max(1, size * 1.45) / Math.max(image.width, image.height) : scale
  const width = image.width * drawScale
  const height = image.height * drawScale
  const x = point.x - width / 2 + (random() - 0.5) * jitter
  const y = point.y - height / 2 + (random() - 0.5) * jitter
  const spatter = tool === 'chalk' ? 2 : dab.spatter
  const faded = dab.dryOut ? 1 / (1 + step * dab.dryOut / 18000) : 1
  context.save()
  if (dab.shadow) {
    context.globalAlpha = 0.18 * faded
    context.drawImage(tintMask(image, '#312022', spatter), x + dab.shadow * scale / 3, y + dab.shadow * scale / 2, width, height)
  }
  context.globalAlpha = faded * 1 / (1 + dab.density * 0.13)
  context.drawImage(tintMask(image, color, spatter), x, y, width, height)
  if (dab.glint) {
    context.globalAlpha = 0.28 * faded
    context.drawImage(tintMask(image, '#ffffff', spatter), x - dab.glint * scale / 2, y - dab.glint * scale / 2, width, height)
  }
  context.restore()
}

function drawingMaterial(tool) {
  return Object.hasOwn(materialBrushes, tool)
}
