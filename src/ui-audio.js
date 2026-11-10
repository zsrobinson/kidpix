// Keep the browser play result with the Audio without changing caller APIs.
// paused is initially true even while play() is pending: only terminal events
// or a rejected play request release an owned source completion gate.
const playback = new WeakMap();
const terminalEvents = ['ended', 'error', 'pause', 'abort', 'emptied'];

export function playUiAudio(audio) {
  let result;
  try { result = audio.play(); } catch (error) { result = Promise.reject(error); }
  const promise = Promise.resolve(result);
  playback.set(audio, promise);
  // Fire-and-forget callers are permitted; observers still see the rejection.
  promise.catch(() => {});
  return audio;
}

export function observeUiAudio(audio, onComplete) {
  let active = true;
  const cleanup = () => {
    active = false;
    for (const event of terminalEvents) audio.removeEventListener?.(event, finish);
  };
  function finish() {
    if (!active) return;
    cleanup();
    onComplete();
  }
  for (const event of terminalEvents) audio.addEventListener?.(event, finish);
  playback.get(audio)?.catch(finish);
  if (audio.ended || audio.error) finish();
  return cleanup;
}
