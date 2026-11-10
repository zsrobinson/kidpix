// UA estimates only. This deliberately rejects clock domains we cannot relate
// to performance.now(), long horizons, oversized batches and malformed lists.
// These are safety/work limits, not claims about useful Pencil latency.
export function pencilPredictions(event, { now, after, pointFor, start, spacing }) {
  try {
    if (event.type !== 'pointermove' || event.pointerType !== 'pen' ||
        !Number.isFinite(now) || !Number.isFinite(after) || !Number.isFinite(event.timeStamp) ||
        !Number.isFinite(spacing) || spacing < .5 ||
        event.timeStamp < after || event.timeStamp > now || now - event.timeStamp > 100) return null
    const entries = event.getPredictedEvents?.()
    if (!entries?.length || entries.length > 16) return null
    let time = Math.max(after, event.timeStamp)
    if (!Number.isFinite(start?.x) || !Number.isFinite(start?.y)) return null
    let last = start
    let work = 0
    const points = []
    for (const entry of entries) {
      if (entry.pointerId !== event.pointerId || entry.pointerType !== 'pen' ||
          !Number.isFinite(entry.timeStamp) || entry.timeStamp <= Math.max(time, now) ||
          entry.timeStamp - event.timeStamp > 100 ||
          !Number.isFinite(entry.clientX) || !Number.isFinite(entry.clientY) ||
          !Number.isFinite(entry.pressure) || entry.pressure < 0 || entry.pressure > 1) return null
      const point = pointFor(entry)
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
      work += Math.ceil(Math.hypot(point.x - last.x, point.y - last.y) / spacing)
      if (work > 4096) return null
      points.push({ ...point, pressure: entry.pressure > 0 ? entry.pressure : .5 })
      last = point
      time = entry.timeStamp
    }
    if (time <= now) return null
    return { points, expires: time }
  } catch { return null }
}
