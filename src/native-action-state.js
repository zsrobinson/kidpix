let controllerSequence = 0;

// Dispatch: recovered i386 0x30ce0–0x30ea9; see README.md.
export function frameAtTick(clip, tick) {
  let index = 0;
  while (index + 1 < clip.frames.length && clip.frames[index + 1].tick <= tick) index++;
  return index;
}

// Explicit owner semantics, never inferred from MBTN group/argument.
export function policyFor(table, row) {
  const key = `${table}:${row}`;
  const boundary = ['18700:1', '18700:2', '9383:2', '9383:3', '9383:4',
    '9383:5', '9383:17', '9383:18'].includes(key);
  const alignment = { '9383:6': 'align:left', '9383:7': 'align:right', '9383:8': 'align:center' };
  const sizes = { '18202:0': 'size:4', '18202:1': 'size:8', '18202:2': 'size:16' };
  const toggles = { '9383:9': 'bold', '9383:10': 'italic', '9383:11': 'underline' };
  const actions = {
    '18700:0': '#category', '18700:1': 'category-step:-1',
    '18700:2': 'category-step:1', '18700:3': 'stamp-edit',
    '9383:2': 'font-step:-1', '9383:3': 'font-step:1',
    '9383:4': 'font-size-step:1', '9383:5': 'font-size-step:-1',
    '9383:12': 'text-clipboard:cut', '9383:13': 'text-clipboard:copy', '9383:14': 'text-clipboard:paste',
    '9383:17': 'voice-step:-1', '9383:18': 'voice-step:1',
    '9383:0': '#font', '9383:1': '#font-size', '9383:16': '#text-voice',
    '926:2': 'edit:cut', '926:3': 'edit:copy', '926:4': 'edit:paste',
    '926:5': 'navigate:1', '926:10': 'navigate:-1',
    '926:6': 'edit:front', '926:7': 'edit:back',
    '926:8': 'edit:forward', '926:9': 'edit:backward', '926:11': 'make-sticker',
  };
  if (alignment[key]) return { kind: 'exclusive', selectionGroup: 'text-alignment', binding: alignment[key] };
  if (sizes[key]) return { kind: 'exclusive', selectionGroup: 'stamp-size', binding: sizes[key] };
  if (toggles[key]) return { kind: 'toggle', binding: toggles[key] };
  if (boundary) return { kind: 'boundary', binding: actions[key] ?? null };
  if (key === '9383:15') return { kind: 'running', binding: 'speak' };
  if ((table === 18700 && [0, 3].includes(row))
    || (table === 9383 && [0, 1, 12, 13, 14, 16].includes(row))
    || (table === 926 && row >= 2 && row <= 11)) {
    return { kind: 'momentary', binding: actions[key] ?? null };
  }
  throw new Error(`Unreviewed source row ${key}`);
}

/** Synchronous, timer-free controller. manifest: {buttons, scripts, sounds}.
 * buttons are exported source rows plus explicit policy; use policyFor for these
 * recovered rows. authoritative entries: {active, disabled, boundary}.
 * Callbacks must not throw. Return values from release are activation proposals;
 * the application acknowledges them with setAuthoritativeState (no implicit commit).
 */
export function createActionStateController(manifest, {
  render = () => {}, playSound = () => null, now = () => performance.now(),
  authoritative = [], onDispatch = () => {}, onGroupMessage = () => {},
} = {}) {
  let disposed = false, hovered = null, tracking = null, sequence = 0, silentRestore = false;
  const controllerId = ++controllerSequence;
  const actors = [];
  function stop(stream) {
    stream?.handles.forEach(handle => handle.stop?.());
    stream?.handles.clear();
  }
  function sounds(stream) {
    while (stream.soundIndex < stream.clip.sounds.length
      && stream.clip.sounds[stream.soundIndex].tick <= stream.tick) {
      const cue = stream.clip.sounds[stream.soundIndex++];
      stream.handles.get(cue.channel)?.stop?.();
      stream.handles.delete(cue.channel);
      const handle = silentRestore ? null : playSound({ ...cue, src: manifest.sounds?.[cue.sound]?.src }, stream.owner);
      if (handle) stream.handles.set(cue.channel, handle);
    }
  }
  function make(script, time, kind, index) {
    const clip = manifest.scripts[script];
    if (!clip) throw new Error(`Missing source program ${script}`);
    const stream = { clip, tick: 0, next: time + clip.tickMs, finished: false,
      soundIndex: 0, handles: new Map(), owner: `action-motion:${controllerId}:${index}:${kind}:${++sequence}` };
    sounds(stream);
    return stream;
  }
  function auxOff(actor) { stop(actor.aux); actor.aux = null; }
  function state(index, slot, time) {
    const actor = actors[index], script = actor.slots[slot];
    if (!script) throw new Error(`Missing source slot ${slot} for row ${index}`);
    // 0x30b25: changing slot with the same script keeps its entire stream.
    if (actor.base.clip.script !== script) {
      stop(actor.base);
      actor.base = make(script, time, 'state', index);
    }
    actor.state = slot;
  }
  function dispatch(index, event, time) {
    if (!Number.isInteger(event) || event < 0x2000 || event > 0x2008) throw new RangeError('Unsupported source event');
    const actor = actors[index], button = manifest.buttons[index], old = actor.state;
    auxOff(actor);
    let target = old, message = null;
    switch (event) {
      case 0x2000: case 0x2005: target = 1; break;
      case 0x2001: target = 0; break;
      case 0x2003: target = actor.latch === 1 ? 2 : 0; break;
      case 0x2004: case 0x2008:
        target = 0; actor.latch = 0;
        if (actor.mode === 0) actor.inputEnabled = true;
        break;
      case 0x2002: case 0x2006:
        if (!actor.slots[2] && !actor.slots[3]) target = 0;
        else if (!actor.latch || event === 0x2006) {
          if (actor.mode === 2) { target = 3; actor.inputEnabled = false; message = 0x66; }
          else { target = 2; actor.latch = 1; message = 0x65; }
        } else if (actor.mode === 1) { target = 0; actor.latch = 0; }
        break;
      case 0x2007:
        if (actor.slots[3]) { target = 3; actor.inputEnabled = false; }
        break;
    }
    state(index, target, time);
    // Native dispatch epilogue 0x30e76–0x30e85.
    if (old === 3 && target !== old) actor.inputEnabled = true;
    onDispatch({ index, event, state: target, latch: actor.latch, inputEnabled: actor.inputEnabled });
    if (message && button.group) onGroupMessage({ index, message, group: button.group });
    // Owner policy, separate from native group notification. Boundary siblings
    // must never be reset by raw shared group numbers.
    if (message === 0x66 && button.policy.kind === 'exclusive') {
      actors.forEach((peer, peerIndex) => {
        if (peerIndex !== index && manifest.buttons[peerIndex].policy.kind === 'exclusive'
          && manifest.buttons[peerIndex].policy.selectionGroup === button.policy.selectionGroup) {
          dispatch(peerIndex, 0x2004, time);
        }
      });
    }
  }
  function restore(index, time) {
    const actor = actors[index], policy = manifest.buttons[index].policy, auth = actor.authoritative;
    auxOff(actor);
    actor.slots[3] = policy.kind === 'boundary' && !auth.boundary ? 0 : actor.originalSlot3;
    actor.latch = auth.active && actor.mode === 1 ? 1 : 0;
    const slot = policy.kind === 'boundary' ? (auth.boundary ? 3 : 0)
      : auth.active ? (actor.mode === 1 ? 2 : 3) : 0;
    state(index, slot, time);
    actor.inputEnabled = !auth.disabled && slot !== 3;
  }
  function disabled(index) {
    return !actors[index].inputEnabled || actors[index].authoritative.disabled
      || !manifest.buttons[index].policy.binding;
  }
  function snapshot() {
    return actors.map((actor, index) => {
      const stream = actor.aux ?? actor.base, frameIndex = frameAtTick(stream.clip, stream.tick);
      return { index, name: manifest.buttons[index].name, state: actor.state,
        mode: actor.mode, latch: actor.latch, disabled: Boolean(disabled(index)),
        inputEnabled: actor.inputEnabled, auxiliary: Boolean(actor.aux),
        script: stream.clip.script, tick: stream.tick, finished: stream.finished,
        clipRect: actor.aux ? manifest.buttons[index].auxiliaryClipRect : null,
        clip: stream.clip, frameIndex, frame: stream.clip.frames[frameIndex] };
    });
  }
  function paint() { if (!disposed) render(snapshot()); }
  const start = now();
  manifest.buttons.forEach((button, index) => {
    const mode = button.stateScripts[2] ? 1 : button.stateScripts[3] ? 2 : 0;
    const policy = button.policy;
    if (!policy || !['momentary', 'toggle', 'running', 'exclusive', 'boundary'].includes(policy.kind)
      || (['exclusive', 'boundary'].includes(policy.kind) ? mode !== 2
        : ['toggle', 'running'].includes(policy.kind) ? mode !== 1 : mode !== 0)
      || (policy.kind === 'exclusive' && !policy.selectionGroup)) throw new Error('Incompatible source policy');
    actors.push({ mode, slots: [...button.stateScripts], originalSlot3: button.stateScripts[3],
      state: 0, latch: 0, inputEnabled: true, aux: null,
      authoritative: { active: false, disabled: false, boundary: false, ...authoritative[index] },
      base: make(button.stateScripts[0], start, 'state', index) });
    restore(index, start);
  });
  paint();
  return {
    snapshot,
    step(time = now()) {
      if (disposed) return;
      let changed = false;
      actors.forEach((actor, index) => {
        const stream = actor.aux ?? actor.base;
        if (stream.finished || time < stream.next) return;
        changed = true;
        // Copied compatible scheduler from native-drawing-motion.js: one tick
        // per delivered update, terminal gate at endCheckTick, final-pose hold.
        stream.next = time + stream.clip.tickMs;
        if (stream.tick + 1 >= stream.clip.endCheckTick) {
          if (![1, 2].some(channel => {
            const handle = stream.handles.get(channel);
            return handle && !handle.isComplete();
          })) stream.finished = true;
        } else { stream.tick++; sounds(stream); }
        if (actor.aux?.finished) {
          auxOff(actor);
          if (manifest.buttons[index].rolloverLoops && hovered === index && tracking === null && !disabled(index)) {
            actor.aux = make(manifest.buttons[index].rolloverScript, time, 'hover', index);
          }
        }
      });
      if (changed) paint();
    },
    dispatch(index, event, time = now()) { if (!disposed) { dispatch(index, event, time); paint(); } },
    enter(index, time = now()) {
      if (disposed || hovered === index) return;
      if (hovered !== null) auxOff(actors[hovered]);
      hovered = index;
      if (tracking !== null) {
        if (tracking === index && !disabled(index)) dispatch(index, 0x2000, time);
      } else if (!disabled(index) && manifest.buttons[index].rolloverScript) {
        stop(actors[index].base);
        actors[index].aux = make(manifest.buttons[index].rolloverScript, time, 'hover', index);
      }
      paint();
    },
    leave(index, time = now()) {
      if (disposed) return;
      if (hovered === index) hovered = null;
      if (manifest.buttons[index].rolloverCancelsOnLeave !== false) auxOff(actors[index]);
      if (tracking === index) dispatch(index, 0x2001, time);
      paint();
    },
    press(index, time = now()) {
      if (disposed || disabled(index) || tracking !== null) return false;
      if (hovered !== null) auxOff(actors[hovered]);
      hovered = index; tracking = index;
      dispatch(index, 0x2005, time); paint(); return true;
    },
    release(inside, time = now()) {
      if (disposed || tracking === null) return null;
      const index = tracking, accepted = Boolean(inside) && !disabled(index);
      tracking = null; hovered = accepted ? index : null;
      dispatch(index, accepted ? 0x2002 : 0x2003, time);
      if (!accepted) restore(index, time);
      paint();
      if (!accepted) return null;
      const button = manifest.buttons[index];
      return { index, binding: button.policy.binding, command: button.command,
        commandArgument: button.commandArgument, state: actors[index].state };
    },
    setAuthoritativeState(index, value, time = now()) {
      if (disposed) return;
      const actor = actors[index];
      actor.authoritative = { ...actor.authoritative, ...value };
      // Ordinary rerenders keep held tracking and shared script progress.
      if (tracking !== index || value.disabled || value.boundary) {
        const cancelled = tracking === index;
        if (cancelled) { tracking = null; hovered = null; stop(actor.base); }
        if (cancelled) silentRestore = true;
        try { restore(index, time); }
        finally { silentRestore = false; }
        if (cancelled) {
          stop(actor.base);
          actor.base.soundIndex = actor.base.clip.sounds.length;
        }
      }
      paint();
    },
    setDisabled(index, value, time = now()) { this.setAuthoritativeState(index, { disabled: Boolean(value) }, time); },
    cancel(time = now()) {
      if (disposed) return;
      tracking = null; hovered = null;
      actors.forEach(actor => { stop(actor.base); auxOff(actor); });
      silentRestore = true;
      try { actors.forEach((_, index) => restore(index, time)); }
      finally { silentRestore = false; }
      // restore can start a different script: cancellation also owns those cues.
      actors.forEach(actor => { stop(actor.base); actor.base.soundIndex = actor.base.clip.sounds.length; });
      paint();
    },
    repaint: paint,
    dispose() {
      if (disposed) return;
      disposed = true; tracking = null; hovered = null;
      actors.forEach(actor => { stop(actor.base); auxOff(actor); });
    },
  };
}
