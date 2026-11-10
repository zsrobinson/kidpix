import { attachMode1Motion } from './native-library-motion.js';

// Explicit browser command bindings. Mode 0 has no selected tray or slots 2/3.
// Completion means dispatch returned, never that a dialog saved or a task ended.
export const commandMotionBindings = [
  { name: 'save', action: 'save' },
  { name: 'export', action: 'stereo' },
];

export function attachCommandMotion(manifest, root, sprites, layer, options) {
  const owner = attachMode1Motion(manifest, root, sprites, layer, {
    ...options, mode: 0, bindings: commandMotionBindings,
    terminalAdoption: true, actorAttribute: 'nativeCommandMotion',
  });
  // Modal changes can also originate outside the command dispatcher. They retire
  // contact/audio, independently of any pending download or image decode task.
  const observer = new root.ownerDocument.defaultView.MutationObserver(records => {
    if (records.some(record => record.target.localName === 'dialog')) owner.cancel();
  });
  observer.observe(root.ownerDocument.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  const dispose = owner.dispose;
  owner.dispose = () => { observer.disconnect(); dispose(); };
  return owner;
}
