import { test, expect } from '@playwright/test';
const api = (page, fn) => page.evaluate(async source => {
  const { navigationTest: t } = await import('/src/main.js');
  return (0,eval)(`(${source})`)(t);
}, String(fn));
test.beforeEach(async ({page}) => { await page.goto('/'); await page.waitForSelector('#paper-canvas'); });
const seed = page => api(page, t => {
  const objects = [
    {id:'a',kind:'image',src:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',x:20,y:20,width:60,height:60},
    {id:'b',kind:'text',text:'',x:100,y:20,width:60,height:60},
    {id:'c',kind:'text',text:'  \n ',x:200,y:20,width:60,height:60}];
  t.scene.restore(objects); t.scene.selectSticker('a'); t.activate('tray:grab');
});
test('array order wraps both ways, retains empty text, content and both history stacks', async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
   const before=JSON.stringify(t.scene.snapshot()), undo=JSON.stringify(t.undo),redo=JSON.stringify(t.redo),targets=[];
   for(const d of [1,1,1,-1,-1,-1]){if(!t.scene.stepSelection(d,t.scene.navigation.identity))throw Error('rejected'); targets.push(t.scene.actionState.target)}
   return {targets,content:before===JSON.stringify(t.scene.snapshot()),undo:undo===JSON.stringify(t.undo),redo:redo===JSON.stringify(t.redo)};
 })).toEqual({targets:['b','c','a','c','b','a'],content:true,undo:true,redo:true});
});
test('zero, singleton and two entries separate appearance from step capability',async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
   const all=t.scene.snapshot();t.scene.restore([]);const zero=t.scene.navigation.available;
   t.scene.restore(all.slice(0,1));t.scene.selectSticker('a');const one=t.scene.navigation;
   const accepted=t.scene.stepSelection(1,one.identity),singleton=t.scene.actionState.target;
   t.scene.restore(all.slice(0,2));t.scene.selectSticker('a');const targets=[];
   for(const d of [-1,1]){t.scene.stepSelection(d,t.scene.navigation.identity);targets.push(t.scene.actionState.target)}
   return {zero,available:one.available,canStep:one.canStep,accepted,singleton,targets};
 })).toEqual({zero:false,available:true,canStep:false,accepted:true,singleton:'a',targets:['b','a']});
});
test('actual reorder changes direction and invalidates a held proposal',async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
   const token=t.scene.navigation.identity;t.scene.edit('front');const stale=t.scene.stepSelection(1,token);
   t.scene.stepSelection(1,t.scene.navigation.identity);
   return {stale,target:t.scene.actionState.target,order:t.scene.snapshot().map(o=>o.id)};
 })).toEqual({stale:false,target:'b',order:['b','c','a']});
});
test('restore, absent selection, path, playback, staging and disposal reject commands',async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
   const token=t.scene.navigation.identity,all=t.scene.snapshot(),out=[];
   t.scene.restore(all);out.push(t.scene.stepSelection(1,token));
   t.scene.selectSticker('missing');out.push(t.scene.navigation.available);
   t.scene.selectSticker('a');t.scene.beginPath();out.push(t.scene.navigation.available);t.scene.cancelPath();
   t.scene.setPlaying(true);out.push(t.scene.navigation.available);t.scene.setPlaying(false);
   const checkpoint=t.scene.suspend();out.push(t.scene.navigation.available);checkpoint.release();
   const retired=t.scene.navigation.identity;t.scene.restore(all);out.push(t.scene.stepSelection(1,retired));
   t.scene.destroy();out.push(t.scene.navigation.available);return out;
 })).toEqual([false,false,false,false,false,false,false]);
});
test('invalid single destination fails closed without scanning or content mutation',async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
   const all=t.scene.snapshot();all[1].kind='unknown';t.scene.restore(all);t.scene.selectSticker('a');
   const before=JSON.stringify(t.scene.snapshot());const result=t.scene.stepSelection(1,t.scene.navigation.identity);
   return {result,target:t.scene.actionState.target,same:before===JSON.stringify(t.scene.snapshot())};
 })).toEqual({result:false,target:'a',same:true});
});
test('selection preserves exact media and editor DOM nodes and control focus',async({page})=>{
 await seed(page);
 const next=page.locator('[data-action="navigate:1"]');await next.focus();
 expect(await api(page,t=>{
   const nodes=[...document.querySelector('#objects').children],media=nodes[0].firstChild,editor=nodes[1].firstChild,focus=document.activeElement;
   t.scene.stepSelection(1,t.scene.navigation.identity);
   return nodes.every((n,i)=>document.querySelector('#objects').children[i]===n)&&media===nodes[0].firstChild&&editor===nodes[1].firstChild&&document.activeElement===focus;
 })).toBe(true);
});
test('presentation notifications keep token stable; mutations and history restore retire it',async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
   const token=t.scene.navigation.identity;document.querySelector('#objects').dispatchEvent(new Event('scenechange'));
   const stable=token===t.scene.navigation.identity;t.scene.nudge(1,0);const changed=token!==t.scene.navigation.identity;
   const held=t.scene.navigation.identity;t.scene.restore(t.scene.snapshot(),{history:true});return {stable,changed,stale:t.scene.stepSelection(1,held)};
 })).toEqual({stable:true,changed:true,stale:false});
});
test('held UI rejects reorder before next RAF and allows presentation-only notifications',async({page})=>{
 await seed(page);const next=page.locator('[data-action="navigate:1"]');await expect(next).toHaveAttribute('data-native-motion-index',/\d/);await next.focus();await page.keyboard.down('Space');
 await api(page,t=>t.scene.edit('front'));await page.keyboard.up('Space');
 expect(await api(page,t=>t.scene.actionState.target)).toBe('a');
 await next.focus();await page.keyboard.down('Space');
 await page.evaluate(()=>document.querySelector('#objects').dispatchEvent(new Event('scenechange')));await page.keyboard.up('Space');
 expect(await api(page,t=>t.scene.actionState.target)).toBe('b');
});
test('real drag excludes navigation until release and retains gesture ownership',async({page})=>{
 await seed(page);await page.locator('[data-object="a"]').hover();await page.mouse.down();
 expect(await api(page,t=>t.scene.navigation.available)).toBe(false);
 expect(await api(page,t=>t.scene.stepSelection(1,t.scene.navigation.identity))).toBe(false);
 await page.mouse.up();expect(await api(page,t=>t.scene.navigation.available)).toBe(true);
});
test('navigation after ordinary typing preserves redo, save representation and clipboard',async({page})=>{
 await seed(page);await api(page,t=>{t.scene.edit('copy');t.scene.nudge(1,0);t.activate('undo')});
 expect(await api(page,t=>{
   t.scene.selectSticker('a');const saved=JSON.stringify(t.project()),redo=JSON.stringify(t.redo),undo=JSON.stringify(t.undo);
   t.scene.stepSelection(1,t.scene.navigation.identity);
   return {saved:saved===JSON.stringify(t.project()),redo:redo===JSON.stringify(t.redo),undo:undo===JSON.stringify(t.undo),paste:t.scene.actionState.paste};
 })).toEqual({saved:true,redo:true,undo:true,paste:true});
});
test('video node, player properties and preview membership survive selection steps',async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
   const all=t.scene.snapshot();all[0].kind='video';all[0].src='/original/absent-test-video.mp4';delete all[0].thumbnail;
   t.scene.restore(all);t.scene.selectSticker('a');t.scene.togglePreview();
   const video=document.querySelector('#objects video'),node=video.parentNode;video.muted=true;video.playbackRate=1.5;
   let play=0,pause=0;video.play=()=>{play++;return Promise.resolve()};video.pause=()=>pause++;
   t.scene.stepSelection(1,t.scene.navigation.identity);t.scene.stepSelection(-1,t.scene.navigation.identity);
   return {same:video===document.querySelector('#objects video')&&node===video.parentNode,rate:video.playbackRate,muted:video.muted,play,pause,count:document.querySelectorAll('#objects video').length};
 })).toEqual({same:true,rate:1.5,muted:true,play:0,pause:0,count:1});
});
test('held navigation rejects document replacement and selection ABA',async({page})=>{
 await seed(page);
 const next=page.locator('[data-action="navigate:1"]');await next.focus();await page.keyboard.down('Space');
 await api(page,t=>{const all=t.scene.snapshot();t.scene.restore(all);t.scene.selectSticker('a')});
 await page.keyboard.up('Space');expect(await api(page,t=>t.scene.actionState.target)).toBe('a');
 expect(await api(page,t=>{const held=t.scene.navigation.identity;t.scene.stepSelection(1,held);t.scene.stepSelection(-1,t.scene.navigation.identity);return t.scene.stepSelection(1,held)})).toBe(false);
});
test('held static Space survives silent artwork readiness and dispatches once',async({page})=>{
 // Retire any already-loaded owner by failing one sprite before entering Hand.
 let finish;const gate=new Promise(resolve=>finish=resolve);
 await page.route('**/secondary-motion/sprites/18000-771.png*',async route=>{await gate;await route.continue()});
 await seed(page);const next=page.locator('[data-action="navigate:1"]');
 await next.focus();await page.keyboard.down('Space');
 const token=await api(page,t=>t.scene.navigation.identity);finish();
 await expect(next).toHaveAttribute('data-native-motion-index',/\d/);
 expect(await api(page,t=>t.scene.navigation.identity)).toBe(token);
 await page.keyboard.up('Space');expect(await api(page,t=>t.scene.actionState.target)).toBe('b');
});
test('pointer leave and reentry retains one accepted navigation target',async({page})=>{
 await seed(page);const next=page.locator('[data-action="navigate:1"]');
 await expect(next).toHaveAttribute('data-native-motion-index',/\d/);
 await next.hover();await page.mouse.down();await page.mouse.move(900,550);await next.hover();await page.mouse.up();
 expect(await api(page,t=>t.scene.actionState.target)).toBe('b');
});
test('any open modal rejects coordinator navigation',async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
  const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();
  t.activate('navigate:1');const target=t.scene.actionState.target;dialog.close();dialog.remove();return target;
 })).toBe('a');
});
test('uncommitted object creation cannot become navigation history without ordinary typing',async({page})=>{
 await seed(page);
 expect(await api(page,t=>{
  t.scene.addText({x:300,y:30},{});const undo=JSON.stringify(t.undo),before=JSON.stringify(t.scene.snapshot());
  return {accepted:t.scene.stepSelection(1,t.scene.navigation.identity),undo:undo===JSON.stringify(t.undo),content:before===JSON.stringify(t.scene.snapshot())};
 })).toEqual({accepted:false,undo:true,content:true});
});

for(const target of ['a','b'])test(`pending typing cannot be flushed from retired editor A under owner ${target}`,async({page})=>{
 const result=await page.evaluate(async target=>{
  const{navigationTest:t}=await import('/src/main.js');const root=document.createElement('div'),surface=document.createElement('canvas');surface.width=720;surface.height=542;document.body.append(root,surface);const changes=[];
  const scene=t.createScene(root,surface,(before,after)=>changes.push({before,after}));
  try{
   scene.restore(['a','b','c'].map((id,i)=>({id,kind:'text',text:id,x:i*90,y:20,width:80,height:60})),{textTarget:'a'});scene.chooseMode('text');
   const editor=root.querySelector('.object-text');editor.focus();scene.chooseMode('grab');scene.selectSticker(target);
   // Explicit late-event fault model, not a hardware IME reachability claim.
   editor.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'!'}));editor.textContent='a!';editor.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:'!'}));
   const before=JSON.stringify(scene.snapshot()),n=changes.length,accepted=scene.stepSelection(1,scene.navigation.identity);
   return{accepted,target:scene.actionState.target,extraChanges:changes.length-n,contentRetained:before===JSON.stringify(scene.snapshot())};
  }finally{scene.destroy();root.remove();surface.remove()}
 },target);
 expect(result).toEqual({accepted:false,target,extraChanges:0,contentRetained:true});
});
test('live keyboard typing settles under its own text owner before Hand navigation',async({page})=>{
 await page.evaluate(async()=>{
  const{navigationTest:t}=await import('/src/main.js');const root=document.createElement('div'),surface=document.createElement('canvas');surface.width=720;surface.height=542;document.body.append(root,surface);const changes=[];
  const scene=t.createScene(root,surface,(before,after)=>changes.push({before,after}));scene.restore(['a','b'].map((id,i)=>({id,kind:'text',text:id,x:i*90,y:20,width:80,height:60})),{textTarget:'a'});scene.chooseMode('text');const editor=root.querySelector('.object-text');editor.focus();window.navigationTypingFixture={scene,root,surface,changes};
 });
 await page.keyboard.press('End');await page.keyboard.type('!');
 expect(await page.evaluate(()=>{const{scene,root,surface,changes}=window.navigationTypingFixture;try{scene.chooseMode('grab');const n=changes.length,accepted=scene.stepSelection(1,scene.navigation.identity);return{accepted,target:scene.actionState.target,text:scene.snapshot()[0].text,changes:n,extraChanges:changes.length-n}}finally{scene.destroy();root.remove();surface.remove();delete window.navigationTypingFixture}})).toEqual({accepted:true,target:'b',text:'a!',changes:1,extraChanges:0});
});
