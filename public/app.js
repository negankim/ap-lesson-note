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

let db=null,user=null,uid=null,ai=null,dict=null,seedFn=null;
let lib=[],isEditor=false,stats={},statsAt=0,libNode="",libSt="active",editing=null,profileExists=false;
const KIND={point:"레슨 포인트",drill:"드릴",training:"훈련"};
const STATUS={active:"사용 중",pending:"검토 대기",retired:"중지"};
let profile={level:"A",goal:""},lessons=[],draft=null,pillarFilter=null,openId=null,busy=false;

/* ===== tabs ===== */
function show(tab){
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===tab));
  $("v-lesson").hidden=tab!=="lesson";$("v-chart").hidden=tab!=="chart";$("v-lib").hidden=tab!=="lib";
  if(tab==="chart")renderChart();
  if(tab==="lib"){renderLib();loadStats()}
  window.scrollTo(0,0);
}
document.querySelector("nav.tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(b)show(b.dataset.tab)});

/* ===== Matrix mini map ===== */
function mapSVG(on,via,mf){
  const BW=190,BH=56;
  let g="";
  for(const [c,n] of Object.entries(NODES)){if(c==="N1")continue;
    const cls="node"+(c===on?" on":"")+(c===via?" via":"")+(on&&c!==on&&c!==via?" dim":"");
    g+=`<g class="${cls}"><rect x="${n.x}" y="${n.y}" width="${BW}" height="${BH}" rx="10"/><text class="code" x="${n.x+16}" y="${n.y+22}">${c}</text><text class="name" x="${n.x+16}" y="${n.y+43}">${esc(n.ko)}</text></g>`}
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
  return `<div class="result">
    <div class="rhead"><span class="eyebrow">${esc(md(date))} · ${esc(PNAME[r.pillar]||"")}</span><h2>${esc(r.title||"레슨 정리")}</h2>
      <div class="meta">${coach?`<span class="pill gold">출처 · ${esc(coach)}</span>`:`<span class="pill">코치 미기재</span>`}${node?`<span class="pill gold">${node} ${esc(NODES[node].ko)}</span>`:`<span class="pill warn">위치 미정</span>`}${r.confidence?`<span class="pill ${conf}">판정 ${esc(r.confidence)}</span>`:""}${r.mental?`<span class="pill warn">압박 시 심해짐 · N1</span>`:""}</div></div>
    <div class="sec"><h4><i>1</i>문제</h4>
      <dl class="kv"><dt>현상</dt><dd>${esc(r.problem&&r.problem.observation)}</dd><dt>원인</dt><dd>${esc(r.problem&&r.problem.interpretation)}</dd></dl>
      ${basis?`<div><span class="pill">근거 · ${esc(basis)}</span></div>`:""}</div>
    <div class="sec map"><h4><i>2</i>Matrix 위치</h4>${mapSVG(node,r.via&&NODES[r.via]?r.via:null,r.mental)}<p>${esc(r.node_reason)}</p>${r.check?`<div class="check"><b>다음 레슨에서 확인</b> · ${esc(r.check)}</div>`:""}</div>
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
    if(!r||!r.plan)throw new Error("format");
    draft={date:$("f-date").value||today(),coach,transcript:text,result:r};
    (r.drills||[]).forEach(d=>{const it=d.lib_id&&lib.find(x=>x.id===d.lib_id);if(it){d.source="AP 라이브러리";d.lib_rev=it.rev||1}else if(d.source==="AP 라이브러리"){d.source="AI 보완";d.lib_id=""}});
    $("out").innerHTML=resultHTML(r,coach,draft.date,{key:"draft"})+`<div class="actions" style="margin-top:12px"><button class="btn" type="button" id="redo">다시 정리</button><button class="btn gold" type="button" id="save">내 차트에 저장</button></div>`;
    st.textContent="";
    say($("g-lesson"),r.node?`정리했어요. 지금 위치는 ${r.node} ${NODES[r.node].ko}예요. 아래 6일 플랜을 확인하고 내 차트에 저장해 주세요.`:"정리했어요. 위치를 확정하려면 확인할 게 하나 있어요. 아래 '다음 레슨에서 확인'을 봐 주세요.",{now:true,who:"rook",motion:r.node?"success":"guide"});
    $("out").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(e){
    st.className="status err";
    st.textContent=e&&/resource-exhausted/.test(e.code||"")?"오늘 정리 횟수를 다 썼습니다. 내일 다시 이용해 주세요.":e&&/unauthenticated/.test(e.code||"")?"로그인이 풀렸습니다. 다시 로그인해 주세요.":"정리하지 못했습니다. 다시 눌러 주세요.";
  }finally{busy=false;$("go").disabled=false}
});
$("out").addEventListener("click",async e=>{
  if(e.target.id==="redo"){$("go").click();return}
  if(e.target.id!=="save"||!draft)return;
  if(!db||!uid){toast("저장하려면 로그인해 주세요");return}
  e.target.disabled=true;
  try{
    if(!profileExists){try{await db.doc("players/"+uid).set({...profile,updatedAt:new Date().toISOString()});profileExists=true}catch(_){}}
    await db.collection("players/"+uid+"/lessons").add({...draft,done:[],feedback:[],createdAt:new Date().toISOString()});
    toast("내 차트에 저장했습니다");draft=null;$("out").innerHTML="";$("f-text").value="";
    await loadLessons();show("chart");
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
  const l=lessons[0];const g=$("g-chart");if(!g)return;g.dataset.who="daryl";
  if(!l){say(g,"아직 기록이 없어요. 첫 레슨이 들어오면 6일 훈련을 같이 시작해요.");return}
  const plan=l.result.plan||[],done=l.done||[];const next=plan.find(p=>!done.includes(p.day));
  if(sameCount(l)>=3){say(g,"같은 문제가 세 번 넘게 반복됐어요. 혼자 더 하기보다 코치님과 확인해 보는 게 좋겠어요.");return}
  if(!next){say(g,"이번 배틀플랜을 다 마쳤어요. 잘했어요! 다음 레슨에서 달라진 점을 들려주세요.");return}
  say(g,`이번 배틀플랜 ${done.length}/${plan.length}일 했어요. 오늘은 D${next.day} '${next.focus}' 차례예요. 해 보고 어땠는지 알려 주세요.`);
}
function renderActive(){
  chartSay();
  setTimeout(()=>say($("g-feel"),"연습해 보니 몸에서 어떤 느낌이었어요? 맞았는지, 그대로인지, 느낌이 안 오는지만 골라 주셔도 돼요.",{who:"paco"}),0);
  const l=lessons[0];
  if(!l){$("active").innerHTML=`<div class="empty-st"><img src="img/motion/AP_01_Golf_Cart-animated.svg" alt="" width="180" height="158"><b>아직 저장된 레슨이 없습니다</b><span>레슨 탭에서 첫 레슨을 정리해 보세요.</span><button class="btn gold" type="button" data-go-lesson>첫 레슨 정리하기</button></div>`;return}
  const r=l.result,done=l.done||[],n=(r.plan||[]).length;
  const fails=sameCount(l);
  const fbs=(l.feedback||[]).slice().reverse().map(f=>`<div class="fb"><div class="h"><span>${esc(md(f.date))}</span><span class="pill ${f.verdict==="잘 맞았다"?"ok":f.verdict==="여전하다"?"warn":""}">${esc(f.verdict)}</span></div>${f.text?`<div>${esc(f.text)}</div>`:""}${f.adjust?`<div><b>조정</b> · ${esc(f.adjust)}</div>`:""}${f.drill&&f.drill.name?`<div class="hint">추가 훈련: ${esc(f.drill.name)} ${esc(f.drill.dose||"")} <span class="pill">AI 보완</span></div>`:""}</div>`).join("");
  $("active").innerHTML=`<div class="panel" data-id="${esc(l.id)}">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="eyebrow"><b>P</b>이번 배틀플랜</span><span class="pill gold">${done.length}/${n}일 완료</span></div>
    <div><h2>${esc(r.title)}</h2><p class="hint">${esc(md(l.date))} · ${esc(l.coach||"코치 미기재")} · ${esc(r.node?r.node+" "+NODES[r.node].ko:"위치 미정")}</p></div>
    ${fails>=3?`<div class="notice bad"><b>같은 문제가 ${fails}번 해결되지 않았습니다.</b> 혼자 계속하기보다 코치와 확인할 때입니다.<div class="actions" style="margin-top:8px"><button class="btn sm" type="button" data-copy="${esc(l.id)}">코치에게 보낼 요약 복사</button></div></div>`:""}
    <div class="days">${(r.plan||[]).map(p=>{const d=done.includes(p.day);return `<label class="day ck${d?" done":""}" for="ck-${p.day}"><input type="checkbox" id="ck-${p.day}" data-day="${p.day}" ${d?"checked":""}><span class="dn">D${p.day}</span><div><b>${esc(p.focus)}</b><small>${esc((p.tasks||[]).join(" · "))}</small></div></label>`}).join("")}</div>
    <div style="display:grid;gap:8px;border-top:1px solid var(--line);padding-top:12px">
      <div class="guide" id="g-feel"></div>
      <div class="chips" id="fb-v"><button type="button" class="chip" data-v="잘 맞았다" aria-pressed="false">잘 맞았다</button><button type="button" class="chip" data-v="여전하다" aria-pressed="false">여전하다</button><button type="button" class="chip" data-v="느낌을 모르겠다" aria-pressed="false">느낌을 모르겠다</button></div>
      <label for="fb-t">한 줄 메모 <span class="hint">선택</span><input id="fb-t" maxlength="200" placeholder="예: 하프스윙은 되는데 풀스윙에서 다시 오른쪽으로"></label>
      <div class="actions"><button class="btn gold" type="button" id="fb-go">피드백 보내기</button></div>
      <p class="status" id="fb-st" role="status"></p>
    </div>
    ${fbs?`<div style="display:grid;gap:8px">${fbs}</div>`:""}
  </div>`;
}
$("active").addEventListener("change",async e=>{
  const ck=e.target.closest("input[data-day]");if(!ck)return;
  const l=lessons[0];if(!l||!db)return;
  const day=Number(ck.dataset.day);const done=new Set(l.done||[]);ck.checked?done.add(day):done.delete(day);
  l.done=[...done].sort((a,b)=>a-b);
  try{await db.doc("players/"+uid+"/lessons/"+l.id).update({done:l.done})}catch(err){toast("저장하지 못했습니다")}
  renderMandala();renderActive();
});
$("active").addEventListener("click",async e=>{
  if(e.target.closest("[data-go-lesson]")){show("lesson");return}
  const chip=e.target.closest("#fb-v .chip");
  if(chip){document.querySelectorAll("#fb-v .chip").forEach(c=>c.setAttribute("aria-pressed",c===chip?"true":"false"));return}
  const cp=e.target.closest("[data-copy]");
  if(cp){const l=lessons.find(x=>x.id===cp.dataset.copy);if(!l)return;const r=l.result;
    const txt=`[AP 레슨 노트] ${r.title}\n위치: ${r.node||"미정"} ${r.node?NODES[r.node].ko:""}\n솔루션: ${r.solution}\n처방: ${(r.drills||[]).map(d=>d.name+" "+(d.dose||"")).join(", ")}\n연습 반응:\n${(l.feedback||[]).map(f=>"- "+f.date+" "+f.verdict+(f.text?" / "+f.text:"")).join("\n")}\n질문: ${((l.feedback||[]).slice(-1)[0]||{}).ask||""}`;
    try{await navigator.clipboard.writeText(txt);toast("요약을 복사했습니다")}catch(err){toast("복사하지 못했습니다")}return}
  if(e.target.id!=="fb-go")return;
  const l=lessons[0];const v=(document.querySelector('#fb-v .chip[aria-pressed="true"]')||{}).dataset;const st=$("fb-st");
  if(!v||!v.v){st.textContent="반응을 하나 골라 주세요.";st.className="status err";return}
  const text=$("fb-t").value.trim();
  e.target.disabled=true;st.className="status";st.innerHTML="다음 연습을 맞추는 중입니다.<div class=\"ld\" aria-hidden=\"true\"></div>";
  let adj={adjust:"",drill:null,ask_coach:""};
  try{if(ai)adj=(await ai({task:"feedback",lesson:{result:l.result,feedback:l.feedback||[]},verdict:v.v,text})).data||adj}catch(err){}
  const f={date:today(),verdict:v.v,text,adjust:adj.adjust||"",drill:adj.drill||null,ask:adj.ask_coach||"",createdAt:new Date().toISOString()};
  l.feedback=[...(l.feedback||[]),f];
  try{await db.doc("players/"+uid+"/lessons/"+l.id).update({feedback:l.feedback});toast("피드백을 남겼습니다")}catch(err){toast("저장하지 못했습니다")}
  renderActive();
  if(f.adjust)setTimeout(()=>say($("g-feel"),"다음엔 이렇게 해 봐요. "+f.adjust,{now:true,who:"paco"}),50);
});

function renderList(){
  const ls=pillarFilter?lessons.filter(l=>l.result.pillar===pillarFilter):lessons;
  $("filter-l").textContent=pillarFilter?PNAME[pillarFilter]+"만 보는 중":"";
  $("list").innerHTML=ls.length?ls.map(l=>{const r=l.result;return `<button type="button" class="lrow" data-id="${esc(l.id)}" aria-expanded="${openId===l.id}"><span class="d">${esc(md(l.date))}</span><span><b>${esc(r.title)}</b><p>${esc([l.coach,PNAME[r.pillar],r.node?r.node+" "+NODES[r.node].ko:"위치 미정"].filter(Boolean).join(" · "))}</p></span><span class="pill ${(l.done||[]).length===(r.plan||[]).length&&(r.plan||[]).length?"ok":""}">${(l.done||[]).length}/${(r.plan||[]).length}</span></button>`}).join(""):`<div class="empty">${pillarFilter?"이 영역의 레슨이 아직 없습니다.":"아직 레슨 기록이 없습니다."}</div>`;
  const o=lessons.find(l=>l.id===openId);
  $("detail").innerHTML=o?resultHTML(o.result,o.coach,o.date,{key:o.id}):"";
}
$("list").addEventListener("click",e=>{const b=e.target.closest(".lrow");if(!b)return;openId=openId===b.dataset.id?null:b.dataset.id;renderList();if(openId)$("detail").scrollIntoView({behavior:"smooth",block:"start"})});

function renderChart(){renderMandala();renderActive();renderList()}

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
  ({db,user,ai,dict,seedFn}=services);
  return boot();
}
async function boot(){
  renderChart();
  setupMic();
  try{isEditor=!!(await user.canEdit())}catch(_){}
  setRole();
  uid=await user.id();
  const me=await user.me();$("who").textContent=(me&&me.name)||"내 기록";setMenuUser(me&&me.name,user.role?user.role():"");
  try{const p=await db.doc("players/"+uid).get();if(p.exists){profileExists=true;const v=p.data();profile={level:v.level||"A",goal:v.goal||""}}}catch(e){}
  await loadLessons();
  let gotLib=false;const lt=setTimeout(()=>{if(!gotLib)$("lib-list").innerHTML='<div class="empty">라이브러리를 아직 불러오지 못했습니다. 연결이 느릴 수 있습니다.</div>'},10000);
  db.collection("library").onSnapshot(snap=>{gotLib=true;clearTimeout(lt);lib=snap.docs.map(d=>({id:d.id,...d.data()}));if(!$("v-lib").hidden)renderLib()},()=>{clearTimeout(lt)});
  renderChart();
}
