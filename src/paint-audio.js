import { paintBrushIndex } from './paint-original.js'

// Start, movement loop, end, and N/E/S/W cues from KPD3.cfg.
const drawing = {
  pencil: [7286, 7287, 0, [7283, 7285, 7284, 0]],
  chalk: [7259, 7263, 0, [7257, 0, 7258, 7258]],
  crayon: [7269, 7271, 0, [7267, 7267, 7268, 0]],
  marker: [7273, 7274, 0, [7275, 7277, 7276, 7278]],
}
const realistic = [
  [7289, 0, 0, [7295, 7292, 7296, 7293]],
  [0, 7279, 7325],
  [7302, 7305, 0, [7299, 7299, 7300, 7300]],
  [7288, 7343, 7359],
  [0, 7326, 7327], [0, 7349, 7348], [0, 7349, 7350], [0, 7281, 7329],
  [0, 7338, 7339], [0, 7332, 0], [0, 7334, 7335], [0, 7336, 7337],
  [0, 7338, 7339], [0, 7340, 0], [0, 7345, 7346], [0, 7341, 7342],
  [0, 7321, 7323], [0, 7328, 7329], [0, 7324, 7325], [0, 7332, 0],
]
const wacky = {
  pyramid: [0, 7374, 7375],
  'drippy-paint': [7380, 7343, 0],
  fracture: [0, 7318, 0],
  'triangle-swirls': [0, 7369, 0],
  'green-hoops': [0, 7356, 0],
  'pixie-dust': [7361, 7362, 7363],
  kooshie: [0, 7377, 0],
  'leaky-pen': [0, 7365, 0],
  'scratchy-pen': [0, 7385, 0],
  'spiral-pen': [0, 7387, 7388],
  'zig-zag-pen': [0, 7364, 0],
  bricks: [7353, 0, 0],
  logs: [7371, 0, 0],
  window: [0, 7355, 0],
  'french-door': [0, 7378, 0],
  'wood-door': [0, 7357, 0],
  roof: [0, 7376, 0],
  'dot-to-dots': [7384, 0, 0],
  'abc-text': [7431, 0, 0],
  rainbow: [0, 7432, 0],
  'color-tiles': [0, 7373, 0],
  kaleidoscope: [0, 7382, 0],
  splats: [0, 7386, 0],
  'fractal-trees': [7379, 0, 0],
}

function cues(options) {
  if (Object.hasOwn(drawing, options.tool)) return drawing[options.tool]
  if (!['brush', 'paint', 'paintbrush'].includes(options.tool)) return null
  const variant = options.variant.toLowerCase().replaceAll(' ', '-')
  if (options.mode === 'wacky') return wacky[variant]
  return realistic[paintBrushIndex(options)]
}

export function createPaintAudio(base) {
  const cache = new Map()
  let current = null
  let movement = null
  let lastDirection = -1

  function clip(id, loop = false) {
    if (!base || !id) return null
    if (!cache.has(id)) {
      const audio = new Audio(`${base}wacky-sounds/${id}.mp3`)
      audio.volume = 0.42
      cache.set(id, audio)
    }
    const audio = cache.get(id)
    audio.loop = loop
    audio.currentTime = 0
    audio.play().catch(() => {})
    return audio
  }

  function stop(complete = false) {
    movement?.pause()
    movement = null
    if (complete) clip(current?.[2])
    current = null
    lastDirection = -1
  }

  return {
    start(options) {
      stop()
      current = cues(options)
      if (!current) return
      const [begin, loop] = current
      if (begin) clip(begin)
      else if (loop) movement = clip(loop, true)
    },
    move(from, to) {
      if (!current || movement && !current[3]) return
      const dx = to.x - from.x
      const dy = to.y - from.y
      if (Math.hypot(dx, dy) < 2) return
      const direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 2 : 0
      if (movement && direction === lastDirection) return
      const id = current[3]?.[direction] || current[1]
      if (!id) return
      movement?.pause()
      movement = clip(id, true)
      lastDirection = direction
    },
    stop,
    destroy() {
      for (const audio of cache.values()) audio.pause()
      cache.clear()
    },
  }
}
