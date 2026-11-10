// RMarker::pixel override, i386 0x00121500–0x00121681. Unlike generic
// media it keeps mask255, rounds the candidate RGB and only darkens channels.
const f = Math.fround

function darkenChannel(channel, paint, alpha, inverse) {
  const candidate = Math.trunc(f(f(f(paint * alpha) + .5) + f(channel * inverse)))
  return Math.min(channel, candidate) || 0
}

export function nativeMarkerRGB(destination, color, mask, {
  density = 1, texture = null, textureBias = 1, invertTexture = false,
} = {}) {
  if (!mask) return [...destination]
  let contribution = mask
  let divisor = f(254 * (density || 1))
  if (texture !== null) {
    contribution += Math.trunc((invertTexture ? 255 - texture : texture) / textureBias)
    divisor = f(divisor + 254)
  }
  const alpha = f(contribution / divisor)
  const inverse = f(1 - alpha)
  return destination.map((channel, index) => darkenChannel(channel, color[index], alpha, inverse))
}

/**
 * Draws against a working copy of the visible opaque paint layer. The preview
 * stores only changed pixels, allowing normal art/background layering elsewhere.
 * History, composition and bitmap placement remain the owning tool's concern.
 * With deferUploads, the owner must flush before reading/compositing the overlay.
 */
export function createNativeMarkerStroke(base, overlay, {
  color, density = 1, texture = null, textureBias = 1, invertTexture = false, deferUploads = false,
}) {
  const { width, height } = base
  const original = new Uint8ClampedArray(base.data)
  const destination = new Uint8ClampedArray(original)
  const pixels = overlay.createImageData(width, height)
  let used = false
  const textureStride = texture && texture.data.length === texture.width * texture.height ? 1 : 4
  const densityDivisor = f(254 * (density || 1))
  const textureDivisor = f(densityDivisor + 254)
  const [red, green, blue] = color

  let dirtyLeft = width, dirtyTop = height, dirtyRight = 0, dirtyBottom = 0
  function flush() {
    if (dirtyRight <= dirtyLeft) return
    overlay.putImageData(pixels, 0, 0, dirtyLeft, dirtyTop, dirtyRight - dirtyLeft, dirtyBottom - dirtyTop)
    dirtyLeft = width; dirtyTop = height; dirtyRight = dirtyBottom = 0
  }

  return {
    flush,
    draw(mask, placement) {
      if (placement.width !== mask.width || placement.height !== mask.height) {
        throw new RangeError('Native Marker requires original bitmap dimensions')
      }
      used = true
      const x0 = Math.floor(placement.x)
      const y0 = Math.floor(placement.y)
      const stride = mask.data.length === mask.width * mask.height ? 1 : 4
      let left = width
      let top = height
      let right = 0
      let bottom = 0
      for (let sy = 0; sy < mask.height; sy++) {
        const y = y0 + sy
        if (y < 0 || y >= height) continue
        for (let sx = 0; sx < mask.width; sx++) {
          const x = x0 + sx
          if (x < 0 || x >= width) continue
          const coverage = mask.data[(sy * mask.width + sx) * stride]
          if (!coverage) continue
          const offset = (y * width + x) * 4
          let contribution = coverage
          let divisor = densityDivisor
          if (texture && x < texture.width && y < texture.height) {
            const paper = texture.data[(y * texture.width + x) * textureStride]
            contribution += Math.trunc((invertTexture ? 255 - paper : paper) / textureBias)
            divisor = textureDivisor
          }
          const alpha = f(contribution / divisor)
          const inverse = f(1 - alpha)
          const r = destination[offset], g = destination[offset + 1], b = destination[offset + 2]
          const nextR = darkenChannel(r, red, alpha, inverse)
          const nextG = darkenChannel(g, green, alpha, inverse)
          const nextB = darkenChannel(b, blue, alpha, inverse)
          if (nextR === r && nextG === g && nextB === b) continue
          destination[offset] = pixels.data[offset] = nextR
          destination[offset + 1] = pixels.data[offset + 1] = nextG
          destination[offset + 2] = pixels.data[offset + 2] = nextB
          pixels.data[offset + 3] = 255
          left = Math.min(left, x)
          top = Math.min(top, y)
          right = Math.max(right, x + 1)
          bottom = Math.max(bottom, y + 1)
        }
      }
      if (right > left) {
        dirtyLeft = Math.min(dirtyLeft, left)
        dirtyTop = Math.min(dirtyTop, top)
        dirtyRight = Math.max(dirtyRight, right)
        dirtyBottom = Math.max(dirtyBottom, bottom)
        if (!deferUploads) flush()
      }
    },
    reset() {
      dirtyLeft = width; dirtyTop = height; dirtyRight = dirtyBottom = 0
      destination.set(original)
      pixels.data.fill(0)
      used = false
      overlay.clearRect(0, 0, width, height)
    },
    get used() { return used },
  }
}
