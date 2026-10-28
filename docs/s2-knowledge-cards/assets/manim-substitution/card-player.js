/* Authored Manim Bezier paths rendered directly as live SVG. No video decoder. */
(() => {
  const NS='http://www.w3.org/2000/svg',assets=new Map(),decoded=new Map(),active=new Set();
  const rates=[.5,.75,1,1.25,1.5,2],key='kc-manim-video-speed';
  const node=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n;};
  const svgNode=tag=>document.createElementNS(NS,tag);
  const stamp=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  const readRate=()=>{try{const n=Number(localStorage.getItem(key));if(rates.includes(n))return n;}catch{}return rates.includes(window.kcManimPlaybackRate)?window.kcManimPlaybackRate:1;};
  async function load(name){
    if(!decoded.has(name))decoded.set(name,(async()=>{
      if(!assets.has(name))throw Error('Missing vector scene: '+name);
      const bytes=Uint8Array.from(atob(assets.get(name)),c=>c.charCodeAt(0));
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    })());
    return decoded.get(name);
  }
  function pathData([points,subpaths]){
    let cursor=0,d='';
    const point=i=>points[i].join(' ');
    for(const count of subpaths){
      const start=cursor;d+='M'+point(cursor);
      for(let j=0;j+3<count;j+=4)d+='C'+point(start+j+1)+' '+point(start+j+2)+' '+point(start+j+3);
      cursor+=count;
      if(Math.hypot(points[start][0]-points[cursor-1][0],points[start][1]-points[cursor-1][1])<.0001)d+='Z';
    }
    return d;
  }
  function visual(spec,opts={}){
    const name=spec.scene || ({'assets/manim-graphical-method/graphical-method.mp4':'graphical-method','assets/manim-substitution/substitution.mp4':'substitution'})[spec.src];
    if(window.kcAnimationResizeHost?.dataset.scene===name)return window.kcAnimationResizeHost;
    const host=node('div','vis kc-substitution-video kc-vector-host');host.dataset.engine='manim-vector';host.dataset.scene=name;
    const surface=node('div','kc-video-scene'),svg=svgNode('svg');svg.setAttribute('viewBox','0 0 16 9');svg.setAttribute('preserveAspectRatio','xMidYMid meet');svg.setAttribute('role','img');svg.setAttribute('aria-label',spec.alt||'Mathematical animation');surface.append(svg);
    const controls=node('div','kc-video-steps');controls.setAttribute('role','group');controls.setAttribute('aria-label','Animation controls');
    const play=node('button'),replay=node('button');play.type=replay.type='button';play.textContent='Play';replay.textContent='Replay';play.disabled=replay.disabled=true;
    const stages=node('select','kc-video-stage');stages.setAttribute('aria-label','Animation stage');stages.disabled=true;
    const speedLabel=node('label','kc-video-speed');speedLabel.append('Speed ');const speed=node('select');speed.setAttribute('aria-label','Playback speed');
    for(const rate of rates){const o=node('option');o.value=rate;o.textContent=rate+'×';speed.append(o);}speed.value=String(readRate());speedLabel.append(speed);
    const row=node('div','kc-video-timeline'),slider=node('input'),clock=node('output','kc-video-time');slider.type='range';slider.min=0;slider.max=0;slider.step=1/60;slider.value=0;slider.disabled=true;slider.setAttribute('aria-label','Animation time');row.append(slider,clock);
    const status=node('span','kc-video-status');status.setAttribute('role','status');status.textContent='Loading animation…';
    controls.append(play,replay,stages,speedLabel);host.append(surface,row,controls,status);
    let data=null,time=0,playing=false,disposed=false,opening=true,raf=0,last=0,painted=-1,pathNodes=[],previous=[],paths=new Map();
    const music=window.KCManimMusic?.attach(host,{scene:name,getState:()=>({time,playing,rate:Number(speed.value)})});
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sync=()=>{
      slider.value=time;clock.textContent=`${stamp(time)} / ${stamp(data?.duration||0)}`;
      slider.setAttribute('aria-valuetext',`${stamp(time)} of ${stamp(data?.duration||0)}`);
      play.textContent=playing?'Pause':time>=data?.duration?'Play again':'Play';play.setAttribute('aria-label',playing?'Pause animation':'Play animation');
      const stage=data?.steps.findLast(s=>time>=(s.start??s.time)-.001);if(stage)stages.value=String(stage.time);
      host.dataset.time=time.toFixed(4);host.dataset.playing=String(playing);
    };
    const draw=()=>{
      if(!data||disposed)return;
      let shown=opening?(data.steps[0]?.time||time):time;
      if(reduced){const stage=data.steps.findLast(s=>time>=(s.start??s.time));shown=stage?.time??data.steps[0]?.time??time;}
      let low=0,high=data.frames.length-1;
      while(low<high){const middle=Math.ceil((low+high)/2);if(data.frames[middle][0]<=shown)low=middle;else high=middle-1;}
      if(painted===low)return;painted=low;
      const frame=data.frames[low][1];
      while(pathNodes.length>frame.length)pathNodes.pop().remove();
      for(let i=0;i<frame.length;i++){
        if(!pathNodes[i]){pathNodes[i]=svgNode('path');svg.append(pathNodes[i]);}
        if(previous[i]===frame[i])continue;
        const state=data.states[frame[i]],path=pathNodes[i],pid=state[0];
        if(!paths.has(pid))paths.set(pid,pathData(data.paths[pid]));
        path.setAttribute('d',paths.get(pid));
        const [,a,c,e,b,d,f,fill,stroke,width]=state;
        path.setAttribute('transform',`matrix(${a} ${b} ${c} ${d} ${e} ${f})`);
        const rgb=c=>'rgb('+c.slice(0,3).map(v=>Math.round(v*255)).join(' ')+')';
        path.setAttribute('fill',rgb(fill));path.setAttribute('fill-opacity',fill[3]);
        path.setAttribute('stroke',rgb(stroke));path.setAttribute('stroke-opacity',stroke[3]);
        path.setAttribute('stroke-width',width*.01*(Math.min(surface.clientWidth/16,surface.clientHeight/9)||1));
        path.setAttribute('vector-effect','non-scaling-stroke');path.setAttribute('stroke-linejoin','round');
      }
      previous=frame.slice();host.dataset.frame=String(low);
    };
    const pause=()=>{playing=false;music?.pause();cancelAnimationFrame(raf);last=0;sync();};
    const seek=t=>{opening=false;pause();if(!data)return;time=Math.max(0,Math.min(data.duration,t));draw();sync();};
    const tick=now=>{
      if(!playing||disposed)return;
      if(last)time=Math.min(data.duration,time+(now-last)/1000*Number(speed.value));last=now;draw();sync();
      if(time>=data.duration)pause();else raf=requestAnimationFrame(tick);
    };
    const start=()=>{if(!data||disposed)return;opening=false;if(time>=data.duration)time=0;playing=true;last=0;sync();raf=requestAnimationFrame(tick);};
    play.onclick=()=>playing?pause():start();replay.onclick=()=>{seek(0);start();};
    stages.onchange=()=>seek(Number(stages.value));slider.oninput=()=>seek(Number(slider.value));
    speed.onchange=()=>{last=0;try{localStorage.setItem(key,speed.value);}catch{}window.webkit?.messageHandlers?.knowledgeCards?.postMessage({type:'animationSpeed',value:Number(speed.value)});};
    for(const type of ['touchstart','touchmove','touchend','touchcancel','pointerdown','keydown'])host.addEventListener(type,e=>e.stopPropagation());
    const fullscreen=window.KCManimFullscreen.attach(host,controls);
    const observer=new ResizeObserver(()=>{painted=-1;previous=[];draw();});observer.observe(surface);
    const controller={host,pause,dispose(){music?.dispose();disposed=true;fullscreen.dispose();cancelAnimationFrame(raf);observer.disconnect();active.delete(controller);data=null;pathNodes=[];paths.clear();svg.replaceChildren();},snapshot:()=>({scene:name,time,duration:data?.duration,playing,disposed,paths:pathNodes.length,frame:painted,rate:Number(speed.value)})};active.add(controller);
    load(name).then(scene=>{
      if(disposed)return;data=scene;slider.max=data.duration;slider.disabled=false;play.disabled=replay.disabled=stages.disabled=false;
      for(const s of data.steps){const o=node('option');o.value=s.time;o.textContent=s.label;stages.append(o);}status.textContent='';
      time=reduced?(data.steps[0]?.time||0):0;draw();sync();
    }).catch(error=>{if(!disposed){status.textContent='The vector animation could not load. Return to this card to retry.';console.error(error);}});
    sync();return host;
  }
  window.KCManimVector={register:(name,gzip)=>assets.set(name,gzip),visual,disposeAll(){if(window.kcAnimationResizeHost)return;for(const c of [...active])c.dispose();},setActive(value){if(!value)active.forEach(c=>c.pause());},snapshot:()=>[...active].map(c=>c.snapshot())};
  // Legacy card records route to the vector renderer without requesting their MP4.
  window.KCManimVideo=window.KCManimVector;
  const pauseAll=()=>active.forEach(c=>c.pause());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAll();});window.addEventListener('pagehide',pauseAll);
})();

/* One fullscreen surface for both SVG and manim-web scenes. */
(() => {
  let expanded=null;
  const post=value=>window.webkit?.messageHandlers?.knowledgeCards?.postMessage(value);
  window.KCManimFullscreen={
    attach(host,controls){
      const button=document.createElement('button');button.type='button';button.textContent='Fullscreen';button.setAttribute('aria-label','Enter animation fullscreen');button.setAttribute('aria-pressed','false');controls.append(button);
      let dialog=null,placeholder=null,disposed=false,usingBrowserFullscreen=false,closing=false;
      const changed=()=>{if(usingBrowserFullscreen&&document.fullscreenElement!==host)exit();};
      const cancel=e=>{e.preventDefault();exit();};
      function exit(){
        if(!dialog||closing)return;closing=true;
        const old=dialog;dialog=null;
        document.removeEventListener('fullscreenchange',changed);
        if(document.fullscreenElement===host)document.exitFullscreen?.().catch(()=>{});
        if(placeholder?.parentNode)placeholder.replaceWith(host);
        old.close();old.remove();expanded=null;usingBrowserFullscreen=false;
        button.textContent='Fullscreen';button.setAttribute('aria-label','Enter animation fullscreen');button.setAttribute('aria-pressed','false');
        post({type:'animationFullscreen',enabled:false});closing=false;
        if(!disposed&&button.isConnected)button.focus({preventScroll:true});
      }
      async function enter(){
        if(disposed||dialog)return;expanded?.exit();
        placeholder=document.createComment('animation position');host.before(placeholder);
        dialog=document.createElement('dialog');dialog.className='kc-animation-fullscreen kc-manim-card kc-s2-animation-card';dialog.setAttribute('aria-label','Fullscreen mathematical animation');dialog.append(host);document.body.append(dialog);dialog.addEventListener('cancel',cancel);dialog.showModal();expanded={exit};
        button.textContent='Exit fullscreen';button.setAttribute('aria-label','Exit animation fullscreen');button.setAttribute('aria-pressed','true');
        post({type:'animationFullscreen',enabled:true});button.focus({preventScroll:true});
        // WKWebView uses the dialog plus native chrome hiding. Desktop browsers
        // may additionally expand beyond the browser viewport using this API.
        if(!window.webkit?.messageHandlers?.knowledgeCards&&host.requestFullscreen){
          try{await host.requestFullscreen();if(dialog){usingBrowserFullscreen=true;document.addEventListener('fullscreenchange',changed);}else if(document.fullscreenElement)await document.exitFullscreen();}catch{}
        }
      }
      button.onclick=()=>dialog?exit():enter();
      return {exit,dispose(){disposed=true;exit();button.remove();}};
    },
    exit(){expanded?.exit();}
  };
})();

window.KCManimResize={render(callback){
  if(document.querySelector('dialog.kc-animation-fullscreen[open]'))return;
  window.kcAnimationResizeHost=document.querySelector('.kc-manim-host,.kc-vector-host');
  try{callback();}finally{window.kcAnimationResizeHost=null;}
}};
