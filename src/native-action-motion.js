import { voiceStep } from './text-voices.js';
import { textStep } from './text-values.js';
import { createActionStateController, policyFor } from './native-action-state.js';
import { createNativeToolMotion } from './native-tool-motion.js';
import { regionClipPath } from './native-control-regions.js';

export function actionProfile({ tray, selected }) {
  if (tray === 'text') return { table: 9383, rows: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18] };
  if (tray === 'grab') return { table: 926, rows: selected === 'grab' ? [2, 3, 4, 6, 7, 8, 9] : selected === 'scissors' ? [2, 3, 4, 11] : [2, 3, 4] };
  return null;
}

// Portable source adapter, also available to the separate Stamp owner.
// Profile rows are source row indices; policyFor supplies explicit bindings.
export function actionManifest(data, profile) {
  const table = data.tables?.[profile.table];
  const rows = Array.isArray(table) ? table : table?.buttons;
  if (!rows) return null;
  const scripts = {}, sprites = {};
  const buttons = profile.rows.map(index => {
    const source = rows.find(row => row.index === index);
    const policy = policyFor(profile.table, index);
    const allowed = { 9383: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18], 926: [2, 3, 4, 6, 7, 8, 9, 11],
      18700: [0, 1, 2, 3], 18202: [0, 1, 2] }[profile.table] ?? [];
    if (!allowed.includes(index) || !source || !policy.binding || !regionClipPath(source.region)
      || source.rolloverParameters?.join() !== (profile.table === 926 && index !== 11 ? '1,0,0' : '0,0,0')) throw new Error('Unsupported action row');
    if (profile.table === 926 && index === 11 && (source.command !== 22361
      || source.stateScripts?.join() !== '18377,18378,0,0' || source.rolloverScript !== 18379
      || source.rolloverLoops !== false || source.rolloverCancelsOnLeave !== true)) throw new Error('Unsupported Make Sticker row');
    for (const id of [...source.stateScripts, source.rolloverScript].filter(Boolean)) {
      const clip = data.scripts[id];
      if (!clip) throw new Error(`Missing action program ${id}`);
      if (profile.table === 926 && index === 11 && (clip.tickMs !== 100
        || clip.frames?.length !== (id === 18378 ? 2 : 1) || clip.endCheckTick !== (id === 18378 ? 2 : 1)
        || clip.frames.some((frame, tick) => frame.tick !== tick || frame.parts?.length !== 1)
        || JSON.stringify(clip.sounds) !== JSON.stringify(id === 18378 ? [{tick:1,sound:18066,cue:66,channel:1}] : []))) throw new Error('Truncated Make Sticker program');
      scripts[id] = { ...clip, script: id, frames: clip.frames.map(frame => ({ ...frame,
        parts: frame.parts.map(part => {
          const key = `${clip.collection}:${part.sprite}`;
          if (!data.sprites[key]) throw new Error(`Missing action sprite ${key}`);
          sprites[key] = data.sprites[key];
          return { ...part, sprite: key };
        }),
      })) };
    }
    return { ...source, policy, name: policy.binding, action: policy.binding };
  });
  // Text's live font/number fields and Grab's unbound navigation column
  // must stay outside the opaque restoration, including vacated pose pixels.
  const restorationGroups = profile.table === 9383 ? [[2, 3], [4, 5], [6, 7, 8, 9, 10, 11], [12, 13, 14], [15], [17, 18]]
    : profile.table === 926 ? [[2, 3, 4], [6, 7, 8, 9], [11]] : null;
  const restorationRects = restorationGroups?.flatMap(rows => {
    const parts = buttons.filter(button => rows.includes(button.index))
      .flatMap(button => [...button.stateScripts, button.rolloverScript].filter(Boolean))
      .flatMap(id => scripts[id].frames.flatMap(frame => frame.parts));
    if (!parts.length) return [];
    const left = Math.min(...parts.map(part => part.x)), top = Math.min(...parts.map(part => part.y));
    const right = Math.max(...parts.map(part => part.x + sprites[part.sprite].width));
    const bottom = Math.max(...parts.map(part => part.y + sprites[part.sprite].height));
    return [[left, top, right - left, bottom - top]];
  });
  return { buttons, scripts, sprites, sounds: data.sounds, renderMode: 'ordinary', restorationRects };
}

export function actionStates(manifest, current) {
  return manifest.buttons.map(button => {
    const action = button.action;
    if (button.policy?.kind === 'boundary') {
      const boundary = (action.startsWith('voice-step:')
        ? voiceStep(current.voice, Number(action.split(':')[1]), current.voiceCatalog) : textStep(current, action)) === null;
      return { active: false, boundary, disabled: boundary };
    }
    return { active: action === 'speak' ? Boolean(current.readActive) : action.startsWith('align:') ? current.align === action.slice(6)
      : ['bold', 'italic', 'underline'].includes(action) ? Boolean(current[action]) : false,
    disabled: action === 'make-sticker' ? !current.stickerAvailable : action.startsWith('text-clipboard:') ? !current.textCapabilities?.[action.split(':')[1]] : action === 'speak' ? Boolean(current.readDisabled) : action.startsWith('edit:') ? !current.capabilities?.[action.slice(5)] : false };
  });
}

export function actionTarget(current, action) {
  if (action === 'make-sticker') return current.stickerIdentity;
  if (action === 'speak') return current.readIdentity;
  if (action?.startsWith('text-clipboard:')) return JSON.stringify([current.textIdentity, action.endsWith(':paste') ? current.textClipboardGeneration : null]);
  return action?.startsWith('voice-step:')
    ? JSON.stringify([current.target, current.voice, current.voiceGeneration]) : current.target;
}

export function createNativeActionMotion(options) {
  const layer = options.stage.ownerDocument.createElement('div');
  layer.className = 'chrome native-secondary-motion';
  layer.hidden = true;
  options.stage.querySelector('#native-tool-motion').after(layer);
  const motion = createNativeToolMotion({ ...options, layer,
    manifestPath: 'secondary-motion/manifest.json', canvasAttribute: 'nativeActionMotion',
    manifestFor: (data, current) => actionManifest(data, current.profile),
    backdropFor(data, current) {
      const backdrop = data.backdrops?.[current.art], page = backdrop?.pages?.[current.page];
      return page && { path: page.image, rect: backdrop.rect };
    },
    supported: tray => tray !== 'inactive', createController: createActionStateController,
    actionForButton: button => button.action, authoritativeFor: actionStates,
    targetFor: current => current.target,
    gestureTargetFor: (current, button) => actionTarget(current, button.action),
  });
  return { ...motion, update(current) {
    const profile = actionProfile(current);
    return motion.update(profile ? { ...current, profile, tray: `${current.tray}:actions:${profile.rows.join('-')}` } : { tray: 'inactive' });
  }, dispose() { motion.dispose(); layer.remove(); } };
}
