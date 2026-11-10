// Browser adaptation: raw platform order, URI identity, no inferred default index.
export const VOICE_STEPPERS = Object.freeze([
  { action: 'voice-step:-1', label: 'Previous voice', x: 731, y: 659, symbol: '▲' },
  { action: 'voice-step:1', label: 'Next voice', x: 731, y: 690, symbol: '▼' },
]);
export function voiceStep(uri, direction, catalog = []) {
  if (!uri || ![-1, 1].includes(direction)) return null;
  const matches = catalog.filter(voice => voice.voiceURI === uri);
  if (matches.length !== 1) return null;
  const next = catalog[catalog.indexOf(matches[0]) + direction];
  if (!next?.voiceURI || catalog.filter(voice => voice.voiceURI === next.voiceURI).length !== 1) return null;
  return next.voiceURI;
}
export function voiceOptions(uri, catalog) {
  const options = [{ value: '', label: 'Default Voice' }];
  const seen = new Set(['']);
  for (const voice of catalog) {
    if (seen.has(voice.voiceURI)) continue;
    seen.add(voice.voiceURI);
    const ambiguous = catalog.filter(entry => entry.voiceURI === voice.voiceURI).length !== 1;
    options.push({ value: voice.voiceURI, label: `${voice.name || voice.voiceURI}${ambiguous ? ' (ambiguous URI)' : ''}` });
  }
  if (uri && !seen.has(uri)) options.push({ value: uri, label: `${uri} (unavailable)` });
  return options;
}
// A generation advances on every notification, including equal-value refreshes:
// no gesture begun against a previous platform catalog may later commit.
export function createVoiceCatalog(platform, changed = () => {}) {
  let voices = [], generation = 0;
  function refresh() {
    try { voices = Array.from(platform?.getVoices() || []); } catch { voices = []; }
    generation++;
    changed();
  }
  platform?.addEventListener('voiceschanged', refresh);
  refresh();
  return { get voices() { return voices; }, get generation() { return generation; },
    dispose() { platform?.removeEventListener('voiceschanged', refresh); } };
}
