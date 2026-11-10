// Canonical plaintext with explicit BR/block line breaks; offsets remain UTF-16
// DOM offsets. Boundary extraction never divides a Unicode surrogate pair.
export function editorText(editor) {
  let text = ''; const points = new Map();
  const mark = (node, offset) => { if (!points.has(node)) points.set(node, []); points.get(node)[offset] = text.length; };
  function walk(node) {
    if (node.nodeType === 3) {
      for (let i = 0; i <= node.length; i++) { mark(node, i); if (i < node.length) text += node.data[i]; }
      return;
    }
    if (node.nodeName === 'BR') { mark(node, 0); text += '\n'; return; }
    mark(node, 0);
    [...node.childNodes].forEach((child, i) => {
      const block = ['DIV', 'P'].includes(child.nodeName);
      if (block && i && !text.endsWith('\n')) text += '\n';
      mark(node, i); walk(child);
      if (block && child.nextSibling && !text.endsWith('\n')) text += '\n';
      mark(node, i + 1);
    });
  }
  walk(editor);
  return { text, point: offset => {
    let exact, closest = [editor, 0], distance = Infinity;
    for (const [node, offsets] of points) {
      for (let i = 0; i < offsets.length; i++) {
        if (offsets[i] === offset) {
          if (node.nodeType === 3) return [node, i];
          exact ??= [node, i];
        }
        const delta = Math.abs(offsets[i] - offset);
        if (delta < distance) { closest = [node, i]; distance = delta; }
      }
    }
    // A BR's trailing newline may only have an element boundary. Keep that
    // exact endpoint rather than replacing it with an earlier text position.
    return exact ?? closest;
  }, offset: (node, index) => points.get(node)?.[index] };
}
export function rangeText(text, anchor, focus) {
  let start = Math.min(anchor, focus), end = Math.max(anchor, focus);
  if (start === end) return text;
  const splits = i => i > 0 && i < text.length && /[\uD800-\uDBFF]/.test(text[i - 1]) && /[\uDC00-\uDFFF]/.test(text[i]);
  if (splits(start)) start--;
  if (splits(end)) end++;
  return text.slice(start, end);
}
