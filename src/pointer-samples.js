// Ownership is checked against the dispatched event by the caller. Early Safari
// coalesced samples can carry a different pointerId; never use it for ownership.
export function pointerSamples(event) {
  let samples
  try { samples = event.getCoalescedEvents?.() } catch { /* unsupported API */ }
  return samples?.length ? Array.from(samples) : [event]
}

export function pressureFactor(pressure) {
  return Math.max(.25, Math.min(1.5, 2 * pressure))
}

export function createPressureInput(event) {
  const pen = event.pointerType === 'pen'
  let lastPositive = .5
  return {
    sample(sample, parent = sample) {
      const type = sample.pointerType || parent.pointerType || event.pointerType
      const value = sample.pressure
      const positive = typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1
      const pressure = pen && type === 'pen'
        ? positive ? value : parent.type === 'pointerup' && value === 0 ? lastPositive : .5
        : .5
      if (pen && type === 'pen' && positive) lastPositive = value
      return pressure
    },
  }
}

export function interpolatePressure(start, end, fraction) {
  return (start.pressure ?? .5) + ((end.pressure ?? .5) - (start.pressure ?? .5)) * fraction
}

// Native tracking returns integer geometry only. Restore pressure without
// changing its acceptance threshold, emission coordinates or RNG sequence.
export function nativePressurePoint(emission, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const fraction = lengthSquared ? Math.max(0, Math.min(1,
    ((emission.x - start.x) * dx + (emission.y - start.y) * dy) / lengthSquared)) : 1
  return { ...emission, pressure: interpolatePressure(start, end, fraction) }
}
