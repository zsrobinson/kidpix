import { attachMode1Motion } from './native-library-motion.js';

// Source mode and browser owner policy are independent. Help reads the actual
// application boolean; New/Print reset before synchronous command delivery.
// Completion means dispatch returned, never that a dialog saved or a task ended.
export const commandMotionBindings = [
  { name: 'save', action: 'save' },
  { name: 'export', action: 'stereo' },
  { name: 'new', action: 'new', mode: 1, resetBeforeDispatch: true },
  { name: 'print', action: 'print', mode: 1, resetBeforeDispatch: true },
  { name: 'help', action: 'help', mode: 1, isSelected: value => value === true },
];

export function attachCommandMotion(manifest, root, sprites, layer, options) {
  const owner = attachMode1Motion(manifest, root, sprites, layer, {
    ...options, mode: 0, bindings: commandMotionBindings,
    semanticCommands: true, terminalAdoption: true, actorAttribute: 'nativeCommandMotion',
  });
  // Modal changes can also originate outside the command dispatcher. They retire
  // contact/audio, independently of any pending download or image decode task.
  const observer = new root.ownerDocument.defaultView.MutationObserver(records => {
    if (records.some(record => record.target.localName === 'dialog')) owner.cancel();
  });
  observer.observe(root.ownerDocument.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  // Browser print events only clean this command's proposals; they do not
  // establish success and must not consume another held control.
  const view = root.ownerDocument.defaultView;
  const cleanupPrint = () => { owner.beforeActivation('print'); owner.cancel('print'); };
  for (const type of ['beforeprint', 'afterprint']) view.addEventListener(type, cleanupPrint);
  const dispose = owner.dispose;
  owner.dispose = () => {
    observer.disconnect();
    for (const type of ['beforeprint', 'afterprint']) view.removeEventListener(type, cleanupPrint);
    dispose();
  };
  return owner;
}
