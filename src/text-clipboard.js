import { editorText } from './editor-text.js';

// Document-local plaintext only. No OS adapter and no serialized state.
export function createTextClipboard({ current, replace, epoch = () => 0, publish = () => true }) {
  let payload = null, generation = 0, revision = 0, identity, retained;
  const editors = new WeakMap(); let editorSequence = 0;
  function target() {
    const state = current();
    if (!state?.editor || !state.editable) { if (identity !== undefined) { identity = undefined; revision++; } return null; }
    const { editor } = state, doc = editor.ownerDocument, model = editorText(editor), selection = doc.getSelection();
    let offsets;
    if (selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
      offsets = [model.offset(selection.anchorNode, selection.anchorOffset), model.offset(selection.focusNode, selection.focusOffset)];
      retained = { editor, text: model.text, offsets, revision: state.revision, epoch: epoch() };
    } else if (retained?.editor === editor && retained.text === model.text && retained.revision === state.revision && retained.epoch === epoch()) offsets = retained.offsets;
    if (!offsets?.every(n => Number.isInteger(n) && n >= 0 && n <= model.text.length)) { if (identity !== undefined) { identity = undefined; revision++; } return null; }
    if (!editors.has(editor)) editors.set(editor, ++editorSequence);
    const next = JSON.stringify([epoch(), state.id, editors.get(editor), state.revision, model.text, offsets]);
    if (next !== identity) { identity = next; revision++; }
    return Object.freeze({ documentEpoch: epoch(), objectId: state.id, editorGeneration: editors.get(editor),
      textRevision: state.revision, rangeRevision: revision, text: model.text, anchor: offsets[0], focus: offsets[1] });
  }
  function valid(token) { return token && JSON.stringify(target()) === JSON.stringify(token); }
  function span(token) {
    let start = Math.min(token.anchor, token.focus), end = Math.max(token.anchor, token.focus);
    const splits = i => i > 0 && i < token.text.length && /[\uD800-\uDBFF]/.test(token.text[i-1]) && /[\uDC00-\uDFFF]/.test(token.text[i]);
    // Collapsed insertion moves past the pair; nonempty selections expand.
    if (start === end) { if (splits(start)) start = end = start + 1; }
    else { if (splits(start)) start--; if (splits(end)) end++; }
    return [start, end];
  }
  function capabilities(token = target()) {
    const editable = Boolean(valid(token));
    return { cut: editable && token.anchor !== token.focus, copy: editable && token.anchor !== token.focus,
      paste: editable && payload?.type === 'text/plain' && payload.text.length > 0 || false };
  }
  return {
    target, capabilities,
    get generation() { return generation; },
    clear() { payload = null; generation++; retained = null; identity = undefined; revision++; },
    perform(action, token = target()) {
      if (!['cut', 'copy', 'paste'].includes(action) || !capabilities(token)[action]) return false;
      const [start, end] = span(token);
      if (action === 'copy' || action === 'cut') {
        const next = Object.freeze({ type: 'text/plain', text: token.text.slice(start, end) });
        try { if (publish(next) !== true || !valid(token)) return false; } catch { return false; }
        payload = next; generation++;
        if (action === 'copy') return true;
      }
      const inserted = action === 'paste' ? payload.text : '';
      return replace(token, { text: token.text.slice(0,start) + inserted + token.text.slice(end),
        anchor: start + inserted.length, focus: start + inserted.length });
    },
  };
}
