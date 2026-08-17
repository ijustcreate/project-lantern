'use strict';
$$('nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));
$$('.filter-btn').forEach(b=>b.onclick=()=>{selectedFilter=b.dataset.filter;$$('.filter-btn').forEach(x=>x.classList.toggle('active',x===b));renderParts()});
$('#join').onclick=()=>{if(state.children<4){snapshot();state.children++;state.lastStory=`Another child joined. Cooperative pieces and public decisions now have more hands.`;state.history.unshift({day:state.day,text:'Another child joined the shared city.'});save();renderAll();toast('A new child joined. The bridge can now be placed.')}else toast('Four active children are already represented.')};
$('#respond').onclick=respond;$('#intention').onclick=leaveIntention;
$('#undo').onclick=()=>{if(!undoStack.length)return;redoStack.push(JSON.stringify(state));restore(undoStack.pop())};$('#redo').onclick=()=>{if(!redoStack.length)return;undoStack.push(JSON.stringify(state));restore(redoStack.pop())};
$('#hear').onclick=()=>{if('speechSynthesis'in window){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(summary()+'. '+state.lastStory))}else toast(summary())};
$('#modal-close').onclick=closeModal;$('#modal-backdrop').onclick=e=>{if(e.target===$('#modal-backdrop'))closeModal()};
$('#contrast').onclick=()=>{state.settings.contrast=!state.settings.contrast;save();renderAll()};$('#motion').onclick=()=>{state.settings.motion=!state.settings.motion;save();renderAll()};$('#large').onclick=()=>{state.settings.large=!state.settings.large;save();renderAll()};
$('#reset').onclick=()=>openModal('Reset the city?',`<p>This clears the local prototype state on this device.</p><div class="choices"><button id="confirm-reset">RESET</button><button id="cancel-reset">KEEP CITY</button></div>`);
document.addEventListener('click',e=>{if(e.target?.id==='confirm-reset'){state=initial();undoStack=[];redoStack=[];save();renderAll();closeModal();toast('Prototype reset.')}if(e.target?.id==='cancel-reset')closeModal()});
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='unfinished-city-state.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$$('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;$$('[data-tool]').forEach(x=>x.classList.toggle('active',x===b))});
$('#mirror').onclick=()=>{const n=[...spritePixels];for(let y=0;y<12;y++)for(let x=0;x<6;x++)n[y*12+(11-x)]=n[y*12+x];spritePixels=n;renderEditor();renderPreview()};
$('#clear-sprite').onclick=()=>{spritePixels=Array(144).fill('');renderEditor();renderPreview()};$('#new-name').onclick=newName;$('#save-sprite').onclick=saveSprite;
window.addEventListener('pointerup',()=>drawing=false);window.addEventListener('pointercancel',()=>drawing=false);
if(!state.tiles.some(t=>t.entity)){[[1,2,'#c94f3f'],[8,2,'#1c6f70'],[3,5,'#7952a5'],[7,5,'#f0bd39']].forEach(([x,y,c],i)=>state.tiles[y*W+x].entity={name:['Jun','Mara','Sol','Pip'][i],behavior:['wander','water','garden','repair'][i],color:c});save()}
renderEditor();renderPalette();renderPreview();newName();renderAll();$('#ready').textContent='APP READY';window.__ucBooted=true;
setTimeout(()=>{if(!window.__ucBooted){$('#ready').textContent='BOOT FAILED';$('#ready').classList.add('bad')}},1500);
