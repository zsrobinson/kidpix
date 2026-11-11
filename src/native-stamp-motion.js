import { actionManifest } from './native-action-motion.js';
import { createActionStateController } from './native-action-state.js';
import { createNativeToolMotion } from './native-tool-motion.js';

// Separate footprints are essential: an enclosing 18700 rectangle erases sizes.
export const stampProfiles = Object.freeze([
  Object.freeze({ name: 'arrows', table: 18700, rows: Object.freeze([1, 2]), bounds: Object.freeze([329, 665, 43, 62]) }),
  Object.freeze({ name: 'editor', table: 18700, rows: Object.freeze([3]), bounds: Object.freeze([490, 650, 61, 76]) }),
  Object.freeze({ name: 'size', table: 18202, rows: Object.freeze([0, 1, 2]), bounds: Object.freeze([432, 653, 32, 75]) }),
]);

export function stampStates(manifest, current) {
  const { categoryIndex, categoryCount, stampSize } = current;
  const valid = Number.isInteger(categoryIndex) && Number.isInteger(categoryCount)
    && categoryCount > 0 && categoryIndex >= 0 && categoryIndex < categoryCount;
  return manifest.buttons.map(button => {
    if (button.policy.kind === 'boundary') {
      const boundary = valid && (button.index === 1 ? categoryIndex === 0 : categoryIndex === categoryCount - 1);
      return { active: false, boundary, disabled: !valid || boundary };
    }
    return { active: button.policy.kind === 'exclusive' && button.action === `size:${stampSize}`,
      disabled: false, boundary: false };
  });
}

/** Explicit showLibrary hooks only. resolve is relative to original/ui.
 * update({active, nativeUi, categoryIndex, categoryCount, stampSize,
 *         selectedAssetId}); page is deliberately ignored (source page 0).
 * readState/refreshCurrent returns the same shape after an accepted command.
 */
export function createNativeStampMotion({ stage, controls = stage.querySelector('#library-tray'),
  resolve, onReady = () => {}, onActivate = () => {}, readState, refreshCurrent,
  ...assetOptions }) {
  const read = refreshCurrent ?? readState;
  let current = { active: false }, disposed = false;
  const ownedStyles = new Map();
  function restoreStyles() {
    for (const [control, style] of ownedStyles) {
      control.style.cssText = style;
      control.classList.remove('native-control', 'native-region');
      delete control.dataset.nativeMotionIndex;
    }
    ownedStyles.clear();
  }
  function rememberStyles() {
    for (const control of controls.querySelectorAll('[data-action]')) {
      if (/^(size:(4|8|16)|category-step:-?1|stamp-edit)$/.test(control.dataset.action)
        && !ownedStyles.has(control)) ownedStyles.set(control, control.style.cssText);
    }
  }
  function stateFor(profile, value) {
    return { ...value, color: '#000000', art: 'stamps', page: 0, profile,
      tray: value.active && value.nativeUi ? `stamp:${profile.name}` : 'inactive' };
  }
  function suppressSizeShadow() {
    for (const control of controls.querySelectorAll('.stamp-size.native-control')) control.style.boxShadow = 'none';
  }
  const owners = stampProfiles.map(profile => {
    const layer = stage.ownerDocument.createElement('div');
    layer.className = 'chrome native-secondary-motion';
    layer.dataset.stampOwner = profile.name;
    layer.style.zIndex = '1';
    layer.hidden = true;
    stage.append(layer);
    let motion;
    motion = createNativeToolMotion({ ...assetOptions, stage, layer, controls, resolve,
      // Preserve this accepted contact if artwork binds before its release.
      ownInteraction: profile.name === 'editor',
      fallbackActions: profile.name === 'editor' ? ['stamp-edit'] : [],
      manifestPath: 'secondary-motion/manifest.json', canvasAttribute: 'nativeStampMotion',
      manifestFor: data => actionManifest(data, profile),
      backdropFor(data) {
        const backdrop = data.backdrops?.stamps;
        return backdrop?.pages?.[0] && { path: backdrop.pages[0].image, rect: backdrop.rect };
      },
      createController: createActionStateController, actionForButton: button => button.action,
      authoritativeFor: stampStates,
      targetFor: value => profile.name === 'editor' ? value.selectedAssetId : null,
      supported: tray => tray !== 'inactive',
      refreshCurrent: read ? () => stateFor(profile, { ...current, ...read() }) : undefined,
      onActivate,
      onReady() {
        if (disposed) return;
        rememberStyles();
        motion.update(stateFor(profile, current));
        suppressSizeShadow();
        onReady();
      },
    });
    return { motion, layer, profile };
  });
  return {
    beforeRender() {
      owners.forEach(({ motion }) => motion.beforeRender());
      // DOM lifetime ends here; preserve the retained source owners themselves.
      restoreStyles();
    },
    update(next) {
      if (disposed) return false;
      current = { ...next };
      if (!current.active || !current.nativeUi) restoreStyles();
      else rememberStyles();
      const ready = owners.map(({ motion, profile }) => motion.update(stateFor(profile, current)));
      suppressSizeShadow();
      return ready.every(Boolean);
    },
    cancel() { owners.forEach(({ motion }) => motion.cancel()); },
    dispose() {
      if (disposed) return;
      disposed = true;
      owners.forEach(({ motion, layer }) => { motion.dispose(); layer.remove(); });
      restoreStyles();
    },
  };
}
