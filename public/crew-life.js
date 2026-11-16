/* No dependency. Call cleanup on component unmount. */
window.mountAPCrewLife = function(root=document){
 const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
 const timers=new Set(),removers=[];let disposed=false;
 const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);if(!disposed)fn()},ms);timers.add(id);return id};
 const nodes=[...root.querySelectorAll('.ap-mascot')];
 const allowed=el=>!mq.matches&&!document.hidden&&el.isConnected&&el.dataset.motion!=='still';
 nodes.forEach(el=>{
  let waving=false;
  function blink(){if(allowed(el)){if(el.dataset.character==='paco'){el.dataset.gaze='left';later(()=>delete el.dataset.gaze,650+Math.random()*500)}else{el.dataset.blink='true';later(()=>delete el.dataset.blink,140)}}later(blink,3000+Math.random()*3000)}
  function wave(){if(!allowed(el)||waving)return;waving=true;[0,220,440,660].forEach((ms,i)=>later(()=>{if(allowed(el)&&i%2===0)el.dataset.hand='up';else delete el.dataset.hand},ms));later(()=>{delete el.dataset.hand;waving=false},700)}
  function idleHand(){if(allowed(el))wave();later(idleHand,7000+Math.random()*5000)}
  const button=el.closest('button');if(button){button.addEventListener('click',wave);removers.push(()=>button.removeEventListener('click',wave))}
  later(blink,1000+Math.random()*4000);later(idleHand,2000+Math.random()*5000);
 });
 function reset(){nodes.forEach(el=>{delete el.dataset.blink;delete el.dataset.gaze;delete el.dataset.hand})}
 mq.addEventListener('change',reset);document.addEventListener('visibilitychange',reset);
 return ()=>{disposed=true;timers.forEach(clearTimeout);timers.clear();removers.forEach(fn=>fn());mq.removeEventListener('change',reset);document.removeEventListener('visibilitychange',reset);reset()};
};
