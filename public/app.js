/* AP 레슨 노트 · 화면 로직. 데이터·AI·음성은 services.js가 넣어 준다. */
/* ===== AP Swing Learning Matrix (진단 맵 기준) ===== */
const NODES={
 N1:{en:"Mental Focus",ko:"멘탈 포커스"},
 N2:{en:"Perceived Impact",ko:"머릿속 임팩트",x:40,y:66},
 N3:{en:"Face & Lever",ko:"페이스·레버",x:40,y:146},
 N4:{en:"Club Path",ko:"클럽 경로",x:40,y:226},
 N5:{en:"Real Impact",ko:"실제 임팩트",x:185,y:320},
 N6:{en:"Consistency",ko:"재현성",x:330,y:226},
 N7:{en:"Efficiency",ko:"효율성",x:330,y:146},
 N8:{en:"Adaptability",ko:"적응",x:330,y:66}
};
/* 만다라트 8개 영역 */
const PILLARS=[["drive","드라이버"],["iron","아이언"],["short","숏게임"],["putt","퍼팅"],["course","코스 매니지먼트"],["body","피지컬"],["mind","멘탈"],["life","루틴·인성"]];
const PNAME=Object.fromEntries(PILLARS);
const LV={P:"투어 선수",J:"아마추어 선수",A:"일반 골퍼"};
const DEF_GOAL={P:"투어 시드 획득",J:"KPGA 프로 입회",A:"90타 깨기"};
const EXAMPLE=`코치: 드라이버가 계속 오른쪽으로 곧게 나가죠? 휘는 게 아니라 처음부터 오른쪽으로 출발해요. 임팩트 때 페이스가 열려서 그래요.
코치: 왼손 등을 다운스윙 때 땅 쪽으로 누른다는 느낌, 시계 반대 방향으로 문 손잡이 돌리듯이요.
나: 그렇게 하니까 처음엔 왼쪽으로 당겨지는 느낌이에요.
코치: 지금은 그게 맞아요. 이번 주는 하프스윙으로 티 두 개 게이트 사이로 출발시키는 연습, 10개씩 3세트, 주 3회 하자. 다음 레슨에서 출발 방향 다시 볼게요.
나: 대회 나가면 더 심해지는 것 같아요.`;

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const md=s=>s?Number(s.slice(5,7))+"/"+Number(s.slice(8,10)):"";
function toast(t){const el=$("toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2400)}

let db=null,user=null,uid=null,ai=null,dict=null,seedFn=null,chat=null,legacy=null,myCoaches=[];
let lib=[],isEditor=false,stats={},statsAt=0,libNode="",libSt="active",editing=null,profileExists=false;
const KIND={point:"레슨 포인트",drill:"드릴",training:"훈련"};
const STATUS={active:"사용 중",pending:"검토 대기",retired:"중지"};
let profile={level:"A",goal:""},lessons=[],draft=null,pillarFilter=null,openId=null,busy=false;

/* ===== 화면 전환 (왼쪽 메뉴에서) · 오늘 / 레슨 / 내 차트 / 훈련 라이브러리(코치 전용) ===== */
function show(tab){
  if(tab==="lib"&&!isEditor)tab="today";
  for(const v of ["today","plaza","lesson","chart","lib"])$("v-"+v).hidden=tab!==v;
  if(tab==="plaza")openPlaza();
  plazaTree&&plazaTree.pause(tab!=="plaza");
  if(tab==="today")renderToday();
  if(tab==="chart")renderChart();
  if(tab==="lib"){renderLib();loadStats()}
  window.scrollTo(0,0);
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-show]");if(b)show(b.dataset.show)});

/* ===== Matrix mini map ===== */
function mapSVG(on,via,mf,leaves={}){
  const BW=190,BH=56;
  let g="";
  for(const [c,n] of Object.entries(NODES)){if(c==="N1")continue;
    const cls="node"+(c===on?" on":"")+(c===via?" via":"")+(on&&c!==on&&c!==via?" dim":"");
    const lf=leaves[c]?`<text class="leaf" x="${n.x+BW-12}" y="${n.y+24}" text-anchor="end">🌱${leaves[c]>1?" "+leaves[c]:""}</text>`:"";
    g+=`<g class="${cls}${leaves[c]?" grow":""}"><rect x="${n.x}" y="${n.y}" width="${BW}" height="${BH}" rx="10"/><text class="code" x="${n.x+16}" y="${n.y+22}">${c}</text><text class="name" x="${n.x+16}" y="${n.y+43}">${esc(n.ko)}</text>${lf}</g>`}
  const mfOn=mf||on==="N1";
  return `<svg viewBox="0 0 560 430" role="img" aria-label="Swing Learning Matrix 위치: ${esc(on||"미정")}">
    <rect class="mf${mfOn?" on":""}" x="8" y="8" width="544" height="414" rx="16"/>
    <text class="mfl${mfOn?" on":""}" x="280" y="34" text-anchor="middle">N1 MENTAL FOCUS</text>
    <text class="mfl" x="135" y="56" text-anchor="middle" style="font-size:10px">CREATION</text>
    <text class="mfl" x="425" y="56" text-anchor="middle" style="font-size:10px">SUSTAINING</text>${g}</svg>`;
}

/* ===== result card (레슨 탭과 차트 상세에서 같이 씀) ===== */
function resultHTML(r,coach,date,opts={}){
  const node=r.node&&NODES[r.node]?r.node:null;
  const conf={"높음":"ok","중간":"gold","낮음":"warn"}[r.confidence]||"";
  const basis=r.problem&&r.problem.basis;
  const drills=(r.drills||[]).map((d,i)=>{const lb=d.lib_id&&d.source==="AP 라이브러리";
    const pill=d.source==="코치"?`<span class="pill gold">코치 처방</span>`:lb?`<span class="pill ok">AP 라이브러리${d.lib_rev?" v"+d.lib_rev:""}</span>`:`<span class="pill">AI 보완</span>`;
    const promo=isEditor&&opts.key&&d.source!=="AP 라이브러리"?` <button type="button" class="btn sm" data-promote="${esc(opts.key)}|${i}">+ 라이브러리에 올리기</button>`:"";
    return `<div class="drill"><div class="t"><b>${esc(d.name)}</b><span class="dose">${esc([d.dose,d.freq].filter(Boolean).join(" · "))}</span></div>${d.how?`<small>${esc(d.how)}</small>`:""}<div>${pill}${promo}</div></div>`}).join("");
  const plan=(r.plan||[]).map(p=>{
    const done=(opts.done||[]).includes(p.day);
    const ck=opts.checkable?`<input type="checkbox" data-day="${p.day}" ${done?"checked":""} aria-label="${p.day}일차 완료">`:"";
    return `<div class="day${done?" done":""}${opts.checkable?" ck":""}">${ck}<span class="dn">D${p.day}</span><div><b>${esc(p.focus)}</b><small>${esc((p.tasks||[]).join(" · "))}</small></div></div>`}).join("");
  const nps=(r.new_points||[]).filter(p=>NODES[p.node]);
  const leaves={};nps.forEach(p=>leaves[p.node]=(leaves[p.node]||0)+1);
  const npHTML=nps.length?`<div class="sec newpt"><h4><i>🌱</i>NEW 레슨 포인트</h4>
    <p class="hint" style="margin:0">${esc(coach||"코치")}님이 이번 레슨에서 새로 준 포인트예요. 저장하면 AP 레거시 나무의 잎으로 쌓이고, 코치님이 확인하면 코치님 이름이 정식으로 남습니다.</p>
    ${nps.map(p=>`<div class="drill"><div class="t"><b>${esc(p.name)}</b><span class="pill gold">${p.node} ${esc(NODES[p.node].ko)} · ${esc((DOMAIN[p.domain]||DOMAIN.tech)[0])}</span></div><div class="feel">“${esc(p.point)}”</div>${p.how||p.dose?`<small>${esc([p.how,p.dose].filter(Boolean).join(" · "))}</small>`:""}<div><span class="pill">🌱 코치 확인 전</span></div></div>`).join("")}</div>`:"";
  return `<div class="result">
    <div class="rhead"><span class="eyebrow">${esc(md(date))} · ${esc(PNAME[r.pillar]||"")}</span><h2>${esc(r.title||"레슨 정리")}</h2>
      <div class="meta">${coach?`<span class="pill gold">출처 · ${esc(coach)}</span>`:`<span class="pill">코치 미기재</span>`}${node?`<span class="pill gold">${node} ${esc(NODES[node].ko)}</span>`:`<span class="pill warn">위치 미정</span>`}${r.confidence?`<span class="pill ${conf}">판정 ${esc(r.confidence)}</span>`:""}${r.mental?`<span class="pill warn">압박 시 심해짐 · N1</span>`:""}</div></div>
    <div class="sec"><h4><i>1</i>문제</h4>
      <dl class="kv"><dt>현상</dt><dd>${esc(r.problem&&r.problem.observation)}</dd><dt>원인</dt><dd>${esc(r.problem&&r.problem.interpretation)}</dd></dl>
      ${basis?`<div><span class="pill">근거 · ${esc(basis)}</span></div>`:""}</div>
    ${npHTML}
    <div class="sec map"><h4><i>2</i>Matrix 위치</h4>${mapSVG(node,r.via&&NODES[r.via]?r.via:null,r.mental,leaves)}<p>${esc(r.node_reason)}</p>${r.check?`<div class="check"><b>다음 레슨에서 확인</b> · ${esc(r.check)}</div>`:""}</div>
    <div class="sec"><h4><i>3</i>레슨 정리</h4>${(r.lesson&&r.lesson.points||[]).length?`<ul>${r.lesson.points.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"<p class='hint'>정리된 포인트가 없습니다.</p>"}${(r.lesson&&r.lesson.feels||[]).map(f=>`<div class="feel">“${esc(f)}”</div>`).join("")}</div>
    <div class="sec"><h4><i>4</i>솔루션</h4><p>${esc(r.solution)}</p></div>
    <div class="sec"><h4><i>5</i>훈련 방안</h4>${drills||"<p class='hint'>처방된 훈련이 없습니다.</p>"}</div>
    <div class="sec"><h4><i>6</i>배틀플랜 · 6일</h4><div class="days">${plan}</div>${r.recheck?`<p class="hint"><b>재평가</b> · ${esc(r.recheck)}</p>`:""}${(r.missing||[]).length?`<p class="hint">코치가 정하지 않은 것: ${esc(r.missing.join(", "))}</p>`:""}</div>
  </div>`;
}

/* ===== 정리하기 ===== */
$("f-date").value=today();
$("ex").addEventListener("click",()=>{$("f-text").value=EXAMPLE;if(!$("f-coach").value)$("f-coach").value="예시 코치";$("f-text").focus()});
$("go").addEventListener("click",async()=>{
  const text=$("f-text").value.trim(),coach=$("f-coach").value.trim();
  const st=$("st");st.className="status";
  if(text.length<20){st.textContent="레슨 내용을 조금 더 적어 주세요.";st.className="status err";return}
  if(!ai){st.textContent="로그인한 뒤에 정리할 수 있습니다.";st.className="status err";return}
  if(busy)return;busy=true;$("go").disabled=true;st.innerHTML="<div class=\"guide\" id=\"g-wait\"></div><div class=\"ld\" aria-hidden=\"true\"></div>";say($("g-wait"),"코치님 말씀을 Matrix에 맞춰 생각하는 중이에요. 20~40초만 기다려 주세요.",{now:true,who:"rook",motion:"guide"});
  try{
    const r=(await ai({task:"organize",text,coach,profile,history:lessons.slice(0,3).map(l=>({date:l.date,title:l.result.title,node:l.result.node||null}))})).data;
    if(r&&r.off_topic){st.textContent="";say($("g-lesson"),"저는 골프 레슨과 연습 이야기만 정리할 수 있어요. 코치님이 한 말이나 공이 어떻게 갔는지 들려주세요.",{now:true,who:"rook",motion:"guide"});return}
    if(!r||!r.plan)throw new Error("format");
    r.new_points=(Array.isArray(r.new_points)?r.new_points:[]).filter(p=>p&&NODES[p.node]&&(p.point||p.name)).slice(0,5);
    draft={date:$("f-date").value||today(),coach,transcript:text,result:r};
    (r.drills||[]).forEach(d=>{const it=d.lib_id&&lib.find(x=>x.id===d.lib_id);if(it){d.source="AP 라이브러리";d.lib_rev=it.rev||1}else if(d.source==="AP 라이브러리"){d.source="AI 보완";d.lib_id=""}});
    $("out").innerHTML=resultHTML(r,coach,draft.date,{key:"draft"})+`<div class="actions" style="margin-top:12px"><button class="btn" type="button" id="redo">다시 정리</button><button class="btn gold" type="button" id="save">내 차트에 저장</button></div>`;
    st.textContent="";
    say($("g-lesson"),r.new_points.length?`NEW 레슨 포인트! ${coach||"코치"}님이 ${r.new_points.map(p=>p.node).filter((v,i,a)=>a.indexOf(v)===i).join("·")}에 새 포인트를 줬어요. 저장하면 새싹으로 남아요.`:r.node?`정리했어요. 지금 위치는 ${r.node} ${NODES[r.node].ko}예요. 아래 6일 플랜을 확인하고 내 차트에 저장해 주세요.`:"정리했어요. 위치를 확정하려면 확인할 게 하나 있어요. 아래 '다음 레슨에서 확인'을 봐 주세요.",{now:true,who:"rook",motion:r.new_points.length||r.node?"success":"guide"});
    $("out").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(e){
    st.className="status err";
    st.textContent=e&&/guardian-pending/.test(e.message||"")?"보호자 확인이 끝나면 정리할 수 있습니다.":e&&/age-required/.test(e.message||"")?"나이 확인이 필요합니다. 새로고침해 주세요.":e&&/resource-exhausted/.test(e.code||"")?"오늘 정리 횟수를 다 썼습니다. 내일 다시 이용해 주세요.":e&&/unauthenticated/.test(e.code||"")?"로그인이 풀렸습니다. 다시 로그인해 주세요.":"정리하지 못했습니다. 다시 눌러 주세요.";
  }finally{busy=false;$("go").disabled=false}
});
$("out").addEventListener("click",async e=>{
  if(e.target.id==="redo"){$("go").click();return}
  if(e.target.id!=="save"||!draft)return;
  if(!db||!uid){toast("저장하려면 로그인해 주세요");return}
  e.target.disabled=true;
  try{
    if(!profileExists){try{await db.doc("players/"+uid).set({...profile,updatedAt:new Date().toISOString()});profileExists=true}catch(_){}}
    const coachId=draft.coach?await coachIdFor(draft.coach):"";
    const np=(draft.result.new_points||[]).length,npNodes=[...new Set((draft.result.new_points||[]).map(p=>p.node))],cname=draft.coach;
    const ref=await db.collection("players/"+uid+"/lessons").add({...draft,draftId:draft.result.draft_id||"",coachId,done:[],feedback:[],createdAt:new Date().toISOString()});
    draft=null;$("out").innerHTML="";$("f-text").value="";
    let lg={added:0,echoed:0};
    if(np&&legacy&&legacy.add&&ref&&ref.id){try{lg=(await legacy.add({lessonId:ref.id})).data||lg}catch(_){}}
    await loadLessons();
    if(lg.added||lg.echoed){plazaStats=null;show("plaza");
      say($("g-plaza"),`NEW 레슨 포인트! ${cname||"코치"}님의 레슨이 ${npNodes.map(n=>n+" "+NODES[n].ko).join(", ")}에 ${lg.added?`새 잎 ${lg.added}개`:""}${lg.added&&lg.echoed?", ":""}${lg.echoed?`이미 있던 잎에 출처 ${lg.echoed}개`:""}로 더해졌어요.`,{now:true,who:"rook",motion:"success"})}
    else{toast("내 차트에 저장했습니다");show("today")}
  }catch(err){toast("저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요");e.target.disabled=false}
});

/* ===== 음성 (dictation) ===== */
function setupMic(){
  if(!dict)return;
  $("mic-row").hidden=false;
  let on=false;
  dict.onPartial(({text})=>{$("partial").textContent=text});
  dict.onFinal(({text})=>{const t=$("f-text");t.value=(t.value?t.value.replace(/\s*$/,"")+"\n":"")+text;$("partial").textContent=""});
  dict.onState(({state})=>{on=state==="listening";$("mic").dataset.on=on;$("mic-l").textContent=on?"듣는 중 · 눌러서 멈춤":"레슨 듣기 시작";document.querySelectorAll("#g-lesson .ap-mascot").forEach(m=>{m.dataset.motion=on?"still":"idle"})});
  $("mic").addEventListener("click",()=>{
    if(on){dict.stop().catch(()=>{});return}
    dict.start().catch(err=>{if(err&&err.code==="not_granted"){$("mic-row").hidden=true;toast("마이크가 허용되지 않아 입력으로 진행합니다")}});
  });
}

/* ===== 내 차트 ===== */
const pillarStats=pid=>{const ls=lessons.filter(l=>l.result.pillar===pid);const tot=ls.reduce((a,l)=>a+(l.result.plan||[]).length,0),dn=ls.reduce((a,l)=>a+(l.done||[]).length,0);return {n:ls.length,p:tot?Math.round(dn/tot*100):0}};
function renderMandala(){
  const cells=[0,1,2,3,null,4,5,6,7].map(i=>{
    if(i===null)return `<div class="mcell goal"><small>${esc(LV[profile.level])}</small><b>${esc(profile.goal||DEF_GOAL[profile.level])}</b></div>`;
    const [id,name]=PILLARS[i];const s=pillarStats(id);
    return `<button type="button" class="mcell${s.n?" has":""}${pillarFilter===id?" sel":""}" data-p="${id}" style="--p:${s.p}%" aria-pressed="${pillarFilter===id}"><b>${esc(name)}</b><small>${s.n?`레슨 ${s.n} · ${s.p}%`:"—"}</small></button>`});
  $("mgrid").innerHTML=cells.join("");
}
$("mgrid").addEventListener("click",e=>{const b=e.target.closest("[data-p]");if(!b)return;pillarFilter=pillarFilter===b.dataset.p?null:b.dataset.p;renderChart()});

function sameCount(l){return (l.feedback||[]).filter(f=>f.verdict==="여전하다").length}
function chartSay(){
  const l=lessons[0];const g=$("g-chart"),gp=$("g-pos");if(!g)return;g.dataset.who="daryl";
  if(!l){if(gp){gp.innerHTML="";delete gp.dataset.said}say(g,"아직 기록이 없어요. 첫 레슨이 들어오면 6일 훈련을 같이 시작해요.");return}
  const plan=l.result.plan||[],done=l.done||[];const next=plan.find(p=>!done.includes(p.day));
  const nd=l.result.node&&NODES[l.result.node];
  if(gp){
    if(sameCount(l)>=3)say(gp,"같은 문제가 세 번 넘게 반복됐어요. 혼자 더 하기보다 코치님과 원인을 다시 확인해 보는 게 좋겠어요.",{who:"rook",motion:"guide"});
    else if(nd)say(gp,`지금 내 위치는 ${l.result.node} ${nd.ko}예요. 이 자리를 먼저 잡으면 다음 단계가 열려요.`,{who:"rook"});
    else say(gp,"아직 위치를 확정하지 못했어요. 다음 레슨에서 코치님께 확인할 것부터 챙겨 주세요.",{who:"rook",motion:"guide"});
  }
  if(sameCount(l)>=3){say(g,"훈련은 잠시 멈추고, 코치님 확인 뒤에 다시 이어 가요.");return}
  if(!next){say(g,"이번 배틀플랜을 다 마쳤어요. 잘했어요! 다음 레슨에서 달라진 점을 들려주세요.");return}
  say(g,`이번 배틀플랜 ${done.length}/${plan.length}일 했어요. 오늘은 D${next.day} '${next.focus}' 차례예요. 해 보고 어땠는지 알려 주세요.`);
}
function renderActive(){
  chartSay();
  const l=lessons[0];
  if(!l){$("active").innerHTML=`<div class="empty-st"><img src="img/motion/AP_01_Golf_Cart-animated.svg" alt="" width="180" height="158"><b>아직 저장된 레슨이 없습니다</b><span>'레슨 정리하기'에서 첫 레슨을 정리해 보세요.</span><button class="btn gold" type="button" data-go-lesson>첫 레슨 정리하기</button></div>`;return}
  const r=l.result,done=l.done||[],n=(r.plan||[]).length;
  const fails=sameCount(l);
  const fbs=(l.feedback||[]).slice().reverse().map(f=>`<div class="fb"><div class="h"><span>${esc(md(f.date))}${f.day?" · D"+f.day:""}${f.amount?" · "+esc(f.amount):""}</span><span class="pill ${f.verdict==="잘 맞았다"?"ok":f.verdict==="여전하다"?"warn":""}">${esc(f.verdict)}</span></div>${f.text?`<div>${esc(f.text)}</div>`:""}${f.adjust?`<div><b>조정</b> · ${esc(f.adjust)}</div>`:""}${f.drill&&f.drill.name?`<div class="hint">추가 훈련: ${esc(f.drill.name)} ${esc(f.drill.dose||"")} <span class="pill">AI 보완</span></div>`:""}</div>`).join("");
  $("active").innerHTML=`<div class="panel" data-id="${esc(l.id)}">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="eyebrow"><b>P</b>이번 배틀플랜</span><span class="pill gold">${done.length}/${n}일 완료</span></div>
    <div><h2>${esc(r.title)}</h2><p class="hint">${esc(md(l.date))} · ${esc(l.coach||"코치 미기재")} · ${esc(r.node?r.node+" "+NODES[r.node].ko:"위치 미정")}</p></div>
    ${fails>=3?`<div class="notice bad"><b>같은 문제가 ${fails}번 해결되지 않았습니다.</b> 혼자 계속하기보다 코치와 확인할 때입니다.<div class="actions" style="margin-top:8px"><button class="btn sm" type="button" data-copy="${esc(l.id)}">코치에게 보낼 요약 복사</button></div></div>`:""}
    <div class="days">${(r.plan||[]).map(p=>{const d=done.includes(p.day);return `<label class="day ck${d?" done":""}" for="ck-${p.day}"><input type="checkbox" id="ck-${p.day}" data-day="${p.day}" ${d?"checked":""}><span class="dn">D${p.day}</span><div><b>${esc(p.focus)}</b><small>${esc((p.tasks||[]).join(" · "))}</small></div></label>`}).join("")}</div>
    <div class="actions"><button class="btn sm" type="button" data-show="today">오늘 연습 기록하러 가기</button></div>
    ${fbs?`<div style="display:grid;gap:8px"><span class="eyebrow"><b>F</b>연습 기록</span>${fbs}</div>`:""}
  </div>`;
}
$("active").addEventListener("change",async e=>{
  const ck=e.target.closest("input[data-day]");if(!ck)return;
  const l=lessons[0];if(!l||!db)return;
  const day=Number(ck.dataset.day);const done=new Set(l.done||[]);ck.checked?done.add(day):done.delete(day);
  l.done=[...done].sort((a,b)=>a-b);
  try{await db.doc("players/"+uid+"/lessons/"+l.id).update({done:l.done})}catch(err){toast("저장하지 못했습니다")}
  renderMandala();renderActive();renderToday();
});
$("active").addEventListener("click",async e=>{
  if(e.target.closest("[data-go-lesson]")){show("lesson");return}
  const cp=e.target.closest("[data-copy]");
  if(cp){const l=lessons.find(x=>x.id===cp.dataset.copy);if(!l)return;const r=l.result;
    const txt=`[AP 레슨 노트] ${r.title}\n위치: ${r.node||"미정"} ${r.node?NODES[r.node].ko:""}\n솔루션: ${r.solution}\n처방: ${(r.drills||[]).map(d=>d.name+" "+(d.dose||"")).join(", ")}\n연습 반응:\n${(l.feedback||[]).map(f=>"- "+f.date+" "+f.verdict+(f.text?" / "+f.text:"")).join("\n")}\n질문: ${((l.feedback||[]).slice(-1)[0]||{}).ask||""}`;
    try{await navigator.clipboard.writeText(txt);toast("요약을 복사했습니다")}catch(err){toast("복사하지 못했습니다")}return}
});

/* ===== 오늘: 오늘 할 것 + 짧은 연습 기록 ===== */
function nextDay(l){const plan=l.result.plan||[],done=l.done||[];return plan.find(p=>!done.includes(p.day))||null}
function renderToday(){
  const box=$("today-card");if(!box)return;
  const l=lessons[0];
  if(!l){box.innerHTML=`<div class="panel"><div class="guide" id="g-today"></div><div class="actions"><button class="btn gold" type="button" data-show="lesson">첫 레슨 정리하기</button></div></div>`;
    say($("g-today"),"아직 저장된 레슨이 없어요. 레슨을 하나 정리하면 오늘 할 것과 대화가 그 기록으로 시작돼요.",{who:"logan"});return}
  const r=l.result,nx=nextDay(l),n=(r.plan||[]).length,dn=(l.done||[]).length,fails=sameCount(l);
  const head=`<div class="t-head"><span class="eyebrow"><b>T</b>오늘 할 것</span><span class="pill gold">${dn}/${n}일</span></div>
    <p class="hint">${esc(md(l.date))} · ${esc(l.coach||"코치 미기재")} · ${esc(r.title)}</p>`;
  const task=nx?`<label class="day ck t-day" for="t-done"><input type="checkbox" id="t-done" data-tday="${nx.day}"><span class="dn">D${nx.day}</span><div><b>${esc(nx.focus)}</b><small>${esc((nx.tasks||[]).join(" · "))}</small></div></label>`:`<div class="notice">이번 배틀플랜을 다 마쳤어요. 다음 레슨에서 달라진 점을 코치님께 보여 드리세요.</div>`;
  box.innerHTML=`<div class="panel today">${head}<div class="guide" id="g-today"></div>${task}
    ${fails>=3?`<div class="notice bad"><b>같은 문제가 ${fails}번 해결되지 않았어요.</b> 혼자 더 하기보다 코치님과 확인할 때예요.</div>`:""}
    <div class="t-log">
      <span class="eyebrow"><b>F</b>연습 기록 · 30초</span>
      <div class="chips" id="t-v"><button type="button" class="chip" data-v="잘 맞았다" aria-pressed="false">잘 맞았다</button><button type="button" class="chip" data-v="여전하다" aria-pressed="false">여전하다</button><button type="button" class="chip" data-v="느낌을 모르겠다" aria-pressed="false">느낌을 모르겠다</button></div>
      <div class="row2"><label for="t-amt">얼마나 <span class="hint">선택</span><input id="t-amt" maxlength="40" placeholder="예: 30개 · 40분"></label>
      <label for="t-memo">느낌 한 줄 <span class="hint">선택</span><input id="t-memo" maxlength="200" placeholder="예: 하프스윙은 되는데 풀스윙에서 다시 오른쪽"></label></div>
      <div class="actions"><button class="btn gold" type="button" id="t-go">기록 남기기</button></div>
      <p class="status" id="t-st" role="status"></p>
    </div></div>`;
  const last=(l.feedback||[]).slice(-1)[0];
  if(last&&last.date===today()&&last.adjust)say($("g-today"),"다음엔 이렇게 해 봐요. "+last.adjust,{who:"paco"});
  else if(nx)say($("g-today"),`오늘은 D${nx.day} '${nx.focus}' 차례예요. 하고 나서 어땠는지만 남겨 주세요.`,{who:"daryl"});
  else say($("g-today"),"6일을 끝까지 해냈어요. 다음 레슨에서 바뀐 걸 꼭 보여 드려요.",{who:"daryl",motion:"success"});
}
$("today-card").addEventListener("click",async e=>{
  const chip=e.target.closest("#t-v .chip");
  if(chip){document.querySelectorAll("#t-v .chip").forEach(c=>c.setAttribute("aria-pressed",c===chip?"true":"false"));return}
  if(e.target.id!=="t-go")return;
  const l=lessons[0];if(!l)return;
  const v=(document.querySelector('#t-v .chip[aria-pressed="true"]')||{}).dataset;const st=$("t-st");
  if(!v||!v.v){st.textContent="어땠는지 하나만 골라 주세요.";st.className="status err";return}
  const nx=nextDay(l),text=$("t-memo").value.trim(),amount=$("t-amt").value.trim(),doneNow=$("t-done")&&$("t-done").checked;
  e.target.disabled=true;st.className="status";st.innerHTML="다음 연습을 맞추는 중이에요.<div class=\"ld\" aria-hidden=\"true\"></div>";
  let adj={adjust:"",drill:null,ask_coach:""};
  try{if(ai)adj=(await ai({task:"feedback",lesson:{result:l.result,feedback:l.feedback||[]},verdict:v.v,text:[amount&&("분량 "+amount),text].filter(Boolean).join(" / ")})).data||adj}catch(err){}
  const f={date:today(),day:nx?nx.day:null,amount,verdict:v.v,text,adjust:adj.adjust||"",drill:adj.drill||null,ask:adj.ask_coach||"",createdAt:new Date().toISOString()};
  l.feedback=[...(l.feedback||[]),f];
  const upd={feedback:l.feedback};
  if(doneNow&&nx){l.done=[...new Set([...(l.done||[]),nx.day])].sort((a,b)=>a-b);upd.done=l.done}
  try{await db.doc("players/"+uid+"/lessons/"+l.id).update(upd);toast("연습 기록을 남겼어요")}catch(err){toast("저장하지 못했습니다")}
  renderToday();renderSug();
});

/* ===== 오늘의 대화 ===== */
let chatLog=[],chatBusy=false;
const LIMIT_CHAT=10;
function usedToday(){const t0=new Date();t0.setHours(0,0,0,0);return chatLog.filter(m=>m.role==="user"&&m.at>=t0.getTime()).length}
function crewHTML(m){
  const c=CH[m.who]||CH.logan;
  const src=(m.sources||[]).map(x=>`<span class="pill gold">${esc(md(x.date))} ${esc(x.coach||"코치 미기재")} 레슨</span>`).join("");
  return `<div class="msg crew"><div class="guide on"><span class="ap-mascot g-av" data-character="${CH[m.who]?m.who:"logan"}" data-motion="idle" aria-hidden="true"></span><div class="g-bub"><span class="g-name">${esc(c.n)}</span><p>${esc(m.text)}</p>
    <div class="msg-meta">${src}${m.basis==="AI 추정"?`<span class="pill">AI 추정</span>`:""}${m.coach_check?`<span class="pill warn">코치님께 확인</span>`:""}</div></div></div></div>`;
}
const meHTML=m=>`<div class="msg me"><p>${esc(m.text)}</p></div>`;
function renderChat(){
  const log=$("chat-log");
  log.innerHTML=chatLog.length?chatLog.map(m=>m.role==="user"?meHTML(m):crewHTML(m)).join(""):`<div class="guide" id="g-chat0"></div>`;
  if(!chatLog.length)say($("g-chat0"),lessons.length?"궁금한 걸 물어보세요. 저장된 레슨 기록을 보고, 맞는 친구가 답해 드릴게요.":"레슨을 하나 정리하면 그 기록으로 답해 드릴 수 있어요. 지금은 앱 쓰는 법을 물어봐도 돼요.",{who:"logan"});
  crewLife();renderUse();
}
function renderUse(){const u=usedToday();$("chat-use").textContent=`오늘 ${u}/${LIMIT_CHAT}번 물었어요.`;$("chat-go").disabled=chatBusy||u>=LIMIT_CHAT}
function renderSug(){
  const l=lessons[0],qs=[];
  if(!l)qs.push("레슨은 어떻게 기록해요?","AP 크루는 뭘 도와줘요?");
  else{
    const nx=nextDay(l);
    qs.push(nx?"오늘 연습 어떻게 하면 돼요?":"다음 레슨 전에 뭘 해 두면 좋아요?");
    qs.push("지난 레슨 핵심만 다시 알려 줘요");
    if(l.result.node)qs.push(`왜 ${l.result.node}가 나왔어요?`);
    if(sameCount(l)>=1)qs.push("느낌이 안 와요. 어떻게 해요?");
  }
  $("chat-sug").innerHTML=qs.slice(0,3).map(q=>`<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("");
}
$("chat-sug").addEventListener("click",e=>{const b=e.target.closest("[data-q]");if(b)ask(b.dataset.q)});
$("chat-form").addEventListener("submit",e=>{e.preventDefault();const t=$("chat-t").value.trim();if(t)ask(t)});
async function loadChat(){
  try{chatLog=chat?await chat.history(30):[]}catch(_){chatLog=[]}
  renderChat();renderSug();
}
async function ask(q){
  if(chatBusy)return;
  if(usedToday()>=LIMIT_CHAT){toast("오늘 질문을 다 썼어요. 내일 다시 물어봐 주세요");return}
  chatBusy=true;$("chat-t").value="";
  const log=$("chat-log");if(!chatLog.length)log.innerHTML="";
  log.insertAdjacentHTML("beforeend",meHTML({text:q})+`<div class="msg crew" id="chat-wait"><div class="guide" id="g-wait-c"></div></div>`);
  say($("g-wait-c"),"기록을 찾아보는 중이에요…",{now:true,who:"logan",motion:"guide"});
  $("chat-wait").scrollIntoView({behavior:"smooth",block:"end"});renderUse();
  try{
    const r=(await ai({task:"chat",text:q})).data;
    const now=Date.now();
    chatLog.push({role:"user",text:q,at:now},{role:"crew",who:r.who,text:r.text,sources:r.sources||[],basis:r.basis,coach_check:r.coach_check,at:now+1});
    $("chat-wait").remove();
    const wrap=document.createElement("div");wrap.innerHTML=crewHTML(chatLog[chatLog.length-1]);
    const node=wrap.firstElementChild;log.append(node);
    const p=node.querySelector(".g-bub p"),full=r.text;
    if(!STILL){p.textContent="";let k=0;const t=setInterval(()=>{k+=3;p.textContent=full.slice(0,k);if(k>=full.length)clearInterval(t)},22);play(node.querySelector(".ap-mascot"),r.coach_check?"guide":"hello")}
    crewLife();node.scrollIntoView({behavior:"smooth",block:"end"});
  }catch(err){
    const m=String((err&&err.message)||"");
    $("chat-wait").remove();
    log.lastElementChild&&log.lastElementChild.classList.contains("me")&&log.lastElementChild.remove();
    toast(/resource-exhausted/.test(err&&err.code||"")?"오늘 질문을 다 썼어요. 내일 다시 물어봐 주세요":/guardian-pending/.test(m)?"보호자 확인이 끝나면 물어볼 수 있어요":/age-required/.test(m)?"나이 확인이 필요해요. 새로고침해 주세요":"답을 받지 못했어요. 다시 물어봐 주세요");
    $("chat-t").value=q;
  }finally{chatBusy=false;renderUse()}
}

function renderList(){
  const ls=pillarFilter?lessons.filter(l=>l.result.pillar===pillarFilter):lessons;
  $("filter-l").textContent=pillarFilter?PNAME[pillarFilter]+"만 보는 중":"";
  $("list").innerHTML=ls.length?ls.map(l=>{const r=l.result;return `<button type="button" class="lrow" data-id="${esc(l.id)}" aria-expanded="${openId===l.id}"><span class="d">${esc(md(l.date))}</span><span><b>${esc(r.title)}</b><p>${esc([l.coach,PNAME[r.pillar],r.node?r.node+" "+NODES[r.node].ko:"위치 미정"].filter(Boolean).join(" · "))}</p></span><span class="pill ${(l.done||[]).length===(r.plan||[]).length&&(r.plan||[]).length?"ok":""}">${(l.done||[]).length}/${(r.plan||[]).length}</span></button>`}).join(""):`<div class="empty">${pillarFilter?"이 영역의 레슨이 아직 없습니다.":"아직 레슨 기록이 없습니다."}</div>`;
  const o=lessons.find(l=>l.id===openId);
  $("detail").innerHTML=o?resultHTML(o.result,o.coach,o.date,{key:o.id}):"";
}
$("list").addEventListener("click",e=>{const b=e.target.closest(".lrow");if(!b)return;openId=openId===b.dataset.id?null:b.dataset.id;renderList();if(openId)$("detail").scrollIntoView({behavior:"smooth",block:"start"})});

function renderChart(){renderMandala();renderActive();renderLegacy();renderList()}

/* ===== 내 코치 · 레슨 레거시 =====
   선수가 적은 코치 이름으로 코치 목록을 만든다. 새 레슨 포인트는 그 코치 아래 새싹으로 쌓인다.
   (다음 단계: 코치가 초대로 들어와 확인하면 정식 잎사귀 + 코치 레거시) */
/* ===== AP 레거시 광장: 모두가 함께 키우는 하나의 나무 =====
   단계 = 전체 고유 레슨 포인트 수, 꽃 = 노드별 축적량. 개인 기록과 분리. */
const DOMAIN={tech:["기술 레슨","#c9a24a"],mental:["멘탈 훈련","#9b7fd4"],fitting:["클럽 피팅","#4f9bd9"],physical:["피지컬 트레이닝","#5fb36b"],course:["코스 매니지먼트","#3fb5a8"]};
const STAGE_NAME=["지식의 뿌리","첫 기록","전해지는 가르침","이어지는 지식","쌓여가는 레거시","풍성해지는 기록","세대를 잇는 나무","살아 있는 골프 레거시"];
let plazaTree=null,plazaStats=null;
function treeData(st){const nodes={};for(const n of Object.keys(NODES))nodes[n]={legacyPointCount:Math.max(0,Number(st&&st.nodes&&st.nodes[n])||0)};
  return {totalLegacyPointCount:Math.max(0,Number(st&&st.total)||0),nodes}}
function statLine(st){const t=Number(st&&st.total)||0,c=Number(st&&st.coaches)||0;
  return t?`지금까지 모인 레슨 포인트 ${t}개 · 남긴 코치 ${c}명`:"아직 첫 잎을 기다리는 나무예요. 첫 레슨 포인트가 이 나무의 첫 기록이 됩니다."}
export function mountPlaza(el,st,{landing=false}={}){
  if(!el)return null;
  const go=()=>{if(!window.APLegacyTree)return setTimeout(go,120);
    const t=new APLegacyTree(el,{atlasUrl:"img/legacy-tree-atlas.webp",data:treeData(st),
      onNodeSelect:({nodeId,legacyPointCount})=>{if(landing){$("lp-tree-n").textContent=`${nodeId} ${NODES[nodeId].ko} · 쌓인 레슨 포인트 ${legacyPointCount}개 — 누가 남긴 어떤 레슨인지는 로그인하면 볼 수 있어요.`}else openNode(nodeId)}});
    const n=landing?$("lp-tree-n"):$("plaza-n");if(n)n.textContent=statLine(st);
    if(landing)t.pause(false);else plazaTree=t;};
  go();
}
async function openPlaza(){
  if(!legacy)return;
  const st=await legacy.stats();plazaStats=st;
  if(!plazaTree)mountPlaza($("plaza-tree"),st);else{plazaTree.update(treeData(st));$("plaza-n").textContent=statLine(st)}
  const stage=(()=>{const th=[0,1,8,24,60,120,240,480],t=Number(st.total)||0;let k=0;th.forEach((v,i)=>{if(t>=v)k=i});return k})();
  if(!$("g-plaza").dataset.said||!/NEW/.test($("g-plaza").dataset.said))say($("g-plaza"),`지금 나무는 '${STAGE_NAME[stage]}' 단계예요. 꽃을 누르면 그 노드에 쌓인 레슨 포인트와 누가 남겼는지 볼 수 있어요.`,{who:"logan"});
}
async function openNode(n){
  const box=$("plaza-node");box.innerHTML=`<div class="panel"><div class="ld" aria-hidden="true"></div></div>`;
  let ps=[];try{ps=await legacy.points(n)}catch(_){}
  box.innerHTML=`<div class="panel"><div class="t-head"><span class="eyebrow"><b>${n}</b>${esc(NODES[n].en)} · ${esc(NODES[n].ko)}</span><span class="pill gold">레슨 포인트 ${ps.length}${ps.length>=100?"+":""}</span></div>
    ${ps.length?ps.map(p=>{const d=DOMAIN[p.domain]||DOMAIN.tech,src=(p.sources||[]).slice(0,3);
      return `<div class="lp-pt"><div class="t-head"><b>${esc(p.name||"레슨 포인트")}</b><span class="pill" style="border-color:${d[1]};color:${d[1]}">${esc(d[0])}</span></div>
        <div class="feel">“${esc(p.point)}”</div>${p.how||p.dose?`<small class="hint">${esc([p.how,p.dose].filter(Boolean).join(" · "))}</small>`:""}
        <div class="chips">${src.map(x=>`<span class="pill gold">${esc(x.coach)}</span><span class="pill">${esc(x.player)} · ${esc(md(x.date))}</span>`).join("")}${(p.echoes||1)>1?`<span class="pill ok">같은 포인트 ${p.echoes}번 이어짐</span>`:""}${p.confirmed?`<span class="pill ok">코치 확인</span>`:`<span class="pill">코치 확인 전</span>`}</div></div>`}).join("")
      :`<div class="empty">아직 이 노드에 쌓인 레슨 포인트가 없어요. 첫 잎을 남겨 주세요.</div>`}</div>`;
  box.scrollIntoView({behavior:"smooth",block:"start"});
}
const normName=s=>String(s||"").replace(/\s+/g,"").toLowerCase();
async function loadCoaches(){
  try{const s=await db.collection("players/"+uid+"/coaches").get();myCoaches=s.docs.map(d=>({id:d.id,...d.data()}))}catch(_){myCoaches=[]}
  $("coach-list").innerHTML=myCoaches.map(c=>`<option value="${esc(c.name)}">`).join("");
}
async function coachIdFor(name){
  const hit=myCoaches.find(c=>normName(c.name)===normName(name));if(hit)return hit.id;
  try{const ref=await db.collection("players/"+uid+"/coaches").add({name:name.trim(),createdAt:new Date().toISOString(),claimedBy:null});
    myCoaches.push({id:ref.id,name:name.trim()});$("coach-list").insertAdjacentHTML("beforeend",`<option value="${esc(name.trim())}">`);return ref.id}catch(_){return ""}
}
function coachGroups(){
  const g=new Map();
  for(const l of lessons){const key=l.coachId||("n:"+normName(l.coach));if(!l.coach)continue;
    if(!g.has(key))g.set(key,{name:l.coach,lessons:0,points:[],last:""});
    const c=g.get(key);c.lessons++;if(!c.last||l.date>c.last)c.last=l.date;
    (l.result.new_points||[]).forEach(p=>c.points.push({...p,date:l.date}))}
  return [...g.values()].sort((a,b)=>b.points.length-a.points.length||b.lessons-a.lessons);
}
function renderLegacy(){
  if(!$("legacy"))return;
  const gs=coachGroups(),pts=gs.flatMap(c=>c.points);
  const tot=pts.length;
  $("legacy-n").textContent=tot?`내가 보탠 잎 ${tot}개 · 코치 ${gs.length}명`:"";
  $("legacy-map").innerHTML="";
  $("legacy-list").innerHTML=gs.length?gs.map((c,i)=>{
    const by={};c.points.forEach(p=>by[p.node]=(by[p.node]||0)+1);
    return `<div class="coach-c"><div class="t-head"><b>${esc(c.name)}</b><span class="hint">레슨 ${c.lessons}번 · 최근 ${esc(md(c.last))}</span></div>
      <div class="chips">${Object.keys(by).sort().map(n=>`<span class="pill gold">${n} 🍃${by[n]}</span>`).join("")||`<span class="hint">아직 새 포인트가 없어요</span>`}</div>
      ${c.points.length?`<details><summary class="hint">포인트 ${c.points.length}개 보기</summary>${c.points.map(p=>`<div class="feel" style="margin-top:6px"><b>${p.node}</b> <span class="pill">${esc((DOMAIN[p.domain]||DOMAIN.tech)[0])}</span> ${esc(p.name)} · “${esc(p.point)}”</div>`).join("")}</details>
      <div class="actions"><button class="btn sm" type="button" data-coach-copy="${i}">코치님께 보여 드릴 요약 복사</button></div>`:""}</div>`}).join("")
    :`<div class="empty">레슨을 정리할 때 코치 이름을 적으면 코치별로 쌓여요.</div>`;
}
$("legacy-list").addEventListener("click",async e=>{
  const b=e.target.closest("[data-coach-copy]");if(!b)return;
  const c=coachGroups()[Number(b.dataset.coachCopy)];if(!c)return;
  const txt=`${c.name}님, AP 레슨 노트에 코치님 레슨을 기록하고 있어요.\n코치님이 주신 포인트가 Matrix 위에 ${c.points.length}개 쌓였어요.\n${c.points.map(p=>`· ${p.node} ${NODES[p.node].ko} — ${p.name}: “${p.point}”`).join("\n")}\n제가 맞게 이해했는지 봐 주세요.\nhttps://ap-lesson-note.web.app`;
  try{await navigator.clipboard.writeText(txt);toast("복사했어요. 코치님께 메시지로 보내 보세요")}catch(_){toast("복사하지 못했습니다")}
});

/* ===== 프로필 (구분·목표) ===== */
$("prof-btn").addEventListener("click",()=>{const p=$("prof");p.hidden=!p.hidden;if(!p.hidden){document.querySelectorAll("#lvl .chip").forEach(c=>c.setAttribute("aria-pressed",c.dataset.v===profile.level));$("goal").value=profile.goal||""}});
$("lvl").addEventListener("click",e=>{const c=e.target.closest(".chip");if(!c)return;document.querySelectorAll("#lvl .chip").forEach(x=>x.setAttribute("aria-pressed",x===c));if(!$("goal").value)$("goal").placeholder=DEF_GOAL[c.dataset.v]});
$("prof-save").addEventListener("click",async()=>{
  const lv=(document.querySelector('#lvl .chip[aria-pressed="true"]')||{}).dataset;
  profile={level:lv&&lv.v||profile.level,goal:$("goal").value.trim()};
  $("prof").hidden=true;renderMandala();
  if(db&&uid){try{await db.doc("players/"+uid).set({...profile,updatedAt:new Date().toISOString()});profileExists=true;toast("목표를 저장했습니다")}catch(err){toast("저장하지 못했습니다")}}
});

/* ===== 훈련 라이브러리 ===== */
$("lib-node").innerHTML=[["","전체"],...Object.entries(NODES).map(([c,n])=>[c,c+" "+n.ko])].map(([v,t])=>`<button type="button" class="chip" data-v="${v}" aria-pressed="${v===""}">${esc(t)}</button>`).join("");
$("lib-node").addEventListener("click",e=>{const c=e.target.closest(".chip");if(!c)return;libNode=c.dataset.v;document.querySelectorAll("#lib-node .chip").forEach(x=>x.setAttribute("aria-pressed",x===c));renderLib()});
$("lib-st").addEventListener("click",e=>{const c=e.target.closest(".chip");if(!c)return;libSt=c.dataset.v;document.querySelectorAll("#lib-st .chip").forEach(x=>x.setAttribute("aria-pressed",x===c));renderLib()});
function setRole(){
  $("lib-role").textContent=isEditor?"편집 권한으로 열려 있습니다. 추가·수정한 내용은 다음 레슨 정리부터 반영되고, 이전 버전은 변경 기록에서 언제든 되돌릴 수 있습니다.":"보기 전용입니다. 처방이 맞지 않으면 내 차트에서 '여전하다' 피드백을 남겨 주세요. 코치진이 효과 데이터를 보고 고칩니다.";
  $("lib-add-w").hidden=!isEditor;
  $("dw-lib").hidden=!isEditor;   /* 훈련 라이브러리는 코치·관리자 화면 */
}
function libCard(it){
  const st=stats[it.id]||{n:0,ok:0,same:0};
  const hist=(it.history||[]);
  const acts=isEditor?`<div class="actions">
    <button class="btn sm" type="button" data-edit="${esc(it.id)}">수정</button>
    ${it.status==="pending"?`<button class="btn sm" type="button" data-status="${esc(it.id)}|active">승인</button>`:""}
    ${it.status==="active"?`<button class="btn sm" type="button" data-status="${esc(it.id)}|retired">사용 중지</button>`:""}
    ${it.status==="retired"?`<button class="btn sm" type="button" data-status="${esc(it.id)}|active">다시 사용</button>`:""}
    ${hist.length?`<button class="btn sm" type="button" data-hist="${esc(it.id)}" aria-expanded="false">변경 기록 ${hist.length}</button>`:""}
  </div>`:"";
  const hl=isEditor&&hist.length?`<div class="hist" id="h-${esc(it.id)}" hidden>${hist.map((h,i)=>`<div class="hrow"><div><b>v${h.rev||1}</b> ${esc(h.name)}<small>${esc([h.point,h.how,h.dose,h.freq].filter(Boolean).join(" / "))}</small>${h.note?`<small>당시 메모: ${esc(h.note)}</small>`:""}<small>${esc((h.at||"").slice(0,10))} · <span data-uid="${esc(h.by||"")}"></span></small></div><button class="btn sm" type="button" data-restore="${esc(it.id)}|${i}">이 버전으로 되돌리기</button></div>`).join("")}</div>`:"";
  return `<article class="litem ${esc(it.status)}">
    <div class="top"><h3>${esc(it.name)}</h3><span class="stat">처방 ${st.n} · 잘 맞음 ${st.ok} · 여전함 ${st.same}</span></div>
    <div class="meta"><span class="pill gold">${esc(it.node)} ${esc(NODES[it.node]?NODES[it.node].ko:"")}</span><span class="pill">${esc(KIND[it.kind]||"드릴")}</span>${it.pillar?`<span class="pill">${esc(PNAME[it.pillar]||"")}</span>`:""}<span class="pill ${it.status==="active"?"ok":it.status==="pending"?"warn":""}">${esc(STATUS[it.status]||"")}</span>${it.example?`<span class="pill warn">예시 · 교체 필요</span>`:""}<span>v${it.rev||1}</span></div>
    <p>${esc(it.point)}</p>
    ${it.how||it.dose||it.freq?`<p class="hint">${esc([it.how&&"방법 · "+it.how,it.dose,it.freq].filter(Boolean).join(" · "))}</p>`:""}
    ${it.note?`<p class="hint">최근 변경 · ${esc(it.note)} · <span data-uid="${esc(it.updatedBy||"")}"></span></p>`:""}
    ${acts}${hl}
  </article>`;
}
async function renderLib(){
  setRole();
  const list=lib.filter(x=>(!libNode||x.node===libNode)&&x.status===libSt).sort((a,b)=>(a.node||"").localeCompare(b.node||"")||(a.name||"").localeCompare(b.name||""));
  const counts={active:0,pending:0,retired:0};lib.forEach(x=>counts[x.status]=(counts[x.status]||0)+1);
  document.querySelectorAll("#lib-st .chip").forEach(c=>c.textContent=STATUS[c.dataset.v]+" "+(counts[c.dataset.v]||0));
  $("lib-list").innerHTML=list.length?list.map(libCard).join(""):(isEditor&&!lib.length&&seedFn?`<div class="notice">라이브러리가 비어 있습니다. AP 기본 훈련 85개(만다라트 훈련표 80개 + 진단 맵 예시 5개)를 넣을 수 있습니다. 관리자만 할 수 있습니다.<div class="actions" style="margin-top:10px"><button class="btn gold" type="button" id="seed">기본 라이브러리 넣기</button></div><p class="status" id="seed-st"></p></div>`:`<div class="empty">${db?"이 조건에 맞는 항목이 없습니다.":"로그인하면 라이브러리를 불러옵니다."}</div>`);
  const ids=[...new Set([...document.querySelectorAll("#lib-list [data-uid]")].map(e=>e.dataset.uid).filter(Boolean))];
  if(user&&ids.length){try{const ps=await user.profiles(ids);document.querySelectorAll("#lib-list [data-uid]").forEach(e=>{const p=ps[e.dataset.uid];e.textContent=(p&&p.name)||"코치진"})}catch(_){}}
  document.querySelectorAll("#lib-list [data-uid]").forEach(e=>{if(!e.textContent)e.textContent=e.dataset.uid?"코치진":""});
}
function formHTML(it,isNew){
  it=it||{};
  return `<div class="panel" style="border-color:var(--gold-line)">
    <h2>${isNew?"새 항목":"항목 수정 · v"+(it.rev||1)+" → v"+((it.rev||1)+1)}</h2>
    <div class="chips" id="lf-kind">${Object.entries(KIND).map(([k,t])=>`<button type="button" class="chip" data-v="${k}" aria-pressed="${(it.kind||"drill")===k}">${t}</button>`).join("")}</div>
    <div class="row2">
      <label for="lf-node">Matrix 노드<select id="lf-node">${Object.entries(NODES).map(([c,n])=>`<option value="${c}" ${it.node===c?"selected":""}>${c} ${esc(n.ko)}</option>`).join("")}</select></label>
      <label for="lf-pillar">만다라트 영역<select id="lf-pillar"><option value="">선택 안 함</option>${PILLARS.map(([id,n])=>`<option value="${id}" ${it.pillar===id?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
    </div>
    <label for="lf-name">이름<input id="lf-name" maxlength="60" value="${esc(it.name||"")}" placeholder="예: 스타트 라인 게이트"></label>
    <label for="lf-point">레슨 포인트 · 무엇을 고치는가<textarea id="lf-point" maxlength="400" style="min-height:80px" placeholder="선수에게 전달할 말, 확인할 동작">${esc(it.point||"")}</textarea></label>
    <label for="lf-how">방법<input id="lf-how" maxlength="160" value="${esc(it.how||"")}" placeholder="예: 볼 앞 1m에 티 2개, 하프 스윙부터"></label>
    <div class="row2">
      <label for="lf-dose">횟수·세트<input id="lf-dose" maxlength="40" value="${esc(it.dose||"")}" placeholder="예: 10구 × 3세트"></label>
      <label for="lf-freq">빈도<input id="lf-freq" maxlength="40" value="${esc(it.freq||"")}" placeholder="예: 주 3회"></label>
    </div>
    <label for="lf-note">${isNew?"메모":"바꾸는 이유"} <span class="hint">${isNew?"선택":"필수 · 나중에 왜 바꿨는지 보입니다"}</span><input id="lf-note" maxlength="120" value="${esc(isNew&&it.note?it.note:"")}" placeholder="예: 주니어에게 10구는 많아서 7구로 조정"></label>
    <label style="display:flex;gap:8px;align-items:center;color:var(--fg)"><input type="checkbox" id="lf-pending" style="width:18px;height:18px" ${it.status==="pending"?"checked":""}> 검토 대기로 저장 <span class="hint">처방에 쓰이지 않고 승인을 기다립니다</span></label>
    <div class="actions"><button class="btn" type="button" id="lf-cancel">취소</button><button class="btn gold" type="button" id="lf-save">저장</button></div>
    <p class="status" id="lf-st" role="status"></p>
  </div>`;
}
function openForm(it,isNew){
  editing={id:isNew?null:it.id};
  $("lib-form").innerHTML=formHTML(it,isNew);
  $("lf-kind").addEventListener("click",e=>{const c=e.target.closest(".chip");if(!c)return;document.querySelectorAll("#lf-kind .chip").forEach(x=>x.setAttribute("aria-pressed",x===c))});
  $("lf-cancel").addEventListener("click",()=>{editing=null;$("lib-form").innerHTML=""});
  $("lf-save").addEventListener("click",saveForm);
  $("lib-form").scrollIntoView({behavior:"smooth",block:"start"});
}
const SNAP=["kind","node","pillar","name","point","how","dose","freq","status","note"];
async function writeItem(id,data,note){
  const now=new Date().toISOString();
  if(!id){
    await db.collection("library").add({...data,note:note||"",rev:1,history:[],example:false,createdAt:now,updatedAt:now,updatedBy:uid});return;
  }
  const cur=lib.find(x=>x.id===id);if(!cur)throw new Error("missing");
  const snap={rev:cur.rev||1,at:cur.updatedAt||"",by:cur.updatedBy||""};SNAP.forEach(k=>snap[k]=cur[k]??"");
  const next={...cur,...data,note:note||"",rev:(cur.rev||1)+1,updatedAt:now,updatedBy:uid,history:[snap,...(cur.history||[])].slice(0,20)};
  delete next.id;
  await db.doc("library/"+id).set(next);
}
async function saveForm(){
  const st=$("lf-st");st.className="status";
  const kind=(document.querySelector('#lf-kind .chip[aria-pressed="true"]')||{}).dataset;
  const data={kind:kind&&kind.v||"drill",node:$("lf-node").value,pillar:$("lf-pillar").value,name:$("lf-name").value.trim(),point:$("lf-point").value.trim(),how:$("lf-how").value.trim(),dose:$("lf-dose").value.trim(),freq:$("lf-freq").value.trim(),status:$("lf-pending").checked?"pending":"active"};
  const note=$("lf-note").value.trim();
  if(!data.name||!data.point){st.textContent="이름과 레슨 포인트를 적어 주세요.";st.className="status err";return}
  if(editing.id&&!note){st.textContent="바꾸는 이유를 한 줄 적어 주세요.";st.className="status err";return}
  if(editing.id){const cur=lib.find(x=>x.id===editing.id);if(cur&&cur.status==="retired"&&!$("lf-pending").checked)data.status="retired";if(cur&&cur.example)data.example=false}
  $("lf-save").disabled=true;
  try{await writeItem(editing.id,data,note);toast(editing.id?"수정했습니다. 다음 정리부터 반영됩니다":"추가했습니다");editing=null;$("lib-form").innerHTML="";libSt=data.status;document.querySelectorAll("#lib-st .chip").forEach(x=>x.setAttribute("aria-pressed",x.dataset.v===libSt))}
  catch(e){st.textContent="저장하지 못했습니다. 편집 권한이 있는지 확인해 주세요.";st.className="status err";$("lf-save").disabled=false}
}
$("lib-add").addEventListener("click",()=>openForm({node:libNode||"N3"},true));
$("lib-list").addEventListener("click",async e=>{
  const ed=e.target.closest("[data-edit]");if(ed){openForm(lib.find(x=>x.id===ed.dataset.edit),false);return}
  const h=e.target.closest("[data-hist]");if(h){const box=$("h-"+h.dataset.hist);box.hidden=!box.hidden;h.setAttribute("aria-expanded",!box.hidden);return}
  const s=e.target.closest("[data-status]");
  if(s){const [id,to]=s.dataset.status.split("|");s.disabled=true;
    try{await writeItem(id,{status:to},to==="active"?"승인·사용":"사용 중지");toast(to==="active"?"처방에 쓰이도록 열었습니다":"처방에서 뺐습니다")}catch(_){toast("바꾸지 못했습니다");s.disabled=false}return}
  const r=e.target.closest("[data-restore]");
  if(r){const [id,i]=r.dataset.restore.split("|");const cur=lib.find(x=>x.id===id);const snap=cur&&(cur.history||[])[Number(i)];if(!snap)return;
    if(!r.dataset.armed){r.dataset.armed="1";r.textContent="한 번 더 누르면 되돌립니다";setTimeout(()=>{delete r.dataset.armed;r.textContent="이 버전으로 되돌리기"},3000);return}
    const data={};["kind","node","pillar","name","point","how","dose","freq","status"].forEach(k=>data[k]=snap[k]??"");
    r.disabled=true;try{await writeItem(id,data,"v"+snap.rev+"로 되돌림");toast("v"+snap.rev+" 내용으로 되돌렸습니다")}catch(_){toast("되돌리지 못했습니다");r.disabled=false}}
});
document.addEventListener("click",async e=>{
  if(e.target.id==="seed"){const st=$("seed-st");e.target.disabled=true;st.textContent="넣는 중입니다.";
    try{const r=(await seedFn()).data;st.textContent=`${r.added}개를 넣었습니다.`+(r.skipped?` 이미 있던 ${r.skipped}개는 그대로 두었습니다.`:"")}catch(err){st.className="status err";st.textContent=/permission/.test(err.code||"")?"관리자 권한이 필요합니다.":"넣지 못했습니다. 다시 눌러 주세요.";e.target.disabled=false}
    return}
  const b=e.target.closest("[data-promote]");if(!b)return;
  const [key,i]=b.dataset.promote.split("|");
  const src=key==="draft"?draft:lessons.find(l=>l.id===key);const r=src&&src.result;const d=r&&(r.drills||[])[Number(i)];if(!d)return;
  show("lib");
  openForm({kind:"drill",node:r.node||"N3",pillar:r.pillar||"",name:d.name,point:r.solution||"",how:d.how,dose:d.dose,freq:d.freq,status:"pending",note:(src.coach?src.coach+" 레슨에서 ":"레슨에서 ")+"올림"},true);
});
async function loadStats(){
  if(!db||!uid||Date.now()-statsAt<60000)return;statsAt=Date.now();
  let all=lessons.slice();
  if(isEditor){try{const ps=await db.collection("players").get();all=[];for(const p of ps.docs){try{const ls=await db.collection("players/"+p.id+"/lessons").get();ls.docs.forEach(d=>all.push(d.data()))}catch(_){}}}catch(_){all=lessons.slice()}}
  const s={};
  all.forEach(l=>{const ids=[...new Set(((l.result||{}).drills||[]).map(d=>d.lib_id).filter(Boolean))];
    const fb=l.feedback||[];const ok=fb.filter(f=>f.verdict==="잘 맞았다").length,same=fb.filter(f=>f.verdict==="여전하다").length;
    ids.forEach(id=>{const x=s[id]=s[id]||{n:0,ok:0,same:0};x.n++;x.ok+=ok;x.same+=same})});
  stats=s;if(!$("v-lib").hidden)renderLib();
}

/* ===== 불러오기 ===== */
async function loadLessons(){
  if(!db||!uid){lessons=[];return}
  try{const s=await db.collection("players/"+uid+"/lessons").get();
    lessons=s.docs.map(d=>({id:d.id,...d.data()})).filter(l=>l.result).sort((a,b)=>((b.date||"")+(b.createdAt||"")).localeCompare((a.date||"")+(a.createdAt||"")));
  }catch(e){lessons=[]}
}
/* ===== AP 크루: 로건(늑대·기록)·루크(까마귀·진단)·데릴(벌꿀오소리·훈련)·파코(카멜레온·감각과 실전)
   이미지: img/ap-crew*.webp (네 칸 시트), 모션: crew.css + crew-life.js.  ===== */
const CH={logan:{n:"로건"},rook:{n:"루크"},daryl:{n:"데릴"},paco:{n:"파코"}};
const STILL=matchMedia("(prefers-reduced-motion: reduce)").matches;
let crewOff=null,crewT=0;
function crewLife(){clearTimeout(crewT);crewT=setTimeout(()=>{if(crewOff)crewOff();crewOff=window.mountAPCrewLife?window.mountAPCrewLife(document):null},30)}
function play(m,motion){if(!m)return;m.dataset.motion="still";void m.offsetWidth;m.dataset.motion=motion}
document.addEventListener("animationend",e=>{const m=e.target;if(m.classList&&m.classList.contains("ap-mascot")&&m.dataset.motion!=="still")m.dataset.motion="idle"});
function say(el,text,{now=false,who,motion="hello"}={}){
  if(!el)return;
  const id=CH[who||el.dataset.who]?(who||el.dataset.who):"logan",c=CH[id];
  if(el.dataset.said===c.n+text)return;
  el.dataset.said=c.n+text;el.classList.remove("on");
  el.innerHTML=`<span class="ap-mascot g-av" data-character="${id}" data-motion="idle" aria-hidden="true"></span><div class="g-bub"><span class="g-name">${c.n}</span><p aria-live="polite"></p></div>`;
  crewLife();
  const p=el.querySelector("p"),av=el.querySelector(".ap-mascot");
  if(!STILL)setTimeout(()=>play(av,motion),now?0:400);
  clearInterval(el._t);
  if(STILL){p.textContent=text;return}
  const run=()=>{let k=0;el.classList.add("on");el._t=setInterval(()=>{k+=2;p.textContent=text.slice(0,k);if(k>=text.length)clearInterval(el._t)},28)};
  if(now||!("IntersectionObserver" in window))return run();
  const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();run()}},{threshold:.4});io.observe(el);
}
document.querySelectorAll(".guide[data-say]").forEach(g=>say(g,g.dataset.say));
const CREW_INTRO={logan:"안녕하세요, 기록 담당 로건이에요. 오늘 받은 레슨, 제가 기억할게요.",rook:"루크예요. 문제의 원인을 찾아 지금 내 위치를 함께 짚어볼게요.",daryl:"데릴이야. 오늘 할 훈련부터 하나씩, 끝까지 함께해 보자.",paco:"파코예요. 어떤 느낌이었는지 들려줘요. 실전에 맞게 조율해 봐요."};
document.querySelectorAll(".lp-mate[data-crew]").forEach(b=>b.addEventListener("click",()=>{
  const id=b.dataset.crew,out=$("crew-say");
  out.textContent="";const n=document.createElement("b");n.textContent=CH[id].n;out.append(n,document.createTextNode(" "+CREW_INTRO[id]));
  if(!STILL)play(b.querySelector(".ap-mascot"),"hello");
}));
crewLife();

/* ===== 메뉴 (왼쪽 서랍) ===== */
function openMenu(){$("drawer").hidden=false;$("menu").setAttribute("aria-expanded","true");document.body.style.overflow="hidden"}
function closeMenu(){$("drawer").hidden=true;$("menu").setAttribute("aria-expanded","false");document.body.style.overflow=""}
$("menu").addEventListener("click",openMenu);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("drawer").hidden)closeMenu()});
$("drawer").addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){closeMenu();return}
  if(e.target.closest("[data-logout]")){closeMenu();$("logout").click();return}
  const b=e.target.closest("[data-go]");if(!b)return;
  closeMenu();
  if(b.dataset.go==="lib"&&b.dataset.node!==undefined){libNode=b.dataset.node;document.querySelectorAll("#lib-node .chip").forEach(x=>x.setAttribute("aria-pressed",x.dataset.v===libNode))}
  show(b.dataset.go);
  const sec=b.dataset.sec;
  if(sec==="prof"){$("prof-btn").click();sec&&setTimeout(()=>$("prof").scrollIntoView({behavior:"smooth",block:"start"}),50);return}
  if(sec)setTimeout(()=>{const el=$(sec);if(el)(el.closest(".panel")||el).scrollIntoView({behavior:"smooth",block:"start"})},50);
});
function setMenuUser(name,role){
  $("dw-name").textContent=name||"내 기록";
  
  $("dw-role").textContent={admin:"관리자",coach:"코치"}[role]||"선수";
}

/* ===== 시작 ===== */
export function start(services){
  ({db,user,ai,dict,seedFn,consent,chat,legacy}=services);
  return boot();
}
/* ===== 나이 확인 · 보호자 동의 ===== */
let consent=null;
async function gate(){
  if(!consent)return true;
  let s;try{s=await consent.status()}catch(_){return true}
  if(s.staff){loadGuardQ();return true}
  if(s.ageBand&&(s.ageBand!=="child"||s.guardianVerified))return true;
  $("consent").hidden=false;document.body.style.overflow="hidden";
  const wait=()=>{$("cs-form").hidden=true;$("cs-wait").hidden=false;$("cs-h").textContent="거의 다 됐어요";say($("g-cs"),"보호자 확인이 끝나면 바로 같이 시작해요. 조금만 기다려 주세요.",{now:true,who:"logan",motion:"guide"})};
  if(s.ageBand==="child"){wait();return false}
  say($("g-cs"),"반가워요, 로건이에요. 안전하게 쓰려고 나이만 먼저 여쭤볼게요.",{now:true,who:"logan"});
  return new Promise(done=>{
    $("cs-form").addEventListener("change",()=>{$("cs-guard").hidden=($("cs-form").age.value!=="child")});
    $("cs-form").addEventListener("submit",async e=>{
      e.preventDefault();const err=$("cs-err");err.textContent="";
      const age=$("cs-form").age.value;
      if(!age){err.textContent="나이를 골라 주세요.";return}
      let guardian=null;
      if(age==="child"){
        guardian={name:$("cs-gname").value.trim(),relation:$("cs-grel").value,phone:$("cs-gphone").value.trim()};
        if(!guardian.name||!guardian.relation||!/^[0-9+\- ]{9,}$/.test(guardian.phone)){err.textContent="보호자 이름, 관계, 연락처를 모두 적어 주세요.";return}
        if(!$("cs-gok").checked){err.textContent="보호자 동의에 체크해 주세요.";return}
      }
      if(!$("cs-ok").checked){err.textContent="안내 내용에 동의해 주세요.";return}
      try{await consent.submit({ageBand:age,guardian})}catch(_){err.textContent="저장하지 못했습니다. 다시 눌러 주세요.";return}
      if(age==="child"){wait();return}
      $("consent").hidden=true;document.body.style.overflow="";done(true);
    });
  });
}
$("cs-reload").addEventListener("click",()=>location.reload());
async function loadGuardQ(){
  let list=[];try{list=await consent.pending()}catch(_){return}
  $("guard-q").hidden=!list.length;
  $("guard-list").innerHTML=list.map(p=>`<div class="gq"><div><b>${esc(p.name||"이름 없음")}</b><small>${p.guardian?esc(p.guardian.name+" ("+p.guardian.relation+") · "+p.guardian.phone):"보호자 정보 없음"}</small></div><button class="btn sm gold" type="button" data-verify="${esc(p.uid)}">확인 완료</button></div>`).join("");
}
$("guard-list").addEventListener("click",async e=>{
  const b=e.target.closest("[data-verify]");if(!b)return;
  if(!confirm("보호자께 직접 연락해 동의를 확인하셨나요?"))return;
  b.disabled=true;try{await consent.verify(b.dataset.verify);toast("승인했습니다");loadGuardQ()}catch(_){b.disabled=false;toast("승인하지 못했습니다")}
});
async function boot(){
  if(!(await gate()))return;
  renderChart();
  setupMic();
  try{isEditor=!!(await user.canEdit())}catch(_){}
  setRole();
  uid=await user.id();
  const me=await user.me();$("who").textContent=(me&&me.name)||"내 기록";setMenuUser(me&&me.name,user.role?user.role():"");
  try{const p=await db.doc("players/"+uid).get();if(p.exists){profileExists=true;const v=p.data();profile={level:v.level||"A",goal:v.goal||""}}}catch(e){}
  await loadCoaches();
  await loadLessons();
  let gotLib=false;const lt=setTimeout(()=>{if(!gotLib)$("lib-list").innerHTML='<div class="empty">라이브러리를 아직 불러오지 못했습니다. 연결이 느릴 수 있습니다.</div>'},10000);
  db.collection("library").onSnapshot(snap=>{gotLib=true;clearTimeout(lt);lib=snap.docs.map(d=>({id:d.id,...d.data()}));if(!$("v-lib").hidden)renderLib()},()=>{clearTimeout(lt)});
  renderChart();
  show("today");
  await loadChat();
}
