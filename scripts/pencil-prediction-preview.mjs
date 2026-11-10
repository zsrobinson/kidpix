// Private functional fixture. No production entry point/config is edited.
import { createServer, build } from 'vite'
import { chromium, webkit } from '@playwright/test'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createBrowserBuildServer } from './serve-browser-build.mjs'
const root = process.env.PENCIL_PREVIEW_OUTPUT || 'artifacts/t3/pencil-prediction-preview'
await mkdir(root, { recursive: true })
const injection = {
  name: 'private-prediction-fixture', enforce: 'pre',
  transform(source, id) {
    if (id.endsWith('/src/paint.js')) {
      let fixture = source.replace('function strokeTo(current, end, targetContext = preview) {',
        'function strokeTo(current, end, targetContext = preview) { if (targetContext === preview) hooks.__predictionTrace?.({ end: { ...end }, last: { ...current.last }, step: current.step, remainder: current.remainder });')
        .replace('return () => {\n    seed', 'return () => { window.__predictionRngCalls = (window.__predictionRngCalls || 0) + 1;\n    seed')
      if (process.env.PENCIL_PREVIEW_FAULT === 'disable') fixture = fixture.replaceAll('hooks.pencilPredictionPreview === true', 'false')
      return fixture
    }
    if (!id.endsWith('/src/main.js')) return
    assert(source.includes('const paint = createPaint(canvas, {'))
    return source.replace('const paint = createPaint(canvas, {', 'const paint = createPaint(canvas, { pencilPredictionPreview: window.__predictionEnabled === true,') +
      '\nwindow.__predictionTest = { paint, createPaint, state, scene, createComposite };'
  },
}
const receipts = []
for (const built of (process.env.PENCIL_CHECKS ? [false] : [false, true])) {
  let server
  if (built) {
    await build({ configLoader: 'runner', mode: 'cloudflare', plugins: [injection], cacheDir: `${root}/cache`, build: { outDir: `${root}/build` } })
    server = createBrowserBuildServer({ buildRoot: `${process.cwd()}/${root}/build` })
    await new Promise(resolve => server.listen(4612, '127.0.0.1', resolve))
  } else {
    server = await createServer({ configLoader: 'runner', plugins: [injection], cacheDir: `${root}/cache`, server: { host: '127.0.0.1', port: 4611, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } })
    await server.listen()
  }
  try {
    if (process.env.PENCIL_CHECKS) {
      for (const engine of ['chromium', 'webkit']) await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'scripts/pencil-prediction-checks.config.mjs', 'pencil-pressure.spec.js', 'brush-engine.spec.js', 'tool-tab-lifecycle.spec.js'], { stdio: 'inherit', env: { ...process.env, ENGINE: engine } })
        child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`checks ${engine}: ${code}`)))
      })
      continue
    }
    for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
      const browser = await launcher.launch()
      const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } })
      await context.tracing.start({ screenshots: true, snapshots: true })
      const pageErrors = []
      context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)))
      let success = false
      try {
        const page = await context.newPage()
        await page.addInitScript(fault => { window.__predictionEnabled = true; window.__predictionErrorFault = fault === 'pageerror' }, process.env.PENCIL_PREVIEW_FAULT)
        await page.goto(`http://127.0.0.1:${built ? 4612 : 4611}/`)
        await page.waitForFunction(() => window.__predictionTest && document.querySelector('#paper-canvas')?.dataset.paintReady === 'ready')
        let trustedPenProbe = null
        if (engine === 'chromium' && !built) {
          try { trustedPenProbe = JSON.parse(await readFile(`${root}/trusted-pen.json`, 'utf8')) } catch { /* first bounded receipt only */ }
        }
        if (engine === 'chromium' && !built && !trustedPenProbe) {
          await page.evaluate(() => {
            const c = document.createElement('canvas'); c.id = 'prediction-trusted-probe'; c.width = 240; c.height = 80
            c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:240px;height:80px'; document.body.append(c)
            window.__trustedPen = []; c.addEventListener('pointermove', e => window.__trustedPen.push({ trusted: e.isTrusted, pointerType: e.pointerType, predictions: e.getPredictedEvents().length }))
          })
          const cdp = await context.newCDPSession(page)
          await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 20, y: 40, button: 'left', buttons: 1, pointerType: 'pen', force: .5 })
          for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20 + i * 20, y: 40, buttons: 1, pointerType: 'pen', force: .5 })
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 180, y: 40, button: 'left', buttons: 0, pointerType: 'pen' })
          await cdp.detach()
          trustedPenProbe = await page.evaluate(() => { document.querySelector('#prediction-trusted-probe').remove(); return window.__trustedPen })
          await writeFile(`${root}/trusted-pen.json`, JSON.stringify(trustedPenProbe, null, 2))
        }
        await page.clock.install({ time: new Date('2026-11-10T00:00:00Z') })
        await page.clock.pauseAt(new Date('2026-11-10T00:01:00Z'))
        const result = await page.evaluate(async () => {
          const { createPaint, paint: studio, state, scene, createComposite } = window.__predictionTest
          const checks = []
          if (window.__predictionErrorFault) queueMicrotask(() => { throw Error('injected prediction fixture page error') })
          const equal = (a, b, label) => { if (a !== b) throw Error(label); checks.push(label) }
          const different = (a, b, label) => { if (a === b) throw Error(label); checks.push(label) }
          const rgba = canvas => Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data).join(',')
          // Constructor lists are real browser plumbing, timestamps model a UA
          // future clock. Synthetic capture is explicitly shimmed, not hardware.
          function send(canvas, type, x, y, pressure = .5, predictions = [], extra = {}) {
            const rect = canvas.getBoundingClientRect()
            const position = (x, y) => ({ clientX: rect.left + x * rect.width / canvas.width, clientY: rect.top + y * rect.height / canvas.height })
            const now = performance.now()
            const entry = (p, index) => {
              const e = new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 71, pressure: p.pressure ?? .5, ...position(p.x, p.y), ...p })
              Object.defineProperty(e, 'timeStamp', { value: now + (index + 1) * 20 })
              return e
            }
            const event = new PointerEvent(type, { pointerType: 'pen', pointerId: 71, button: 0, buttons: type === 'pointerup' ? 0 : 1,
              pressure, ...position(x, y), predictedEvents: predictions.map(entry), ...extra })
            Object.defineProperty(event, 'timeStamp', { value: now })
            if (extra.api === 'throw') Object.defineProperty(event, 'getPredictedEvents', { value: () => { throw Error('modeled API failure') } })
            if (extra.api === 'missing') Object.defineProperty(event, 'getPredictedEvents', { value: undefined })
            if (extra.coalesced) Object.defineProperty(event, 'getCoalescedEvents', { value: () => extra.coalesced.map(p => {
              const e = new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 0, pressure: p.pressure, ...position(p.x, p.y) })
              Object.defineProperty(e, 'timeStamp', { value: now }); return e
            }) })
            canvas.dispatchEvent(event)
            try { return event.getPredictedEvents?.().length ?? 0 } catch { return 0 }
          }
          const make = async (enabled = true, options = {}, canvas = null, native = false) => {
            const frame = document.createElement('iframe'); frame.width = native ? 720 : 256; frame.height = native ? 542 : 128; await new Promise(resolve => { frame.onload = resolve; document.body.append(frame) })
            canvas ||= frame.contentDocument.createElement('canvas')
            canvas.width = native ? 720 : 256; canvas.height = native ? 542 : 128; canvas.style.cssText = `position:fixed;left:0;top:0;width:${canvas.width}px;height:${canvas.height}px`
            frame.contentDocument.body.append(canvas); canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {}
            const trace = []; const paint = createPaint(canvas, { originalTools: native ? new URL('/original/tools/', location.href).href : '', soundEffects: false, pencilPredictionPreview: enabled, __predictionTrace: row => trace.push(row) })
            await paint.setOptions({ size: 9, color: '#123456', ...options })
            const compose = (opts = {}) => { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; paint.renderTo(c.getContext('2d'), opts); return rgba(c) }
            return { paint, canvas, compose, trace, end: () => { paint.destroy(); frame.remove() } }
          }
          const actual = [{ x: 55.4, y: 45, pressure: .2 }, { x: 83.8, y: 45, pressure: .7 }]
          const future = [{ x: 121.1, y: 55.5, pressure: .3 }, { x: 165, y: 66.5, pressure: .9 }]
          const rngBefore = window.__predictionRngCalls || 0
          const a = await make(true), b = await make(false), oracle = await make(false)
          for (const f of [a, b, oracle]) { send(f.canvas, 'pointerdown', 20.3, 45, .1); send(f.canvas, 'pointermove', 83.8, 45, .7, f === a ? future : [], { coalesced: actual }) }
          equal(a.paint.save().art, b.paint.save().art, 'midstroke save excludes both actual preview and predictions')
          equal(a.compose({ includePreview: true }), b.compose({ includePreview: true }), 'canonical preview keeps actual coalesced ink exact')
          different(rgba(a.canvas), rgba(b.canvas), 'temporary tail is visible')
          for (const p of future) send(oracle.canvas, 'pointermove', p.x, p.y, p.pressure)
          equal(rgba(a.canvas), rgba(oracle.canvas), 'independent REAL extended Pencil renderer matches predicted RGBA and pressure/spacing phase')
          equal(a.paint.getColorAt({ x: 150, y: 66 }), b.paint.getColorAt({ x: 150, y: 66 }), 'sampleColor excludes prediction')
          equal(a.paint.copy(), b.paint.copy(), 'midstroke copy baseline')
          for (const f of [a,b]) send(f.canvas, 'pointermove', 60, 82, .2)
          equal(rgba(a.canvas), rgba(b.canvas), 'reversal replaces incorrect prediction exactly')
          for (const f of [a,b]) send(f.canvas, 'pointermove', 93, 82, .2, f === a ? future : [])
          for (const f of [a,b]) send(f.canvas, 'pointerup', 110, 82, 0)
          equal(rgba(a.canvas), rgba(b.canvas), 'release commits actual pressure only')
          equal(a.paint.save().art, b.paint.save().art, 'final project art exact')
          equal(JSON.stringify(a.trace), JSON.stringify(b.trace), 'actual coalesced consumption, last pressure, spacing/remainder/step trace exact')
          equal(window.__predictionRngCalls || 0, rngBefore, 'pure Pencil actual and predictions consume zero RNG draws')
          equal(a.compose(), b.compose(), 'export composition exact')
          const click = HTMLAnchorElement.prototype.click, downloads = []
          try {
            HTMLAnchorElement.prototype.click = function () { downloads.push(this.href) }
            a.paint.download('prediction-fixture.png'); b.paint.download('prediction-fixture.png')
          } finally { HTMLAnchorElement.prototype.click = click }
          equal(downloads.length, 2, 'download serialized through existing path without downloading')
          equal(downloads[0], downloads[1], 'download PNG exact')
          const final = rgba(a.canvas)
          equal(a.paint.undo(), true, 'one undo succeeds'); equal(b.paint.undo(), true, 'baseline undo succeeds')
          equal(rgba(a.canvas), rgba(b.canvas), 'undo exact'); equal(a.paint.canUndo, false, 'only one stroke checkpoint')
          a.paint.redo(); b.paint.redo(); equal(rgba(a.canvas), final, 'redo exact')
          for (const f of [a,b]) {
            await f.paint.setOptions({ tool: 'select', variant: 'rectangle' })
            send(f.canvas, 'pointerdown', 0, 0); send(f.canvas, 'pointermove', 240, 110); send(f.canvas, 'pointerup', 240, 110, 0)
          }
          equal(a.paint.copy(), b.paint.copy(), 'final selected clipboard PNG exact')
          a.end(); b.end(); oracle.end()
          // Default-off and excluded tools/contacts never draw estimates.
          for (const spec of [{ enabled: false }, { pointerType: 'mouse' }, { pointerType: 'touch' }, { tool: 'chalk' }, { tool: 'crayon' }, { tool: 'marker' }, { mode: 'wacky' }, { variant: 'line' }]) {
            const f = await make(spec.enabled ?? true, spec), control = await make(false, spec)
            for (const item of [f,control]) {
              send(item.canvas, 'pointerdown', 20, 45, .2, [], spec)
              send(item.canvas, 'pointermove', 84, 45, .8, item === f ? future : [], spec)
            }
            equal(rgba(f.canvas), rgba(control.canvas), `excluded ${JSON.stringify(spec)}`)
            f.end(); control.end()
          }
          // Exercise actual native bitmap dimensions separately from procedural fixtures.
          for (const tool of ['chalk', 'crayon', 'marker']) {
            const f = await make(true, { tool, sizeIndex: 1 }, null, true)
            const control = await make(false, { tool, sizeIndex: 1 }, null, true)
            const before = rgba(control.canvas)
            for (const item of [f,control]) {
              send(item.canvas, 'pointerdown', 20, 45, .2)
              send(item.canvas, 'pointermove', 84, 45, .8, item === f ? future : [])
            }
            different(rgba(control.canvas), before, `native ${tool} fixture actually renders ink`)
            equal(rgba(f.canvas), rgba(control.canvas), `native ${tool} prediction exclusion`)
            for (const item of [f,control]) send(item.canvas, 'pointerup', 84, 45, 0)
            equal(rgba(f.canvas), rgba(control.canvas), `native ${tool} committed ink exact`)
            f.end(); control.end()
          }
          for (const api of ['missing', 'throw', 'empty']) {
            const f = await make(); send(f.canvas, 'pointerdown', 20, 45)
            send(f.canvas, 'pointermove', 84, 45, .5, future)
            send(f.canvas, 'pointermove', 84, 45, .5, [], { api })
            equal(rgba(f.canvas), f.compose({ includePreview: true }), `${api} clears old tail`); f.end()
          }
          for (const p of [{ x: 160, y: 45, pointerId: 99 }, { x: 160, y: 45, pressure: 2 }, { x: 160, y: 45, pointerType: 'mouse' }]) {
            const f = await make(); send(f.canvas, 'pointerdown', 20, 45)
            send(f.canvas, 'pointermove', 84, 45, .5, [p])
            equal(rgba(f.canvas), f.compose({ includePreview: true }), 'browser malformed/wrong-owner estimate ignored')
            f.end()
          }
          // Existing foreground must occlude actual AND future ink.
          const f = await make(); const front = document.createElement('canvas'); front.width = 256; front.height = 128
          front.getContext('2d').fillStyle = '#ff0000'; front.getContext('2d').fillRect(100, 0, 156, 128)
          await f.paint.setForeground(front.toDataURL())
          send(f.canvas, 'pointerdown', 20, 45); send(f.canvas, 'pointermove', 84, 45, .5, future)
          equal(Array.from(f.canvas.getContext('2d').getImageData(150, 65, 1, 1).data).join(), '255,0,0,255', 'source foreground occludes prediction')
          f.end()
          // Real app DEFAULT Pencil, not a selected substitute tool or native fallback.
          equal(state.tools.draw, 'pencil', 'actual studio default tool is Pencil')
          const sceneImage = document.createElement('canvas'); sceneImage.width = 60; sceneImage.height = 60
          sceneImage.getContext('2d').fillStyle = '#00aa00'; sceneImage.getContext('2d').fillRect(0,0,60,60)
          scene.addAsset({ src: sceneImage.toDataURL(), width: 60, height: 60 }, { x: 300, y: 250 })
          await Promise.all(Array.from(document.querySelectorAll('#objects img')).map(image => image.decode()))
          const sceneBefore = createComposite().toDataURL()
          const c = studio.canvas; c.setPointerCapture = () => {}; c.releasePointerCapture = () => {}
          send(c, 'pointerdown', 45, 250, .2); const count = send(c, 'pointermove', 90, 250, .8, [{ x: 155, y: 250, pressure: .6 }])
          equal(count, 1, 'browser constructor returned nonempty modeled API list')
          equal(createComposite().toDataURL(), sceneBefore, 'actual app scene export remains baseline during uncommitted actual and predicted ink')
          const mid = c.toDataURL(); const canonical = document.createElement('canvas'); canonical.width = c.width; canonical.height = c.height
          studio.renderTo(canonical.getContext('2d'), { includePreview: true, includeForeground: false })
          different(mid, canonical.toDataURL(), 'actual studio default Pencil is eligible with private opt-in')
          send(c, 'pointermove', 70, 280, .2); equal(c.toDataURL(), (() => { studio.renderTo(canonical.getContext('2d'), { includePreview: true, includeForeground: false }); return canonical.toDataURL() })(), 'actual app correction exact')
          send(c, 'pointerup', 70, 280, 0)
          window.__predictionFixture = { make, send, rgba, checks }
          return { checks, constructorModeledPoints: count }
        })
        // Timer and interruption checks cross a task boundary with controlled time.
        for (const lifecycle of ['expiry', 'pointercancel', 'lostpointercapture', 'Escape', 'blur', 'pagehide', 'resize', 'hidden', 'tool', 'reset', 'destroy', 'reuse']) {
          await page.evaluate(async () => { window.__lifecycle = { f: await window.__predictionFixture.make() } })
          // Settle browser-delivered iframe resize before starting a contact.
          await new Promise(resolve => setTimeout(resolve, 100))
          await page.clock.runFor(50)
          await page.evaluate(lifecycle => {
            const { send, rgba } = window.__predictionFixture
            const { f } = window.__lifecycle
            send(f.canvas, 'pointerdown', 20, 45); send(f.canvas, 'pointermove', 84, 45, .5, [{ x: 160, y: 45 }])
            window.__lifecycle.actual = f.compose({ includePreview: true })
            if (rgba(f.canvas) === window.__lifecycle.actual) throw Error('lifecycle must start with a visible tail')
            if (lifecycle === 'pointercancel' || lifecycle === 'lostpointercapture') send(f.canvas, lifecycle, 84, 45)
            if (lifecycle === 'Escape') f.canvas.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            if (['blur', 'pagehide', 'resize'].includes(lifecycle)) f.canvas.ownerDocument.defaultView.dispatchEvent(new Event(lifecycle))
            if (lifecycle === 'hidden') { Object.defineProperty(f.canvas.ownerDocument, 'hidden', { value: true, configurable: true }); f.canvas.ownerDocument.dispatchEvent(new Event('visibilitychange')) }
            if (lifecycle === 'reuse') {
              f.paint.destroy()
              const fresh = window.__predictionTest.createPaint(f.canvas, { soundEffects: false, originalTools: null })
              window.__lifecycle.fresh = fresh
              send(f.canvas, 'pointerdown', 20, 95); send(f.canvas, 'pointerup', 70, 95)
              window.__lifecycle.reused = rgba(f.canvas)
            }
            if (lifecycle === 'tool') f.paint.setOptions({ tool: 'marker' })
            if (lifecycle === 'reset') f.paint.reset()
            if (lifecycle === 'destroy') { f.paint.destroy(); f.canvas.getContext('2d').fillStyle = '#00ff00'; f.canvas.getContext('2d').fillRect(0,0,256,128); window.__lifecycle.destroyed = rgba(f.canvas) }
          }, lifecycle)
          await page.clock.runFor(150)
          await page.evaluate(lifecycle => {
            const { f, actual, destroyed, fresh, reused } = window.__lifecycle; const { rgba } = window.__predictionFixture
            const expected = lifecycle === 'expiry' || lifecycle === 'Escape' ? actual : lifecycle === 'destroy' ? destroyed : lifecycle === 'reuse' ? reused : f.compose({ includePreview: true })
            if (rgba(f.canvas) !== expected) throw Error(`lifecycle ${lifecycle}: matches canonical=${rgba(f.canvas) === f.compose({ includePreview: true })}, now=${performance.now()}`)
            fresh?.destroy(); f.end()
          }, lifecycle)
          result.checks.push(`lifecycle ${lifecycle} and late callback`)
        }
        assert.deepEqual(pageErrors, [], 'Browser page errors invalidate prediction fixture acceptance')
        receipts.push({ engine, built, trustedPenProbe, pageErrors, ...result })
        success = true
        console.log(engine, built ? 'built' : 'dev', result.checks.length, 'checks passed')
      } finally {
        await context.tracing.stop(success ? {} : { path: `${root}/${engine}-${built ? 'built' : 'dev'}-failure.zip` })
        await context.close(); await browser.close()
      }
    }
  } finally { await new Promise(resolve => built ? server.close(resolve) : server.close().then(resolve)) }
}
if (!process.env.PENCIL_CHECKS) await writeFile(`${root}/results.json`, JSON.stringify(receipts, null, 2))
