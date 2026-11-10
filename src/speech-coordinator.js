// WebSpeech is queue-wide. This owner is the only product caller of cancel/speak.
export function createSpeechCoordinator(engine, Utterance, changed = () => {}) {
  let current = null, generation = 0;
  const notify = () => changed();
  function retire(owner) {
    if (!current || (owner && current.owner !== owner)) return false;
    current = null; generation++; // Invalidate before potentially synchronous callbacks.
    try { engine.cancel(); } catch { /* Token and UI remain retired even if the platform fails. */ } finally { notify(); }
    return true;
  }
  function submit(owner, payloads) {
    if (owner !== 'TextRead') retire();
    if (!engine || !Utterance || !payloads.length) return false;
    if (owner === 'TextRead' && (current || engine.paused || engine.speaking || engine.pending)) return false;
    const token = { owner, generation: ++generation, state: 'queued', pending: new Set(), utterances: [],
      payloads: Object.freeze(payloads.map(value => Object.freeze({ ...value }))) };
    let voices;
    try { voices = Array.from(engine.getVoices()); } catch { return false; }
    if (owner === 'TextRead' && (!voices.length || token.payloads.some(p => p.voiceURI
      && voices.filter(v => v.voiceURI === p.voiceURI).length !== 1))) return false;
    try {
      for (const payload of token.payloads) {
        const utterance = new Utterance(payload.text);
        if (payload.voiceURI) utterance.voice = voices.find(v => v.voiceURI === payload.voiceURI) || null;
        token.utterances.push(utterance); token.pending.add(utterance);
        utterance.onstart = () => { if (current === token && token.pending.has(utterance)) { token.state = 'started'; notify(); } };
        const finish = () => {
          if (current !== token || !token.pending.delete(utterance)) return;
          if (!token.pending.size) { current = null; generation++; notify(); }
        };
        utterance.onend = finish; utterance.onerror = finish;
      }
      current = token; notify();
      for (const utterance of token.utterances) {
        if (current !== token) break;
        engine.speak(utterance);
      }
      return true;
    } catch {
      if (current === token) retire(owner);
      return false;
    }
  }
  return { submit, retire, get current() { return current; }, get generation() { return generation; } };
}
