/* Optional companion music for existing Manim timelines. No network requests. */
(() => {
  const scores=new Map(),active=new Set();let nextPanel=0;
  const styles={keys:'Soft keys',ambient:'Warm ambient',pluck:'Gentle plucks'};
  const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,String(value));}catch{}};
  const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  function attach(host,{scene,getState}){
    const score=scores.get(scene);if(!score)return null;
    let style=read('kc-manim-music-style','keys');if(!Object.hasOwn(styles,style))style='keys';
    let volume=Number(read('kc-manim-music-volume','.4'));if(!Number.isFinite(volume)||volume<0||volume>1)volume=.4;
    let enabled=false,disposed=false,pending=false,blocked=false,generation=0,objectURL=null,frame=0,lastSeek=-Infinity;
    let context=null,gain=null,source=null,loadedStyle=null,state={time:0,playing:false,rate:1},maxDrift=0,corrections=0;
    const panel=node('section');panel.className='kc-music-panel';panel.setAttribute('aria-label','Animation music');
    panel.id='kc-music-settings-'+(++nextPanel);panel.setAttribute('popover','auto');
    const settings=node('button','Music');settings.type='button';settings.className='kc-music-settings';
    settings.setAttribute('aria-label','Music settings');settings.setAttribute('aria-expanded','false');settings.setAttribute('aria-controls',panel.id);
    const controls=host.querySelector('.kc-video-steps,.kc-manim-controls');controls.append(settings);
    const heading=node('strong','Music'),close=node('button','×');close.type='button';close.className='kc-music-close';close.setAttribute('aria-label','Close music settings');
    const top=node('div');top.className='kc-music-heading';top.append(heading,close);
    const nativePopover=typeof panel.showPopover==='function';if(!nativePopover)panel.hidden=true;
    const opened=()=>nativePopover?panel.matches(':popover-open'):!panel.hidden;
    function positionPanel(){
      if(!opened())return;
      const r=settings.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight;
      panel.style.left=Math.max(8,Math.min(innerWidth-w-8,r.right-w))+'px';
      panel.style.top=Math.max(8,Math.min(innerHeight-h-8,r.top-h-8))+'px';
    }
    function hidePanel(){if(nativePopover){if(opened())panel.hidePopover();}else panel.hidden=true;settings.setAttribute('aria-expanded','false');}
    settings.onclick=()=>{if(opened())hidePanel();else{if(nativePopover)panel.showPopover();else panel.hidden=false;settings.setAttribute('aria-expanded','true');positionPanel();}};
    close.onclick=()=>{hidePanel();settings.focus({preventScroll:true});};
    panel.addEventListener('toggle',()=>settings.setAttribute('aria-expanded',String(opened())));
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){hidePanel();settings.focus({preventScroll:true});event.stopPropagation();}});
    const dismiss=event=>{if(!nativePopover&&opened()&&!panel.contains(event.target)&&!settings.contains(event.target))hidePanel();};
    document.addEventListener('pointerdown',dismiss);window.addEventListener('resize',positionPanel);
    const toggle=node('button','Music off');toggle.type='button';toggle.setAttribute('aria-pressed','false');
    const styleLabel=node('label','Style '),select=node('select');select.setAttribute('aria-label','Music style');
    for(const [key,label] of Object.entries(styles)){const option=node('option',label);option.value=key;select.append(option);}
    select.value=style;styleLabel.append(select);
    const volumeLabel=node('label','Volume '),slider=node('input');slider.type='range';slider.min=0;slider.max=100;slider.step=1;
    slider.value=Math.round(volume*100);slider.setAttribute('aria-label','Music volume');volumeLabel.append(slider);
    const status=node('span');status.className='kc-music-status';status.setAttribute('role','status');
    const audio=node('audio');audio.preload='auto';audio.setAttribute('aria-hidden','true');
    panel.append(top,toggle,styleLabel,volumeLabel,status,audio);host.append(panel);
    const message=(text,error=false)=>{if(status.textContent!==text)status.textContent=text;status.dataset.error=String(error);};
    function setVolume(){
      if(gain&&context){const t=context.currentTime;gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(volume,t,.025);audio.volume=1;}
      else audio.volume=volume;
    }
    function unlock(){
      blocked=false;
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!context&&AudioContext){
        try{context=new AudioContext();gain=context.createGain();gain.gain.value=volume;
          source=context.createMediaElementSource(audio);source.connect(gain);gain.connect(context.destination);audio.volume=1;
        }catch{source?.disconnect();gain?.disconnect();context?.close().catch(()=>{});context=gain=source=null;}
      }
      if(context?.state==='suspended')context.resume().catch(()=>message('Tap Play to start music.',true));
      setVolume();
    }
    function load(){
      generation++;pending=false;blocked=false;lastSeek=-Infinity;audio.pause();
      audio.removeAttribute('src');audio.load();
      if(objectURL)URL.revokeObjectURL(objectURL);
      const bytes=Uint8Array.from(atob(score.scores[style]),c=>c.charCodeAt(0));
      objectURL=URL.createObjectURL(new Blob([bytes],{type:score.mime}));audio.src=objectURL;
      loadedStyle=style;
      setVolume();
    }
    function sync(force=false){
      if(disposed)return;
      const next=getState();const jumped=Math.abs(next.time-state.time)>.3;state=next;
      state.playing=!!state.playing&&state.time<score.duration-.01&&!document.hidden;
      if(!enabled){if(!audio.paused)audio.pause();return;}
      if(!objectURL)load();
      if(audio.playbackRate!==state.rate)audio.playbackRate=state.rate;
      audio.preservesPitch=true;
      const drift=Math.abs(audio.currentTime-state.time);
      if(state.playing&&!audio.paused)maxDrift=Math.max(maxDrift,drift);
      if(audio.readyState>=1&&(force||jumped||(!audio.seeking&&drift>.18&&(!state.playing||performance.now()-lastSeek>600)))){
        audio.currentTime=Math.min(state.time,audio.duration||score.duration);lastSeek=performance.now();
        if(!force&&state.playing)corrections++;
      }
      if(!state.playing){audio.pause();message('Music on. Press Play.');return;}
      if(audio.error||blocked)return;
      if(audio.paused&&!pending){
        const token=generation;pending=true;
        // Calling play before metadata arrives keeps the user's tap available
        // to WebKit; loadedmetadata aligns the position as soon as it can.
        audio.play().then(()=>{
          if(disposed||token!==generation)return;
          if(!enabled||!state.playing){audio.pause();return;}
          message('Music on: '+styles[style]);
        }).catch(error=>{
          if(!disposed&&token===generation&&error.name!=='AbortError'){
            blocked=true;message('Tap Play or Music on to start music.',true);
          }
        }).finally(()=>{if(token===generation)pending=false;});
      }
    }
    toggle.onclick=()=>{
      enabled=!enabled;toggle.textContent=enabled?'Music on':'Music off';toggle.setAttribute('aria-pressed',String(enabled));
      settings.dataset.enabled=String(enabled);
      if(enabled){unlock();sync(true);}else{audio.pause();message('Music off.');}
    };
    select.onchange=()=>{
      style=select.value;save('kc-manim-music-style',style);
      if(enabled){unlock();load();sync(true);}
      else if(objectURL){generation++;pending=false;audio.pause();audio.removeAttribute('src');audio.load();
        URL.revokeObjectURL(objectURL);objectURL=null;loadedStyle=null;}
    };
    slider.oninput=()=>{volume=Number(slider.value)/100;save('kc-manim-music-volume',volume);setVolume();};
    const gesture=()=>{if(enabled){unlock();sync();}};
    host.addEventListener('pointerdown',gesture,{capture:true});host.addEventListener('keydown',gesture,{capture:true});
    host.addEventListener('click',gesture);
    audio.addEventListener('loadedmetadata',()=>sync(true));audio.addEventListener('canplay',()=>sync());
    audio.addEventListener('error',()=>{if(enabled)message('Music could not load. You can continue silently.',true);});
    const controller={host,sync,pause(){audio.pause();},snapshot:()=>({scene,style,loadedStyle,enabled,volume,time:state.time,playing:state.playing,
      audioTime:audio.currentTime,audioPaused:audio.paused,audioRate:audio.playbackRate,preservesPitch:audio.preservesPitch,
      readyState:audio.readyState,audioError:audio.error?.message||null,contextState:context?.state||null,gain:gain?.gain.value??null,
      maxDrift,corrections,disposed}),dispose(){
        if(disposed)return;disposed=true;generation++;cancelAnimationFrame(frame);audio.pause();audio.removeAttribute('src');audio.load();
        if(objectURL)URL.revokeObjectURL(objectURL);source?.disconnect();gain?.disconnect();context?.close().catch(()=>{});
        host.removeEventListener('pointerdown',gesture,{capture:true});host.removeEventListener('keydown',gesture,{capture:true});
        host.removeEventListener('click',gesture);
        hidePanel();document.removeEventListener('pointerdown',dismiss);window.removeEventListener('resize',positionPanel);
        panel.remove();settings.remove();active.delete(controller);
      }};
    const tick=()=>{if(disposed)return;sync();frame=requestAnimationFrame(tick);};
    active.add(controller);frame=requestAnimationFrame(tick);message('Music off.');return controller;
  }
  window.KCManimMusic={register:(name,data)=>scores.set(name,data),attach,
    snapshot:()=>[...active].map(c=>c.snapshot()),pauseAll:()=>active.forEach(c=>c.pause()),
    disposeAll:()=>{for(const c of [...active])c.dispose();}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)window.KCManimMusic.pauseAll();});
  window.addEventListener('pagehide',()=>window.KCManimMusic.pauseAll());
})();
