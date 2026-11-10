import { editorText, rangeText } from './editor-text.js';
// Keep the editor range across whole-object formatting and genuine value focus.
// Anchor/focus order is intentional: backward and collapsed ranges are distinct.
export function createTextRangeKeeper(root) {
  const doc = root.ownerDocument;
  let saved, readIdentity, rangeRevision = 0;
  function capture(editor = doc.activeElement) {
    const selection = doc.getSelection();
    if (!editor?.matches('.object-text') || !root.contains(editor) || !selection?.rangeCount
      || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return;
    const model = editorText(editor);
    const offset = model.offset;
    saved = { id: editor.closest('[data-object]').dataset.object,
      offsets: [offset(selection.anchorNode, selection.anchorOffset), offset(selection.focusNode, selection.focusOffset)], text: model.text };
  }
  root.addEventListener('focusout', event => capture(event.target));
  function restore(editor, focus = false) {
    if (!saved || editor?.closest('[data-object]')?.dataset.object !== saved.id) return;
    if (focus) editor.focus({ preventScroll: true });
    const point = editorText(editor).point;
    doc.getSelection().setBaseAndExtent(...point(saved.offsets[0]), ...point(saved.offsets[1]));
  }
  function payload(target) {
    if (!target) return null;
    const editor = [...root.children].find(node => node.dataset.object === target.id)?.querySelector('.object-text');
    if (!editor) return null;
    const selection = doc.getSelection(), model = editorText(editor);
    let offsets;
    if (selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
      offsets = [model.offset(selection.anchorNode, selection.anchorOffset), model.offset(selection.focusNode, selection.focusOffset)];
    } else if (saved?.id === target.id && saved.text === model.text) offsets = saved.offsets;
    else offsets = [0, 0];
    const identity = JSON.stringify([target.id, target.revision, model.text, offsets]);
    if (identity !== readIdentity) { readIdentity = identity; rangeRevision++; }
    return Object.freeze({ ...target, rangeRevision, text: rangeText(model.text, ...offsets), boxText: model.text,
      range: Object.freeze([...offsets]) });
  }
  return { capture, restore, payload, apply(change) {
    const editor = doc.activeElement?.matches('.object-text') ? doc.activeElement : null;
    capture(editor);
    const id = editor?.closest('[data-object]').dataset.object;
    change();
    if (id) restore([...root.children].find(node => node.dataset.object === id)?.querySelector('.object-text'), true);
  } };
}
