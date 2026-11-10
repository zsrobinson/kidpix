import { interactionOwner, onInteractionInactive } from './interaction-owner.js'
import { pointerSamples, createPressureInput, pressureFactor, interpolatePressure, nativePressurePoint } from './pointer-samples.js'
import { brushOpacity, brushSpacing, drawBrushDab } from './paint-brushes.js'
import { cutoutContours, makeFillRenderer, makeSurface, mixPixels } from './paint-pixels.js'
import { drawOriginalDab, originalDab, nativeDabPlacement } from './paint-original.js'
import { createPaintAudio } from './paint-audio.js'
import { createNativeSprayAssets } from './native-spray-assets.js'
import { selectNativeShape, drawNativeShape, drawNativeSprayFrame } from './native-spray-runtime.js'
import { createNativeMovingPaint } from './native-moving-paint.js'
import { createNativeBrushTracking, nativeBrushLine, resolveNativeBrushLineSpacing } from './native-brush-tracking.js'
import { createNativeMarkerStroke } from './native-marker.js'

const shapes = new Set(['line', 'curve', 'rectangle', 'ellipse', 'polygon'])
const drawingTools = new Set(['pencil', 'chalk', 'crayon', 'marker'])
const toolAliases = {
  draw: 'pencil',
  paintbrush: 'brush',
  fill: 'bucket',
  eyeDropper: 'eyedropper',
  picker: 'eyedropper',
  rubber: 'stamp',
  cutout: 'scissors',
  grab: 'select',
}
const shapeAliases = {
  straight: 'line',
  'straight-line': 'line',
  'curved-line': 'curve',
  box: 'rectangle',
  circle: 'ellipse',
  'box-outline': 'rectangle',
  'circle-outline': 'ellipse',
  'shape-outline': 'polygon',
  'filled-box': 'filled-rectangle',
  'filled-circle': 'filled-ellipse',
  'filled-shape': 'filled-polygon',
  'big-eraser': 'big',
  'mini-eraser': 'round',
}
const cursors = {
  eyedropper: 'crosshair',
  text: 'text',
  select: 'grab',
}

function assetUrl(asset) {
  return typeof asset === 'string' ? asset : asset?.url || asset?.src || asset?.path
}

function assetElement(asset) {
  return asset?.image || asset?.element || (asset?.nodeType === 1 || asset instanceof ImageBitmap ? asset : null)
}

function mediaSize(source) {
  return {
    width: source.naturalWidth || source.videoWidth || source.width,
    height: source.naturalHeight || source.videoHeight || source.height,
  }
}

function distance(first, last) {
  return Math.hypot(last.x - first.x, last.y - first.y)
}

function makeRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function constrain(start, end, shape, shift) {
  if (!shift) return end
  const x = end.x - start.x
  const y = end.y - start.y
  if (shape === 'line' || shape === 'curve') {
    const step = Math.PI / 4
    const angle = Math.round(Math.atan2(y, x) / step) * step
    const length = x * Math.cos(angle) + y * Math.sin(angle)
    return { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) }
  }
  const size = Math.max(Math.abs(x), Math.abs(y))
  return { x: start.x + Math.sign(x || 1) * size, y: start.y + Math.sign(y || 1) * size }
}

function drawPath(context, shape, start, end, points, control) {
  context.beginPath()
  if (points) {
    context.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) context.lineTo(point.x, point.y)
    if (shape === 'polygon' || shape === 'lasso') context.closePath()
  } else if (shape === 'ellipse') {
    context.ellipse(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      Math.abs(start.x - end.x) / 2,
      Math.abs(start.y - end.y) / 2,
      0,
      0,
      Math.PI * 2,
    )
  } else if (shape === 'rectangle') {
    context.rect(start.x, start.y, end.x - start.x, end.y - start.y)
  } else {
    context.moveTo(start.x, start.y)
    if (control) context.quadraticCurveTo(control.x, control.y, end.x, end.y)
    else context.lineTo(end.x, end.y)
  }
}

function selectionBounds(selection) {
  const points = selection.points || [selection.start, selection.end]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  const x = Math.floor(minX)
  const y = Math.floor(minY)
  return { x, y, width: Math.ceil(maxX) - x, height: Math.ceil(maxY) - y }
}

function moveSelection(selection, dx, dy) {
  const move = point => ({ x: point.x + dx, y: point.y + dy })
  return {
    ...selection,
    start: move(selection.start),
    end: move(selection.end),
    points: selection.points?.map(move),
    contours: selection.contours?.map(path => path.map(move)),
  }
}

export function createPaint(canvas, hooks = {}) {
  const { width, height } = canvas
  const originalTools = hooks.originalTools ?? './original/tools/'
  const paintAudio = createPaintAudio(hooks.soundEffects === false ? null : originalTools)
  const display = canvas.getContext('2d', { willReadFrequently: true })
  const art = makeSurface(width, height, true)
  const preview = makeSurface(width, height)
  const work = makeSurface(width, height)
  const sample = makeSurface(width, height, true)
  const snapshotInk = makeSurface(width, height, true)
  const imageCache = new Map()
  const nativeSprayAssets = createNativeSprayAssets()
  let shapeBankId = null
  let nextNativeShape = null
  const contourCache = new WeakMap()
  const paperMasks = new WeakMap()
  const nativePixels = new WeakMap()
  const nativeLineSpacings = new Map()
  const back = []
  const forward = []
  const historyLimit = hooks.historyLimit ?? 32
  const listeners = new AbortController()

  let options = { tool: 'pencil', variant: 'freehand', color: '#000000', size: 3 }
  let background = null
  let foreground = null
  let paper = null
  const inputOwner = interactionOwner(canvas.ownerDocument)
  let gesture = null
  // A held contact can create a discrete action or pending polygon vertex
  // without a retained drawing gesture. It still needs a terminal lifecycle.
  let contact = null
  function claimContact(event) {
    if (!inputOwner.claim(event, canvas)) return false
    contact = event.pointerId
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    return true
  }
  function releaseContact() {
    const pointer = contact
    contact = null
    if (pointer !== null) inputOwner.release(canvas, pointer)
  }
  let soundStroke = null
  let cutoutRegions = null
  let cutoutRequest = null
  let lastSoundAt = 0
  let pendingShape = null
  let selection = null
  const actionTargets = new WeakMap()
  let actionTargetSequence = 0
  let clipboard = null
  let pageOperation = false
  let updateId = 0
  const movingPaint = createNativeMovingPaint({
    containsPoint: point => point.x >= 0 && point.y >= 0 && point.x < width && point.y < height,
    ...(hooks.soundEffects === false ? { playSound: () => null } : {}),
    onFrame: () => render(),
    onCommit(actor, frame) {
      drawNativeSprayFrame(art, actor.point, actor.clip, actor.bundle.bank, frame, actor.bundle.imageFor)
    },
  })

  function brushAsset(brush) {
    if (brush.asset) return brush.asset
    if (!originalTools) return null
    const dab = originalDab(brush)
    if (dab) return `${originalTools}brushes/${dab.id}.png`
    return null
  }

  function loadAsset(asset) {
    const element = assetElement(asset)
    if (element) return Promise.resolve(element)
    const url = assetUrl(asset)
    if (!url) return Promise.resolve(null)
    if (!imageCache.has(url)) {
      const image = new Image()
      const entry = {}
      entry.ready = new Promise((resolve, reject) => {
        image.onload = () => {
          entry.image = image
          resolve(image)
        }
        image.onerror = () => {
          imageCache.delete(url)
          reject(new Error(`Couldn't load ${url}`))
        }
        image.src = url
      })
      imageCache.set(url, entry)
    }
    return imageCache.get(url).ready
  }

  function cachedAsset(asset) {
    return assetElement(asset) || imageCache.get(assetUrl(asset))?.image
  }

  function visibleInk() {
    if (!movingPaint.active) return art
    snapshotInk.clearRect(0, 0, width, height)
    snapshotInk.drawImage(art.canvas, 0, 0)
    movingPaint.drawTo(snapshotInk)
    return snapshotInk
  }

  function snapshot() {
    return { image: visibleInk().getImageData(0, 0, width, height), background, foreground, paper }
  }

  function loadSnapshot(state) {
    movingPaint.discard()
    art.putImageData(state.image, 0, 0)
    background = state.background
    foreground = state.foreground
    paper = state.paper
    selection = null
  }

  function clearPreview() {
    preview.clearRect(0, 0, width, height)
  }

  function cancel() {
    const current = gesture
    current?.nativeTracking?.end()
    stopNativeBrushPolling(current)
    if (gesture?.type === 'move-selection') {
      loadSnapshot(gesture.before)
      selection = gesture.original
    }
    gesture = null
    releaseContact()
    // Native media writes into the picture as it paints. Preserve delivered
    // dabs when interrupted, with one undo checkpoint before tool cleanup.
    if (current?.nativeTracking && current.type === 'stroke') commitPreview(current)
    if (current?.type === 'native-moving') finishMovingStroke(current)
    movingPaint.flush()
    paintAudio.stop()
    soundStroke = null
    pendingShape = null
    clearPreview()
    render()
  }

  function finishMovingStroke(current) {
    movingPaint.end()
    if (!current.remembered) {
      current.remembered = true
      remember(current.before, 'spray')
    }
  }

  function notify(kind) {
    render()
    hooks.onChange?.({ kind, canUndo: !!back.length, canRedo: !!forward.length, paperSource: paper?.url ?? null })
  }

  function remember(before, kind) {
    back.push(before)
    if (back.length > historyLimit) back.shift()
    forward.length = 0
    notify(kind)
  }

  function undo() {
    cancel()
    if (!back.length) return false
    updateId++
    forward.push(snapshot())
    loadSnapshot(back.pop())
    notify('undo')
    return true
  }

  function redo() {
    cancel()
    if (!forward.length) return false
    updateId++
    back.push(snapshot())
    loadSnapshot(forward.pop())
    notify('redo')
    return true
  }

  function drawLayer(context, layer) {
    if (!layer?.image) return
    const { width: sourceWidth, height: sourceHeight } = mediaSize(layer.image)
    if (sourceWidth && sourceHeight) context.drawImage(layer.image, 0, 0, width, height)
  }

  function renderForegroundTo(context) {
    drawLayer(context, foreground)
  }

  function compose(context, { includeForeground = true, includePreview = false } = {}) {
    context.save()
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    drawLayer(context, background)
    const active = gesture || pendingShape || soundStroke
    if (includePreview && active?.type === 'stroke' && active.options.tool === 'eraser' && !background) {
      work.clearRect(0, 0, width, height)
      work.drawImage(art.canvas, 0, 0)
      work.globalCompositeOperation = 'destination-out'
      work.drawImage(preview.canvas, 0, 0)
      work.globalCompositeOperation = 'source-over'
      context.drawImage(work.canvas, 0, 0)
    } else {
      context.drawImage(art.canvas, 0, 0)
      if (includePreview && active && active.type !== 'native-moving') overlayStrokeTo(context, active)
    }
    movingPaint.drawTo(context)
    if (includeForeground) renderForegroundTo(context)
    context.restore()
  }

  function render() {
    compose(display, { includePreview: true, includeForeground: hooks.includeForeground !== false })
    const activeSelection = gesture?.type === 'select' ? gesture.selection : selection
    if (!activeSelection) return
    drawSelectionPath(display, activeSelection)
    display.save()
    display.strokeStyle = '#ffffff'
    display.lineWidth = 2
    display.stroke()
    display.strokeStyle = '#1364d8'
    display.lineWidth = 1.5
    display.setLineDash([4, 3])
    display.stroke()
    display.restore()
  }

  function paperMask() {
    if (!paper?.image || /\/12300\.png(?:[?#]|$)/.test(paper.url)) return null
    const { image } = paper
    if (paperMasks.has(image)) return paperMasks.get(image)
    const dimensions = mediaSize(image)
    const mask = makeSurface(dimensions.width, dimensions.height, true)
    mask.drawImage(image, 0, 0)
    const pixels = mask.getImageData(0, 0, dimensions.width, dimensions.height)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const light = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 765
      pixels.data[i + 3] = Math.round(255 * (0.25 + 0.75 * light))
    }
    mask.putImageData(pixels, 0, 0)
    paperMasks.set(image, mask.canvas)
    return mask.canvas
  }

  function sourcePixels(image) {
    if (!nativePixels.has(image)) {
      const { width, height } = mediaSize(image)
      const surface = makeSurface(width, height, true)
      surface.drawImage(image, 0, 0)
      nativePixels.set(image, surface.getImageData(0, 0, width, height))
    }
    return nativePixels.get(image)
  }

  function nativePaperTexture() {
    if (!paper?.image || /\/12300\.png(?:[?#]|$)/.test(paper.url)) return null
    return sourcePixels(paper.image)
  }

  function nativeLineSpacing(brush, dab) {
    const key = `${brush.tool}:${brush.effectIndex ?? 0}:${brush.variant}`
    const value = resolveNativeBrushLineSpacing({ spacing: dab.spacing,
      previousLineSpacing: nativeLineSpacings.get(key) ?? 3, marker: dab.blendClass === 'marker' })
    nativeLineSpacings.set(key, value)
    return value
  }

  const nativePoint = point => ({ x: Math.floor(point.x), y: Math.floor(point.y) })

  function markerStroke(brush, dab) {
    compose(sample, { includeForeground: false })
    const color = brush.color.slice(1).match(/../g).map(value => parseInt(value, 16))
    return createNativeMarkerStroke(sample.getImageData(0, 0, width, height), preview,
      { color, deferUploads: true, density: dab.density, texture: brush.nativeTexture,
        textureBias: dab.textureBias, invertTexture: brush.invertTexture })
  }

  function overlayStrokeTo(context, current) {
    const { options: brush } = current
    if (current.nativeMarker?.used) {
      current.nativeMarker.flush()
      context.drawImage(preview.canvas, 0, 0)
      return
    }
    let source = preview.canvas
    const usePaper = !current.nativeDabs && ['chalk', 'crayon', 'marker', 'brush', 'paint'].includes(brush.tool)
    const mask = usePaper && paperMask()
    if (mask) {
      work.clearRect(0, 0, width, height)
      work.drawImage(source, 0, 0)
      work.globalCompositeOperation = 'destination-in'
      work.fillStyle = work.createPattern(mask, 'repeat')
      work.fillRect(0, 0, width, height)
      work.globalCompositeOperation = 'source-over'
      source = work.canvas
    }
    context.save()
    context.globalAlpha = brushOpacity(brush)
    if (brush.tool === 'eraser' && !background) context.globalCompositeOperation = 'destination-out'
    context.drawImage(source, 0, 0)
    context.restore()
  }

  function commitPreview(current, kind = current.options.tool) {
    const before = snapshot()
    overlayStrokeTo(art, current)
    clearPreview()
    remember(before, kind)
  }

  function finishSound() {
    if (!soundStroke) return
    const current = soundStroke
    soundStroke = null
    commitPreview(current, 'sound')
  }

  function respondToSound() {
    const now = performance.now()
    const level = Number(options.level) || 0
    if (level < 0.018) {
      if (soundStroke && now - lastSoundAt > 230) finishSound()
      return
    }
    if (now - lastSoundAt < 42) return
    const mouseStroke = gesture?.type === 'sound' ? gesture : null
    if (!mouseStroke && (gesture || options.mode !== 'hands-free')) return
    lastSoundAt = now
    const brush = mouseStroke?.options || activeOptions({})
    const pitch = Math.max(0, Math.min(1, options.pitch ?? 0.35))
    const size = Math.min(86, Math.max(4, brush.size + level * 115))
    if (!mouseStroke && !soundStroke) {
      const random = makeRandom(Math.round(now))
      soundStroke = { options: brush, random, step: 0, end: { x: width / 2, y: height / 2 } }
    }
    const current = mouseStroke || soundStroke
    const point = { ...current.end }
    if (!mouseStroke) {
      const angle = pitch * 6 + current.step * 0.17
      point.x = (point.x + Math.cos(angle) * size * 0.8 + width) % width
      point.y = (point.y + Math.sin(angle) * size * 0.8 + height) % height
      current.end = point
    }
    const variant = ['rainbow', 'bubbles', 'confetti'].includes(brush.variant) ? brush.variant : 'wacky'
    drawBrushDab(preview, point, {
      ...brush, tool: 'wacky', variant, size, effectIndex: brush.effectIndex % 4,
    }, null, current.random, current.step++)
    render()
  }

  function pointFor(event) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * width / rect.width,
      y: (event.clientY - rect.top) * height / rect.height,
    }
  }

  function pixelFor(point) {
    return {
      x: Math.max(0, Math.min(width - 1, Math.floor(point.x))),
      y: Math.max(0, Math.min(height - 1, Math.floor(point.y))),
    }
  }

  function getColorAt(point) {
    if (hooks.sampleColor) return hooks.sampleColor(point);
    compose(sample)
    const { x, y } = pixelFor(point)
    const pixels = sample.getImageData(x, y, 1, 1).data
    return `#${[...pixels.slice(0, 3)].map(channel => channel.toString(16).padStart(2, '0')).join('')}`
  }

  function placeImage(context, image, placement) {
    const dimensions = mediaSize(image)
    const x = placement.x ?? width / 2
    const y = placement.y ?? height / 2
    const scale = placement.size ? placement.size / Math.max(dimensions.width, dimensions.height) : 1
    const drawWidth = placement.width || dimensions.width * scale
    const drawHeight = placement.height || (placement.width ? dimensions.height * placement.width / dimensions.width : dimensions.height * scale)
    context.save()
    context.translate(x, y)
    context.rotate(placement.rotation || 0)
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
    context.restore()
  }

  function drawStamp(point, brush, image) {
    if (image) {
      placeImage(art, image, { ...point, size: brush.size })
    } else if (brush.text) {
      art.save()
      art.fillStyle = brush.color
      art.font = `${brush.size}px ${brush.font || 'sans-serif'}`
      art.textAlign = 'center'
      art.textBaseline = 'middle'
      art.fillText(brush.text, point.x, point.y)
      art.restore()
    }
  }

  function drawShape(current, end, points, control) {
    clearPreview()
    current.nativeMarker?.reset()
    current.nativeDabs = false
    const { start, shape, options: brush } = current
    preview.save()
    preview.lineWidth = brush.size
    preview.lineCap = 'round'
    preview.lineJoin = 'round'
    preview.strokeStyle = brush.color
    preview.fillStyle = brush.color
    drawPath(preview, shape, start, end, points, control)
    if (brush.fill && (shape === 'rectangle' || shape === 'ellipse' || shape === 'polygon')) preview.fill()
    else if (distance(start, end) === 0 && !points && !control) {
      preview.beginPath()
      preview.arc(start.x, start.y, brush.size / 2, 0, Math.PI * 2)
      preview.fill()
    } else if (current.dab && current.image) {
      drawMaterialOutline(current, end, points, control)
    } else preview.stroke()
    preview.restore()
  }

  function drawMaterialOutline(current, end, points, control) {
    const { start, shape } = current
    current.nativeDabs = true
    const brush = { ...current, last: nativePoint(start), nativeTracking: null,
      nativeLineSpacing: nativeLineSpacing(current.options, current.dab),
      remainder: 0, step: 1, random: makeRandom(53) }
    if (shape === 'ellipse') brush.last = nativePoint({ x: end.x, y: (start.y + end.y) / 2 })
    drawDab(brush, brush.last)
    if (points) {
      for (const point of points.slice(1)) strokeTo(brush, point)
      if (shape === 'polygon') strokeTo(brush, points[0])
    } else if (shape === 'rectangle') {
      strokeTo(brush, { x: end.x, y: start.y })
      strokeTo(brush, end)
      strokeTo(brush, { x: start.x, y: end.y })
      strokeTo(brush, start)
    } else if (shape === 'ellipse') {
      const radiusX = (end.x - start.x) / 2
      const radiusY = (end.y - start.y) / 2
      for (let index = 1; index <= 64; index++) {
        const angle = index * Math.PI / 32
        strokeTo(brush, {
          x: start.x + radiusX * (1 + Math.cos(angle)),
          y: start.y + radiusY * (1 + Math.sin(angle)),
        })
      }
    } else if (control) {
      for (let index = 1; index <= 32; index++) {
        const t = index / 32
        const a = (1 - t) ** 2
        const b = 2 * (1 - t) * t
        const c = t ** 2
        strokeTo(brush, { x: a * start.x + b * control.x + c * end.x, y: a * start.y + b * control.y + c * end.y })
      }
    } else strokeTo(brush, end)
  }

  function drawDab(current, point) {
    const { options: baseBrush, dab, image, random } = current
    const factor = current.pressureInput ? pressureFactor(point.pressure ?? .5) : 1
    const brush = factor !== 1 && !dab ? { ...baseBrush, size: baseBrush.size * factor } : baseBrush
    if (dab && image) current.nativeDabs = true
    if (current.nativeShapes) {
      const { bank, imageFor } = current.nativeShapes
      const frame = nextNativeShape ?? bank.frames[0]
      drawNativeShape(preview, { x: Math.floor(point.x), y: Math.floor(point.y) }, frame, imageFor(frame.image))
      nextNativeShape = selectNativeShape(bank, Math.random)
      current.lastNativeShapeAt = performance.now()
      return
    }
    if (current.nativeMarker) {
      current.nativeMarker.draw(sourcePixels(image), nativeDabPlacement(point, brush, dab, image, random))
      current.step++
    } else if (dab && image) {
      // Scale only the rendered dab. Keep native mask generation, page texture
      // sampling and the base-size tracking scheduler in their original space.
      if (factor !== 1) {
        preview.save()
        preview.translate(point.x, point.y)
        preview.scale(factor, factor)
        preview.translate(-point.x, -point.y)
      }
      drawOriginalDab(preview, point, brush, dab, image, random, current.step++)
      if (factor !== 1) preview.restore()
    } else drawBrushDab(preview, point, brush, image, random, current.step++)
  }

  function sprayWhileHeld(current) {
    let lastDab = performance.now()
    function tick(now) {
      if (gesture !== current) return
      if (now - (current.nativeShapes ? current.lastNativeShapeAt ?? lastDab : lastDab) >= (current.nativeShapes ? 100 : 130)) {
        drawDab(current, current.end)
        lastDab = now
        render()
      }
      current.sprayRender = requestAnimationFrame(tick)
    }
    current.sprayRender = requestAnimationFrame(tick)
  }

  function stopNativeBrushPolling(current) {
    if (!current) return
    clearTimeout(current.nativePoll)
    if (current.sprayRender !== undefined) cancelAnimationFrame(current.sprayRender)
    if (current.nativePaintRender !== undefined) cancelAnimationFrame(current.nativePaintRender)
  }

  function pollNativeBrush(current) {
    // The source framework requests a 5ms idle wakeup. Delivery also depends
    // on its event loop; browser timeouts are an adaptation, not measured parity.
    function poll() {
      if (gesture !== current || !current.nativeTracking.active) return
      if (current.pressureInput) strokeTo(current, current.end)
      else for (const emission of current.nativeTracking.track(nativePoint(current.end))) drawDab(current, emission)
      if (current.nativePaintRender === undefined) {
        current.nativePaintRender = requestAnimationFrame(() => {
          current.nativePaintRender = undefined
          if (gesture === current) render()
        })
      }
      current.nativePoll = setTimeout(poll, 5)
    }
    current.nativePoll = setTimeout(poll, 5)
  }

  function strokeTo(current, end) {
    const { options: brush } = current
    if (current.nativeTracking || current.nativeLineSpacing !== undefined) {
      const target = nativePoint(end)
      const emissions = current.nativeTracking ? current.nativeTracking.track(target)
        : nativeBrushLine(nativePoint(current.last), target, current.nativeLineSpacing)
      for (const emission of emissions) drawDab(current, current.pressureInput
        ? nativePressurePoint(emission, current.last, { ...target, pressure: end.pressure }) : emission)
      const accepted = current.nativeTracking?.lastPoint ?? target
      current.last = current.pressureInput
        ? { ...accepted, pressure: emissions.length || (accepted.x === target.x && accepted.y === target.y)
          ? end.pressure : current.last.pressure } : accepted
      return
    }
    const length = distance(current.last, end)
    const spacing = current.dab && current.image
      ? Math.max(0.7, current.dab.spacing * brush.scale)
      : brush.tool === 'spray' ? 12 : brushSpacing(brush)
    let offset = spacing - current.remainder
    while (offset <= length) {
      const fraction = offset / length
      const point = {
        x: current.last.x + (end.x - current.last.x) * fraction,
        y: current.last.y + (end.y - current.last.y) * fraction,
        ...(current.pressureInput ? { pressure: interpolatePressure(current.last, end, fraction) } : {}),
      }
      if (current.type === 'mixer') {
        compose(sample, { includeForeground: false, includePreview: true })
        mixPixels(sample, preview, point, brush)
      } else {
        drawDab(current, point)
      }
      offset += spacing
    }
    current.remainder = (current.remainder + length) % spacing
    current.last = end
  }

  function drawSelectionPath(context, item) {
    if (item.contours?.length) {
      context.beginPath()
      for (const path of item.contours) {
        context.moveTo(path[0].x, path[0].y)
        for (const point of path.slice(1)) context.lineTo(point.x, point.y)
        context.closePath()
      }
      return
    }
    drawPath(context, item.shape, item.start, item.end, item.points)
  }

  function selectCookieCutter(point, brush, image) {
    const id = assetUrl(brush.asset)?.match(/(13\d{3})\.png$/)?.[1]
    const region = brush.cutout || cutoutRegions?.[id]
    const source = region || image
    if (!source) return
    if (!contourCache.has(source)) contourCache.set(source, cutoutContours(region, image))
    const contour = contourCache.get(source)
    if (!contour.paths.length) return
    const scale = region ? width / 720 : width / 360
    const start = { x: point.x - contour.width * scale / 2, y: point.y - contour.height * scale / 2 }
    const end = { x: start.x + contour.width * scale, y: start.y + contour.height * scale }
    const contours = contour.paths.map(path => path.map(position => ({
      x: start.x + position.x * scale,
      y: start.y + position.y * scale,
    })))
    selection = { shape: 'cookie-cutter', start, end, contours }
  }

  function selectionImage(item) {
    const bounds = selectionBounds(item)
    if (!bounds.width || !bounds.height) return null
    const result = makeSurface(bounds.width, bounds.height)
    const translated = moveSelection(item, -bounds.x, -bounds.y)
    drawSelectionPath(result, translated)
    result.clip()
    compose(sample, { includeForeground: false })
    result.drawImage(sample.canvas, -bounds.x, -bounds.y)
    return { canvas: result.canvas, bounds }
  }

  function eraseSelection(item) {
    art.save()
    drawSelectionPath(art, item)
    art.fillStyle = '#ffffff'
    if (!background) art.globalCompositeOperation = 'destination-out'
    art.fill()
    art.restore()
  }

  function containsSelection(point) {
    if (!selection) return false
    drawSelectionPath(display, selection)
    return display.isPointInPath(point.x, point.y)
  }

  function copy() {
    if (!selection) return null
    clipboard = selectionImage(selection)
    return clipboard?.canvas.toDataURL() || null
  }

  function cut() {
    const data = copy()
    if (!data) return null
    const before = snapshot()
    eraseSelection(selection)
    selection = null
    remember(before, 'cut')
    return data
  }

  function paste() {
    if (!clipboard) return false
    const before = snapshot()
    art.drawImage(clipboard.canvas, clipboard.bounds.x + 12, clipboard.bounds.y + 12)
    remember(before, 'paste')
    return true
  }

  function clear() {
    cancel()
    updateId++
    const before = snapshot()
    art.clearRect(0, 0, width, height)
    background = null
    foreground = null
    selection = null
    remember(before, 'clear')
    return true
  }

  function reset() {
    cancel()
    updateId++
    art.clearRect(0, 0, width, height)
    background = null
    foreground = null
    paper = null
    selection = null
    back.length = 0
    forward.length = 0
    notify('reset')
  }

  function placeText(text, placement = {}) {
    if (!text?.trim()) return false
    const before = snapshot()
    const size = placement.size || 28
    const x = placement.x ?? width / 2
    const y = placement.y ?? height / 2
    art.save()
    art.fillStyle = placement.color || options.color
    art.font = `${placement.italic ? 'italic ' : ''}${placement.bold ? 'bold ' : ''}${size}px ${placement.font || 'sans-serif'}`
    art.textAlign = placement.align || 'left'
    art.textBaseline = 'top'
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      const lineY = y + index * size * 1.25
      art.fillText(line, x, lineY)
      if (placement.underline) {
        const lineWidth = art.measureText(line).width
        const offset = art.textAlign === 'center' ? lineWidth / 2 : art.textAlign === 'right' ? lineWidth : 0
        art.fillRect(x - offset, lineY + size, lineWidth, Math.max(1, size / 16))
      }
    })
    art.restore()
    remember(before, 'text')
    return true
  }

  function activeOptions(event) {
    const size = Math.max(1, Math.min(Math.max(width, height), Number(options.size) || 1))
    let tool = toolAliases[options.tool] || options.tool
    let variant = shapeAliases[options.variant] || options.variant
    let fill = options.fill || variant.startsWith('filled-')
    if (shapes.has(tool) || tool.startsWith('filled-')) {
      variant = tool
      fill ||= variant.startsWith('filled-')
      tool = 'pencil'
    }
    if (fill) variant = variant.replace(/^filled-/, '')
    // Native media samples Option at stroke begin to invert paper texture.
    // Retain the web picker shortcut only for the non-media pencil path.
    if (event.altKey && tool === 'pencil') tool = 'eyedropper'
    return { ...options, size, tool, variant, fill, scale: width / 720,
      nativeTexture: nativePaperTexture(), invertTexture: Boolean(event.altKey) }
  }

  function finishPolygon(point) {
    const current = pendingShape
    if (current.points.length > 2 && distance(current.start, point) <= 12) {
      pendingShape = null
      if (current.type === 'polygon-select') {
        selection = { shape: 'polygon', start: current.start, end: point, points: current.points }
        clearPreview()
        render()
      } else {
        drawShape(current, point, current.points)
        commitPreview(current)
      }
    } else {
      current.points.push(point)
    }
  }

  function handleDown(event) {
    if (event.button !== 0 || gesture) return
    const point = pointFor(event)
    const brush = activeOptions(event)
    const { tool, variant } = brush
    if (tool === 'none') return
    const moving = ['moving', 'moving-spray'].includes(brush.mode)
    const sprayBundle = tool === 'spray'
      ? nativeSprayAssets.peek(moving ? 'moving-spray' : 'spray', 24000 + 100 * ((brush.effectIndex ?? 0) % (moving ? 20 : 15))) : null
    const nativeShapes = !moving ? sprayBundle : null
    if (tool === 'spray' && !sprayBundle) {
      hooks.onError?.(new Error(`Loading the original ${moving ? 'moving paints' : 'spray shapes'}. Try again in a moment.`))
      return
    }
    if (tool === 'sound' && brush.mode === 'hands-free') return
    const image = cachedAsset(brushAsset(brush))
    const dab = originalDab(brush)

    if ((pendingShape?.type === 'curve' || pendingShape?.points) && !claimContact(event)) return
    if (pendingShape?.type === 'curve') {
      const current = pendingShape
      pendingShape = null
      drawShape(current, current.end, null, point)
      commitPreview(current)
      return
    }
    if (pendingShape?.points) {
      finishPolygon(point)
      return
    }

    if (tool !== 'select' && tool !== 'scissors') selection = null
    if (tool === 'eyedropper') {
      const color = getColorAt(point)
      options.color = color
      hooks.onSample?.(color)
      return
    }
    hooks.onSound?.(tool, brush)

    if (tool === 'eraser' && (variant === 'big' || brush.mode === 'big')) {
      if (hooks.onBigErase) hooks.onBigErase(brush)
      else clear()
      return
    }
    if (tool === 'text') {
      event.preventDefault()
      if (hooks.onText) {
        Promise.resolve(hooks.onText(point, brush)).then(text => {
          if (typeof text === 'string') placeText(text, { ...brush, ...point, size: brush.fontSize || 28 })
        }).catch(error => hooks.onError?.(error))
      } else {
        placeText(brush.text, { ...brush, ...point, size: brush.fontSize || 28 })
      }
      return
    }
    if (tool === 'stamp') {
      if (image || brush.text) {
        const before = snapshot()
        drawStamp(point, brush, image)
        remember(before, 'stamp')
      }
      return
    }

    if (!claimContact(event)) return
    paintAudio.start(brush)
    clearPreview()
    const common = { start: point, end: point, options: brush, pointerId: event.pointerId, image, dab, nativeShapes }
    if (dab?.blendClass === 'marker' && image) common.nativeMarker = markerStroke(brush, dab)

    if (tool === 'spray' && moving) {
      gesture = { ...common, type: 'native-moving', before: snapshot(), remembered: false }
      movingPaint.begin(point, sprayBundle)
    } else if (tool === 'sound') {
      gesture = { ...common, type: 'sound', random: makeRandom(Math.round(performance.now())), step: 0 }
      respondToSound()
    } else if (tool === 'bucket') {
      compose(sample, { includeForeground: false })
      const fillAt = makeFillRenderer(sample, pixelFor(point), brush, image)
      gesture = { ...common, type: 'fill', fillAt }
      fillAt(preview, pixelFor(point))
    } else if (tool === 'select' || tool === 'scissors') {
      if (containsSelection(point)) {
        gesture = { ...common, type: 'move-selection', original: selection, before: snapshot() }
      } else if (variant === 'cookie-cutter') {
        selectCookieCutter(point, brush, image)
      } else if (tool === 'scissors' && variant === 'polygon') {
        selection = null
        pendingShape = { ...common, type: 'polygon-select', points: [point] }
      } else {
        selection = null
        const shape = variant === 'freehand' && tool === 'scissors' ? 'lasso'
          : variant === 'ellipse' ? 'ellipse' : 'rectangle'
        gesture = {
          ...common,
          type: 'select',
          selection: { shape, start: point, end: point, points: shape === 'lasso' ? [point] : null },
        }
      }
    } else if (drawingTools.has(tool) && shapes.has(variant)) {
      const current = { ...common, type: 'shape', shape: variant }
      if (variant === 'polygon') pendingShape = { ...current, points: [point] }
      else gesture = current
    } else if (tool === 'mixer') {
      compose(sample, { includeForeground: false })
      mixPixels(sample, preview, point, brush)
      if (brush.mode === 'mega' || variant === 'mega') commitPreview(common)
      else gesture = { ...common, type: 'mixer', last: point, remainder: 0 }
    } else {
      if (tool === 'eraser') brush.color = '#ffffff'
      const random = makeRandom(Math.floor(point.x * 14399 + point.y * 131 + performance.now()))
      gesture = { ...common, type: 'stroke', last: point, remainder: 0, random, step: 0 }
      if (event.pointerType === 'pen' && variant === 'freehand' && ['pencil', 'chalk', 'crayon'].includes(tool)) {
        gesture.pressureInput = createPressureInput(event)
        point.pressure = gesture.pressureInput.sample(event)
      }
      if (dab && image) {
        gesture.nativeTracking = createNativeBrushTracking({ spacing: dab.spacing, lineSpacing: nativeLineSpacing(brush, dab) })
      }
      if (tool === 'spray') {
        sprayWhileHeld(gesture)
      }
      if (gesture.nativeTracking) {
        if (gesture.pressureInput) gesture.last = { ...nativePoint(point), pressure: point.pressure }
        for (const emission of gesture.nativeTracking.begin(nativePoint(point))) drawDab(gesture, gesture.pressureInput ? { ...emission, pressure: point.pressure } : emission)
        if (dab.spacing === 0) pollNativeBrush(gesture)
      } else drawDab(gesture, point)
    }
    render()
  }

  function handleMove(event) {
    if (contact !== null && event.pointerId !== contact) return
    const point = pointFor(event)
    if (!gesture) {
      if (pendingShape?.type === 'curve') {
        drawShape(pendingShape, pendingShape.end, null, point)
        render()
      } else if (pendingShape?.type === 'polygon-select') {
        render()
        display.save()
        display.strokeStyle = '#1364d8'
        display.setLineDash([4, 3])
        drawPath(display, 'lasso', pendingShape.start, point, [...pendingShape.points, point])
        display.stroke()
        display.restore()
      } else if (pendingShape?.points) {
        drawShape(pendingShape, point, [...pendingShape.points, point])
        render()
      } else if (options.tool === 'eyedropper') {
        hooks.onSamplePreview?.(getColorAt(point))
      }
      return
    }

    if (gesture.pointerId !== event.pointerId) return
    const current = gesture
    paintAudio.move(current.end, point)
    current.end = point
    if (current.type === 'native-moving') {
      movingPaint.move(point)
    } else if (current.type === 'shape') {
      current.end = constrain(current.start, point, current.shape, event.shiftKey)
      drawShape(current, current.end)
    } else if (current.type === 'fill') {
      current.fillAt(preview, pixelFor(point))
    } else if (current.type === 'select') {
      const item = current.selection
      item.end = constrain(item.start, point, item.shape, event.shiftKey)
      if (item.points) item.points.push(point)
    } else if (current.type === 'move-selection') {
      if (!current.piece && distance(current.start, point) >= 1) {
        current.piece = selectionImage(current.original)
        if (current.piece) eraseSelection(current.original)
      }
      if (current.piece) {
        const dx = Math.round(point.x - current.start.x)
        const dy = Math.round(point.y - current.start.y)
        selection = moveSelection(current.original, dx, dy)
        clearPreview()
        preview.drawImage(current.piece.canvas, current.piece.bounds.x + dx, current.piece.bounds.y + dy)
      }
    } else if (current.type === 'sound') {
      respondToSound()
    } else if (current.nativeShapes) {
      // The native cyclic shape renderer is throttled by time, not distance;
      // bitmap registration supplies placement without jitter or rotation.
      if (event.type !== 'pointerup' && performance.now() - current.lastNativeShapeAt >= 100) drawDab(current, point)
    } else {
      for (const entry of pointerSamples(event)) {
        const sample = pointFor(entry)
        if (current.pressureInput) sample.pressure = current.pressureInput.sample(entry, event)
        strokeTo(current, sample)
        // Poll native tools at the last consumed sample, never the duplicate
        // parent position after a nonempty coalesced list.
        if (current.pressureInput) current.end = sample
      }
    }
    render()
  }

  function handleUp(event) {
    if (!gesture) {
      if (contact === event.pointerId) { releaseContact(); paintAudio.stop(true) }
      return
    }
    if (gesture.pointerId !== event.pointerId) return
    const current = gesture
    stopNativeBrushPolling(current)
    if (current.nativeTracking) current.nativeTracking.end()
    else handleMove(event)
    gesture = null
    releaseContact()
    paintAudio.stop(true)
    if (current.type === 'native-moving') {
      finishMovingStroke(current)
    } else if (current.type === 'select') {
      const bounds = selectionBounds(current.selection)
      if (bounds.width > 2 && bounds.height > 2) selection = current.selection
      render()
    } else if (current.type === 'move-selection') {
      if (current.piece) {
        art.drawImage(preview.canvas, 0, 0)
        clearPreview()
        remember(current.before, 'move')
      }
    } else if (current.type === 'shape' && current.shape === 'curve' && distance(current.start, current.end) > 1) {
      pendingShape = { ...current, type: 'curve' }
      render()
    } else if (current.type !== 'sound' || current.step) {
      commitPreview(current)
    } else {
      render()
    }
  }


  async function setLayer(name, asset, settings = {}) {
    if (pageOperation) return false
    const request = ++updateId
    const image = await loadAsset(asset)
    const frontAsset = settings.foreground
    const frontImage = frontAsset ? await loadAsset(frontAsset) : null
    if (request !== updateId) return false
    cancel()
    const before = snapshot()
    const layer = image ? { image, url: assetUrl(asset) || null } : null
    if (name === 'background') {
      if (settings.clearArt) art.clearRect(0, 0, width, height)
      background = layer
      foreground = frontImage ? { image: frontImage, url: assetUrl(frontAsset) || null } : null
    } else if (name === 'foreground') foreground = layer
    else paper = layer
    remember(before, name)
    return true
  }

  async function placeAsset(asset, placement = {}) {
    if (pageOperation) return false
    const request = updateId
    const image = await loadAsset(asset)
    if (request !== updateId || !image) return false
    cancel()
    const before = snapshot()
    placeImage(art, image, placement)
    remember(before, 'asset')
    return true
  }

  async function loadImage(asset) {
    if (pageOperation) return false
    const request = ++updateId
    const image = await loadAsset(asset)
    if (request !== updateId || !image) return false
    cancel()
    const before = snapshot()
    const dimensions = mediaSize(image)
    const scale = Math.min(width / dimensions.width, height / dimensions.height)
    placeImage(art, image, { width: dimensions.width * scale, height: dimensions.height * scale })
    remember(before, 'import')
    return true
  }

  function save() {
    return {
      version: 1,
      width,
      height,
      art: visibleInk().canvas.toDataURL(),
      background: background?.url || null,
      foreground: foreground?.url || null,
      paper: paper?.url || null,
    }
  }

  async function restore(state) {
    if (pageOperation) return false
    if (typeof state === 'string' && state.startsWith('{')) state = JSON.parse(state)
    if (!state || state.version !== 1) throw new Error('Unsupported picture file')
    const request = ++updateId
    const [ink, base, front, texture] = await Promise.all([
      loadAsset(state.art),
      loadAsset(state.background),
      loadAsset(state.foreground),
      loadAsset(state.paper),
    ])
    if (request !== updateId) return false
    cancel()
    art.clearRect(0, 0, width, height)
    if (ink) art.drawImage(ink, 0, 0, width, height)
    background = base ? { image: base, url: state.background } : null
    foreground = front ? { image: front, url: state.foreground } : null
    paper = texture ? { image: texture, url: state.paper } : null
    selection = null
    back.length = 0
    forward.length = 0
    notify('restore')
    return true
  }

  function setOptions(next) {
    const changed = ['tool', 'variant', 'mode'].some(key => key in next && next[key] !== options[key]) ||
      movingPaint.active && 'effectIndex' in next && next.effectIndex !== options.effectIndex
    if (changed) {
      finishSound()
      cancel()
    }
    if (next.variant === 'cookie-cutter' && 'asset' in next && next.asset !== options.asset) {
      selection = null
      render()
    }
    if (next.tool && next.tool !== options.tool && !('asset' in next)) options.asset = null
    options = { ...options, ...next }
    options.variant ||= 'freehand'
    canvas.style.cursor = hooks.cursorFor?.(options) || cursors[toolAliases[options.tool] || options.tool] || 'crosshair'
    if (options.tool === 'sound' && 'level' in next) respondToSound()
    if (Object.keys(next).every(key => key === 'level' || key === 'pitch')) return
    const brush = activeOptions({})
    if (brush.tool === 'spray') {
      const moving = ['moving', 'moving-spray'].includes(brush.mode)
      const id = 24000 + 100 * ((brush.effectIndex ?? 0) % (moving ? 20 : 15))
      if (moving) { shapeBankId = null; nextNativeShape = null }
      else if (shapeBankId !== id) { shapeBankId = id; nextNativeShape = null }
      return nativeSprayAssets.load(moving ? 'moving-spray' : 'spray', id)
    }
    if (brush.tool !== 'eyedropper') { shapeBankId = null; nextNativeShape = null }
    const asset = brushAsset(brush)
    if (options.variant === 'cookie-cutter' && originalTools && !cutoutRequest) {
      cutoutRequest = fetch(`${originalTools}cutouts/regions.json`).then(response => {
        if (!response.ok) throw new Error('Cutout shapes unavailable')
        return response.json()
      }).then(regions => { cutoutRegions = regions }).catch(() => {})
    }
    if (asset) {
      const ready = loadAsset(asset).catch(error => {
        hooks.onError?.(error)
        return null
      })
      return options.variant === 'cookie-cutter' ? Promise.all([ready, cutoutRequest]) : ready
    }
  }

  function download(filename = 'Kid Pix Picture.png') {
    compose(sample)
    const link = document.createElement('a')
    link.download = filename
    link.href = sample.canvas.toDataURL()
    link.click()
  }

  const listenerOptions = { signal: listeners.signal }
  canvas.style.touchAction = 'none'
  canvas.style.cursor = 'crosshair'
  canvas.addEventListener('pointerdown', handleDown, listenerOptions)
  canvas.addEventListener('pointermove', handleMove, listenerOptions)
  canvas.addEventListener('pointerup', handleUp, listenerOptions)
  canvas.addEventListener('pointercancel', event => {
    if (contact === event.pointerId) cancel()
  }, listenerOptions)
  canvas.addEventListener('lostpointercapture', event => {
    if (contact === event.pointerId) cancel()
  }, listenerOptions)
  onInteractionInactive(canvas, cancel, listeners.signal)
  render()

  return {
    // Opaque synchronous checkpoint: no private canvases or async serialization.
    beginPageOperation() {
      if (pageOperation) throw new Error('Page operation already active')
      cancel()
      updateId++
      const prior = snapshot(), undo = back.slice(), redo = forward.slice()
      pageOperation = true
      let ended = false
      return {
        clear() { if (!ended) return clear() },
        rollback() {
          if (ended) return
          loadSnapshot(prior)
          back.splice(0, back.length, ...undo)
          forward.splice(0, forward.length, ...redo)
          notify('restore')
        },
        release() { ended = true; pageOperation = false; updateId++ },
      }
    },
    canvas,
    setOptions,
    resetNativeSpray() { nextNativeShape = null },
    setBackground: (asset, settings) => setLayer('background', asset, settings),
    setForeground: asset => setLayer('foreground', asset),
    setPaper: asset => setLayer('paper', asset),
    placeAsset,
    loadImage,
    placeText,
    getColorAt,
    renderTo: compose,
    renderForegroundTo,
    render,
    undo,
    redo,
    clear,
    reset,
    cancel,
    copy,
    cut,
    paste,
    save,
    restore,
    download,
    destroy() {
      cancel()
      listeners.abort()
      paintAudio.destroy()
    },
    get actionState() {
      if (selection && !actionTargets.has(selection)) actionTargets.set(selection, ++actionTargetSequence)
      return { target: selection ? actionTargets.get(selection) : null,
        cut: Boolean(selection), copy: Boolean(selection), paste: Boolean(clipboard) }
    },
    get canUndo() { return !!back.length },
    get canRedo() { return !!forward.length },
  }
}
