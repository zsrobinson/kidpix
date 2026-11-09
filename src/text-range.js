// Keep the editor range across whole-object formatting and genuine value focus.
// Anchor/focus order is intentional: backward and collapsed ranges are distinct.
export function createTextRangeKeeper(root) {
  const doc = root.ownerDocument;
  let saved;
  function capture(editor = doc.activeElement) {
    const selection = doc.getSelection();
    if (!editor?.matches('.object-text') || !selection.rangeCount
      || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return;
    const offset = (node, position) => {
      const prefix = doc.createRange(); prefix.selectNodeContents(editor); prefix.setEnd(node, position);
      return prefix.toString().length;
    };
    saved = { id: editor.closest('[data-object]').dataset.object,
      offsets: [offset(selection.anchorNode, selection.anchorOffset), offset(selection.focusNode, selection.focusOffset)] };
  }
  root.addEventListener('focusout', event => capture(event.target));
  function restore(editor, focus = false) {
    if (!saved || editor?.closest('[data-object]')?.dataset.object !== saved.id) return;
    if (focus) editor.focus({ preventScroll: true });
    const point = offset => {
      const walker = doc.createTreeWalker(editor, 4); let node;
      while ((node = walker.nextNode())) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      return [editor, editor.childNodes.length];
    };
    doc.getSelection().setBaseAndExtent(...point(saved.offsets[0]), ...point(saved.offsets[1]));
  }
  return { capture, restore, apply(change) {
    const editor = doc.activeElement?.matches('.object-text') ? doc.activeElement : null;
    capture(editor);
    const id = editor?.closest('[data-object]').dataset.object;
    change();
    if (id) restore([...root.children].find(node => node.dataset.object === id)?.querySelector('.object-text'), true);
  } };
}
