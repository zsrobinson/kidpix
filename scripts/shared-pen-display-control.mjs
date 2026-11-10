// Strict benchmark-only source seam; production paint remains unchanged.
export function displayControlTransform(source, { coalesce = false, counters = false, attribution = false } = {}) {
 const once = (needle, replacement) => {
  if (source.split(needle).length !== 2) throw Error('Display control seam changed: ' + needle);
  source = source.replace(needle, replacement);
 };
 if (coalesce) {
  once('  function render() {', `  let sharedDisplayFrame = null
  window.sharedDisplayState = () => ({ pending: sharedDisplayFrame !== null })
  function requestDisplay() {
    ${counters ? 'if(window.sharedPerf?.enabled)window.sharedStroke.requests++;' : ''}
    if (sharedDisplayFrame !== null) return
    sharedDisplayFrame = requestAnimationFrame(() => { sharedDisplayFrame = null; render() })
  }
  function render() {
    if (sharedDisplayFrame !== null) { cancelAnimationFrame(sharedDisplayFrame); sharedDisplayFrame = null }
`);
  once('    render()\n  }\n\n  function handleUp(event)', `    // Only delivered freehand moves; timed native polling/shapes stay synchronous.
    if (event.type === 'pointermove' && current.type === 'stroke' && !current.nativeShapes && current.nativePoll === undefined && current.sprayRender === undefined && ['pencil','chalk','crayon','marker'].includes(current.options.tool)) requestDisplay()
    else render()
  }

  function handleUp(event)`);
 }
 if (counters) once('  return {\n    // Opaque synchronous checkpoint:', '  return window.sharedBenchPaint = {\n    // Opaque synchronous checkpoint:');
 if (counters || attribution) {
  for (const [name, args] of [['pointFor','event'],['strokeTo','current, end'],['drawDab','current, point'],['compose','context, { includeForeground = true, includePreview = false } = {}'],['render',''],['handleMove','event']]) {
   const decl = `function ${name}(${args}) {`;
   once(decl, `function ${name}(...args) {
    if (!window.sharedPerf?.enabled) return sharedOriginal_${name}(...args)
    const m = window.sharedStroke
    const row = m.calls.${name} ||= {count:0,ms:0,max:0}
    row.count++
    ${name === 'strokeTo' ? 'm.samples.push({...args[1]});' : ''}
    ${attribution ? `const start=performance.now();try{return sharedOriginal_${name}(...args)}finally{const elapsed=performance.now()-start;row.ms+=elapsed;row.max=Math.max(row.max,elapsed)}` : `return sharedOriginal_${name}(...args)`}
  }
  function sharedOriginal_${name}(${args}) {`);
  }
  once('import { pointerSamples,', 'import { pointerSamples as sharedOriginal_pointerSamples,');
  source += `\nfunction pointerSamples(event) {if(!window.sharedPerf?.enabled)return sharedOriginal_pointerSamples(event);const row=window.sharedStroke.calls.pointerSamples||={count:0,ms:0,max:0};row.count++;${attribution ? 'const start=performance.now();try{return sharedOriginal_pointerSamples(event)}finally{const elapsed=performance.now()-start;row.ms+=elapsed;row.max=Math.max(row.max,elapsed)}' : 'return sharedOriginal_pointerSamples(event)'}}\n`;
 }
 return source;
}

// Separate attribution lane. Inclusive spans overlap and use native clocks.
export function installStrokeAttribution() {
 const originalRect = Element.prototype.getBoundingClientRect;
 Element.prototype.getBoundingClientRect = function(...args) {
  if (!window.sharedPerf?.enabled) return originalRect.apply(this,args);
  const row=window.sharedStroke.calls.rect||={count:0,ms:0,max:0};row.count++;
  const start=performance.now();try{return originalRect.apply(this,args)}finally{const elapsed=performance.now()-start;row.ms+=elapsed;row.max=Math.max(row.max,elapsed)}
 };
 const originalAdd = EventTarget.prototype.addEventListener;
 const originalRemove = EventTarget.prototype.removeEventListener;
 const wrappers = new WeakMap();
 const keyFor = options => Boolean(typeof options === 'boolean' ? options : options?.capture);
 EventTarget.prototype.removeEventListener = function(type, callback, options) {
  const wrapped=wrappers.get(this)?.get(callback)?.get(keyFor(options));
  return originalRemove.call(this,type,type==='pointermove'&&wrapped?wrapped:callback,options);
 };
 EventTarget.prototype.addEventListener = function(type, callback, options) {
  if(type!=='pointermove'||typeof callback!=='function')return originalAdd.call(this,type,callback,options);
  let callbacks=wrappers.get(this);if(!callbacks)wrappers.set(this,callbacks=new Map());
  let captures=callbacks.get(callback);if(!captures)callbacks.set(callback,captures=new Map());
  const key=keyFor(options);if(captures.has(key))return originalAdd.call(this,type,captures.get(key),options);
  const target=this.id||this.tagName||this.constructor.name, name=callback.name||'anonymous';
  const wrapped=function(...args){
   if(!window.sharedPerf?.enabled)return callback.apply(this,args);
   const row=window.sharedStroke.listeners[target+':'+name]||={count:0,ms:0,max:0};row.count++;
   const start=performance.now();try{return callback.apply(this,args)}finally{const elapsed=performance.now()-start;row.ms+=elapsed;row.max=Math.max(row.max,elapsed)}
  };captures.set(key,wrapped);return originalAdd.call(this,type,wrapped,options);
 };
}
