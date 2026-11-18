import { initTL, renderTL, bindTL, renderMyRx, myRxItems, apPracticeItems } from "./tlib.js";
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
function toast(t){const el=$("toast");el.textContent=T(t);el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2400)}

let db=null,user=null,uid=null,ai=null,dict=null,seedFn=null,chat=null,legacy=null,account=null,myCoaches=[];
/* 화면 번역(i18n.js): 한국어 문장을 고른 언어로. 없으면 그대로 */
const T=s=>(window.APT?window.APT(s):s);
let micTarget="lesson",lib=[],isEditor=false,stats={},statsAt=0,libNode="",libSt="active",editing=null,profileExists=false;
const KIND={point:"레슨 포인트",drill:"드릴",training:"훈련"};
const STATUS={active:"사용 중",pending:"검토 대기",retired:"중지"};
let profile={level:"A",goal:""},lessons=[],draft=null,pillarFilter=null,openId=null,busy=false;

/* ===== 화면 전환. 선수의 한 바퀴: 오늘의 대화 → 말하기(코치님 레슨·내 얘기) → 정리 → 오늘의 훈련(같이 짜기) → 했어요 → 다시
   예전 이름(dx=내 문제 진술, feel=파코 느낌)은 새 화면으로 연결한다 ===== */
const VIEWS=["home","lesson","train","me","ask","lib","link","plan","set","watch","tlib"],ALIAS={today:"home",plaza:"home",chart:"lesson",dx:"lesson",feel:"train"};
let recMode="coach";
function setRec(m){recMode=m==="self"?"self":"coach";
  document.querySelectorAll("#rec-mode [data-rec-m]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.recM===recMode)));
  $("rec-coach").hidden=recMode!=="coach";$("rec-self").hidden=recMode!=="self";
  if(recMode==="self"){renderProbForm();chartSay()}}
$("rec-mode").addEventListener("click",e=>{const b=e.target.closest("[data-rec-m]");if(b)setRec(b.dataset.recM)});
function show(tab){
  if(tab==="dx")recMode="self";
  if(typeof crewStop==="function")crewStop();
  if(typeof miloStop==="function")miloStop(true);
  if(typeof crewPopClose==="function")crewPopClose();
  if(typeof miloPopClose==="function")miloPopClose();
  tab=ALIAS[tab]||tab;if(!VIEWS.includes(tab))tab="home";
  if((tab==="lib"||tab==="tlib")&&!isEditor)tab="home";
  for(const v of VIEWS)$("v-"+v).hidden=tab!==v;
  if(tab==="home"){openPlaza();setTimeout(crewWalk,300);setTimeout(miloEnter,500)}
  plazaTree&&plazaTree.pause(tab!=="home");
  if(tab==="lesson"){setRec(recMode);renderList();renderLegacy();$("coach-zone").hidden=!isEditor;if(isEditor)renderDx()}
  if(tab==="train"){renderMandala();renderActive();renderTrain();renderMandalaAP();renderPlan();renderFeelHist();chartSay();renderDay();if(uid){myRxItems(uid).then(x=>{rxPool=x}).catch(()=>{});apPracticeItems().then(x=>{apPool=x}).catch(()=>{})}}
  if(tab==="ask"){renderSug();renderTalk();renderTalkQ()}
  if(tab==="link"){renderLink();loadViewers().then(renderLink)}
  if(tab==="plan")renderPlanPage();
  if(tab==="set")renderSet();
  if(tab==="watch")loadViewers().then(renderWatch);
  if(tab==="train")renderTCard();
  if(tab==="lib")renderTMetrics();
  if(tab==="me")renderMe();
  if(tab==="lib"){renderLib();loadStats()}
  if(tab==="tlib"){bindTL();renderTL()}
  if(tab==="train"&&uid)renderMyRx(uid,$("my-rx"));
  window.scrollTo(0,0);
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-show]");if(!b)return;if(b.dataset.rec)recMode=b.dataset.rec;show(b.dataset.show)});

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
function langBadge(r){if(!r||!r.src_lang||!r.out_lang||r.src_lang===r.out_lang)return "";return `<span class="pill lang-pill" title="레코드 원문 언어">원문 ${esc(LANG_NAME[r.src_lang]||r.src_lang.toUpperCase())} → ${esc(LANG_NAME[r.out_lang]||r.out_lang)}</span>`}
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
    ${nps.map(p=>`<div class="drill"><div class="t"><b>${esc(p.name)}</b><span class="pill gold">${isEditor?p.node+" "+esc(NODES[p.node].ko)+" · ":""}${esc((DOMAIN[p.domain]||DOMAIN.tech)[0])}</span></div><div class="feel">“${esc(p.point)}”</div>${p.how||p.dose?`<small>${esc([p.how,p.dose].filter(Boolean).join(" · "))}</small>`:""}<div><span class="pill">🌱 코치 확인 전</span></div></div>`).join("")}</div>`:"";
  return `<div class="result">
    <div class="rhead"><span class="eyebrow">${esc(md(date))} · ${esc(PNAME[r.pillar]||"")}</span><h2>${esc(r.title||"레슨 정리")}</h2>${langBadge(r)}
      <div class="meta">${opts.self||r.source==="self"?`<span class="pill">본인 진술</span>`:coach?`<span class="pill gold">출처 · ${esc(coach)}</span>`:`<span class="pill">코치 미기재</span>`}${isEditor?(node?`<span class="pill gold">${node} ${esc(NODES[node].ko)}</span>`:`<span class="pill warn">위치 미정</span>`):""}${r.confidence&&isEditor?`<span class="pill ${conf}">판정 ${esc(r.confidence)}</span>`:""}${r.mental?`<span class="pill warn">압박 상황에서 더 심함</span>`:""}${(r.special||[]).includes("YIPS")?`<span class="pill yips">스페셜 · 입스</span>`:""}</div></div>
    <div class="sec"><h4><i>1</i>문제</h4>
      <dl class="kv"><dt>현상</dt><dd>${esc(r.problem&&r.problem.observation)}</dd><dt>원인</dt><dd>${esc(r.problem&&r.problem.interpretation)}</dd></dl>
      ${basis?`<div><span class="pill">근거 · ${esc(basis)}</span></div>`:""}</div>
    ${npHTML}
    ${(r.special||[]).includes("YIPS")?`<div class="notice yips-note">입스 신호가 보여요. 입스는 한 부분만 고치는 문제가 아니라서, 기술을 한꺼번에 바꾸지 말고 코치님과 단계적으로 다뤄요. 떨림·경련이 골프 밖에서도 계속되면 전문가와 상의해 주세요.</div>`:""}
    ${isEditor?`<div class="sec map"><h4><i>2</i>Matrix 위치 <span class="pill">코치 영역</span></h4>${mapSVG(node,r.via&&NODES[r.via]?r.via:null,r.mental,leaves)}<p>${esc(r.node_reason)}</p>${r.check?`<div class="check"><b>다음 레슨에서 확인</b> · ${esc(r.check)}</div>`:""}</div>`
      :r.check?`<div class="sec"><h4><i>2</i>확인할 것</h4><div class="check">${esc(r.check)}</div></div>`:""}
    ${opts.self||r.source==="self"?((r.lesson&&r.lesson.feels||[]).length?`<div class="sec"><h4><i>3</i>내가 말한 느낌</h4>${r.lesson.feels.map(f=>`<div class="feel">“${esc(f)}”</div>`).join("")}</div>`:""):`<div class="sec"><h4><i>3</i>레슨 정리</h4>${(r.lesson&&r.lesson.points||[]).length?`<ul>${r.lesson.points.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"<p class='hint'>정리된 포인트가 없습니다.</p>"}${(r.lesson&&r.lesson.feels||[]).map(f=>`<div class="feel">“${esc(f)}”</div>`).join("")}</div>`}
    <div class="sec"><h4><i>4</i>솔루션</h4><p>${esc(r.solution)}</p></div>
    <div class="sec"><h4><i>5</i>훈련 방안</h4>${drills||"<p class='hint'>처방된 훈련이 없습니다.</p>"}</div>
    <div class="sec"><h4><i>6</i>배틀플랜 · 6일</h4><div class="days">${plan}</div>${r.recheck?`<p class="hint"><b>재평가</b> · ${esc(r.recheck)}</p>`:""}${(r.missing||[]).length?`<p class="hint">코치가 정하지 않은 것: ${esc(r.missing.join(", "))}</p>`:""}</div>
  </div>`;
}

/* ===== 정리하기 ===== */
$("f-date").value=today();
$("ex").addEventListener("click",()=>{$("f-text").value=T(EXAMPLE);if(!$("f-coach").value)$("f-coach").value=T("예시 코치");$("f-text").focus()});
$("go").addEventListener("click",async()=>{
  const text=$("f-text").value.trim(),coach=$("f-coach").value.trim();
  const st=$("st");st.className="status";
  if(text.length<20){st.textContent="레슨 내용을 조금 더 적어 주세요.";st.className="status err";return}
  if(!ai){st.textContent="로그인한 뒤에 정리할 수 있습니다.";st.className="status err";return}
  if(busy)return;busy=true;$("go").disabled=true;st.innerHTML="<div class=\"guide\" id=\"g-wait\"></div><div class=\"ld\" aria-hidden=\"true\"></div>";say($("g-wait"),"코치님 말씀을 Matrix에 맞춰 생각하는 중이에요. 20~40초만 기다려 주세요.",{now:true,who:"rook",motion:"think"});
  try{
    const r=(await ai({task:"organize",text,coach,profile,history:lessons.slice(0,3).map(l=>({date:l.date,title:l.result.title,node:l.result.node||null}))})).data;
    if(r&&r.off_topic){st.textContent="";say($("g-lesson"),"저는 골프 레슨과 연습 이야기만 정리할 수 있어요. 코치님이 한 말이나 공이 어떻게 갔는지 들려주세요.",{now:true,who:"rook",motion:"guide"});return}
    if(!r||!r.plan)throw new Error("format");
    r.new_points=(Array.isArray(r.new_points)?r.new_points:[]).filter(p=>p&&NODES[p.node]&&(p.point||p.name)).slice(0,5);
    draft={date:$("f-date").value||today(),coach,transcript:text,result:r};
    (r.drills||[]).forEach(d=>{const it=d.lib_id&&lib.find(x=>x.id===d.lib_id);if(it){d.source="AP 라이브러리";d.lib_rev=it.rev||1}else if(d.source==="AP 라이브러리"){d.source="AI 보완";d.lib_id=""}});
    $("out").innerHTML=resultHTML(r,coach,draft.date,{key:"draft"})+`<div class="actions" style="margin-top:12px"><button class="btn" type="button" id="redo">다시 정리</button><button class="btn gold" type="button" id="save">내 차트에 저장</button></div>`;
    st.textContent="";
    say($("g-lesson"),r.new_points.length?`NEW 레슨 포인트! ${coach||"코치"}님이 새 포인트 ${r.new_points.length}개를 줬어요. 저장하면 레거시 나무에 새싹으로 남아요.`:r.node?`정리했어요. 아래 문제·솔루션·훈련을 확인하고 내 차트에 저장해 주세요.`:"정리했어요. 위치를 확정하려면 확인할 게 하나 있어요. 아래 '다음 레슨에서 확인'을 봐 주세요.",{now:true,who:"rook",motion:r.new_points.length||r.node?"success":"guide"});
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
    if(lg.added||lg.echoed){plazaStats=null;show("home");
      say($("g-plaza"),`NEW 레슨 포인트! ${cname||"코치"}님의 레슨이 ${npNodes.map(n=>n+" "+NODES[n].ko).join(", ")}에 ${lg.added?`새 잎 ${lg.added}개`:""}${lg.added&&lg.echoed?", ":""}${lg.echoed?`이미 있던 잎에 출처 ${lg.echoed}개`:""}로 더해졌어요.`,{now:true,who:"rook",motion:"success"})}
    else{toast("저장했어요. 오늘의 훈련을 같이 짜 봐요");show("train")}
  }catch(err){toast("저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요");e.target.disabled=false}
});

/* ===== 음성 (dictation) ===== */
function setupMic(){
  if(!dict)return;
  $("mic-row").hidden=false;
  let on=false;
  /* 마이크 하나를 레슨 기록(로건)과 내 문제 진술(루크)이 같이 쓴다. micTarget 으로 어디에 적을지 정한다 */
  dict.onPartial(({text})=>{if(micTarget==="lesson")$("partial").textContent=text});
  dict.onFinal(({text})=>{const t=micTarget==="prob"?$("p-words"):$("f-text");if(!t)return;t.value=(t.value?t.value.replace(/\s*$/,"")+(micTarget==="prob"?" ":"\n"):"")+text;$("partial").textContent=""});
  dict.onState(({state})=>{on=state==="listening";$("mic").dataset.on=on&&micTarget==="lesson";$("mic-l").textContent=on&&micTarget==="lesson"?"듣는 중 · 눌러서 멈춤":"레슨 듣기 시작";
    const pm=$("p-mic");if(pm){const pon=on&&micTarget==="prob";pm.dataset.on=pon?"1":"";pm.textContent=T(pon?"■ 멈추기":"🎙 말하기")}});
  $("mic").addEventListener("click",()=>{
    if(on){dict.stop().catch(()=>{});return}
    micTarget="lesson";
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
  if(gp)say(gp,l&&sameCount(l)>=3?"같은 문제가 세 번 넘게 반복됐어요. 혼자 더 하기보다 코치님과 원인을 다시 확인해 보는 게 좋겠어요.":"지금 겪는 고민을 골라서 알려 주세요. 글은 짧아도, 안 써도 돼요. 문제와 해법, 할 훈련을 바로 정리해 줄게요.",{who:"rook",motion:l&&sameCount(l)>=3?"guide":"hello"});
  if(l&&sameCount(l)>=3){say(g,"같은 문제가 세 번 넘게 그대로예요. 훈련은 잠시 멈추고, 코치님 확인 뒤에 다시 이어 가요.",{motion:"guide"});return}
  g.innerHTML="";delete g.dataset.said;
}
function renderActive(){
  chartSay();
  const l=lessons[0];
  if(!l){$("active").innerHTML=`<div class="empty-st"><img src="img/icons3d/cart-animated.svg" alt="" width="180" height="180"><b>아직 저장된 레슨이 없습니다</b><span>로건에게 첫 레슨을 들려주세요. 6일 플랜이 여기에 생겨요.</span><button class="btn gold" type="button" data-go-lesson>첫 레슨 정리하기</button></div>`;return}
  const r=l.result,done=l.done||[],n=(r.plan||[]).length;
  const fails=sameCount(l);
  const fbs="";
  $("active").innerHTML=`<div class="panel" data-id="${esc(l.id)}">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="eyebrow"><b>P</b>이번 배틀플랜</span><span class="pill gold">${done.length}/${n}일 완료</span></div>
    <div><h2>${esc(r.title)}</h2><p class="hint">${esc(md(l.date))} · ${esc(l.source==="self"?"본인 진술":l.coach||"코치 미기재")}${isEditor?" · "+esc(r.node?r.node+" "+NODES[r.node].ko:"위치 미정"):""}</p></div>
    ${fails>=3?`<div class="notice bad"><b>같은 문제가 ${fails}번 해결되지 않았습니다.</b> 혼자 계속하기보다 코치와 확인할 때입니다.<div class="actions" style="margin-top:8px"><button class="btn sm" type="button" data-copy="${esc(l.id)}">코치에게 보낼 요약 복사</button></div></div>`:""}
    <div class="days">${(r.plan||[]).map(p=>{const d=done.includes(p.day);return `<label class="day ck${d?" done":""}" for="ck-${p.day}"><input type="checkbox" id="ck-${p.day}" data-day="${p.day}" ${d?"checked":""}><span class="dn">D${p.day}</span><div><b>${esc(p.focus)}</b><small>${esc((p.tasks||[]).join(" · "))}</small></div></label>`}).join("")}</div>
  </div>`;
}
$("active").addEventListener("change",async e=>{
  const ck=e.target.closest("input[data-day]");if(!ck)return;
  const l=lessons[0];if(!l||!db)return;
  const day=Number(ck.dataset.day);const done=new Set(l.done||[]);ck.checked?done.add(day):done.delete(day);
  l.done=[...done].sort((a,b)=>a-b);
  try{await db.doc("players/"+uid+"/lessons/"+l.id).update({done:l.done})}catch(err){toast("저장하지 못했습니다")}
  renderMandala();renderActive();renderTrain();
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
function renderTrain(){
  const box=$("train-today");if(!box)return;const l=lessons[0];
  if(!l){box.innerHTML="";return}
  const r=l.result,nx=nextDay(l),n=(r.plan||[]).length,dn=(l.done||[]).length;
  box.innerHTML=nx?`<div class="panel today"><div class="t-head"><span class="eyebrow"><b>T</b>오늘 할 훈련</span><span class="pill gold">${dn}/${n}일</span></div>
    <div class="day t-day"><span class="dn">D${nx.day}</span><div><b>${esc(nx.focus)}</b><small>${esc((nx.tasks||[]).join(" · "))}</small></div></div>
    <p class="hint" style="margin:0">오늘의 훈련에서 '바로 짜 줘'를 누르면 이 과제가 먼저 들어가요.</p></div>`
    :`<div class="notice">이번 배틀플랜을 다 마쳤어요. 다음 레슨에서 달라진 점을 코치님께 보여 드리세요.</div>`;
}
function renderFeelHist(){
  const box=$("feel-hist");if(!box)return;const l=lessons[0];
  const fbs=l?(l.feedback||[]).slice().reverse():[];
  box.innerHTML=fbs.length?`<div class="panel"><span class="eyebrow"><b>F</b>내 연습 기록</span>${fbs.map(f=>`<div class="fb"><div class="h"><span>${esc(md(f.date))}${f.day?" · D"+f.day:""}${f.amount?" · "+esc(f.amount):""}</span><span class="pill ${f.verdict==="잘 맞았다"?"ok":f.verdict==="여전하다"?"warn":""}">${esc(f.verdict)}</span></div>${f.text?`<div>${esc(f.text)}</div>`:""}${f.adjust?`<div><b>파코의 조율</b> · ${esc(f.adjust)}</div>`:""}${f.drill&&f.drill.name?`<div class="hint">추가 훈련: ${esc(f.drill.name)} ${esc(f.drill.dose||"")} <span class="pill">AI 보완</span></div>`:""}</div>`).join("")}</div>`:"";
}
/* ===== 오늘의 대화 ===== */
let chatLog=[],chatBusy=false;
const LIMIT_CHAT=10;
function usedToday(){const t0=new Date();t0.setHours(0,0,0,0);return chatLog.filter(m=>m.role==="user"&&m.at>=t0.getTime()).length}
function crewHTML(m){
  const c=CH[m.who]||CH.logan;
  const src=(m.sources||[]).map(x=>`<span class="pill gold">${esc(md(x.date))} ${esc(x.coach||"코치 미기재")} 레슨</span>`).join("");
  return `<div class="msg crew"><div class="guide on"><img class="g-av" src="${crewImg(m.who,m.coach_check?"guide":"hello")}" alt="" width="52" height="87"><div class="g-bub"><span class="g-name">${esc(c.n)}</span><p>${esc(m.text)}</p>
    <div class="msg-meta">${src}${m.basis==="AI 추정"?`<span class="pill">AI 추정</span>`:""}${m.coach_check?`<span class="pill warn">코치님께 확인</span>`:""}</div></div></div></div>`;
}
const meHTML=m=>`<div class="msg me"><p>${esc(m.text)}</p></div>`;
function renderChat(){
  const log=$("chat-log");
  log.innerHTML=chatLog.map(m=>m.role==="user"?meHTML(m):crewHTML(m)).join(""); // 비어 있으면 첫 화면 인사가 대신한다
  renderUse();
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
  say($("g-wait-c"),"기록을 찾아보는 중이에요…",{now:true,who:"logan",motion:"think"});
  $("chat-wait").scrollIntoView({behavior:"smooth",block:"end"});renderUse();
  try{
    const r=(await ai({task:"chat",text:q})).data;
    const now=Date.now();
    chatLog.push({role:"user",text:q,at:now},{role:"crew",who:r.who,text:r.text,sources:r.sources||[],basis:r.basis,coach_check:r.coach_check,at:now+1});
    $("chat-wait").remove();
    const wrap=document.createElement("div");wrap.innerHTML=crewHTML(chatLog[chatLog.length-1]);
    const node=wrap.firstElementChild;log.append(node);
    const p=node.querySelector(".g-bub p"),full=r.text;
    if(!STILL){p.textContent="";let k=0;const t=setInterval(()=>{k+=3;p.textContent=full.slice(0,k);if(k>=full.length)clearInterval(t)},22);node.querySelector(".g-av").classList.add("hop")}
    node.scrollIntoView({behavior:"smooth",block:"end"});
  }catch(err){
    const m=String((err&&err.message)||"");
    $("chat-wait").remove();
    log.lastElementChild&&log.lastElementChild.classList.contains("me")&&log.lastElementChild.remove();
    toast(/resource-exhausted/.test(err&&err.code||"")?"오늘 질문을 다 썼어요. 내일 다시 물어봐 주세요":/guardian-pending/.test(m)?"보호자 확인이 끝나면 물어볼 수 있어요":/age-required/.test(m)?"나이 확인이 필요해요. 새로고침해 주세요":"답을 받지 못했어요. 다시 물어봐 주세요");
    $("chat-t").value=q;
  }finally{chatBusy=false;renderUse()}
}

function renderDx(){
  const box=$("dx-box");if(!box)return;const l=lessons[0];
  if(!l){box.innerHTML=`<div class="empty-st"><img src="img/icons3d/bulb-animated.svg" alt="" width="160" height="160"><b>아직 진단할 레슨이 없어요</b><span>로건에게 레슨을 들려주면 루크가 Matrix 위에 위치를 짚어요.</span><button class="btn gold" type="button" data-show="lesson">레슨 기록하기</button></div>`;return}
  const r=l.result,pb=r.problem||{},node=r.node&&NODES[r.node]?r.node:null,via=r.via&&NODES[r.via]?r.via:null;
  const hist=lessons.filter(x=>x.result&&x.result.node).slice(0,8);
  box.innerHTML=`<div class="panel"><div class="t-head"><span class="eyebrow"><b>M</b>지금 내 위치</span><span class="pill gold">${node?node+" "+esc(NODES[node].ko):"위치 미정"}</span></div>
    <p class="hint" style="margin:0">${esc(md(l.date))} · ${esc(l.coach||"코치 미기재")} · ${esc(r.title)}</p>
    <div class="sec map">${mapSVG(node,via,r.mental)}</div>
    <div class="dx-kv"><div><span class="eyebrow">현상 · 관찰</span><p>${esc(pb.observation||"—")}</p></div>
      <div><span class="eyebrow">원인 · 해석</span><p>${esc(pb.interpretation||"—")} ${pb.basis?`<span class="pill">${esc(pb.basis)}</span>`:""}</p></div>
      ${r.node_reason?`<div><span class="eyebrow">왜 이 위치인가</span><p>${esc(r.node_reason)}</p></div>`:""}</div>
    <div class="actions"><button class="btn sm" type="button" data-open-lesson="${esc(l.id)}">이 레슨 전체 보기</button></div></div>
    ${hist.length>1?`<div class="panel"><span class="eyebrow"><b>H</b>위치가 지나온 길</span>${hist.map(h=>`<div class="fb"><div class="h"><span>${esc(md(h.date))} · ${esc(h.coach||"코치 미기재")}</span><span class="pill gold">${h.result.node}</span></div><div>${esc(h.result.title)}</div></div>`).join("")}</div>`:""}`;
}
$("dx-box").addEventListener("click",e=>{const b=e.target.closest("[data-open-lesson]");if(!b)return;openId=b.dataset.openLesson;show("lesson");renderList();setTimeout(()=>$("detail").scrollIntoView({behavior:"smooth",block:"start"}),80)});

function renderList(){
  const ls=pillarFilter?lessons.filter(l=>l.result.pillar===pillarFilter):lessons;
  $("filter-l").textContent=pillarFilter?PNAME[pillarFilter]+"만 보는 중":"";
  $("list").innerHTML=ls.length?ls.map(l=>{const r=l.result;return `<button type="button" class="lrow" data-id="${esc(l.id)}" aria-expanded="${openId===l.id}"><span class="d">${esc(md(l.date))}</span><span><b>${esc(r.title)}</b><p>${esc([l.coach,PNAME[r.pillar],r.node?r.node+" "+NODES[r.node].ko:"위치 미정"].filter(Boolean).join(" · "))}</p></span><span class="pill ${(l.done||[]).length===(r.plan||[]).length&&(r.plan||[]).length?"ok":""}">${(l.done||[]).length}/${(r.plan||[]).length}</span></button>`}).join(""):`<div class="empty">${pillarFilter?"이 영역의 레슨이 아직 없습니다.":"아직 레슨 기록이 없습니다."}</div>`;
  const o=lessons.find(l=>l.id===openId);
  $("detail").innerHTML=o?resultHTML(o.result,o.coach,o.date,{key:o.id}):"";
}
$("list").addEventListener("click",e=>{const b=e.target.closest(".lrow");if(!b)return;openId=openId===b.dataset.id?null:b.dataset.id;renderList();if(openId)$("detail").scrollIntoView({behavior:"smooth",block:"start"})});

function renderChart(){renderMandala();renderActive();renderLegacy();renderList();renderDx();renderTrain();renderFeelHist()}

/* ===== 내 코치 · 레슨 레거시 =====
   선수가 적은 코치 이름으로 코치 목록을 만든다. 새 레슨 포인트는 그 코치 아래 새싹으로 쌓인다.
   (다음 단계: 코치가 초대로 들어와 확인하면 정식 잎사귀 + 코치 레거시) */
/* ===== AP 레거시 광장: 모두가 함께 키우는 하나의 나무 =====
   단계 = 전체 고유 레슨 포인트 수, 꽃 = 노드별 축적량. 개인 기록과 분리. */
const DOMAIN={tech:["기술 레슨","#c9a24a"],mental:["멘탈 훈련","#9b7fd4"],fitting:["클럽 피팅","#4f9bd9"],physical:["피지컬 트레이닝","#5fb36b"],course:["코스 매니지먼트","#3fb5a8"]};
const STAGE_NAME=["지식의 뿌리","첫 기록","전해지는 가르침","이어지는 지식","쌓여가는 레거시","풍성해지는 기록","세대를 잇는 나무","살아 있는 골프 레거시"];
let plazaTree=null,plazaStats=null;
const NODE_DESC={N1:"주의·루틴 진입·압박 반응·리셋",N2:"샷 전에 그리는 머릿속 임팩트와 의도",N3:"페이스와 레버 — 공의 출발 방향",N4:"클럽 경로 — 공의 휘어짐",N5:"실제 임팩트 — 컨택·타점·탄도",N6:"재현성 — 같은 샷을 반복하는 힘",N7:"효율성 — 힘을 거리로 바꾸는 법",N8:"적응 — 코스와 실전에서 쓰는 법"};
function treeData(st,{landing=false,points={}}={}){const nodes={};
  for(const n of Object.keys(NODES))nodes[n]={legacyPointCount:Math.max(0,Number(st&&st.nodes&&st.nodes[n])||0),
    description:NODES[n].ko+" — "+NODE_DESC[n]+(landing?". 누가 남긴 어떤 레슨인지는 로그인하면 볼 수 있어요.":""),
    ...(points[n]?{points:points[n]}:{})};
  return {totalLegacyPointCount:Math.max(0,Number(st&&st.total)||0),nodes}}
function statLine(st){const t=Number(st&&st.total)||0,c=Number(st&&st.coaches)||0;
  return t?`지금까지 모인 레슨 포인트 ${t}개 · 남긴 코치 ${c}명`:"아직 첫 잎을 기다리는 나무예요. 첫 레슨 포인트가 이 나무의 첫 기록이 됩니다."}
const plazaPoints={};
export function mountPlaza(el,st,{landing=false}={}){
  if(!el)return null;
  const go=()=>{if(!window.APLegacyTree)return setTimeout(go,120);
    const t=new APLegacyTree(el,{atlasUrl:"img/legacy-tree-atlas-light.webp",data:treeData(st,{landing}),
      onNodeSelect:({nodeId})=>{if(!landing)loadNodePoints(nodeId)}});
    const n=landing?$("lp-tree-n"):$("plaza-n");if(n){n.textContent="";n.hidden=true}
    if(!landing){plazaTree=t;const d=el.querySelector(".ap-legacy-detail"),slot=$("plaza-detail");if(d&&slot)slot.append(d)}
    setTimeout(()=>growTour(t,el,()=>treeData(landing?st:(plazaStats||st),{landing,points:landing?{}:plazaPoints})),500)};
  go();
}
/* 꽃을 누르면 나무 아래 펼쳐지는 칸에 그 노드의 레슨 포인트와 출처를 채운다 */
async function loadNodePoints(n){
  if(!legacy||plazaPoints[n])return;
  let ps=[];try{ps=await legacy.points(n)}catch(_){return}
  /* 공동 레거시 포인트: 내 언어 번역(i18n)이 있으면 그걸로, 없으면 기준문(한국어) */
  const L=window.AP_LANG||"ko";ps=ps.map(p=>p.i18n&&p.i18n[L]&&p.i18n[L].name?{...p,...p.i18n[L]}:p);
  plazaPoints[n]=ps.map(p=>{const d=T((DOMAIN[p.domain]||DOMAIN.tech)[0]),src=(p.sources||[]);const s0=src[0]||{};
    const more=src.length>1?` 외 ${src.length-1}곳에서 이어짐`:"";
    return {id:p.id,title:`[${d}] ${p.name||"레슨 포인트"} — “${p.point}”`,coach:`${s0.coach||p.coach||"코치 미기재"} · ${s0.player||"선수"}${more} · ${p.confirmed?"코치 확인":"코치 확인 전"}`,date:md(s0.date||"")}});
  if(plazaTree)plazaTree.update({...treeData(plazaStats,{points:plazaPoints}),stageOverride:31});
}
async function openPlaza(){
  if(!legacy)return;
  const st=await legacy.stats();plazaStats=st;for(const k in plazaPoints)delete plazaPoints[k];
  if(!plazaTree)mountPlaza($("plaza-tree"),st);else plazaTree.update({...treeData(st),stageOverride:31})
  const th=window.APLegacyTree?window.APLegacyTree.thresholds:[0],t=Number(st.total)||0;let k=0;th.forEach((v,i)=>{if(t>=v)k=i});
  if(!$("g-plaza").dataset.said||!/NEW/.test($("g-plaza").dataset.said))say($("g-plaza"),"열매를 누르면 그 영역에 쌓인 레슨 포인트와 누가 남겼는지 볼 수 있어요.",{who:"logan"});
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
/* ===== AP 크루 (부드러운 3D): 로건(늑대·기록)·루크(까마귀·진단)·데릴(벌꿀오소리·훈련)·파코(카멜레온·감각과 실전)
   그림은 자세별 정지 이미지(img/crew3d/{id}-{자세}.webp). 손 흔들기 같은 관절 움직임은 아직 없고, 상황에 맞는 자세로 바꿔 보여 준다. ===== */
const CH={logan:{n:"로건"},rook:{n:"루크"},daryl:{n:"데릴"},paco:{n:"파코"}};
const STILL=matchMedia("(prefers-reduced-motion: reduce)").matches;
const POSE={hello:"greet",guide:"explain",success:"success",think:"think",idle:"idle",point:"point",cheer:"think"};
const crewImg=(id,motion="idle")=>`img/crew3d/${CH[id]?id:"logan"}-${POSE[motion]||"greet"}.webp`;
function say(el,text,{now=false,who,motion="hello"}={}){
  if(!el)return;text=T(text);
  const id=CH[who||el.dataset.who]?(who||el.dataset.who):"logan",c=CH[id];
  if(el.dataset.said===c.n+text)return;
  el.dataset.said=c.n+text;el.classList.remove("on");
  el.innerHTML=`<img class="g-av" src="${crewImg(id,motion)}" alt="" width="52" height="87"><div class="g-bub"><span class="g-name">${c.n}</span><p aria-live="polite"></p></div>`;
  const p=el.querySelector("p"),av=el.querySelector(".g-av");
  if(!STILL)setTimeout(()=>av.classList.add("hop"),now?0:300);
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
  const img=b.querySelector(".mate-img");if(img){img.src=crewImg(id,"hello");clearTimeout(img._t);img._t=setTimeout(()=>img.src=crewImg(id,"idle"),2600)}
}));

/* ===== 메뉴 (왼쪽 서랍) ===== */
function openMenu(){renderDrawerStatus();loadViewers();$("drawer").hidden=false;$("menu").setAttribute("aria-expanded","true");document.body.style.overflow="hidden"}
function closeMenu(){$("drawer").hidden=true;$("menu").setAttribute("aria-expanded","false");document.body.style.overflow=""}
$("menu").addEventListener("click",openMenu);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("drawer").hidden)closeMenu()});
$("drawer").addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){closeMenu();return}
  if(e.target.closest("[data-dp-open]")){closeMenu();setTimeout(dpOpen,120);return}
  if(e.target.closest("[data-logout]")){closeMenu();$("logout").click();return}
  const b=e.target.closest("[data-go]");if(!b)return;
  closeMenu();
  if(b.dataset.go==="lib"&&b.dataset.node!==undefined){libNode=b.dataset.node;document.querySelectorAll("#lib-node .chip").forEach(x=>x.setAttribute("aria-pressed",x.dataset.v===libNode))}
  show(b.dataset.go);
  const sec=b.dataset.sec;
  if(sec==="me-special"){setTimeout(()=>$("me-special").scrollIntoView({behavior:"smooth",block:"start"}),80);return}
  if(sec==="tcard"){setTimeout(()=>$("tcard").scrollIntoView({behavior:"smooth",block:"start"}),60);return}
  if(sec==="mfold"){$("mfold").open=true;$("prof").hidden=true;$("prof-btn").click();setTimeout(()=>$("mfold").scrollIntoView({behavior:"smooth",block:"start"}),50);return}
  if(sec)setTimeout(()=>{const el=$(sec);if(el)(el.closest(".panel")||el).scrollIntoView({behavior:"smooth",block:"start"})},50);
});
function setMenuUser(name,role){
  $("dw-name").textContent=name||"내 기록";
  
  $("dw-role").textContent={admin:"관리자",coach:"코치"}[role]||"선수";
}

/* ===== 시작 ===== */
export function start(services){
  ({db,user,ai,dict,seedFn,consent,chat,legacy,account}=services);
  initTL({db,tlib:services.tlib,toast,md,uid:()=>uid,role:()=>(user.role?user.role():"player"),isEditor:()=>isEditor});
  return boot();
}
/* ===== 나이 확인 · 보호자 동의 =====
   보호자 동의: 모든 나라 만 14세 미만, 인도네시아·말레이시아는 만 18세 이하까지(서버 ageOf 와 같은 규칙) */
const legalHref=(doc,l)=>doc+(l&&l!=="ko"&&LANG_NAME[l]?"."+l:"")+".html";
const needsG=(a,c)=>a==="child"||(a==="teen"&&["ID","MY"].includes(c));
const LANG_OPTS=[["ko","한국어","ko-KR"],["en","English","en-US"],["ja","日本語","ja-JP"],["zh","简体中文","zh-CN"],["ms","Bahasa Melayu","ms-MY"],["id","Bahasa Indonesia","id-ID"]];
const LANG_NAME=Object.fromEntries(LANG_OPTS.map(x=>[x[0],x[1]]));
const guessLang=()=>{const n=(navigator.language||"ko").toLowerCase().slice(0,2);return LANG_NAME[n]?n:"ko"};
const guessCountry=()=>{const l=(navigator.language||"").toUpperCase(),m=l.split("-")[1];const map={KR:"KR",US:"US",JP:"JP",CN:"CN",MY:"MY",ID:"ID"};if(map[m])return map[m];return {KO:"KR",JA:"JP",ZH:"CN",MS:"MY",ID:"ID",IN:"ID"}[l.slice(0,2)]||"KR"};
let consent=null;
async function gate(){
  if(!consent)return true;
  let s;try{s=await consent.status()}catch(_){return true}
  if(s.staff){loadGuardQ();return true}
  if(s.ageBand&&(!s.guardianNeeded||s.guardianVerified)&&(s.country!=="CN"||s.xb))return true;
  $("consent").hidden=false;document.body.style.overflow="hidden";
  const wait=()=>{$("cs-form").hidden=true;$("cs-wait").hidden=false;$("cs-h").textContent="거의 다 됐어요";say($("g-cs"),"보호자 확인이 끝나면 바로 같이 시작해요. 조금만 기다려 주세요.",{now:true,who:"logan",motion:"guide"})};
  if(s.ageBand&&s.guardianNeeded&&!s.guardianVerified){wait();return false}
  say($("g-cs"),"반가워요, 로건이에요. 안전하게 쓰려고 나이만 먼저 여쭤볼게요.",{now:true,who:"logan"});
  return new Promise(done=>{
    document.querySelectorAll('#cs-form a[href^="terms"],#cs-form a[href^="privacy"]').forEach(a=>{a.href=legalHref(a.getAttribute("href").startsWith("terms")?"terms":"privacy",guessLang())});
    if(!$("cs-country").dataset.set){$("cs-country").value=guessCountry();$("cs-country").dataset.set=1}
    const sync=()=>{const a=$("cs-form").age.value,c=$("cs-country").value;$("cs-guard").hidden=!needsG(a,c);$("cs-xb-row").hidden=c!=="CN"};sync();
    $("cs-form").addEventListener("change",sync);
    $("cs-form").addEventListener("submit",async e=>{
      e.preventDefault();const err=$("cs-err");err.textContent="";
      const age=$("cs-form").age.value;
      if(!age){err.textContent="나이를 골라 주세요.";return}
      let guardian=null;
      const country=$("cs-country").value||"KR";
      if(needsG(age,country)){
        guardian={name:$("cs-gname").value.trim(),relation:$("cs-grel").value,phone:$("cs-gphone").value.trim()};
        if(!guardian.name||!guardian.relation||!/^[0-9+\- ]{9,}$/.test(guardian.phone)){err.textContent="보호자 이름, 관계, 연락처를 모두 적어 주세요.";return}
        if(!$("cs-gok").checked){err.textContent="보호자 동의에 체크해 주세요.";return}
      }
      if(country==="CN"&&!$("cs-xb").checked){err.textContent="중국에서 쓰려면 국외 이전·민감정보 동의가 필요해요.";return}
      if(!$("cs-ok").checked){err.textContent="안내 내용에 동의해 주세요.";return}
      try{await consent.submit({ageBand:age,country,lang:guessLang(),xb:country==="CN",guardian})}catch(_){err.textContent="저장하지 못했습니다. 다시 눌러 주세요.";return}
      if(needsG(age,country)){wait();return}
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
  if(!confirm(T("보호자께 직접 연락해 동의를 확인하셨나요?")))return;
  b.disabled=true;try{await consent.verify(b.dataset.verify);toast("승인했습니다");loadGuardQ()}catch(_){b.disabled=false;toast("승인하지 못했습니다")}
});
async function boot(){
  if(!(await gate()))return;
  renderChart();
  /* 계정 언어와 화면 언어가 다르면 한 번 맞추고 다시 연다 */
  {const ul=(user.info&&user.info().lang)||"";if(ul&&ul!==(window.AP_LANG||"ko")&&!sessionStorage.getItem("ap-lang-sync")){try{localStorage.setItem("ap-lang",ul);sessionStorage.setItem("ap-lang-sync","1");location.reload();return}catch(_){}}}
  if(dict&&dict.setLang)dict.setLang(speakLang());
  setupMic();fillSpeak();
  try{isEditor=!!(await user.canEdit())}catch(_){}
  setRole();
  uid=await user.id();
  const me=await user.me();$("who").textContent=(me&&me.name)||"내 기록";setMenuUser(me&&me.name,user.role?user.role():"");
  try{const p=await db.doc("players/"+uid).get();if(p.exists){profileExists=true;const v=p.data();profile={level:v.level||"A",goal:v.goal||""}}}catch(e){}
  await loadStatement();
  if(!stmt.bio)await askBio();
  await loadCoaches();
  await loadLessons();
  await loadTrainings();
  await loadMandala();
  await loadDay();
  myRxItems(uid).then(x=>{rxPool=x}).catch(()=>{});
  apPracticeItems().then(x=>{apPool=x}).catch(()=>{});
  let gotLib=false;const lt=setTimeout(()=>{if(!gotLib)$("lib-list").innerHTML='<div class="empty">라이브러리를 아직 불러오지 못했습니다. 연결이 느릴 수 있습니다.</div>'},10000);
  db.collection("library").onSnapshot(snap=>{gotLib=true;clearTimeout(lt);lib=snap.docs.map(d=>({id:d.id,...d.data()}));if(!$("v-lib").hidden)renderLib();if(!$("v-train").hidden){renderMandalaAP();renderPlan()}if(!$("v-ask").hidden)renderTalkQ()},()=>{clearTimeout(lt)});
  renderChart();
  show("ask");
  loadViewers().then(handleInvite);
  $("dp-tab").hidden=false;
  await loadChat();
}

/* ===== 밀로(두더지 길잡이): ? 버튼에서 장소의 이름 → 의미 → 할 수 있는 일 ===== */
const MILO_HELP={
  tree:{title:"레거시 나무",meaning:"코치와 선수들이 남긴 레슨 포인트가 잎으로 쌓이는 모두의 나무야. 내 진척도가 아니라 골프 지식이 모이는 곳이지.",action:"열매(N1~N8)를 누르면 그 영역에 쌓인 레슨과 누가 남겼는지 볼 수 있어."},
  logan:{title:"말하기 · 코치님 레슨",meaning:"코치님 레슨을 말이나 글로 남기는 곳이야. 위에서 '내 얘기'로 바꾸면 내 고민도 같은 곳에 남길 수 있어.",action:"정리하기를 누르면 문제·해법·할 훈련이 카드 한 장으로 나와. 저장하면 오늘의 훈련에 들어가.",goLabel:"말하러 가기",onGo:()=>{recMode="coach";show("lesson")}},
  rook:{title:"말하기 · 내 얘기",meaning:"지금 겪는 고민을 남기는 곳이야. 어떤 샷인지, 공이 어떻게 가는지, 언제 심한지를 고르기만 하면 돼.",action:"문제·해법·할 훈련이 바로 나오고, 저장하면 오늘의 훈련에 들어가.",goLabel:"내 얘기 하러 가기",onGo:()=>show("dx")},
  daryl:{title:"데릴 · 오늘의 훈련",meaning:"오늘 할 훈련을 같이 짜는 곳이야. '바로 짜 줘'나 '얘기하면서 짜자'를 고르면 돼.",action:"레슨·내 얘기·코치 처방·배틀플랜에서 오늘 할 것만 모아 줘. 만다라트와 배틀플랜은 아래에 접혀 있어.",goLabel:"오늘의 훈련으로",onGo:()=>show("train")},
  paco:{title:"파코 · 했어요",meaning:"연습이 끝나면 어땠는지 듣는 친구야.",action:"오늘의 훈련 아래에서 맞았어요·그대로예요·잘 모르겠어요 중 하나만 고르면 다음 연습을 맞춰 줘.",goLabel:"오늘의 훈련으로",onGo:()=>show("train")},
  ask:{title:"오늘의 대화",meaning:"하루를 시작하는 곳이야. 말하기와 오늘의 훈련으로 바로 가고, 크루에게 물어볼 수도 있어.",action:"크루는 내 기록을 근거로 답해. 하루 10번까지 물을 수 있고, 기록에 없는 내용은 'AI 추정'으로 표시돼."}
};
(function startMilo(){if(!window.MiloHelp)return setTimeout(startMilo,150);window.MiloHelp.mount({root:document,assetUrl:"img/milo.webp",help:MILO_HELP})})();

/* ===== 나의 스테이트먼트 (골퍼의 기본 캐릭터) =====
   입력은 글이 아니라 밀어서 고르기(슬라이더)와 누르기(칩). 기본 바이오는 처음 로그인 때 필수, 6개 영역은 천천히.
   저장: players/{uid}/statement/current. 크루는 참고, 만다라트·배틀플랜은 약한 영역을 먼저 챙긴다. 판정은 레슨 기록과 코치 말이 먼저. */
const SL={}; // 슬라이더 설정: id → {min,max,step,fmt}
function slider(id,cfg,val){SL[id]=cfg;const has=val!==null&&val!==undefined&&val!=="";const v=has?Number(val):cfg.start??Math.round((cfg.min+cfg.max)/2);
  return `<div class="sl" data-sl="${id}"><div class="sl-top"><b class="sl-v">${has?esc(cfg.fmt(v)):`<span class="hint">밀어서 고르기</span>`}</b><button type="button" class="sl-x" data-sl-clear ${has?"":"hidden"}>모름</button></div>
    <input type="range" min="${cfg.min}" max="${cfg.max}" step="${cfg.step||1}" value="${v}" data-touched="${has}" aria-label="${esc(cfg.label||id)}"></div>`}
const slVal=(root,id)=>{const w=root.querySelector(`[data-sl="${id}"] input`);return w&&w.dataset.touched==="true"?Number(w.value):null};
function chipsHTML(name,opts,on=[],multi=false){return `<div class="chips" data-pick="${name}" data-multi="${multi}">${opts.map(o=>`<button type="button" class="chip" data-v="${esc(o)}" aria-pressed="${on.includes(o)}">${esc(o)}</button>`).join("")}</div>`}
const picked=(root,name)=>[...root.querySelectorAll(`[data-pick="${name}"] .chip[aria-pressed="true"]`)].map(c=>c.dataset.v);
document.addEventListener("input",e=>{const w=e.target.closest(".sl input");if(!w)return;const box=w.closest(".sl"),c=SL[box.dataset.sl];w.dataset.touched="true";box.querySelector(".sl-v").textContent=c.fmt(Number(w.value));box.querySelector("[data-sl-clear]").hidden=false});
document.addEventListener("click",e=>{
  const x=e.target.closest("[data-sl-clear]");if(x){const box=x.closest(".sl");box.querySelector("input").dataset.touched="false";box.querySelector(".sl-v").innerHTML=`<span class="hint">밀어서 고르기</span>`;x.hidden=true;return}
  const c=e.target.closest("[data-pick] .chip");if(c){const g=c.parentElement;if(g.dataset.multi==="true")c.setAttribute("aria-pressed",c.getAttribute("aria-pressed")!=="true");else g.querySelectorAll(".chip").forEach(b=>b.setAttribute("aria-pressed",b===c&&c.getAttribute("aria-pressed")!=="true"))}
});
const BIO=[
  {k:"years",l:"구력",min:0,max:40,start:3,fmt:v=>v===0?"1년 미만":v+"년"},
  {k:"age",l:"나이 (만)",min:7,max:80,start:16,fmt:v=>v+"세"},
  {k:"gender",l:"성별",pick:["남","여","선택 안 함"]},
  {k:"score",l:"평균 타수",min:62,max:130,start:90,fmt:v=>"평균 "+v+"타",key:"handicap"},
  {k:"pweek",l:"연습 횟수",min:0,max:7,start:3,fmt:v=>v===0?"거의 안 함":"주 "+v+"회"},
  {k:"phours",l:"연습 1회 시간",min:0.5,max:6,step:0.5,start:2,fmt:v=>"회당 "+v+"시간"},
  {k:"rounds",l:"플레이 빈도",min:0,max:20,start:2,fmt:v=>v===0?"거의 안 나감":"월 "+v+"라운드",key:"play"},
];
const BIO_SHOW=[["years","구력"],["age","나이"],["gender","성별"],["handicap","평균 타수"],["practice","훈련량"],["play","플레이 빈도"]];
function bioFields(b={}){const n=b.num||{};return BIO.map(f=>`<div class="fld bio-f"><span>${f.l}</span>${f.pick?chipsHTML("b-"+f.k,f.pick,b[f.k]?[b[f.k]]:[]):slider("b-"+f.k,{...f,label:f.l},n[f.k])}</div>`).join("")}
function readBio(root){const num={};BIO.forEach(f=>{if(!f.pick)num[f.k]=slVal(root,"b-"+f.k)});const g=picked(root,"b-gender")[0]||"";const F=k=>BIO.find(x=>x.k===k).fmt;
  const ok=k=>num[k]!==null;return {num,years:ok("years")?F("years")(num.years):"",age:ok("age")?F("age")(num.age):"",gender:g,handicap:ok("score")?F("score")(num.score):"",
    practice:ok("pweek")&&ok("phours")?F("pweek")(num.pweek)+" · "+F("phours")(num.phours):"",play:ok("rounds")?F("rounds")(num.rounds):""}}
const bioMissing=b=>BIO_SHOW.filter(([k])=>!b[k]).map(([,l])=>l);
const AREAS=[
  {k:"mental",n:"멘탈",ic:"bulb",pillar:"mind",note:"정식 멘탈 테스트 문항지가 준비되면 이 칸이 문항지로 바뀝니다.",
   items:[{k:"tension",l:"긴장 조절 (평소·시합)"},{k:"attention",l:"주의력 (지금 샷에 집중)"},{k:"focus",l:"집중 지속 (18홀 내내)"},{k:"body",l:"압박 때 몸의 변화 조절",mc:["손이 떨림","호흡이 빨라짐","심장이 두근거림","몸이 굳음","별 변화 없음"],multi:true}]},
  {k:"short",n:"숏게임",ic:"flag",pillar:"short",
   items:[{k:"pitch",l:"피치샷",mv:{min:10,max:100,step:5,u:"m",lab:"자신 있는 거리"}},{k:"chip",l:"칩샷"},{k:"scramble",l:"스크램블 능력",mv:{min:0,max:100,step:5,u:"%",lab:"파 세이브율"}},{k:"skills",l:"스킬스 (벙커·로브 등)"}]},
  {k:"shot",n:"샷",ic:"ball",pillar:"drive",
   items:[{k:"driver",l:"드라이버",mv:{min:100,max:320,step:5,u:"m",lab:"평균 비거리"}},{k:"iron",l:"아이언샷",mv:{min:60,max:200,step:5,u:"m",lab:"7번 아이언 거리"}},{k:"shape",l:"샷셰이핑 능력 (구질)",mc:["스트레이트","드로우","페이드","훅","슬라이스"],mlab:"주 구질"}]},
  {k:"physical",n:"피지컬",ic:"glove",pillar:"body",
   items:[{k:"rom",l:"가동범위"},{k:"strength",l:"근력"},{k:"endurance",l:"근지구력"},{k:"agility",l:"민첩성"},{k:"power",l:"파워"}]},
  {k:"course",n:"코스 매니지먼트",ic:"cart",pillar:"course",
   items:[{k:"club",l:"클럽 선택"},{k:"strategy",l:"코스 공략"},{k:"adapt",l:"코스 적응력"}]},
  {k:"fitting",n:"클럽 피팅 (머터리얼)",ic:"bag",rate:false,
   items:[{k:"weight",l:"드라이버 무게",mv:{min:250,max:380,step:5,u:"g"}},{k:"flex",l:"샤프트 강도",mc:["L","A","R","SR","S","X"]},{k:"speed",l:"스윙 스피드",mv:{min:25,max:60,step:1,u:"m/s"}},{k:"spin",l:"드라이버 스핀량",mv:{min:1500,max:4500,step:100,u:"rpm"}},{k:"fitted",l:"피팅 받은 적",mc:["있음","없음"]}]},
];
const RATE=["","많이 부족","부족","보통","좋음","강점"];
let stmt={},meOpen="";
async function loadStatement(){try{const d=await db.doc("players/"+uid+"/statement/current").get();stmt=d.exists?d.data():{}}catch(_){stmt={}}}
async function saveStatement(){stmt.updatedAt=new Date().toISOString();await db.doc("players/"+uid+"/statement/current").set(stmt)}
function askBio(){
  const ov=$("bio-ov"),form=$("bio-form");ov.hidden=false;document.body.style.overflow="hidden";
  form.innerHTML=bioFields(stmt.bio||{})+`<p class="status err" id="bio-err" aria-live="polite"></p><button class="btn gold" type="submit">저장하고 다음으로</button>`;
  say($("g-bio"),"반가워요, 루크예요. 글은 안 써도 돼요. 밀어서 고르기만 하면 1분이면 끝나요.",{now:true,who:"rook"});
  return new Promise(done=>{form.onsubmit=async e=>{e.preventDefault();const b=readBio(form),err=$("bio-err");
    const miss=bioMissing(b);if(miss.length){err.textContent="아직 고르지 않았어요: "+miss.join(", ");return}
    stmt.bio=b;try{await saveStatement()}catch(_){err.textContent="저장하지 못했습니다. 다시 눌러 주세요.";return}
    ov.hidden=true;document.body.style.overflow="";done()}});
}
function areaDone(a){const v=(stmt.areas||{})[a.k]||{};return a.items.filter(i=>{const x=v[i.k]||{};return x.v||x.m}).length}
function areaAvg(a){const v=(stmt.areas||{})[a.k]||{};const r=a.items.map(i=>(v[i.k]||{}).v).filter(x=>x>0);return r.length?r.reduce((s,x)=>s+x,0)/r.length:null}
function itemHTML(a,i,x){
  const rate=a.rate===false?"":slider(`r-${a.k}-${i.k}`,{min:1,max:5,start:3,fmt:v=>v+" · "+RATE[v],label:i.l},x.v||null);
  const mOn=x.m?String(x.m).split(" · "):[];
  const meas=i.mv?`<div class="fld"><small>${esc(i.mv.lab||"측정값")} <span class="hint">아는 경우만</span></small>${slider(`m-${a.k}-${i.k}`,{...i.mv,fmt:v=>v+i.mv.u,label:i.l},x.mn??null)}</div>`
    :i.mc?`<div class="fld"><small>${esc(i.mlab||(a.rate===false?"":"해당하는 것"))}</small>${chipsHTML(`c-${a.k}-${i.k}`,i.mc,mOn,!!i.multi)}</div>`:"";
  return `<div class="me-item"><div class="t-head"><b>${esc(i.l)}</b>${x.coach?`<span class="pill ok">코치 확인</span>`:`<span class="pill">자기평가</span>`}</div>${rate}${meas}</div>`;
}
function renderMe(){
  renderYips();
  if(!$("me-bio"))return;const b=stmt.bio||{};
  $("me-bio").innerHTML=`<div class="panel"><div class="t-head"><span class="eyebrow"><b>B</b>기본 바이오</span><button class="btn sm" type="button" id="me-bio-edit">고치기</button></div>
    <div class="bio-grid">${BIO_SHOW.map(([k,l])=>`<div><small>${l}</small><b>${esc(b[k]||"—")}</b></div>`).join("")}</div>
    <form id="me-bio-form" class="me-bio-form" hidden></form></div>`;
  $("me-areas").innerHTML=AREAS.map(a=>{const n=areaDone(a),open=meOpen===a.k,v=(stmt.areas||{})[a.k]||{},avg=areaAvg(a);
    return `<div class="panel me-area${open?" open":""}"><button type="button" class="me-head" data-area="${a.k}" aria-expanded="${open}">
      <img src="img/icons3d/${a.ic}.webp" alt="" width="40" height="40"><span><b>${a.n}</b><small>${n}/${a.items.length} 작성${avg?` · 평균 ${avg.toFixed(1)}`:""}</small></span><i class="bar"><i style="width:${Math.round(n/a.items.length*100)}%"></i></i></button>
      ${open?`<form class="me-form" data-form="${a.k}">${a.note?`<p class="notice" style="margin:0">${a.note}</p>`:""}
        ${a.items.map(i=>itemHTML(a,i,v[i.k]||{})).join("")}
        <div class="actions"><button class="btn gold" type="submit">저장</button></div></form>`:""}</div>`}).join("");
}
$("v-me").addEventListener("click",e=>{
  const h=e.target.closest("[data-area]");if(h){meOpen=meOpen===h.dataset.area?"":h.dataset.area;renderMe();return}
  if(e.target.id==="me-bio-edit"){const f=$("me-bio-form");f.hidden=!f.hidden;if(!f.hidden)f.innerHTML=bioFields(stmt.bio||{})+`<p class="status err" id="me-bio-err"></p><div class="actions"><button class="btn gold" type="submit">저장</button></div>`}
});
$("v-me").addEventListener("submit",async e=>{
  const f=e.target;if(f.id==="yips-form")return;e.preventDefault();
  if(f.id==="me-bio-form"){const b=readBio(f),miss=bioMissing(b);if(miss.length){$("me-bio-err").textContent="아직 고르지 않았어요: "+miss.join(", ");return}stmt.bio=b}
  else{const k=f.dataset.form,a=AREAS.find(x=>x.k===k),o={};
    a.items.forEach(i=>{const v=a.rate===false?0:(slVal(f,`r-${k}-${i.k}`)||0);let m="",mn=null;
      if(i.mv){mn=slVal(f,`m-${k}-${i.k}`);m=mn===null?"":String(mn)}else if(i.mc){m=picked(f,`c-${k}-${i.k}`).join(" · ")}
      if(v||m)o[i.k]={l:i.l,v,m,mn,u:i.mv?i.mv.u:"",coach:false}});
    stmt.areas={...(stmt.areas||{}),[k]:{...o,_n:a.n,_at:new Date().toISOString()}};meOpen=""}
  try{await saveStatement();toast("저장했어요");renderMe()}catch(_){toast("저장하지 못했습니다")}
});
MILO_HELP.me={title:"나의 스테이트먼트",meaning:"지금의 나를 남겨 두는 곳이야. 기본 바이오와 멘탈·숏게임·샷·피지컬·코스·클럽 피팅 6개 영역이 있어. 메뉴의 '내 계정'에 있어.",action:"한꺼번에 채울 필요 없어. 오늘의 대화에서 루크가 하루에 하나씩 물어봐. 약한 영역은 오늘의 훈련이 먼저 챙겨."};

/* ===== AI 훈련 카드 (데릴의 훈련장) =====
   선수 기록 확인 → 오늘의 훈련 제안 → 수정·적용 → 결과 확인 → 다음 훈련.
   제안·내부 연결·검토는 서버가 만든다(players/{uid}/trainings). 화면에는 내부 코드·가설 용어를 보이지 않는다.
   AI 원안(proposal)은 그대로 두고, 고친 내용은 adjustments 에, 실제 수행은 runs 에 덧붙인다. */
let trainings=[],tBusy=false,tMode="",tStart=0,tStop=false;
const T_TASK={Shot:"샷",Putt:"퍼트",Approach:"어프로치"};
const T_TRIG={Shot:{visual:["어려운 홀","도그렉","경사"],situation:["버디 찬스","파세이브","경쟁"],club:["드라이버","우드","유틸","롱아이언","숏아이언"]},
  Putt:{visual:["숏퍼트","롱퍼트","라이 난이도","거리감"],situation:["버디 찬스","파세이브","경쟁"]},
  Approach:{visual:["거리감","라이 난이도","그린 난이도","내리막","오르막","포대그린"],situation:["파세이브","경쟁"]}};
const T_PRES={Single:"한 가지 상황",Composite:"여러 상황 함께",Random:"불규칙(무작위)"};
/* 순서표: 조건마다 2개씩 번갈아(기본) 또는 조건별로 묶어서. 서버(training.js schedule)와 같은 규칙 */
function tSchedule(order,reps,mode){if(mode==="blocked")return order.flatMap(k=>Array(reps).fill(k));const left=Object.fromEntries(order.map(k=>[k,reps])),out=[];let rot=[...order];
  while(Object.values(left).some(x=>x>0)){for(const k of rot){const n=Math.min(2,left[k]);for(let i=0;i<n;i++)out.push(k);left[k]-=n}rot=[...rot.slice(1),rot[0]]}return out}
function tScheduleText(cur){const s=cur.setup,sc=s.schedule||[];if(!sc.length)return "";const lab=k=>{const c=cur.conditions.find(x=>x.key===k);return c?c.label.replace("압박 상황 + 준비 순서 유지","준비 순서 유지"):k};
  const g=[];sc.forEach(k=>{const l=g[g.length-1];if(l&&l.k===k)l.n++;else g.push({k,n:1})});
  return `<details class="tc-order"><summary class="hint">${s.orderMode==="blocked"?"조건별로 묶어서 하는 순서":"번갈아 하는 순서표 (조건마다 2개씩 돌아가며)"}</summary><div class="tc-conds">${g.map((x,i)=>`<span class="pill">${i+1}. ${esc(lab(x.k))} ×${x.n}</span>`).join("")}</div></details>`}
const T_UNIT={Shot:"m",Putt:"cm",Approach:"m"};
const T_FEEL=[["pressure","압박감","상황이 얼마나 부담스러웠나"],["anxiety","불안","잘못될까 걱정됐나"],["tension","몸의 긴장","어깨·손에 힘이 들어갔나"]];
const myRole=()=>{try{return user&&user.role?user.role()||"player":"player"}catch(_){return "player"}};
const sameDay=(iso)=>iso&&new Date(iso).toDateString()===new Date().toDateString();
async function loadTrainings(){
  if(!db||!uid){trainings=[];return}
  try{const s=await db.collection("players/"+uid+"/trainings").get();trainings=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""))}catch(_){trainings=[]}
}
function tState(t){
  if(t.status==="applied"){const ap=(t.events||[]).filter(e=>e.action==="applied").slice(-1)[0];return sameDay(ap&&ap.at)?"진행 중":"결과 미입력"}
  return {proposed:"제안",skipped:"미수행",stopped:"중단",done:"결과 입력됨"}[t.status]||""
}
function condLabel(c,s){
  if(!(s.trigger&&c.perceived))return c.label;
  const tg=[...(s.trigger.situation||[]),...(s.trigger.visual||[])].join("·");
  return tg?c.label.replace("압박 상황",`압박 상황(${tg})`):c.label;
}
function condsOf(cur){return (cur.setup.order||cur.conditions.map(c=>c.key)).map(k=>cur.conditions.find(c=>c.key===k)).filter(Boolean)}
function tCardHTML(t){
  const cur=t.current||t.proposal,c=cur.card,s=cur.setup,ev=(t.internal&&t.internal.evidence)||[];
  const meta=[T_TASK[s.task],s.distance,s.slope,s.club,`조건마다 ${s.reps}번`,s.trigger&&s.presentation&&s.presentation!=="Single"?T_PRES[s.presentation]+(s.randomTarget?` · 바꾸는 것: ${s.randomTarget}`:""):""].filter(Boolean).join(" · ");
  return `<div class="tc-sec"><h4>오늘의 목표</h4><p>${esc(c.goal)}</p></div>
  <div class="tc-sec"><h4>추천 훈련</h4><p>${esc(c.drill)}</p></div>
  <div class="tc-sec"><h4>진행 방법</h4><p class="hint">${esc(meta)}</p>${s.otherDay?`<p class="notice" style="margin:0">오늘이 아닌 다른 날 해 주세요. 하루 지나서도 유지되는지 보는 훈련이에요.</p>`:""}
    <div class="tc-conds">${condsOf(cur).map((x,i)=>`<span class="pill">${i+1}. ${esc(condLabel(x,s))}</span>`).join("")}</div>
    ${tScheduleText(cur)}
    <ol class="tc-steps">${(c.steps||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
    <p class="hint" style="margin:0"><b>성공으로 세는 기준</b> · ${esc(s.success)}</p></div>
  <div class="tc-sec"><h4>체크 포인트</h4><div class="chips">${(c.checks||[]).map(x=>`<span class="chip static">${esc(x)}</span>`).join("")}</div></div>
  <details class="tc-why"><summary>추천 이유</summary>${c.why?`<p>${esc(c.why)}</p>`:""}${(c.unknowns||[]).length?`<p class="hint">아직 모르는 것: ${esc(c.unknowns.join(" · "))}</p>`:""}
    <p class="hint">${ev.length?"근거: "+esc(ev.map(e=>md(e.date)+" "+(e.coach||"코치 미기재")+" 레슨").join(", ")):"레슨 기록이 충분하지 않아 현재 수행부터 확인해요."} · AI가 만든 제안이에요. 코치님 판단이 먼저예요.</p></details>
  ${t.compat&&t.compat.ok===false?`<div class="notice">${esc((t.compat.notes||[]).join(" "))}</div>`:""}`;
}
function tResultSummary(t){
  const run=(t.runs||[]).slice(-1)[0],cur=t.current||t.proposal;if(!run)return "";
  if(run.stopped)return `<p>${esc(md(run.at.slice(0,10)))} · ${esc(run.stopped)}(으)로 중단했어요. 완료나 실패로 세지 않아요.</p>`;
  return `<div class="tc-res">${condsOf(cur).map(c=>{const r=run.results[c.key]||{};const f=r.perceived?[...T_FEEL.map(([k,l])=>`${l} ${r.perceived[k]===null||r.perceived[k]===undefined?"미측정":r.perceived[k]}`),`상황 해석 ${r.perceived.appraisal||"미측정"}`].join(" · "):"";
    return `<div><b>${esc(condLabel(c,cur.setup))}</b><span>${r.made}/${r.tries}${r.err!==null&&r.err!==undefined?` · 오차 ${r.err}${esc(cur.setup.errUnit||"")}`:""}${r.routine!==null&&r.routine!==undefined?` · ${esc(c.track)} ${r.routine}`:""}</span>${f?`<small>${esc(f)}</small>`:""}</div>`}).join("")}</div>
  <p class="hint" style="margin:0">${esc([run.distance,run.club,run.orderMode==="blocked"||run.orderFollowed===false?"조건별로 묶어서 진행":"번갈아 진행",run.source].filter(Boolean).join(" · "))}</p>
  ${run.sameSetup===false?`<p class="hint">조건마다 거리·경사·클럽이 달랐다고 기록했어요.</p>`:""}`;
}
function tEditHTML(t){
  const cur=t.current||t.proposal,c=cur.card,s=cur.setup,tr=T_TRIG[s.task]||T_TRIG.Putt;
  const chipset=(name,opts,on,multi=true)=>`<div class="chips" data-chips="${name}" data-multi="${multi}">${opts.map(o=>`<button type="button" class="chip" data-v="${esc(o)}" aria-pressed="${on.includes(o)}">${esc(T_PRES[o]||o)}</button>`).join("")}</div>`;
  return `<form class="tc-edit" id="tc-edit">
    <p class="hint" style="margin:0">고쳐도 AI가 처음 낸 제안은 그대로 남고, 고친 내용으로 진행해요.</p>
    <label class="fld">오늘의 목표<input name="goal" maxlength="200" value="${esc(c.goal)}"></label>
    <label class="fld">추천 훈련<textarea name="drill" rows="2" maxlength="400">${esc(c.drill)}</textarea></label>
    <label class="fld">진행 방법 <span class="hint">한 줄에 하나</span><textarea name="steps" rows="5">${esc((c.steps||[]).join("\n"))}</textarea></label>
    <label class="fld">체크 포인트 <span class="hint">· 로 구분</span><input name="checks" value="${esc((c.checks||[]).join(" · "))}"></label>
    <label class="fld">성공으로 세는 기준<input name="success" maxlength="120" value="${esc(s.success)}"></label>
    <div class="row3"><label class="fld">거리<input name="distance" maxlength="40" value="${esc(s.distance)}"></label><label class="fld">경사·라이<input name="slope" maxlength="40" value="${esc(s.slope)}"></label><label class="fld">클럽<input name="club" maxlength="30" value="${esc(s.club)}"></label></div>
    <label class="fld">조건마다 반복 수<input name="reps" inputmode="numeric" value="${esc(s.reps)}"></label>
    ${s.trigger?`<div class="fld">압박 상황 · 상황 조건${chipset("situation",tr.situation,s.trigger.situation||[])}</div>
      <div class="fld">압박 상황 · 보이는 조건${chipset("visual",[...tr.visual,...(tr.club||[])],s.trigger.visual||[])}</div>
      <div class="fld">제시 방식${chipset("presentation",["Single","Composite","Random"],[s.presentation||"Single"],false)}</div>
      <div class="fld">불규칙일 때 바꾸는 것${chipset("randomTarget",["유발조건","클럽","과제"],[s.randomTarget||"유발조건"],false)}</div>`:""}
    <div class="fld">진행 순서${chipset("orderMode",["interleaved","blocked"],[s.orderMode||"interleaved"],false).replace(">interleaved<",">번갈아 (권장)<").replace(">blocked<",">조건별로 묶어서<")}</div>
    <div class="actions"><button class="btn gold" type="submit">고친 내용으로 저장</button><button class="btn" type="button" data-t="cancel">취소</button></div></form>`;
}
function tRunHTML(t){
  const cur=t.current||t.proposal,s=cur.setup,u=s.errUnit||T_UNIT[s.task]||"";
  const feel=(k)=>T_FEEL.map(([f,l,h])=>`<div class="tr-feel"><span>${l}<small>${h}</small></span><div class="chips pchips" data-feel="${k}.${f}">${[0,1,2,3,4,5].map(n=>`<button type="button" class="chip" data-v="${n}" aria-pressed="false">${n}</button>`).join("")}<button type="button" class="chip" data-v="" aria-pressed="true">미측정</button></div></div>`).join("")
    +`<div class="tr-feel"><span>상황을 어떻게 받아들였나<small>해 볼 만했다(도전) · 겁났다(위협) · 둘 다 · 별 느낌 없음</small></span><div class="chips pchips" data-feel="${k}.appraisal" data-text="1">${[["도전","해 볼 만했다"],["위협","겁났다"],["혼합","둘 다"],["중립","별 느낌 없음"]].map(([v,l])=>`<button type="button" class="chip" data-v="${v}" aria-pressed="false">${l}</button>`).join("")}<button type="button" class="chip" data-v="" aria-pressed="true">미측정</button></div></div>`;
  return `<form class="tc-run" id="tc-run">
    ${condsOf(cur).map((c,i)=>`<fieldset class="tr-c" data-k="${c.key}"><legend>${i+1}. ${esc(condLabel(c,s))}</legend>
      <div class="row3"><label class="fld">성공<input data-f="made" inputmode="numeric" required></label><label class="fld">시도<input data-f="tries" inputmode="numeric" value="${esc(s.reps)}"></label><label class="fld">목표 오차 평균 (${u}) <span class="hint">선택</span><input data-f="err" inputmode="decimal"></label></div>
      ${c.track?`<label class="fld">${esc(c.track)} <span class="hint">선택</span><input data-f="routine" inputmode="numeric"></label>`:""}
      ${c.perceived?`<div class="fld">선수가 느낀 부담 (0 없음 ~ 5 매우 큼, AP 운영 척도) <span class="hint">묻지 않았으면 '미측정' 그대로</span>${feel(c.key)}</div>`:""}
      <details><summary class="hint">각 시도 오차 적기 (선택)</summary><label class="fld">시도마다 오차 (${u}), 쉼표로<input data-f="errs" placeholder="예: 30, 45, 20"></label></details></fieldset>`).join("")}
    ${s.presentation==="Random"?`<label class="fld">실제로 한 순서와 상황<input id="tr-order" maxlength="200" placeholder="예: 평소 → 파세이브(롱퍼트) → 준비 순서 유지(숏퍼트)"></label>`:""}
    ${s.presentation==="Random"?`<p class="hint" style="margin:0">계획한 조건: ${esc([...((s.trigger||{}).situation||[]),...((s.trigger||{}).visual||[])].join(" · "))} · 바꾸는 것: ${esc(s.randomTarget||"유발조건")}</p>`:""}
    <div class="row3"><label class="fld">실제 거리<input id="tr-dist" maxlength="40" value="${esc(s.distance||"")}"></label><label class="fld">실제 사용 클럽<input id="tr-club" maxlength="30" value="${esc(s.task==="Putt"?"퍼터":s.club||"")}" ${s.task==="Putt"?"readonly":""}></label><span></span></div>
    ${(s.schedule||[]).length&&s.orderMode!=="blocked"?`<label class="ck-line"><input type="checkbox" id="tr-order-ok" checked> 순서표대로 번갈아 했어요</label>`:""}
    <label class="ck-line"><input type="checkbox" id="tr-same" checked> 모든 조건을 같은 거리·경사·클럽으로 했어요</label>
    <label class="fld">누가 확인했나요<select id="tr-src"><option value="선수 보고">내가 직접 셌어요</option><option value="코치 관찰">코치님이 보셨어요</option><option value="장비 측정">장비로 쟀어요</option></select></label>
    <label class="fld">메모 <span class="hint">선택</span><input id="tr-memo" maxlength="200"></label>
    <p class="status err" id="tr-err" aria-live="polite"></p>
    <div class="actions"><button class="btn gold" type="submit">결과 저장</button><button class="btn" type="button" data-t="cancel">취소</button></div></form>`;
}
function renderTCard(){
  const box=$("tcard");if(!box)return;if(!uid){box.innerHTML="";return}
  const t=trainings[0];
  const head=(pills="")=>`<div class="t-head"><span class="eyebrow"><b>AI</b>오늘의 훈련 제안</span><span>${pills}</span></div>`;
  const stLine=`<p class="status" id="tc-st" role="status"></p>`;
  const hist=trainings.length>1?`<details class="tc-hist"><summary class="hint">지난 훈련 ${trainings.length-1}개</summary>${trainings.slice(1,11).map(x=>{const c=(x.current||x.proposal).card;return `<div class="tc-h"><span>${esc(md((x.createdAt||"").slice(0,10)))} · ${esc(c.goal)}</span><span class="pill">${esc(tState(x))}</span>${x.next?`<small>${esc(x.next.text)}</small>`:""}</div>`}).join("")}</details>`:"";
  if(!t||(["skipped","stopped"].includes(t.status)&&tMode!=="view")){
    const intro=!t?(lessons.length?"최근 레슨 기록을 바탕으로 오늘 할 훈련 하나를 제안해요.":"먼저 현재 수행을 확인한 뒤 다음 훈련을 맞추겠습니다.")
      :t.status==="stopped"?"지난 훈련은 중단으로 남겨 두었어요. 몸이 괜찮아지면 코치님과 상의한 뒤 새로 시작해요.":"지난 제안은 하지 않은 것으로 남겨 두었어요.";
    box.innerHTML=`<div class="panel tcard">${head()}<p style="margin:0">${intro}</p><div class="actions"><button class="btn gold" type="button" data-t="new">오늘의 훈련 제안 받기</button></div>${stLine}${hist}</div>`;return}
  const pills=`<span class="pill ${t.status==="done"?"ok":t.status==="applied"?"gold":""}">${tState(t)}</span> <span class="pill">${(t.adjustments||[]).length?"수정됨":"AI 제안"}</span>`;
  let main="",acts="";
  if(t.status==="proposed"){main=tMode==="edit"?tEditHTML(t):tCardHTML(t);
    if(tMode!=="edit")acts=`<button class="btn gold" type="button" data-t="apply">적용하기</button><button class="btn" type="button" data-t="edit">고치기</button><button class="btn" type="button" data-t="skip">이번엔 안 할래요</button>`}
  else if(t.status==="applied"){
    if(tMode==="edit")main=tEditHTML(t);
    else if(tMode==="run")main=tCardHTML(t).replace(/<details class="tc-why">[\s\S]*?<\/details>/,"")+`<h4 class="tc-h4">결과 확인</h4>`+tRunHTML(t);
    else{main=tCardHTML(t);acts=`<button class="btn gold" type="button" data-t="run">결과 입력하기</button><button class="btn" type="button" data-t="edit">고치기</button><button class="btn" type="button" data-t="stop">중단했어요 (통증·피로)</button>`}
    if(tStop)acts=`<div class="tc-stop"><p style="margin:0">어떤 이유로 멈췄나요? 그 동작은 쉬고 코치님과 상의해 주세요.</p><div class="chips">${["통증","과도한 피로","기타"].map(r=>`<button type="button" class="chip" data-t="stop-go" data-r="${r}">${r}</button>`).join("")}</div><button class="btn sm" type="button" data-t="stop-no">계속할게요</button></div>`;
  }else{
    const n=t.next;
    main=`<h4 class="tc-h4">결과 확인</h4>${tResultSummary(t)}
      <h4 class="tc-h4">다음 훈련</h4>${n?`<p>${esc(n.text)}</p>`:`<p class="hint">결과를 바탕으로 다음 훈련을 맞추는 중이 아니에요. 아래 버튼을 눌러 주세요.</p>`}
      <details class="tc-why"><summary>이번 훈련 다시 보기</summary>${tCardHTML(t)}</details>`;
    acts=!n?`<button class="btn gold" type="button" data-t="review">다음 훈련 맞추기</button>`:n.tpl?`<button class="btn gold" type="button" data-t="next">다음 훈련 제안 받기</button>`:`<button class="btn" type="button" data-t="new">새 훈련 제안 받기</button>`;
  }
  box.innerHTML=`<div class="panel tcard">${head(pills)}${main}${acts?`<div class="actions">${acts}</div>`:""}${stLine}${hist}</div>`;
}
const tErr=(e)=>{const m=(e&&(e.message||""))+" "+(e&&e.code||"");
  return /guardian-pending/.test(m)?"보호자 확인이 끝나면 훈련 제안을 받을 수 있어요.":/age-required/.test(m)?"나이 확인이 필요해요. 새로고침해 주세요.":/resource-exhausted/.test(m)?"오늘 훈련 제안 횟수를 다 썼어요. 내일 다시 받아 주세요.":/train-invalid/.test(m)?"이번에는 믿을 만한 제안을 만들지 못했어요. 레슨 기록은 그대로예요. 잠시 뒤 다시 눌러 주세요.":"제안을 받지 못했어요. 레슨 기록과 저장은 그대로예요. 잠시 뒤 다시 눌러 주세요."};
async function tUpdate(t,patch,ev){
  const upd={...patch,updatedAt:new Date().toISOString()};
  if(ev)upd.events=[...(t.events||[]),{at:upd.updatedAt,by:uid,role:myRole(),...ev}];
  await db.doc("players/"+uid+"/trainings/"+t.id).update(upd);Object.assign(t,upd);
}
async function tPropose(parent){
  if(tBusy)return;if(!ai){toast("로그인한 뒤에 받을 수 있어요");return}
  tBusy=true;const st=$("tc-st");if(st){st.className="status";st.innerHTML=`<div class="guide" id="g-tc"></div><div class="ld" aria-hidden="true"></div>`;say($("g-tc"),"레슨 기록을 보고 오늘 할 훈련을 맞추는 중이에요. 20초쯤 걸려요.",{now:true,who:"daryl",motion:"think"})}
  try{await ai(parent?{task:"train",parent}:{task:"train"});tMode="";await loadTrainings();renderTCard();
    say($("g-chart"),"오늘의 훈련을 준비했어요. 그대로 하거나, 코치님과 고쳐서 적용해 주세요.",{now:true,who:"daryl",motion:"point"})}
  catch(e){const s2=$("tc-st");if(s2){s2.className="status err";s2.textContent=tErr(e)}}
  finally{tBusy=false}
}
async function tReview(t){
  const st=$("tc-st");
  try{await ai({task:"train_review",id:t.id});await loadTrainings();tMode="";renderTCard()}
  catch(e){if(st){st.className="status err";st.textContent="결과는 저장했어요. 다음 훈련 맞추기는 아직 못 했어요. '다음 훈련 맞추기'를 다시 눌러 주세요."}renderTCard()}
}
$("tcard").addEventListener("click",async e=>{
  const ch=e.target.closest(".tc-edit .chip, .tc-run .chip");
  if(ch){e.preventDefault();const g=ch.parentElement;if(g.dataset.multi==="true")ch.setAttribute("aria-pressed",ch.getAttribute("aria-pressed")!=="true");else g.querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-pressed",c===ch));return}
  const b=e.target.closest("[data-t]");if(!b||tBusy)return;const a=b.dataset.t,t=trainings[0];
  try{
    if(a==="new"){tMode="";await tPropose(null);return}
    if(a==="next"){await tPropose(t.id);return}
    if(a==="review"){b.disabled=true;await tReview(t);return}
    if(a==="cancel"){tMode="";renderTCard();return}
    if(a==="edit"){tMode="edit";renderTCard();return}
    if(a==="run"){tMode="run";tStart=Date.now();renderTCard();$("tcard").scrollIntoView({behavior:"smooth",block:"start"});return}
    if(a==="stop"){tStop=true;renderTCard();return}
    if(a==="stop-no"){tStop=false;renderTCard();return}
    if(a==="apply"){await tUpdate(t,{status:"applied"},{action:"applied"});toast("오늘 훈련으로 적용했어요");renderTCard();return}
    if(a==="skip"){await tUpdate(t,{status:"skipped"},{action:"skipped"});tMode="";renderTCard();return}
    if(a==="stop-go"){tStop=false;const cur=t.current||t.proposal;
      const run={at:new Date().toISOString(),by:uid,role:myRole(),stopped:b.dataset.r,planned:cur.setup,results:{}};
      await tUpdate(t,{status:"stopped",runs:[...(t.runs||[]),run]},{action:"stopped",reason:b.dataset.r});tMode="view";
      await tReview(t);tMode="view";renderTCard();return}
  }catch(err){toast("저장하지 못했습니다. 다시 눌러 주세요")}
});
$("tcard").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target,t=trainings[0];if(!t)return;const cur=t.current||t.proposal;
  if(f.id==="tc-edit"){
    const v=n=>f.elements[n]?f.elements[n].value.trim():"";const pick=n=>[...f.querySelectorAll(`[data-chips="${n}"] .chip[aria-pressed="true"]`)].map(c=>c.dataset.v);
    const reps=Number(v("reps"));
    if(!v("goal")||!v("drill")||!v("steps")){toast("목표·훈련·진행 방법은 비울 수 없어요");return}
    if(!Number.isInteger(reps)||reps<1||reps>30){toast("반복 수를 1~30 사이로 적어 주세요");return}
    const setup={...cur.setup,distance:v("distance"),slope:v("slope"),club:v("club"),reps,success:v("success")};
    if(cur.setup.trigger){setup.trigger={situation:pick("situation"),visual:pick("visual")};setup.presentation=pick("presentation")[0]||"Single";if(setup.presentation==="Random")setup.randomTarget=pick("randomTarget")[0]||"유발조건";else delete setup.randomTarget}
    setup.orderMode=pick("orderMode")[0]||"interleaved";setup.schedule=tSchedule(setup.order||cur.conditions.map(c=>c.key),reps,setup.orderMode);
    const dm=String(setup.distance).match(/(\d+(?:\.\d+)?)\s*(cm|m|미터)?/);setup.distanceM=dm?(dm[2]==="cm"?Number(dm[1])/100:Number(dm[1])):null;
    if(setup.task==="Putt")setup.club="퍼터";
    const next={card:{...cur.card,goal:v("goal"),drill:v("drill"),steps:v("steps").split("\n").map(x=>x.trim()).filter(Boolean).slice(0,8),checks:v("checks").split(/[·,]/).map(x=>x.trim()).filter(Boolean).slice(0,4)},setup,conditions:cur.conditions};
    /* 원래 비교 기준을 그대로 쓸 수 있는지 다시 확인 */
    const notes=[],p=t.proposal.setup,min=(t.template&&t.template.minReps)||5;
    if(reps<min)notes.push(`조건마다 ${min}번보다 적으면 비교하지 않고 한 번 더 하자고 할 수 있어요.`);
    if(setup.trigger&&!(setup.trigger.situation.length||setup.trigger.visual.length))notes.push("압박 상황을 하나도 고르지 않아 압박 비교를 할 수 없어요.");
    if((p.distance||"")!==setup.distance||(p.club||"")!==setup.club)notes.push("거리나 클럽이 처음 제안과 달라졌어요. 이번 결과는 고친 조건끼리만 비교해요.");
    if(setup.orderMode==="blocked")notes.push("조건별로 묶어서 하면 연습·피로·순서 효과와 구분하기 어려워요.");
    const vis=(setup.trigger&&setup.trigger.visual)||[];
    if(setup.task==="Putt"&&vis.includes("숏퍼트")&&!(setup.distanceM<=2))notes.push("숏퍼트는 2m 이하 기준이에요(운영 기준 ops-1). 실제 거리를 확인해 주세요.");
    if(setup.task==="Putt"&&vis.includes("롱퍼트")&&!(setup.distanceM>=10))notes.push("롱퍼트는 10m 이상 기준이에요(운영 기준 ops-1). 실제 거리를 확인해 주세요.");
    await tUpdate(t,{current:next,adjustments:[...(t.adjustments||[]),{at:new Date().toISOString(),by:uid,role:myRole(),before:cur,after:next}],compat:{ok:!notes.some(n=>/할 수 없어요|비교하지 않고/.test(n)),notes}},{action:"edited"});
    tMode="";toast("고친 내용으로 저장했어요. 처음 제안도 그대로 남아 있어요");renderTCard();return;
  }
  if(f.id==="tc-run"){
    const err=$("tr-err");err.textContent="";const results={},miss=[];
    const nv=(x)=>{const s=String(x||"").trim();if(s==="")return null;const n=Number(s);return Number.isFinite(n)&&n>=0?n:NaN};
    for(const fs of f.querySelectorAll(".tr-c")){const k=fs.dataset.k,g=n=>{const i=fs.querySelector(`[data-f="${n}"]`);return i?i.value:""};
      const made=nv(g("made")),tries=nv(g("tries")),er=nv(g("err")),routine=nv(g("routine"));
      const errs=String(g("errs")||"").split(/[,\s]+/).filter(Boolean).map(Number);
      const name=fs.querySelector("legend").textContent;
      if(made===null||tries===null||!tries||Number.isNaN(made)||Number.isNaN(tries)||!Number.isInteger(made)||!Number.isInteger(tries)||made>tries){miss.push(name);continue}
      if(Number.isNaN(er)||Number.isNaN(routine)||(routine!==null&&routine>tries)||errs.some(x=>!Number.isFinite(x))){miss.push(name+" (숫자 확인)");continue}
      const r={made,tries,err:er,errs,routine};
      const pf=fs.querySelectorAll("[data-feel]");if(pf.length){r.perceived={};pf.forEach(g2=>{const on=g2.querySelector('.chip[aria-pressed="true"]');const [,fk]=g2.dataset.feel.split(".");r.perceived[fk]=on&&on.dataset.v!==""?(g2.dataset.text?on.dataset.v:Number(on.dataset.v)):null})}
      results[k]=r}
    if(miss.length){err.textContent="성공 수와 시도 수를 확인해 주세요: "+miss.join(", ");return}
    if(!$("tr-club").value.trim()){err.textContent="실제로 쓴 클럽을 적어 주세요.";return}
    const run={at:new Date().toISOString(),by:uid,role:myRole(),source:$("tr-src").value,sameSetup:$("tr-same").checked,orderFollowed:$("tr-order-ok")?$("tr-order-ok").checked:false,orderMode:cur.setup.orderMode||"interleaved",distance:$("tr-dist").value.trim(),club:$("tr-club").value.trim(),randomTarget:cur.setup.randomTarget||"",
      order:condsOf(cur).map(c=>c.key),presented:$("tr-order")?$("tr-order").value.trim():"",planned:cur.setup,results,memo:$("tr-memo").value.trim(),inputMs:tStart?Date.now()-tStart:null};
    f.querySelector('[type="submit"]').disabled=true;
    try{await tUpdate(t,{status:"done",runs:[...(t.runs||[]),run]},{action:"result"});toast("결과를 저장했어요")}
    catch(_){err.textContent="저장하지 못했어요. 다시 눌러 주세요.";f.querySelector('[type="submit"]').disabled=false;return}
    tMode="";await tReview(t);
  }
});

/* 운영 지표 (코치·관리자): 추천 수만이 아니라 채택·수정·실제 수행·결과 입력·재검을 따로 센다 */
async function renderTMetrics(){
  const box=$("t-metrics");if(!box)return;if(!isEditor||!db.group){box.hidden=true;return}
  try{const s=await db.group("trainings").get();const all=s.docs.map(d=>({id:d.id,...d.data()}));
    const has=(t,a)=>(t.events||[]).some(e=>e.action===a);
    const n=all.length,applied=all.filter(t=>has(t,"applied")).length,edited=all.filter(t=>(t.adjustments||[]).length).length,
      done=all.filter(t=>(t.runs||[]).some(r=>!r.stopped)).length,stopped=all.filter(t=>t.status==="stopped").length,skipped=all.filter(t=>t.status==="skipped").length,
      reviewed=all.filter(t=>t.review&&t.review.decision!=="no_data").length,
      retestAsk=all.filter(t=>t.next&&t.next.decision==="retest_other_day"),retestDone=retestAsk.filter(t=>{const c=all.find(x=>x.id===t.nextId);return c&&(c.runs||[]).some(r=>!r.stopped)}).length,
      ms=all.flatMap(t=>(t.runs||[]).map(r=>r.inputMs).filter(x=>x>0)),avg=ms.length?Math.round(ms.reduce((a,b)=>a+b,0)/ms.length/1000):null;
    box.hidden=false;
    box.innerHTML=`<h4 class="eyebrow"><b>T</b>AI 훈련 카드 운영 지표 (시범)</h4>
      <div class="bio-grid"><div><small>추천</small><b>${n}</b></div><div><small>적용(채택)</small><b>${applied} / ${n}</b></div><div><small>코치·선수 수정</small><b>${edited} / ${n}</b></div><div><small>실제 수행</small><b>${done} / ${n}</b></div>
      <div><small>결과 검토까지</small><b>${reviewed} / ${n}</b></div><div><small>미수행 · 중단</small><b>${skipped} · ${stopped}</b></div><div><small>다른 날 재검 완료</small><b>${retestDone} / ${retestAsk.length}</b></div><div><small>결과 입력 평균 시간</small><b>${avg===null?"—":avg+"초"}</b></div></div>
      <p class="hint" style="margin:0">추천 수만으로 성과를 보지 않아요. 목표 수치는 초기 사용 자료를 모은 뒤 정합니다.</p>`;
  }catch(_){box.hidden=true}
}

/* ===== 내 문제 진술 (루크의 방) =====
   글 대신 고르기·밀기로 뼈대를 받고, 원하면 말 한마디(음성·글)를 덧붙인다. → 서버 solve → 문제·솔루션·훈련·6일 플랜.
   저장은 레슨 기록과 같은 곳(players/{uid}/lessons, source:"self"). 근거는 '본인 진술'. 공동 레거시에는 올리지 않는다.
   나중: 목소리로 본인과 레슨자를 구분(speaker 필드 자리), 해결된 문제는 레거시로, 해법에 맞는 레슨자 추천. */
const P_SHOTS=["드라이버","우드·유틸","아이언","어프로치","벙커","퍼트"];
const P_MISS={swing:["입스처럼 손이 멈추거나 튐","왼쪽으로 출발","오른쪽으로 출발","왼쪽으로 휨","오른쪽으로 휨","뒤땅","탑볼","생크","거리가 안 나옴","거리가 들쑥날쑥","방향이 들쑥날쑥","탄도가 너무 높음","탄도가 너무 낮음"],
  putt:["입스처럼 손이 멈추거나 튐","짧음","김","왼쪽으로 빠짐","오른쪽으로 빠짐","거리감이 들쑥날쑥","짧은 퍼트가 불안","라인을 못 읽음"]};
const P_WHEN=["연습장에서도","코스에서","시합·압박 상황","첫 홀·첫 샷","실수한 직후","피곤할 때","특정 거리·클럽에서"];
const P_SINCE=["1주 안","1달쯤","3달쯤","6달쯤","1년 넘게"];
let probDraft=null,probBusy=false;
function renderProbForm(){
  const f=$("prob-form");if(!f||f.dataset.ready)return;f.dataset.ready="1";
  f.innerHTML=`<div class="fld"><span class="eyebrow"><b>1</b>어떤 샷에서요?</span>${chipsHTML("p-shot",P_SHOTS,[],true)}</div>
    <div class="fld"><span class="eyebrow"><b>2</b>공이 어떻게 가나요?</span><div id="p-miss-box">${chipsHTML("p-miss",P_MISS.swing,[],true)}</div></div>
    <div class="fld"><span class="eyebrow"><b>3</b>언제 더 심한가요?</span>${chipsHTML("p-when",P_WHEN,[],true)}</div>
    <div class="fld"><span class="eyebrow"><b>4</b>얼마나 자주요?</span>${slider("p-freq",{min:1,max:10,start:5,fmt:v=>`10번 중 ${v}번`,label:"얼마나 자주"},null)}</div>
    <div class="fld"><span class="eyebrow"><b>5</b>얼마나 됐나요?</span>${slider("p-since",{min:0,max:4,start:1,fmt:v=>P_SINCE[v],label:"얼마나 됐나"},null)}</div>
    <div class="fld"><span class="eyebrow"><b>6</b>말로 덧붙이기 <span class="hint">선택</span></span>
      <div class="row-mic"><textarea id="p-words" rows="2" maxlength="1500" placeholder="예: 연습장에선 괜찮은데 첫 홀 티샷만 오른쪽으로 밀려요"></textarea><button class="btn sm" type="button" id="p-mic" ${dict?"":"hidden"}>🎙 말하기</button></div>${dict?`<label class="speak">말하는 언어<select data-speak></select></label>`:""}</div>
    <p class="status" id="p-st" role="status"></p>
    <div class="actions"><button class="btn gold" type="submit" id="p-go">문제와 솔루션 보기</button></div>`;
}
$("prob-form").addEventListener("click",e=>{
  if(e.target.closest('[data-pick="p-shot"] .chip')){setTimeout(()=>{const putt=picked($("prob-form"),"p-shot").includes("퍼트"),sw=picked($("prob-form"),"p-shot").some(x=>x!=="퍼트");
    const keep=picked($("prob-form"),"p-miss");$("p-miss-box").innerHTML=chipsHTML("p-miss",[...(sw||!putt?P_MISS.swing:[]),...(putt?P_MISS.putt:[])],keep,true)},0)}
  if(e.target.id==="p-mic"&&dict){if(e.target.dataset.on==="1"){dict.stop().catch(()=>{});return}
    micTarget="prob";dict.start().catch(()=>toast("마이크를 쓸 수 없어 글로 적어 주세요"))}
});
$("prob-form").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target,st=$("p-st");if(probBusy)return;
  const s={shots:picked(f,"p-shot"),misses:picked(f,"p-miss"),when:picked(f,"p-when"),freq:slVal(f,"p-freq"),since:(v=>v===null?"":P_SINCE[v])(slVal(f,"p-since")),words:$("p-words").value.trim(),speaker:"self",at:new Date().toISOString()};
  if(!s.shots.length||!s.misses.length){st.className="status err";st.textContent="어떤 샷인지, 공이 어떻게 가는지는 꼭 골라 주세요.";return}
  if(!ai){st.className="status err";st.textContent="로그인한 뒤에 볼 수 있어요.";return}
  probBusy=true;$("p-go").disabled=true;st.className="status";st.innerHTML=`<div class="guide" id="g-pwait"></div><div class="ld" aria-hidden="true"></div>`;
  say($("g-pwait"),"말씀하신 상황을 정리하고 있어요. 20~40초만 기다려 주세요.",{now:true,who:"rook",motion:"think"});
  try{
    const r=(await ai({task:"solve",statement:s,profile,history:lessons.slice(0,3).map(l=>({date:l.date,title:l.result.title,node:l.result.node||null}))})).data;
    if(r&&r.off_topic){st.className="status err";st.textContent="골프 이야기만 정리할 수 있어요.";return}
    if(!r||!r.plan)throw new Error("format");
    (r.drills||[]).forEach(d=>{const it=d.lib_id&&lib.find(x=>x.id===d.lib_id);if(it){d.source="AP 라이브러리";d.lib_rev=it.rev||1}else{d.source="AI 보완";d.lib_id=""}});
    probDraft={date:today(),coach:"",source:"self",statement:s,transcript:[s.shots.join("·")+" / "+s.misses.join("·"),s.when.join("·"),s.words].filter(Boolean).join(" — "),result:r};
    st.textContent="";
    $("prob-out").innerHTML=resultHTML(r,"",probDraft.date,{self:true})+`<div class="actions" style="margin-top:12px"><button class="btn" type="button" id="p-redo">다시 고르기</button><button class="btn gold" type="button" id="p-save">내 기록에 저장 · 오늘의 훈련으로</button></div>`;
    say($("g-pos"),"정리했어요. 원인은 아직 '확인할 것'이에요. 저장하면 오늘의 훈련에 바로 들어가요.",{now:true,who:"rook",motion:"success"});
    $("prob-out").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){st.className="status err";const m=(err&&(err.message||""))+" "+(err&&err.code||"");
    st.textContent=/guardian-pending/.test(m)?"보호자 확인이 끝나면 볼 수 있어요.":/age-required/.test(m)?"나이 확인이 필요해요. 새로고침해 주세요.":/resource-exhausted/.test(m)?"오늘 횟수를 다 썼어요. 내일 다시 해 주세요.":"정리하지 못했어요. 다시 눌러 주세요."}
  finally{probBusy=false;$("p-go").disabled=false}
});
$("prob-out").addEventListener("click",async e=>{
  if(e.target.id==="p-redo"){$("prob-out").innerHTML="";$("prob-form").scrollIntoView({behavior:"smooth"});return}
  if(e.target.id!=="p-save"||!probDraft)return;e.target.disabled=true;
  try{await db.collection("players/"+uid+"/lessons").add({...probDraft,done:[],feedback:[],createdAt:new Date().toISOString()});
    probDraft=null;$("prob-out").innerHTML="";delete $("prob-form").dataset.ready;renderProbForm();await loadLessons();
    mandalaHint=true;toast("저장했어요. 오늘의 훈련을 같이 짜 봐요");show("train")}
  catch(_){toast("저장하지 못했어요. 다시 눌러 주세요");e.target.disabled=false}
});
/* ===== 만다라트 (오타니식 3×3) + 설정에 따른 배틀플랜 (데릴의 훈련장) =====
   파일럿: AP 라이브러리 훈련으로 자동 생성(규칙, AI 아님). 가운데는 본인 목표, 둘레 8칸은 8개 영역.
   칸을 누르면 그 영역 훈련과 수행률(%)이 보인다. 최근 문제·레슨과 스테이트먼트의 약한 영역을 먼저 챙긴다.
   저장: players/{uid}/mandala/current. 훈련 내용은 라이브러리에서 코치진이 고치면 다음 생성부터 반영. */
let mandala=null,mOpen="",mandalaHint=false;
const LVKEY={P:"투어",J:"아마",A:"일반"};
const doseFor=it=>{const d=String(it.dose||"");const seg=d.split("·").map(x=>x.trim()).find(x=>x.startsWith(LVKEY[profile.level]||"일반"));return seg||d};
const roundOnly=it=>/라운드/.test(String(it.freq||""));
async function loadMandala(){try{const d=await db.doc("players/"+uid+"/mandala/current").get();mandala=d.exists?d.data():null}catch(_){mandala=null}}
async function saveMandala(){mandala.updatedAt=new Date().toISOString();await db.doc("players/"+uid+"/mandala/current").set(mandala)}
function focusPillars(){
  const f=[];const l=lessons[0];if(l&&PNAME[l.result.pillar])f.push(l.result.pillar);
  const SH={"드라이버":"drive","우드·유틸":"drive","아이언":"iron","어프로치":"short","벙커":"short","퍼트":"putt"};
  if(l&&l.statement)(l.statement.shots||[]).forEach(x=>SH[x]&&f.push(SH[x]));
  if(l&&l.result.mental)f.push("mind");
  AREAS.forEach(a=>{const v=areaAvg(a);if(a.pillar&&v!==null&&v<=2.5)f.push(a.pillar)});
  return [...new Set(f)];
}
function genCells(){
  const act=lib.filter(x=>x.status==="active"&&!x.example&&PNAME[x.pillar]);const l=lessons[0],node=l&&l.result.node,via=l&&l.result.via;
  const sc=x=>(x.node===node?3:0)+(x.node===via?2:0)+(x.kind!=="point"?1:0)+(roundOnly(x)?-1:0);
  return Object.fromEntries(PILLARS.map(([p])=>[p,act.filter(x=>x.pillar===p).sort((a,b)=>sc(b)-sc(a)).slice(0,8).map(x=>x.id)]));
}
function genSessions(cells,set,focus){
  /* 회차마다 첫 칸은 가장 먼저 챙길 영역(최근 문제), 나머지 칸은 다른 먼저 챙길 영역을 두 번, 그 밖의 영역을 한 번씩 돌아가며 */
  const total=set.perWeek*set.weeks,per=Math.max(1,Math.min(4,Math.round(set.minutes/25)));
  const usable=p=>(cells[p]||[]).filter(id=>{const it=lib.find(x=>x.id===id);return it&&!roundOnly(it)});
  const avail=PILLARS.map(([p])=>p).filter(p=>usable(p).length);
  const lead=focus.find(p=>avail.includes(p))||null;
  const rest=avail.filter(p=>p!==lead),cyc=[];
  [...rest.filter(p=>focus.includes(p)),...rest].forEach(p=>cyc.push(p));
  const ptr={},nextOf=p=>{const l=usable(p);return l[(ptr[p]=(ptr[p]??-1)+1)%l.length]};
  const out=[];let c=0;
  for(let s=0;s<total;s++){const items=[],used=new Set();
    if(lead&&(per>1||s%2===0)){items.push(nextOf(lead));used.add(lead)}
    let guard=0;while(items.length<per&&cyc.length&&guard++<cyc.length*2){const p=cyc[c++%cyc.length];if(used.has(p))continue;used.add(p);items.push(nextOf(p))}
    out.push({n:s+1,week:Math.floor(s/set.perWeek)+1,items,done:[]})}
  return out;
}
function cellStat(p){const ids=(mandala&&mandala.cells[p])||[];let plan=0,done=0;(mandala.sessions||[]).forEach(s=>s.items.forEach(id=>{if(ids.includes(id)){plan++;if(s.done.includes(id))done++}}));return {plan,done,pct:plan?Math.round(done/plan*100):null}}
function itemStat(id){let plan=0,done=0;(mandala.sessions||[]).forEach(s=>{if(s.items.includes(id)){plan++;if(s.done.includes(id))done++}});return {plan,done}}
function renderMandalaAP(){
  const box=$("mandala");if(!box)return;if(!uid){box.innerHTML="";return}
  if(!lib.length){box.innerHTML=`<div class="panel"><span class="eyebrow"><b>M</b>나의 만다라트</span><p class="hint">AP 훈련 라이브러리를 불러오는 중이에요.</p></div>`;return}
  if(!mandala){box.innerHTML=`<div class="panel"><span class="eyebrow"><b>M</b>나의 만다라트</span><p style="margin:0">가운데에 목표를 두고, 둘레 8개 영역에 AP 훈련을 자동으로 채워요. 최근 문제와 약한 영역을 먼저 챙깁니다.</p>
    <label class="fld">가운데 목표 <span class="hint">선택</span><input id="m-goal" maxlength="30" placeholder="${esc(profile.goal||DEF_GOAL[profile.level])}"></label>
    <div class="actions"><button class="btn gold" type="button" data-m="make">만다라트 만들기</button></div></div>`;return}
  const goal=mandala.goal||profile.goal||DEF_GOAL[profile.level];
  const cells=[0,1,2,3,null,4,5,6,7].map(i=>{if(i===null)return `<button type="button" class="mcell goal" data-m="goal"><small>목표</small><b>${esc(goal)}</b></button>`;
    const [p,name]=PILLARS[i],st=cellStat(p),f=(mandala.focus||[]).includes(p);
    return `<button type="button" class="mcell${st.plan?" has":""}${mOpen===p?" sel":""}${f?" focus":""}" data-m="cell" data-p="${p}" style="--p:${st.pct||0}%" aria-pressed="${mOpen===p}"><b>${esc(name)}</b><small>${st.pct===null?`훈련 ${(mandala.cells[p]||[]).length}개`:st.pct+"% 수행"}</small>${f?`<i class="mf-dot" title="먼저 챙길 영역"></i>`:""}</button>`}).join("");
  let detail="";
  if(mOpen==="goal")detail=`<div class="m-detail"><label class="fld">가운데 목표<input id="m-goal" maxlength="30" value="${esc(mandala.goal||"")}" placeholder="${esc(goal)}"></label><div class="actions"><button class="btn sm gold" type="button" data-m="goal-save">저장</button></div></div>`;
  else if(mOpen){const ids=mandala.cells[mOpen]||[];detail=`<div class="m-detail"><div class="t-head"><b>${esc(PNAME[mOpen])} 훈련</b>${(s=>s.pct===null?"":`<span class="pill gold">${s.pct}% 수행 · ${s.done}/${s.plan}</span>`)(cellStat(mOpen))}</div>
    ${ids.map(id=>{const it=lib.find(x=>x.id===id);if(!it)return "";const s=itemStat(id);return `<div class="drill"><div class="t"><b>${esc(it.name)}</b><span class="dose">${esc(doseFor(it))}${it.freq?" · "+esc(it.freq):""}</span></div>${it.point?`<small>${esc(it.point)}</small>`:""}${it.how?`<small>${esc(it.how)}</small>`:""}
      <div><span class="pill ok">AP 라이브러리 v${it.rev||1}</span> ${roundOnly(it)?`<span class="pill">라운드에서 확인</span>`:s.plan?`<span class="pill">${s.done}/${s.plan}회 수행</span>`:`<span class="pill">이번 플랜에 없음</span>`}</div></div>`}).join("")||`<p class="hint">이 영역 훈련이 아직 라이브러리에 없어요.</p>`}</div>`}
  box.innerHTML=`<div class="panel"><div class="t-head"><span class="eyebrow"><b>M</b>나의 만다라트</span><button class="btn sm" type="button" data-m="remake">다시 만들기</button></div>
    ${mandalaHint?`<p class="notice" style="margin:0">새 문제나 레슨이 저장됐어요. '다시 만들기'를 누르면 그 내용에 맞춰 훈련을 다시 채워요.</p>`:""}
    <div class="mgrid ap">${cells}</div><p class="hint" style="margin:0">칸을 누르면 그 영역 훈련이 보여요. 칸은 배틀플랜에서 수행한 만큼 차오릅니다. ● 표시는 먼저 챙길 영역이에요.</p>${detail}</div>`;
}
function renderPlan(){
  const box=$("bplan");if(!box)return;if(!uid||!mandala){box.innerHTML="";return}
  const b=(stmt.bio&&stmt.bio.num)||{},set=mandala.settings||{perWeek:Math.max(1,Math.min(7,b.pweek||3)),minutes:Math.max(20,Math.min(180,Math.round((b.phours||1)*60/10)*10)),weeks:2};
  const ss=mandala.sessions||[],next=ss.find(s=>s.done.length<s.items.length),tot=ss.reduce((a,s)=>a+s.items.length,0),dn=ss.reduce((a,s)=>a+s.done.length,0);
  const weeks=[...new Set(ss.map(s=>s.week))];
  box.innerHTML=`<div class="panel"><div class="t-head"><span class="eyebrow"><b>P</b>배틀플랜</span>${ss.length?`<span class="pill gold">${tot?Math.round(dn/tot*100):0}% · ${dn}/${tot}</span>`:""}</div>
    <details class="bp-set" ${ss.length?"":"open"}><summary class="hint">설정: 주 ${set.perWeek}회 · 회당 ${set.minutes}분 · ${set.weeks}주</summary>
      <div class="fld"><small>주 몇 회</small>${slider("bp-w",{min:1,max:7,fmt:v=>"주 "+v+"회",label:"주 몇 회"},set.perWeek)}</div>
      <div class="fld"><small>회당 시간</small>${slider("bp-m",{min:20,max:180,step:10,fmt:v=>v+"분",label:"회당 시간"},set.minutes)}</div>
      <div class="fld"><small>기간</small>${slider("bp-k",{min:1,max:8,fmt:v=>v+"주",label:"기간"},set.weeks)}</div>
      <div class="actions"><button class="btn gold" type="button" data-m="plan">${ss.length?"이 설정으로 다시 만들기":"배틀플랜 만들기"}</button></div></details>
    ${weeks.map(w=>`<div class="bp-week"><span class="eyebrow">${w}주차</span>${ss.filter(s=>s.week===w).map(s=>{const isNext=next&&s.n===next.n,ok=s.items.length&&s.done.length===s.items.length;
      return `<div class="bp-s${isNext?" next":""}${ok?" done":""}"><div class="h"><b>${s.n}회차</b>${isNext?`<span class="pill gold">오늘 할 세션</span>`:ok?`<span class="pill ok">완료</span>`:""}</div>
        ${s.items.map(id=>{const it=lib.find(x=>x.id===id);return it?`<label class="ck-line"><input type="checkbox" data-sess="${s.n}" data-item="${esc(id)}" ${s.done.includes(id)?"checked":""}> <span>${esc(it.name)} <small class="hint">${esc(PNAME[it.pillar]||"")} · ${esc(doseFor(it))}</small></span></label>`:""}).join("")}</div>`}).join("")}</div>`).join("")}
</div>`;
}
async function makeMandala(keepGoal){
  const goal=keepGoal!==undefined?keepGoal:(($("m-goal")&&$("m-goal").value.trim())||"");
  const prev=mandala;const focus=focusPillars(),cells=genCells();
  mandala={goal,cells,focus,settings:prev&&prev.settings||null,sessions:[],history:[...((prev&&prev.history)||[]),...(prev&&prev.sessions&&prev.sessions.length?[{at:prev.updatedAt||"",settings:prev.settings,sessions:prev.sessions,cells:prev.cells}]:[])].slice(-5),
    basedOn:lessons[0]?lessons[0].id:null,generatedAt:new Date().toISOString(),rule:"mandala-1 (AP 라이브러리 자동 생성 · 파일럿)"};
  if(prev&&prev.settings)mandala.sessions=genSessions(cells,prev.settings,focus);
  await saveMandala();mandalaHint=false;
}
$("mandala").addEventListener("click",async e=>{const b=e.target.closest("[data-m]");if(!b)return;const a=b.dataset.m;
  try{
    if(a==="make"){await makeMandala();toast("만다라트를 만들었어요. 아래에서 배틀플랜을 만들어 보세요");renderMandalaAP();renderPlan();return}
    if(a==="remake"){if(mandala&&(mandala.sessions||[]).some(s=>s.done.length)&&!confirm(T("다시 만들면 지금 배틀플랜 체크는 기록으로 보관되고 새로 시작해요. 다시 만들까요?")))return;await makeMandala(mandala?mandala.goal:"");toast("최근 기록에 맞춰 다시 만들었어요");renderMandalaAP();renderPlan();return}
    if(a==="cell"){mOpen=mOpen===b.dataset.p?"":b.dataset.p;renderMandalaAP();return}
    if(a==="goal"){mOpen=mOpen==="goal"?"":"goal";renderMandalaAP();return}
    if(a==="goal-save"){mandala.goal=$("m-goal").value.trim();await saveMandala();mOpen="";renderMandalaAP();return}
  }catch(_){toast("저장하지 못했어요. 다시 눌러 주세요")}
});
$("bplan").addEventListener("click",async e=>{const b=e.target.closest('[data-m="plan"]');if(!b)return;const r=$("bplan");
  const set={perWeek:slVal(r,"bp-w"),minutes:slVal(r,"bp-m"),weeks:slVal(r,"bp-k")};
  if([set.perWeek,set.minutes,set.weeks].some(v=>v===null)){toast("주 몇 회·회당 시간·기간을 밀어서 골라 주세요");return}
  if((mandala.sessions||[]).some(s=>s.done.length)&&!confirm(T("지금 플랜의 체크는 기록으로 보관되고 새로 시작해요. 다시 만들까요?")))return;
  if((mandala.sessions||[]).length)mandala.history=[...(mandala.history||[]),{at:mandala.updatedAt||"",settings:mandala.settings,sessions:mandala.sessions,cells:mandala.cells}].slice(-5);
  mandala.settings=set;mandala.sessions=genSessions(mandala.cells,set,mandala.focus||[]);
  try{await saveMandala();toast(`배틀플랜 ${mandala.sessions.length}회차를 만들었어요`);renderPlan();renderMandalaAP()}catch(_){toast("저장하지 못했어요")}
});
$("bplan").addEventListener("change",async e=>{const c=e.target.closest("input[data-sess]");if(!c)return;const s=mandala.sessions.find(x=>x.n===Number(c.dataset.sess));if(!s)return;
  const id=c.dataset.item;s.done=c.checked?[...new Set([...s.done,id])]:s.done.filter(x=>x!==id);
  try{await saveMandala()}catch(_){toast("저장하지 못했어요")}renderPlan();renderMandalaAP();chartSay()});


/* ===== 오늘의 훈련 (데릴·파코): 바로 짜기 / 얘기하면서 짜기 → 확정 → 체크 → 했어요 =====
   여러 곳의 훈련(최근 코치님 레슨·내 얘기의 6일 플랜, 코치 처방, 적용한 AI 훈련 카드, 배틀플랜 회차, 만다라트 칸)을 한 목록으로 모은다.
   고르는 건 규칙이다(AI 아님): 시간 → 개수, 장소 → 할 수 있는 영역, 컨디션 → 개수 줄임, 챙길 것 → 순서. 선수가 빼거나 더한 뒤 확정한다.
   저장 players/{uid}/days/{날짜}. 체크하면 배틀플랜 회차·레슨 6일 플랜에도 같이 체크된다.
   '했어요'는 그 레슨의 피드백으로도 남아 '여전하다' 3회 → 코치 확인 규칙이 그대로 돈다. */
let day=null,dayDraft=null,dayAsk=null,dayBusy=false,rxPool=[],apPool=[];
const D_TIME=[["30","30분"],["60","1시간"],["120","2시간 이상"]];
const D_PLACE=[["range","연습장"],["green","퍼팅그린·숏게임장"],["screen","스크린"],["field","필드"],["home","집·실내"]];
const D_PLACE_OK={range:["drive","iron","short","putt","body","mind","life"],green:["putt","short","mind","life"],screen:["drive","iron","short","putt","course","mind","life"],field:null,home:["putt","body","mind","life"]};
/* Training Library 의 하는 곳(6곳) → 오늘의 훈련 장소(5곳) */
const TL_PLACE={range:"range",short:"green",green:"green",screen:"screen",field:"field",home:"home"};
const D_COND=[["good","좋아요"],["ok","보통"],["tired","피곤해요"]];
const D_FOCUS=[["recent","최근 레슨·고민"],["weak","약한 영역"],["real","실전 판단력"],["drive","드라이버"],["iron","아이언"],["short","숏게임"],["putt","퍼팅"],["mind","멘탈"]];
const D_Q=[["time","오늘 연습 시간은 얼마나 돼요?",D_TIME],["place","어디서 해요?",D_PLACE],["cond","몸 상태는 어때요?",D_COND],["focus","오늘 특히 챙기고 싶은 게 있어요?",D_FOCUS]];
const D_MAND="만다라트";
const D_VERD=[["잘 맞았다","맞았어요"],["여전하다","그대로예요"],["느낌을 모르겠다","잘 모르겠어요"]];
const AXIS_P={PUTTING:"putt",SHORT_GAME:"short",SWING:"drive",COURSE:"course",MENTAL:"mind",PHYSICAL:"body"};
const dLabel=(list,v)=>(list.find(x=>x[0]===v)||[,""])[1];
async function loadDay(){if(!db||!uid){day=null;return}try{const d=await db.doc(`players/${uid}/days/${today()}`).get();day=d.exists?d.data():null}catch(_){day=null}}
async function saveDay(){day.updatedAt=new Date().toISOString();await db.doc(`players/${uid}/days/${day.date}`).set(day)}
function libDay(id,src,key){const it=lib.find(x=>x.id===id);if(!it||it.status!=="active")return null;return {key,src,name:it.name,dose:doseFor(it),how:it.how||it.point||"",pillar:it.pillar||"",round:roundOnly(it),kind:"lib"}}
function dayPool(){
  const out=[],l=lessons[0];
  if(l){const nx=nextDay(l);if(nx&&sameCount(l)<3)out.push({key:`ls:${l.id}:${nx.day}`,src:(l.source==="self"?"내 얘기":"레슨 · "+(l.coach||"코치님"))+` · D${nx.day}`,name:nx.focus,dose:"",how:(nx.tasks||[]).join(" · "),pillar:l.result.pillar||"",kind:"lesson"})}
  rxPool.forEach(x=>out.push({...x,pillar:AXIS_P[x.axis]||"",kind:"rx"}));
  const t=trainings[0];if(t&&t.status==="applied"){const cur=t.current||t.proposal;out.push({key:"tc:"+t.id,src:"AI 훈련 카드",name:cur.card.drill,dose:"",how:cur.card.goal,pillar:{Putt:"putt",Approach:"short",Shot:"drive"}[cur.setup.task]||"",kind:"tc"})}
  const ss=(mandala&&mandala.sessions)||[],nx=ss.find(s=>s.done.length<s.items.length);
  if(nx)nx.items.filter(id=>!nx.done.includes(id)).forEach(id=>{const x=libDay(id,`배틀플랜 ${nx.n}회차`,`bp:${nx.n}:${id}`);if(x)out.push({...x,kind:"bp"})});
  apPool.forEach(x=>out.push(x)); /* AP 실전 인지 드릴: 코치 승인된 것만 */
  return out;
}
/* 모자라면 만다라트 칸(없으면 라이브러리)에서 영역을 돌아가며 하나씩 더한다 */
function dayExtra(pillars,haveKeys,fits,n){
  const used=new Set(haveKeys.map(k=>k.split(":").pop())),lists=pillars.map(p=>((mandala&&mandala.cells&&mandala.cells[p])||lib.filter(x=>x.status==="active"&&!x.example&&x.pillar===p).map(x=>x.id)).slice()),out=[];
  let guard=0;while(out.length<n&&lists.some(x=>x.length)&&guard++<200){for(let i=0;i<lists.length&&out.length<n;i++){while(lists[i].length){const id=lists[i].shift();if(used.has(id))continue;const x=libDay(id,D_MAND+" · "+PNAME[pillars[i]],`lib:${id}`);if(x&&fits(x)){out.push(x);used.add(id);break}}}}
  return out;
}
function dayCount(ask){const b=(stmt.bio&&stmt.bio.num)||{};const min=ask&&ask.time?Number(ask.time):Math.round((b.phours||1)*60);let n=Math.max(2,Math.min(5,Math.round(min/25)));if(ask&&ask.cond==="tired")n=Math.max(1,n-1);return n}
function dayFits(ask){const ok=ask&&D_PLACE_OK[ask.place];
  return x=>x.kind==="ap"?(!ask||!ask.place||(x.places||[]).some(p=>TL_PLACE[p]===ask.place)):(!ok||!x.pillar||ok.includes(x.pillar))&&(!x.round||(ask&&ask.place==="field"))}
function buildDay(ask){
  const n=dayCount(ask),fits=dayFits(ask),ok=ask&&D_PLACE_OK[ask.place];
  const focus=!ask||ask.focus==="recent"||ask.focus==="real"?[]:ask.focus==="weak"?focusPillars():[ask.focus];
  let pool=dayPool().filter(fits);
  const rank=x=>(focus.length?(focus.includes(x.pillar)?4:0):0)+(ask&&ask.focus==="real"&&x.kind==="ap"?5:0)+({lesson:3,rx:3,tc:2,bp:1,ap:1}[x.kind]||0);
  pool=pool.map((x,i)=>({x,i})).sort((a,b)=>rank(b.x)-rank(a.x)||a.i-b.i).map(o=>o.x);
  let items=pool.slice(0,n);
  if(items.length<n){const want=[...focus,...focusPillars(),...PILLARS.map(p=>p[0])].filter((p,i,a)=>a.indexOf(p)===i&&(!ok||ok.includes(p)));
    items=[...items,...dayExtra(want,items.map(x=>x.key),fits,n-items.length)]}
  return items;
}
function dItemHTML(x,mode,done){
  const meta=[x.dose,x.how].filter(Boolean).join(" · ");
  const ck=mode==="run"?`<input type="checkbox" data-dk="${esc(x.key)}" ${done?"checked":""} aria-label="${esc(x.name)} 했어요">`:"";
  const rm=mode==="draft"?`<button class="d-rm" type="button" data-d="rm" data-k="${esc(x.key)}" aria-label="빼기">×</button>`:"";
  return `<${mode==="run"?"label":"div"} class="d-it${done?" done":""}">${ck}<span class="d-tx"><span class="pill${x.kind==="lesson"||x.kind==="rx"?" gold":""}">${esc(x.src)}</span><b>${esc(x.name)}</b>${meta?`<small>${esc(meta)}</small>`:""}</span>${rm}</${mode==="run"?"label":"div"}>`;
}
function renderDay(){
  const box=$("today-plan");if(!box)return;if(!uid){box.innerHTML="";return}
  const g=`<div class="guide" id="g-day"></div>`;
  if(dayAsk){ /* 얘기하면서 짜기: 하나씩 묻는다 */
    const step=D_Q.findIndex(([k])=>!dayAsk[k]);
    const said=D_Q.filter(([k])=>dayAsk[k]).map(([k,,opts])=>`<span class="pill">${esc(dLabel(opts,dayAsk[k]))}</span>`).join("");
    if(step>=0){const [k,q,opts]=D_Q[step];
      box.innerHTML=`<div class="panel dday">${g}${said?`<div class="d-said">${said}</div>`:""}<div class="chips d-opts">${opts.map(([v,l])=>`<button type="button" class="chip" data-d="ans" data-k="${k}" data-v="${v}">${esc(l)}</button>`).join("")}</div>
        <div class="actions"><button class="btn sm" type="button" data-d="back">${step?"이전 질문":"그만두기"}</button></div></div>`;
      say($("g-day"),q,{now:true,who:"daryl",motion:step?"point":"hello"});return}
    box.innerHTML=`<div class="panel dday">${g}<div class="d-said">${said}</div>
      <label class="fld">한마디 <span class="hint">선택</span><input id="d-words" maxlength="200" placeholder="예: 내일 시합이라 퍼팅 위주로 가볍게"></label>
      <div class="actions"><button class="btn gold" type="button" data-d="make">계획 보기</button><button class="btn sm" type="button" data-d="back">이전 질문</button></div></div>`;
    say($("g-day"),"좋아요. 더 할 말이 있으면 한마디 남겨 주세요. 없으면 바로 짜 줄게요.",{now:true,who:"daryl",motion:"point"});return}
  if(dayDraft){ /* 짜 본 계획: 빼고 더하고 확정 */
    const it=dayDraft.items;
    box.innerHTML=`<div class="panel dday">${g}${dayDraft.ask?`<div class="d-said">${D_Q.map(([k,,o])=>`<span class="pill">${esc(dLabel(o,dayDraft.ask[k]))}</span>`).join("")}</div>`:""}
      ${it.length?`<div class="d-list">${it.map(x=>dItemHTML(x,"draft")).join("")}</div>`:`<p class="notice" style="margin:0">지금 넣을 훈련이 없어요. 먼저 레슨이나 내 얘기를 남기거나, 아래에서 만다라트를 만들어 주세요.</p>`}
      <div class="actions">${it.length?`<button class="btn gold" type="button" data-d="ok">이걸로 할게요</button>`:`<button class="btn gold" type="button" data-show="lesson">말하러 가기</button>`}<button class="btn sm" type="button" data-d="more">하나 더</button><button class="btn sm" type="button" data-d="reset">다시 짜기</button></div></div>`;
    say($("g-day"),it.length?"이렇게 짜 봤어요. 빼고 싶은 건 ×를 누르고, 괜찮으면 '이걸로 할게요'를 눌러 주세요.":"오늘 넣을 훈련을 찾지 못했어요.",{now:true,who:"daryl",motion:it.length?"point":"guide"});return}
  if(day&&day.items){ /* 오늘 할 것 → 체크 → 했어요 */
    const n=day.items.length,dn=(day.done||[]).length,fin=!!day.verdict;
    const l=lessons[0],warn=l&&sameCount(l)>=3?`<div class="notice bad"><b>같은 문제가 ${sameCount(l)}번 그대로예요.</b> 혼자 더 하기보다 코치님과 확인할 때예요.</div>`:"";
    box.innerHTML=`<div class="panel dday"><div class="t-head"><span class="eyebrow"><b>T</b>오늘 할 훈련</span><span class="pill ${dn===n?"ok":"gold"}">${dn}/${n}</span></div>${g}
      <div class="d-list">${day.items.map(x=>dItemHTML(x,"run",(day.done||[]).includes(x.key))).join("")}</div>${warn}
      ${fin?`<div class="d-fin"><span class="pill ${day.verdict==="잘 맞았다"?"ok":day.verdict==="여전하다"?"warn":""}">${esc(dLabel(D_VERD,day.verdict))}</span>${day.text?`<span>${esc(day.text)}</span>`:""}</div>
        <div class="actions"><button class="btn sm" type="button" data-d="again">다시 짜기</button></div>`
      :`<div class="d-done"><span class="eyebrow"><b>F</b>했어요 · 어땠어요?</span>
        <div class="chips" id="d-v">${D_VERD.map(([v,l])=>`<button type="button" class="chip" data-d="v" data-v="${v}" aria-pressed="false">${esc(l)}</button>`).join("")}</div>
        <label class="fld">한마디 <span class="hint">선택</span><input id="d-memo" maxlength="200" placeholder="예: 하프스윙은 되는데 풀스윙에서 다시 오른쪽"></label>
        <div class="actions"><button class="btn gold" type="button" data-d="fin">했어요</button><button class="btn sm" type="button" data-d="again">다시 짜기</button></div><p class="status" id="d-st" role="status"></p></div>`}</div>`;
    if(fin)say($("g-day"),day.adjust?"다음엔 이렇게 해 봐요. "+day.adjust:"기록했어요. 수고했어요! 내일 또 같이 짜요.",{now:true,who:"paco",motion:day.adjust?"point":"success"});
    else say($("g-day"),dn===n?"다 했네요! 어땠는지 하나만 골라 주세요.":"한 것은 체크하고, 끝나면 어땠는지 하나만 골라 주세요.",{now:true,who:dn===n?"paco":"daryl",motion:dn===n?"success":"point"});return}
  box.innerHTML=`<div class="panel dday start">${g}<div class="d-start"><button class="btn gold" type="button" data-d="quick">응, 바로 짜 줘</button><button class="btn" type="button" data-d="talk">얘기하면서 짜자</button></div></div>`;
  say($("g-day"),lessons.length||mandala?"오늘 연습 계획 같이 짤까?":"오늘 연습 계획 같이 짤까? 레슨이나 고민을 먼저 남겨 두면 더 잘 맞춰 줄 수 있어.",{now:true,who:"daryl"});
}
async function syncDone(key,on){
  const [k,a,...r]=key.split(":"),b=r.join(":");
  if(k==="bp"&&mandala){const s=(mandala.sessions||[]).find(x=>x.n===Number(a));if(s){s.done=on?[...new Set([...s.done,b])]:s.done.filter(x=>x!==b);await saveMandala()}}
  if(k==="ls"){const l=lessons.find(x=>x.id===a);if(l){const d=new Set(l.done||[]);on?d.add(Number(b)):d.delete(Number(b));l.done=[...d].sort((x,y)=>x-y);await db.doc(`players/${uid}/lessons/${l.id}`).update({done:l.done})}}
}
$("today-plan").addEventListener("change",async e=>{const c=e.target.closest("[data-dk]");if(!c||!day)return;const k=c.dataset.dk;
  day.done=c.checked?[...new Set([...(day.done||[]),k])]:(day.done||[]).filter(x=>x!==k);
  try{await saveDay();await syncDone(k,c.checked);buzz()}catch(_){toast("저장하지 못했어요")}
  renderDay();renderActive();renderTrain();renderPlan();renderMandalaAP()});
$("today-plan").addEventListener("click",async e=>{
  const b=e.target.closest("[data-d]");if(!b||dayBusy)return;const a=b.dataset.d;
  if(a==="quick"){dayDraft={mode:"quick",ask:null,items:buildDay(null)};renderDay();return}
  if(a==="talk"){dayAsk={};renderDay();return}
  if(a==="ans"){dayAsk[b.dataset.k]=b.dataset.v;renderDay();return}
  if(a==="back"){const done=D_Q.filter(([k])=>dayAsk[k]);if(!done.length){dayAsk=null}else delete dayAsk[done[done.length-1][0]];renderDay();return}
  if(a==="make"){const ask={...dayAsk,words:($("d-words")||{}).value?$("d-words").value.trim():""};dayAsk=null;dayDraft={mode:"talk",ask,items:buildDay(ask)};renderDay();return}
  if(a==="rm"){dayDraft.items=dayDraft.items.filter(x=>x.key!==b.dataset.k);renderDay();return}
  if(a==="more"){const ask=dayDraft.ask,fits=dayFits(ask),ok=ask&&D_PLACE_OK[ask.place],have=dayDraft.items.map(x=>x.key);
    let nx=dayPool().filter(fits).find(x=>!have.includes(x.key));
    if(!nx){const want=[...focusPillars(),...PILLARS.map(p=>p[0])].filter((p,i,a2)=>a2.indexOf(p)===i&&(!ok||ok.includes(p)));nx=dayExtra(want,have,fits,1)[0]}
    if(nx)dayDraft.items.push(nx);else toast("더 넣을 훈련이 없어요");renderDay();return}
  if(a==="reset"){dayDraft=null;dayAsk=null;renderDay();return}
  if(a==="again"){if(day&&day.items&&!confirm(T("오늘 계획을 다시 짤까요? 지금 계획은 기록으로 남아요.")))return;dayDraft=null;dayAsk=null;day={...(day||{}),prevItems:(day&&day.items)||[],items:null,againFrom:true};renderDay();return}
  if(a==="ok"){if(!dayDraft.items.length)return;const prev=day&&day.againFrom?day:null;
    day={date:today(),mode:dayDraft.mode,ask:dayDraft.ask,items:dayDraft.items,done:[],createdAt:new Date().toISOString(),history:prev?[...(prev.history||[]),{at:prev.createdAt||"",items:prev.prevItems||[],done:prev.done||[],verdict:prev.verdict||""}].slice(-5):[]};
    try{await saveDay();dayDraft=null;toast("오늘의 훈련을 정했어요");buzz()}catch(_){toast("저장하지 못했어요. 다시 눌러 주세요")}renderDay();return}
  if(a==="v"){document.querySelectorAll("#d-v .chip").forEach(c=>c.setAttribute("aria-pressed",String(c===b)));return}
  if(a==="fin"){const v=(document.querySelector('#d-v .chip[aria-pressed="true"]')||{}).dataset,st=$("d-st");
    if(!v||!v.v){st.className="status err";st.textContent="어땠는지 하나만 골라 주세요.";return}
    const text=$("d-memo").value.trim();dayBusy=true;b.disabled=true;st.className="status";st.innerHTML=`다음 연습을 맞추는 중이에요.<div class="ld" aria-hidden="true"></div>`;
    const li=day.items.find(x=>x.kind==="lesson"),l=(li&&lessons.find(x=>x.id===li.key.split(":")[1]))||lessons[0];
    const amount=`${(day.done||[]).length}/${day.items.length}개`;let adj={adjust:"",drill:null,ask_coach:""};
    try{if(l&&ai)adj=(await ai({task:"feedback",lesson:{result:l.result,feedback:l.feedback||[]},verdict:v.v,text:["오늘 "+amount,text].filter(Boolean).join(" / ")})).data||adj}catch(_){}
    try{
      if(l){const f={date:today(),day:li?Number(li.key.split(":")[2]):null,amount,verdict:v.v,text,adjust:adj.adjust||"",drill:adj.drill||null,ask:adj.ask_coach||"",createdAt:new Date().toISOString()};
        l.feedback=[...(l.feedback||[]),f];await db.doc(`players/${uid}/lessons/${l.id}`).update({feedback:l.feedback})}
      Object.assign(day,{verdict:v.v,text,adjust:adj.adjust||"",finishedAt:new Date().toISOString()});await saveDay();toast("오늘 연습을 기록했어요");buzz()}
    catch(_){toast("저장하지 못했어요. 다시 눌러 주세요")}
    finally{dayBusy=false}
    renderDay();renderFeelHist();renderActive();chartSay();renderSug();return}
});

/* ===== 오늘의 대화: 루크가 하루에 하나씩 묻는 스테이트먼트 (한꺼번에 채우지 않게) ===== */
function nextStmtQ(){for(const a of AREAS){if(a.rate===false)continue;const v=(stmt.areas||{})[a.k]||{};const i=a.items.find(x=>!(v[x.k]&&(v[x.k].v||v[x.k].m)));if(i)return {a,i}}return null}
function renderTalkQ(){
  const box=$("talk-q");if(!box)return;const q=uid&&stmt.bio?nextStmtQ():null;
  if(!q||prefGet("q-skip","")===today()){box.innerHTML="";return}
  box.dataset.a=q.a.k;box.dataset.i=q.i.k;
  box.innerHTML=`<div class="panel tq"><div class="guide" id="g-tq"></div><div class="fld"><b>${esc(q.a.n)} · ${esc(q.i.l)}</b>${slider("tq-r",{min:1,max:5,start:3,fmt:v=>v+" · "+RATE[v],label:q.i.l},null)}</div>
    <div class="actions"><button class="btn sm gold" type="button" data-tq="save">저장</button><button class="btn sm" type="button" data-tq="skip">오늘은 그만</button></div></div>`;
  say($("g-tq"),"하나만 물어볼게요. 지금 내 실력을 1~5로 밀어서 골라 주세요.",{who:"rook"});
}
$("talk-q").addEventListener("click",async e=>{const b=e.target.closest("[data-tq]");if(!b)return;const box=$("talk-q");
  if(b.dataset.tq==="skip"){prefSet("q-skip",today());renderTalkQ();return}
  const v=slVal(box,"tq-r");if(v===null){toast("밀어서 골라 주세요");return}
  const a=AREAS.find(x=>x.k===box.dataset.a),i=a&&a.items.find(x=>x.k===box.dataset.i);if(!i)return;
  const old=(stmt.areas||{})[a.k]||{};stmt.areas={...(stmt.areas||{}),[a.k]:{...old,[i.k]:{...(old[i.k]||{}),l:i.l,v,m:(old[i.k]||{}).m||"",mn:(old[i.k]||{}).mn??null,u:(old[i.k]||{}).u||"",coach:false},_n:a.n,_at:new Date().toISOString()}};
  try{await saveStatement();toast("저장했어요");buzz()}catch(_){toast("저장하지 못했어요")}renderTalkQ()});

/* ===== 나의 데이터 (오른쪽 패널) =====
   휴대폰에서 오른쪽 가장자리 탭을 누르거나 왼쪽으로 밀면 펼쳐진다. 내 기록을 한눈에 보고 각 방으로 바로 간다. */
function dpOpen(){renderDataPanel();$("dpanel").hidden=false;requestAnimationFrame(()=>$("dpanel").classList.add("on"));$("dp-tab").setAttribute("aria-expanded","true");document.body.style.overflow="hidden";setTimeout(()=>$("dpanel").querySelector(".dp-x").focus(),250)}
function dpClose(){const p=$("dpanel");if(p.hidden)return;p.classList.remove("on");$("dp-tab").setAttribute("aria-expanded","false");document.body.style.overflow="";setTimeout(()=>{p.hidden=true;$("dp-tab").focus({preventScroll:true})},260)}
function renderDataPanel(){
  const coachL=lessons.filter(l=>l.source!=="self"),selfL=lessons.filter(l=>l.source==="self");
  const ss=(mandala&&mandala.sessions)||[],fin=ss.filter(x=>x.items.length&&x.done.length===x.items.length).length;
  const last=lessons[0]?lessons[0].date:"";$("dp-last").textContent=last?"마지막 기록 "+last.replace(/-/g,"."):"";
  $("dp-tiles").innerHTML=[["코치님 레슨",coachL.length,"개"],["내 얘기",selfL.length,"개"],["배틀플랜",ss.length?fin:"—",ss.length?" / "+ss.length:""]]
    .map(([l,v,u])=>`<div class="dp-tile"><small>${l}</small><b>${v}<i>${u}</i></b></div>`).join("");
  const b=stmt.bio||{},areas=AREAS.filter(a=>a.rate!==false).map(a=>[a.n,areaAvg(a)]);
  const row=(n,title,sub,body,go,cls="")=>`<details class="dp-item${cls}"><summary><span class="dp-n">${n}</span><span class="dp-t"><b>${title}</b><small>${sub}</small></span><span class="dp-chev" aria-hidden="true">⌄</span></summary><div class="dp-body">${body}${go?`<button class="btn sm gold" type="button" data-dp-go="${go}">열기</button>`:""}</div></details>`;
  const lessonRow=l=>`<div class="dp-line"><span>${esc(md(l.date))}</span><span>${esc(l.result.title)}</span></div>`;
  $("dp-list").innerHTML=
    row("01","나의 스테이트먼트",[b.years,b.handicap].filter(Boolean).map(esc).join(" · ")||"아직 비어 있어요",
      `<p class="hint" style="margin:0">스페셜 · 입스: ${esc(yipsLine())}</p><div class="dp-bars">${areas.map(([n,v])=>`<div><span>${esc(n)}</span><i><i style="width:${v?v/5*100:0}%"></i></i><small>${v?v.toFixed(1):"—"}</small></div>`).join("")}</div>`,"me")+
    row("02","내 얘기",selfL[0]?esc(selfL[0].result.title):"아직 남긴 얘기가 없어요",selfL.slice(0,3).map(lessonRow).join("")||`<p class="hint">말하기에서 '내 얘기'를 골라 지금 겪는 고민을 알려 주세요.</p>`,"dx")+
    row("03","코치님 레슨",coachL[0]?esc(md(coachL[0].date)+" · "+(coachL[0].coach||"코치 미기재")):"아직 레슨 기록이 없어요",coachL.slice(0,3).map(lessonRow).join("")||`<p class="hint">말하기에서 코치님 말씀을 들려주세요.</p>`,"lesson")+
    row("04","만다라트 · 배틀플랜",mandala?(ss.length?`배틀플랜 ${fin}/${ss.length}회차`:"배틀플랜을 만들어 보세요"):"아직 만다라트가 없어요",
      mandala?`<div class="dp-mini">${[0,1,2,3,null,4,5,6,7].map(i=>i===null?`<span class="g">${esc(mandala.goal||profile.goal||DEF_GOAL[profile.level])}</span>`:(()=>{const [p,n]=PILLARS[i],st=cellStat(p);return `<span style="--p:${st.pct||0}%">${esc(n)}<small>${st.pct===null?"—":st.pct+"%"}</small></span>`})()).join("")}</div>`:`<p class="hint">오늘의 훈련 아래 '만다라트 · 배틀플랜'에서 만들 수 있어요.</p>`,"train")+
    `<div class="dp-item soon"><span class="dp-n">05</span><span class="dp-t"><b>맞는 레슨자 추천</b><small>곧 열려요</small></span></div>`;
}
$("dp-tab").addEventListener("click",dpOpen);
$("dpanel").addEventListener("click",e=>{if(e.target.closest("[data-dp-close]")){dpClose();return}const g=e.target.closest("[data-dp-go]");if(g){dpClose();show(g.dataset.dpGo)}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("dpanel").hidden)dpClose()});
/* 밀어서 열고 닫기: 오른쪽 가장자리에서 왼쪽으로 밀면 열림, 패널을 오른쪽으로 밀면 닫힘 */
(function(){let x0=null,y0=0,from="";
  document.addEventListener("touchstart",e=>{const t=e.touches[0];if($("dp-tab").hidden)return;
    if($("dpanel").hidden&&t.clientX>innerWidth-28&&$("drawer").hidden){x0=t.clientX;y0=t.clientY;from="edge"}else if(!$("dpanel").hidden&&e.target.closest(".dp-sheet")){x0=t.clientX;y0=t.clientY;from="sheet"}else x0=null},{passive:true});
  document.addEventListener("touchend",e=>{if(x0===null)return;const t=e.changedTouches[0],dx=t.clientX-x0,dy=Math.abs(t.clientY-y0);
    if(dy<60){if(from==="edge"&&dx<-50)dpOpen();if(from==="sheet"&&dx>70)dpClose()}x0=null},{passive:true});
})();


/* ===== 오늘의 대화 (첫 화면) + 왼쪽 메뉴 상태 ===== */
function renderTalk(){
  const d=new Date();$("talk-date").textContent=(window.AP_LANG&&window.AP_LANG!=="ko")?d.toLocaleDateString({en:"en-US",ja:"ja-JP",zh:"zh-CN",ms:"ms-MY",id:"id-ID"}[window.AP_LANG]||"en-US",{month:"long",day:"numeric",weekday:"long"}):`${d.getMonth()+1}월 ${d.getDate()}일 ${"일월화수목금토"[d.getDay()]}요일`;
  const name=($("who").textContent||"").trim();const nm=name&&name!=="내 기록"&&name!=="연결 중"?((window.AP_LANG||"ko")!=="ko"?" "+name:name+"님"):"";
  /* 크루 말투(설정)에 따라 첫 인사도 다르게 */
  const tone=(user&&user.info&&user.info().tone)||"coach";
  const dn=day&&day.items?(day.verdict?"done":"plan"):"";
  const line2=tone==="friend"?(!lessons.length?"오늘도 반가워요! 받은 레슨이나 고민부터 편하게 남겨 봐요.":dn==="done"?"오늘 연습 끝! 수고했어요. 더 남길 게 있으면 말해 줘요.":dn==="plan"?"오늘 짠 훈련 기다리고 있어요! 끝나면 '했어요' 눌러 줘요.":"오늘 연습 같이 짜 볼까요? 편하게 말해 줘요!")
    :tone==="direct"?(!lessons.length?"레슨이나 고민부터 남기세요.":dn==="done"?"오늘 훈련 완료.":dn==="plan"?"오늘 훈련 진행 중. 끝나면 '했어요'.":"오늘 훈련부터 짜세요.")
    :(!lessons.length?"오늘 받은 레슨이나 지금 겪는 고민부터 남겨 볼까요?":dn==="done"?"오늘 연습을 기록했어요. 새로 남길 레슨이나 고민이 있나요?":dn==="plan"?"오늘 짠 훈련이 기다리고 있어요. 끝나면 '했어요'만 눌러 주세요.":"오늘 연습 계획부터 같이 짜 볼까요?");
  $("talk-hi").innerHTML=`<p>안녕하세요${nm?", "+esc(nm):""}.</p><p>${esc(line2)}</p>`;
}
function renderDrawerStatus(){
  const b=stmt.bio||{},bioOk=!bioMissing(b).length,n=AREAS.filter(a=>areaDone(a)>0).length;
  const set=(id,ok,txt)=>{const el=$(id);if(!el)return;el.classList.toggle("ok",ok);el.querySelector("i").textContent=ok?"✓":el.querySelector("i").textContent.replace("✓",id==="dw-s1"?"1":"2");el.querySelector("em").textContent=txt};
  set("dw-s1",bioOk,bioOk?"완료":"입력하기");
  {const y=stmt.special&&stmt.special.yips,el=$("dw-s4");if(el){el.classList.toggle("ok",!!(y&&y.status));el.querySelector("em").textContent=y&&y.status?(y.status==="없음"?"없음":y.status):"선택"}}set("dw-s2",n===AREAS.length,n===AREAS.length?"완료":`${n}/${AREAS.length}`);
  $("dw-sub").textContent=[b.years,b.handicap].filter(Boolean).join(" · ");
}
$("talk-plus").addEventListener("click",()=>{const sh=$("talk-sheet"),open=sh.hidden;sh.hidden=!open;$("talk-plus").setAttribute("aria-expanded",open);$("talk-plus").textContent=open?"×":"+"});
$("talk-sheet").addEventListener("click",e=>{const b=e.target.closest("[data-tk]");if(!b)return;$("talk-sheet").hidden=true;$("talk-plus").textContent="+";$("talk-plus").setAttribute("aria-expanded","false");
  const a=b.dataset.tk;if(a==="rec"){recMode="coach";show("lesson");setTimeout(()=>{$("f-coach").focus();if(dict&&!$("mic-row").hidden)toast("코치 이름을 적고 '레슨 듣기 시작'을 누르면 녹음돼요")},120);return}show(a)});


/* ===== 레거시 나무가 자라는 모습 =====
   화면이 열리면 설명·버튼 없이 1단계부터 32단계까지 저절로 자라고, 다 자란 나무로 남는다(대표 결정).
   나무 모양은 보여 주기용이고, 열매 크기·밝기와 열매를 눌렀을 때의 포인트·출처는 실제 기록 그대로다. */
function growTour(tree,el,realData){
  if(!tree||!el)return;
  if(matchMedia("(prefers-reduced-motion: reduce)").matches){tree.update({...realData(),stageOverride:31});return}
  const th=(window.APLegacyTree&&window.APLegacyTree.thresholds)||[];
  const demo=s=>{const f=s/31,nodes={};["N1","N2","N3","N4","N5","N6","N7","N8"].forEach((n,i)=>nodes[n]={legacyPointCount:Math.round(f*f*80*(.55+.45*((i*37)%10)/10))});
    return {nodes,totalLegacyPointCount:th[s]||0,stageOverride:s}};
  el.classList.add("growing");let s=0;
  const timer=setInterval(()=>{tree.update(demo(s));
    if(s>=31){clearInterval(timer);setTimeout(()=>{el.classList.remove("growing");tree.update({...realData(),stageOverride:31})},1200);return}s++},190);
}


/* ===== 광장 크루가 스스로 돌아다니기 =====
   크루는 광장 바닥(타원) 안에서 천천히 걸어 다니다 멈춰 쉬고, 가끔 인사한다. 누르면 그 방으로 들어간다(조작해서 움직이는 게임은 아님).
   그림은 자세별 정지 이미지라 다리 동작은 없고, 이동 + 살짝 흔들림으로 걷는 느낌만 낸다. 모자 AP 모노그램이 뒤집히지 않게 좌우 반전은 하지 않는다. */
const WALK={timers:[],on:false,frames:null,seen:true};
/* 광장이 화면에 보일 때만 걷기 그림을 넘긴다 (휴대폰 배터리·성능) */
try{new IntersectionObserver(es=>es.forEach(e=>{WALK.seen=e.isIntersecting}),{threshold:0.05}).observe(document.getElementById("scene"))}catch(_){}
/* 걷는 동작 그림(있을 때만): img/crew3d/walk/manifest.json = {"logan":{"right":8,"left":8},...}
   파일 이름 img/crew3d/walk/{id}-walk-{right|left}-{01..08}.webp. 없으면 이동+흔들림으로 대신한다. */
async function loadWalkFrames(){if(WALK.frames!==null)return;WALK.frames={};
  try{const r=await fetch("img/crew3d/walk/manifest.json",{cache:"no-cache"});if(!r.ok)return;const m=await r.json();
    for(const [id,dirs] of Object.entries(m))for(const [d,n] of Object.entries(dirs)){const list=Array.from({length:n},(_,i)=>`img/crew3d/walk/${id}-walk-${d}-${String(i+1).padStart(2,"0")}.webp`);
      list.forEach(u=>{const im=new Image();im.src=u});(WALK.frames[id]=WALK.frames[id]||{})[d]=list}}catch(_){}}
function walkAnim(st,img,id,dir,on){clearInterval(st._wf);const fr=WALK.frames&&WALK.frames[id]&&WALK.frames[id][dir];
  if(!on||!fr){st.classList.toggle("framed",false);if(!on&&id)img.src=`img/crew3d/${id}-idle.webp`;return}
  st.classList.add("framed");let k=0;img.src=fr[0];st._wf=setInterval(()=>{if(!WALK.seen)return;k=(k+1)%fr.length;img.src=fr[k]},125)}
function floorPoint(self){ // 바닥 타원 안의 한 점 (left %, bottom %) — 나무 줄기 앞 가운데는 비우고, 다른 크루(가는 곳 포함)와 떨어진 곳
  const others=[...document.querySelectorAll("#v-home .station")].filter(x=>x!==self).map(x=>({x:+x.dataset.x,y:+x.dataset.y}));
  for(let k=0;k<40;k++){const x=6+Math.random()*80,y=3+Math.random()*30;
    const cx=(x+7-50)/46,cy=(y-18)/17;if(cx*cx+cy*cy>1)continue;if(Math.abs(x+7-50)<11&&y>22)continue;
    if(others.some(o=>Math.abs(o.x-x)<17&&Math.abs(o.y-y)<12))continue;if(x<27&&y<17)continue;return {x,y}}
  return {x:10+Math.random()*70,y:6+Math.random()*12};
}
function placeStation(st,pt,dur){st.style.transitionDuration=dur+"s";st.style.left=pt.x+"%";st.style.bottom=pt.y+"%";
  st.style.zIndex=String(40-Math.round(pt.y));const sc=1.08-pt.y/34*0.3;st.style.setProperty("--depth",sc.toFixed(3));st.style.transform=`scale(${sc.toFixed(3)})`;st.style.transformOrigin="50% 100%"}
async function crewWalk(){
  await loadWalkFrames();
  const sts=[...document.querySelectorAll("#v-home .station")];if(!sts.length)return;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!WALK.placed){const start=[{x:8,y:20},{x:24,y:5},{x:62,y:5},{x:80,y:20}];sts.forEach((st,i)=>{st.dataset.x=start[i].x;st.dataset.y=start[i].y;placeStation(st,start[i],0)});WALK.placed=true}
  if(reduce||WALK.on)return;WALK.on=true;
  sts.forEach((st,i)=>{
    const img=st.querySelector(".crew-go img"),id=(img.src.match(/crew3d\/(\w+)-/)||[])[1];
    if(!st.dataset.bound){st.dataset.bound="1";st.addEventListener("pointerenter",e=>{if(e.pointerType==="mouse"){st.dataset.hold="1";crewFreeze(st)}});st.addEventListener("pointerleave",()=>{delete st.dataset.hold})}
    const held=()=>!!st.dataset.hold||!!st.dataset.pin;
    const rest=()=>{if(!WALK.on)return;st.classList.remove("walking");walkAnim(st,img,id,"",false);
      if(Math.random()<.35&&id){img.src=`img/crew3d/${id}-greet.webp`;WALK.timers.push(setTimeout(()=>{img.src=`img/crew3d/${id}-idle.webp`},1800))}
      WALK.timers.push(setTimeout(go,2500+Math.random()*4500))};
    const go=()=>{if(!WALK.on)return;if(held()||document.hidden||$("v-home").hidden||!WALK.seen){WALK.timers.push(setTimeout(go,1500));return}
      const from={x:+st.dataset.x,y:+st.dataset.y},to=floorPoint(st),dist=Math.hypot(to.x-from.x,(to.y-from.y)*1.6),dur=Math.max(2.5,dist/5.5);
      st.dataset.x=to.x;st.dataset.y=to.y;st.classList.add("walking");walkAnim(st,img,id,to.x<from.x?"left":"right",true);placeStation(st,to,dur);WALK.timers.push(setTimeout(rest,dur*1000))};
    WALK.timers.push(setTimeout(go,800+i*900));
  });
}
/* 걷던 자리에서 바로 멈춘다 (지금 그려진 위치로 고정) */
function crewFreeze(st){clearInterval(st._wf);st.classList.remove("framed");const im=st.querySelector(".crew-go img"),cid=(st.querySelector(".crew-go")||{}).dataset;if(im&&cid&&cid.crew&&/walk/.test(im.src))im.src=`img/crew3d/${cid.crew}-idle.webp`;const sc=$("scene"),cs=getComputedStyle(st),W=sc.clientWidth,H=sc.clientHeight;
  const x=parseFloat(cs.left)/W*100,y=parseFloat(cs.bottom)/H*100;st.style.transitionDuration="0s";st.style.left=x+"%";st.style.bottom=y+"%";st.dataset.x=x;st.dataset.y=y;st.classList.remove("walking")}
function crewStop(){WALK.on=false;WALK.timers.forEach(clearTimeout);WALK.timers=[];document.querySelectorAll("#v-home .station").forEach(st=>{clearInterval(st._wf);st.classList.remove("walking","framed");const im=st.querySelector(".crew-go img"),c=st.querySelector(".crew-go").dataset.crew;if(im&&/walk/.test(im.src))im.src=`img/crew3d/${c}-idle.webp`;st.style.transitionDuration="0s"})}


/* ===== 광장 크루를 누르면 소개가 나온다 (? 없이) =====
   이름 → 무엇을 하는 곳 → 할 수 있는 일, 그리고 '들어가기'. 보는 동안 그 크루는 걷기를 멈춘다. */
const CREW_VIEW={logan:"lesson",rook:"dx",daryl:"train",paco:"train"};
let popCrew=null;
function crewPop(id,st){
  const h=MILO_HELP[id];if(!h)return;const pop=$("crew-pop");
  document.querySelectorAll("#v-home .station").forEach(x=>{delete x.dataset.pin});if(st){st.dataset.pin="1";crewFreeze(st)}
  miloPopClose();popCrew=id;$("crew-pop-img").src=`img/crew3d/${id}-greet.webp`;$("crew-pop-h").textContent=h.title;$("crew-pop-m").textContent=h.meaning;$("crew-pop-a").textContent=h.action||"";
  $("crew-pop-go").textContent=h.goLabel||"들어가기";pop.hidden=false;requestAnimationFrame(()=>pop.classList.add("on"));$("crew-pop-go").focus({preventScroll:true});
}
function crewPopClose(){const pop=$("crew-pop");if(pop.hidden)return;pop.classList.remove("on");pop.hidden=true;document.querySelectorAll("#v-home .station").forEach(x=>{delete x.dataset.pin});
  const st=popCrew&&document.querySelector(`#v-home .crew-go[data-crew="${popCrew}"]`);popCrew=null;if(st)st.focus({preventScroll:true})}
$("v-home").addEventListener("click",e=>{
  const b=e.target.closest(".crew-go[data-crew]");if(b){e.stopPropagation();crewPop(b.dataset.crew,b.closest(".station"));return}
  if(e.target.closest("#crew-pop-go")){const v=CREW_VIEW[popCrew];if(popCrew==="logan")recMode="coach";crewPopClose();if(v)show(v);return}
  if(e.target.closest("#crew-pop-x")){crewPopClose();return}
  if(!e.target.closest("#crew-pop"))crewPopClose();
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")crewPopClose()});


/* ===== 광장의 밀로 (도움말 안내) =====
   크루 옆 ?를 없앤 대신, 광장 구석 굴의 밀로를 누르면 궁금한 것을 골라 설명을 듣는다. 밀로는 걸어 다니지 않는다. */
MILO_HELP.data={title:"나의 데이터",meaning:"화면 오른쪽 가장자리의 금색 '내 데이터' 탭이야. 누르거나 왼쪽으로 밀면 펼쳐져.",action:"코치님 레슨과 내 얘기, 배틀플랜 진행, 스테이트먼트를 한눈에 보고 각 화면으로 바로 갈 수 있어.",goLabel:"열어 보기",onGo:()=>dpOpen()};
function miloPopClose(){const p=$("milo-pop");if(!p||p.hidden)return;p.classList.remove("on");p.hidden=true;$("milo-pop-d").hidden=true;p.querySelectorAll("[data-mh]").forEach(x=>x.removeAttribute("aria-pressed"))}
$("milo-spot").addEventListener("click",e=>{e.stopPropagation();crewPopClose();if(miloBusy){miloStop();miloIdleLoop()}const p=$("milo-pop");if(!p.hidden){miloPopClose();return}p.hidden=false;requestAnimationFrame(()=>p.classList.add("on"))});
$("milo-pop").addEventListener("click",e=>{
  if(e.target.closest("#milo-pop-x")){e.stopPropagation();miloPopClose();return}
  const c=e.target.closest("[data-mh]");if(c){const k=c.dataset.mh,h=MILO_HELP[k];if(!h)return;
    $("milo-pop").querySelectorAll("[data-mh]").forEach(x=>x.setAttribute("aria-pressed",x===c));
    const d=$("milo-pop-d");d.hidden=false;d.innerHTML=`<b>${esc(h.title)}</b><p>${esc(h.meaning)}</p>${h.action?`<p class="hint">${esc(h.action)}</p>`:""}${h.onGo?`<button class="btn gold sm" type="button" id="milo-pop-go">${esc(h.goLabel||"가 보기")}</button>`:""}`;
    d.dataset.k=k;return}
  if(e.target.closest("#milo-pop-go")){const h=MILO_HELP[$("milo-pop-d").dataset.k];miloPopClose();if(h&&h.onGo)h.onGo()}
});
$("v-home").addEventListener("click",e=>{if(!e.target.closest("#milo-pop")&&!e.target.closest("#milo-spot"))miloPopClose()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")miloPopClose()});


/* ===== 밀로 등장 (구덩이에서 쏙) =====
   광장에 들어오면 1→8을 한 번 재생하고 8번(가장자리에 손 얹고 웃기)에서 기다린다.
   가끔(20~40초) 쏙 들어갔다(역순) 다시 나온다. 메뉴가 열렸거나 손을 대고 있을 때, 화면 밖일 때는 하지 않는다. 동작 줄이기면 8번 정지. */
const MILO_FR=Array.from({length:8},(_,i)=>`img/milo/milo-pop-${String(i+1).padStart(2,"0")}.webp`);
const MILO_IN=Array.from({length:8},(_,i)=>`img/milo/milo-in-${String(i+1).padStart(2,"0")}.webp`); // 퇴장(쏙 숨기): 1=등장 8번, 8=빈 구덩이
const MILO_MS=[180,100,110,110,100,100,140],MILO_IN_MS=[150,220,130,90,100,100,150];
let miloT=null,miloBusy=false,miloHover=false;
[...MILO_FR,...MILO_IN].forEach(u=>{const im=new Image();im.src=u});
function miloPlay(seq,ms,done,set){const img=$("milo-pop-img");if(!img)return;const F=set||MILO_FR;miloBusy=true;let i=0;
  const step=()=>{img.src=F[seq[i]];const d=ms[i]||110;i++;if(i<seq.length)miloT=setTimeout(step,d);else{miloBusy=false;done&&done()}};step()}
function miloIdleLoop(){clearTimeout(miloT);miloT=setTimeout(()=>{
  const busy=!$("milo-pop").hidden||miloHover||document.hidden||$("v-home").hidden||!WALK.seen;
  if(busy){miloIdleLoop();return}
  /* 손 인사 → 쏙 숨기 → 흙 덮기 → 빈 구덩이 잠깐 → 다시 쏙 등장 */
  miloPlay([0,1,2,3,4,5,6,7],[...MILO_IN_MS,1400],()=>miloPlay([0,1,2,3,4,5,6,7],[...MILO_MS,0],miloIdleLoop),MILO_IN)},20000+Math.random()*20000)}
function miloEnter(){clearTimeout(miloT);const img=$("milo-pop-img");if(!img)return;
  if(matchMedia("(prefers-reduced-motion: reduce)").matches){img.src=MILO_FR[7];return}
  miloPlay([0,1,2,3,4,5,6,7],[400,...MILO_MS.slice(1),0],miloIdleLoop)}
function miloStop(leaving){clearTimeout(miloT);miloBusy=false;const img=$("milo-pop-img");if(img)img.src=MILO_FR[leaving?0:7]}
$("milo-spot").addEventListener("pointerenter",()=>{miloHover=true});$("milo-spot").addEventListener("pointerleave",()=>{miloHover=false});


/* ===== 스페셜 파트 · 입스(YIPS) =====
   입스는 6개 영역 중 하나가 아니라 전체 에러코드라 따로 기록·관리한다. 저장 statement.special.yips.
   크루는 원인을 단정하지 않고, 기술을 급히 바꾸지 않으며, 코치와 단계적으로 다루도록 안내한다(서버 규칙). */
const YIPS={status:["없음","예전에 있었음","지금 있음"],shots:["짧은 퍼트","긴 퍼트","칩·어프로치","벙커","드라이버","아이언"],
  symptoms:["손·손목이 멈춤","갑자기 튀거나 찍힘","손이 떨림","백스윙이 안 떨어짐","몸이 굳음"],when:["연습장에서도","코스에서","시합·압박 상황","특정 거리에서"]};
let yipsOpen=false;
function yipsLine(){const y=stmt.special&&stmt.special.yips;if(!y||!y.status)return "아직 체크하지 않았어요";if(y.status==="없음")return "입스 없음";
  return [y.status,(y.shots||[]).join("·"),y.severity?`심한 정도 ${y.severity}/5`:""].filter(Boolean).join(" · ")}
function renderYips(){
  const box=$("me-special");if(!box)return;const y=(stmt.special&&stmt.special.yips)||{};
  box.innerHTML=`<div class="panel me-area yips${yipsOpen?" open":""}"><button type="button" class="me-head" data-yips aria-expanded="${yipsOpen}">
      <span class="yips-badge" aria-hidden="true">S</span><span><b>스페셜 파트 · 입스</b><small>${esc(yipsLine())}</small></span><i class="bar"><i style="width:${y.status?100:0}%"></i></i></button>
    ${yipsOpen?`<form class="me-form" id="yips-form">
      <p class="notice" style="margin:0">입스는 한 영역의 문제가 아니라 스윙 전체에 나타나는 '에러'라서 따로 기록해요. 크루는 원인을 단정하지 않고, 코치님과 천천히 다루도록 도와요.</p>
      <div class="fld"><small>입스를 겪은 적이 있나요?</small>${chipsHTML("y-status",YIPS.status,y.status?[y.status]:[])}</div>
      <div class="fld"><small>어떤 샷에서요?</small>${chipsHTML("y-shots",YIPS.shots,y.shots||[],true)}</div>
      <div class="fld"><small>어떻게 나타나요?</small>${chipsHTML("y-symptoms",YIPS.symptoms,y.symptoms||[],true)}</div>
      <div class="fld"><small>언제 나타나요?</small>${chipsHTML("y-when",YIPS.when,y.when||[],true)}</div>
      <div class="fld"><small>얼마나 자주요?</small>${slider("y-freq",{min:1,max:10,start:3,fmt:v=>`10번 중 ${v}번`,label:"입스 빈도"},y.freq??null)}</div>
      <div class="fld"><small>얼마나 심한가요?</small>${slider("y-sev",{min:1,max:5,start:3,fmt:v=>v+" · "+["","조금 신경 쓰임","가끔 결과에 영향","자주 영향","샷이 두려움","거의 칠 수 없음"][v],label:"입스 심한 정도"},y.severity??null)}</div>
      <p class="hint" style="margin:0">손이나 팔의 떨림·경련이 골프 밖에서도 계속되면 코치님과 의료 전문가에게 꼭 상의해 주세요.</p>
      <div class="actions"><button class="btn gold" type="submit">저장</button></div></form>`:""}</div>`;
}
$("me-special").addEventListener("click",e=>{if(e.target.closest("[data-yips]")){yipsOpen=!yipsOpen;renderYips()}});
$("me-special").addEventListener("submit",async e=>{e.preventDefault();const f=e.target;const st=picked(f,"y-status")[0]||"";
  if(!st){toast("입스를 겪은 적이 있는지 먼저 골라 주세요");return}
  const y=st==="없음"?{status:st}:{status:st,shots:picked(f,"y-shots"),symptoms:picked(f,"y-symptoms"),when:picked(f,"y-when"),freq:slVal(f,"y-freq"),severity:slVal(f,"y-sev")};
  stmt.special={...(stmt.special||{}),yips:{...y,code:"YIPS",at:new Date().toISOString()}};
  try{await saveStatement();yipsOpen=false;toast("저장했어요");renderYips()}catch(_){toast("저장하지 못했습니다")}});

/* ===== 내 계정: 연결 · 구독 · 설정 · 함께 보는 선수 =====
   연결: 선수가 링크를 보내면 받은 사람(코치님·부모님 등)이 로그인해서 요청하고, 선수가 수락해야 읽기만 할 수 있다(규칙 isViewer).
   구독: 파일럿 동안 무료. 플랜과 가격은 대표 확정 전이라 '곧 열려요'.
   설정: 이름(앱 안에서 보이는 이름), 크루 말투(서버가 대화·피드백에 반영), 진동, 계정 삭제(서버 account 함수). */
const APP_VER="2026-11-18";
const CONTACT_EMAIL="negankim@ap-legacy.com";
const LINK_ROLES=[["coach","코치님"],["parent","부모님·보호자"],["family","가족·친구"]];
const TONE_OPTS=[["coach","코치형","오늘은 출발 방향부터 확인해요. 게이트 10개, 성공 수를 세 주세요."],["friend","친구형","어제 못 했어도 괜찮아요! 오늘 같이 게이트 10개만 해 봐요."],["direct","직설형","게이트 10개. 성공 수 기록. 끝."]];
let viewers=[],watching=[],myAge=null,watchSel=null;
const prefGet=(k,d)=>{try{const v=localStorage.getItem("ap-"+k);return v===null?d:v}catch(_){return d}};
const prefSet=(k,v)=>{try{localStorage.setItem("ap-"+k,v)}catch(_){}};
const buzz=()=>{if(prefGet("vib","1")==="1"&&navigator.vibrate)try{navigator.vibrate(12)}catch(_){}};
const roleName=r=>(LINK_ROLES.find(x=>x[0]===r)||[,"연결"])[1];
const myName=()=>{const n=($("who").textContent||"").trim();return n&&n!=="내 기록"?n:"선수"};
async function loadViewers(){
  if(!uid)return;
  try{const s=await db.collection("players/"+uid+"/viewers").get();viewers=s.docs.map(d=>({id:d.id,...d.data()}))}catch(_){viewers=[]}
  try{const s=await db.collection("users/"+uid+"/watching").get();watching=s.docs.map(d=>({id:d.id,...d.data()}))}catch(_){watching=[]}
  if(myAge===null){try{const d=await db.doc("users/"+uid).get();myAge=d.exists?(d.data().ageBand||""):""}catch(_){myAge=""}}
  const act=viewers.filter(v=>v.status==="active").length,pend=viewers.filter(v=>v.status==="pending").length;
  $("dw-link-n").textContent=pend?`요청 ${pend}`:act?`${act}명`:"없음";
  $("dw-watch").hidden=!watching.length;$("dw-watch-n").textContent=watching.length?watching.length+"명":"";
}
const acctRow=(main,sub,right="",attrs="")=>`<div class="acct-row"${attrs}><span><b>${main}</b>${sub?`<small>${sub}</small>`:""}</span>${right}</div>`;

function renderLink(){
  const box=$("link-box");if(!box)return;const act=viewers.filter(v=>v.status==="active"),pend=viewers.filter(v=>v.status==="pending");
  box.innerHTML=`<p class="lead">연결하면 코치님이나 부모님이 내 기록(레슨·문제 진술·만다라트·배틀플랜·스테이트먼트)을 함께 볼 수 있어요. 보기만 하고 고치지는 못해요. 요청이 오면 여기서 수락해요.</p>
    ${pend.length?`<h3 class="acct-k">받은 요청</h3><div class="acct-list">${pend.map(v=>acctRow(esc(v.name||"이름 없음"),`${esc(roleName(v.role))} · ${esc(md((v.requestedAt||"").slice(0,10)))} 요청`,`<span class="acct-act"><button class="btn sm gold" type="button" data-lk="ok" data-id="${esc(v.id)}">수락</button><button class="btn sm" type="button" data-lk="no" data-id="${esc(v.id)}">거절</button></span>`)).join("")}</div>`:""}
    <h3 class="acct-k">함께 보는 사람</h3><div class="acct-list">${act.length?act.map(v=>acctRow(esc(v.name||"이름 없음"),esc(roleName(v.role)),`<button class="btn sm" type="button" data-lk="cut" data-id="${esc(v.id)}">연결 끊기</button>`)).join(""):acctRow(`<span class="hint">아직 연결된 사람이 없어요</span>`,"")}</div>
    <h3 class="acct-k">연결 추가</h3><div class="acct-list"><div class="acct-row col"><span><b>연결 링크 보내기</b><small>링크를 받은 사람이 로그인해서 요청하면, 내가 수락해야 볼 수 있어요. 링크는 7일 동안 쓸 수 있어요.</small></span>
      <div class="chips" data-pick="lk-role">${LINK_ROLES.map(([k,l],i)=>`<button type="button" class="chip" data-v="${k}" aria-pressed="${i===0}">${l}</button>`).join("")}</div>
      <button class="btn gold" type="button" data-lk="make">링크 만들기</button><div id="lk-out"></div></div></div>
    ${myAge==="child"||myAge==="teen"?`<p class="notice">미성년 선수는 부모님·보호자와 함께 확인하고 연결해 주세요. 모르는 사람의 요청은 수락하지 마세요.</p>`:""}`;
}
$("link-box").addEventListener("click",async e=>{const b=e.target.closest("[data-lk]");if(!b)return;const a=b.dataset.lk,id=b.dataset.id;
  try{
    if(a==="ok"){await db.doc(`players/${uid}/viewers/${id}`).update({status:"active",approvedAt:new Date().toISOString()});toast("수락했어요");buzz()}
    if(a==="no"){await db.doc(`players/${uid}/viewers/${id}`).update({status:"declined",approvedAt:new Date().toISOString()});toast("거절했어요")}
    if(a==="cut"){if(!confirm(T("연결을 끊을까요? 그 사람은 더 이상 내 기록을 볼 수 없어요.")))return;await db.doc(`players/${uid}/viewers/${id}`).delete();toast("연결을 끊었어요")}
    if(a==="make"){const role=picked($("link-box"),"lk-role")[0]||"coach";const arr=new Uint8Array(9);crypto.getRandomValues(arr);
      const code=[...arr].map(x=>"abcdefghjkmnpqrstuvwxyz23456789"[x%31]).join("");
      await db.doc("invites/"+code).set({owner:uid,ownerName:myName(),role,createdAt:new Date().toISOString(),expires:Date.now()+7*864e5});
      const url=location.origin+"/?invite="+code;
      $("lk-out").innerHTML=`<label class="fld">${esc(roleName(role))}에게 보낼 링크<input id="lk-url" readonly value="${esc(url)}"></label><div class="actions"><button class="btn sm gold" type="button" data-lk="copy">복사</button>${navigator.share?`<button class="btn sm" type="button" data-lk="share">보내기</button>`:""}</div>`;return}
    if(a==="copy"){const u=$("lk-url");u.select();try{await navigator.clipboard.writeText(u.value)}catch(_){document.execCommand("copy")}toast("링크를 복사했어요");buzz();return}
    if(a==="share"){try{await navigator.share({title:"AP 레슨 노트 연결",text:`${myName()} 선수가 AP 레슨 노트 기록을 함께 보자고 해요.`,url:$("lk-url").value})}catch(_){}return}
    await loadViewers();renderLink();
  }catch(_){toast("처리하지 못했어요. 다시 눌러 주세요")}
});
/* 링크를 받은 사람: 로그인 후 ?invite= 로 들어오면 요청 카드를 띄운다 */
async function handleInvite(){
  const code=new URLSearchParams(location.search).get("invite");if(!code)return;history.replaceState(null,"",location.pathname);
  let inv=null;try{const d=await db.doc("invites/"+code).get();inv=d.exists?d.data():null}catch(_){}
  if(!inv||inv.expires<Date.now()){toast("연결 링크가 만료됐거나 없어요. 다시 받아 주세요");return}
  if(inv.owner===uid){toast("내가 만든 연결 링크예요. 받은 사람이 열어야 해요");return}
  const ov=document.createElement("div");ov.className="cs";ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");
  ov.innerHTML=`<div class="cs-box wrap"><div class="panel" style="display:grid;gap:10px"><span class="eyebrow"><b>L</b>연결 요청</span>
    <h2 style="margin:0">${esc(inv.ownerName||"선수")} 선수가 기록을 함께 보자고 해요</h2>
    <p style="margin:0">${esc(roleName(inv.role))}(으)로 요청을 보내면, 선수가 수락한 뒤 레슨·문제 진술·만다라트·배틀플랜을 볼 수 있어요. 보기만 하고 고치지는 못해요.</p>
    <div class="actions"><button class="btn gold" type="button" data-iv="yes">요청 보내기</button><button class="btn" type="button" data-iv="no">나중에</button></div></div></div>`;
  document.body.append(ov);
  ov.addEventListener("click",async e=>{const b=e.target.closest("[data-iv]");if(!b)return;
    if(b.dataset.iv==="yes"){try{const now=new Date().toISOString();
      await db.doc(`players/${inv.owner}/viewers/${uid}`).set({name:myName(),role:inv.role,status:"pending",code,requestedAt:now});
      await db.doc(`users/${uid}/watching/${inv.owner}`).set({ownerName:inv.ownerName||"",role:inv.role,at:now});
      toast("요청을 보냈어요. 선수가 수락하면 볼 수 있어요");await loadViewers()}catch(_){toast("요청을 보내지 못했어요. 링크를 다시 받아 주세요")}}
    ov.remove()});
}

/* 함께 보는 선수: 읽기만 */
async function renderWatch(){
  const box=$("watch-box");if(!box)return;
  if(!watching.length){box.innerHTML=`<p class="lead">함께 보는 선수가 없어요. 선수에게 연결 링크를 받아 열면 여기에 생겨요.</p>`;return}
  if(!watchSel||!watching.find(w=>w.id===watchSel))watchSel=watching[0].id;
  const w=watching.find(x=>x.id===watchSel);
  box.innerHTML=`<div class="chips">${watching.map(x=>`<button type="button" class="chip" data-wsel="${esc(x.id)}" aria-pressed="${x.id===watchSel}">${esc(x.ownerName||"선수")}</button>`).join("")}</div><div id="watch-one"><p class="hint">불러오는 중…</p></div>`;
  const one=$("watch-one");
  let st=null;try{const d=await db.doc(`players/${w.id}/viewers/${uid}`).get();st=d.exists?d.data().status:null}catch(_){}
  if(st!=="active"){one.innerHTML=`<div class="notice">${st==="pending"?"선수가 아직 수락하지 않았어요. 수락하면 기록이 보여요.":st==="declined"?"선수가 요청을 거절했어요.":"연결이 끊겼어요."}</div><div class="actions"><button class="btn sm" type="button" data-wrm="${esc(w.id)}">목록에서 빼기</button></div>`;return}
  let ls=[],md_=null,sm=null;
  try{const s=await db.collection(`players/${w.id}/lessons`).get();ls=s.docs.map(d=>({id:d.id,...d.data()})).filter(l=>l.result).sort((a,b)=>((b.date||"")+(b.createdAt||"")).localeCompare((a.date||"")+(a.createdAt||"")))}catch(_){}
  try{const d=await db.doc(`players/${w.id}/mandala/current`).get();md_=d.exists?d.data():null}catch(_){}
  try{const d=await db.doc(`players/${w.id}/statement/current`).get();sm=d.exists?d.data():null}catch(_){}
  const b=(sm&&sm.bio)||{},ss=(md_&&md_.sessions)||[],fin=ss.filter(x=>x.items.length&&x.done.length===x.items.length).length,y=sm&&sm.special&&sm.special.yips;
  one.innerHTML=`<div class="panel" style="display:grid;gap:8px"><div class="t-head"><b>${esc(w.ownerName||"선수")}</b><span class="pill">${esc(roleName(w.role))}로 보는 중 · 읽기만</span></div>
      <div class="bio-grid">${BIO_SHOW.map(([k,l])=>`<div><small>${l}</small><b>${esc(b[k]||"—")}</b></div>`).join("")}</div>
      ${y&&y.status&&y.status!=="없음"?`<p class="notice yips-note" style="margin:0">스페셜 · 입스: ${esc(y.status)}${(y.shots||[]).length?" · "+esc(y.shots.join("·")):""}</p>`:""}
      <p class="hint" style="margin:0">만다라트 목표: ${esc((md_&&md_.goal)||"—")} · 배틀플랜 ${ss.length?`${fin}/${ss.length}회차`:"없음"}</p></div>
    <h3 class="acct-k">최근 기록</h3>${ls.slice(0,8).map(l=>`<details class="panel wl"><summary><span>${esc(md(l.date))}</span><b>${esc(l.result.title||"")}</b><span class="pill">${l.source==="self"?"본인 진술":esc(l.coach||"코치 미기재")}</span></summary>${resultHTML(l.result,l.coach||"",l.date,{self:l.source==="self"})}</details>`).join("")||`<p class="hint">아직 기록이 없어요.</p>`}`;
}
$("watch-box").addEventListener("click",async e=>{const s=e.target.closest("[data-wsel]");if(s){watchSel=s.dataset.wsel;renderWatch();return}
  const r=e.target.closest("[data-wrm]");if(r){const o=r.dataset.wrm;try{await db.doc(`users/${uid}/watching/${o}`).delete();await db.doc(`players/${o}/viewers/${uid}`).delete().catch(()=>{})}catch(_){}await loadViewers();renderWatch()}});

function renderPlanPage(){
  const box=$("plan-box");if(!box)return;
  box.innerHTML=`<h3 class="acct-k">지금 내 플랜</h3><div class="acct-list"><div class="acct-row col"><span><b>AP 레슨 노트 · 파일럿</b><small>파일럿 기간에는 무료로 모든 기능을 써 볼 수 있어요.</small></span>
      <div class="plan-use"><span>크루에게 묻기 <b>하루 10번</b></span><span>레슨 정리 <b>하루 20번</b></span><span>내 문제 진술 <b>하루 20번</b></span><span>훈련 제안 <b>하루 20번</b></span></div></div></div>
    <h3 class="acct-k">모든 플랜 <span class="pill">곧 열려요</span></h3><div class="acct-list">
      ${acctRow("개인","레슨 기록·문제 진술·만다라트·배틀플랜, 크루 대화 횟수 늘림",`<span class="hint">준비 중</span>`)}
      ${acctRow("패밀리","부모님이 자녀 기록을 함께 보고 응원해요",`<span class="hint">준비 중</span>`)}
      ${acctRow("코치 · 아카데미 · 팀","선수 관리, 레슨 레코드, Matrix 진단 근거와 레거시 기여 기록",`<span class="hint">준비 중</span>`)}</div>
    <p class="hint">결제는 아직 받지 않아요. 플랜이 열리면 여기서 고를 수 있어요.</p>`;
}

function renderSet(){
  const box=$("set-box");if(!box)return;const inf=(user&&user.info)?user.info():{};const tone=inf.tone||"coach";
  box.innerHTML=`<h3 class="acct-k">프로필</h3><div class="acct-list">
      ${acctRow("이름",esc(myName()),`<button class="btn sm" type="button" data-st="name">바꾸기</button>`)}
      <div id="st-name" hidden></div>
      ${acctRow("로그인 이메일",esc(inf.email||"—"))}
      ${acctRow("로그인 방식",inf.provider==="google.com"?"Google로 로그인":esc(inf.provider||"—"))}</div>
    <h3 class="acct-k">크루 말투</h3><div class="acct-list">${TONE_OPTS.map(([k,l,ex])=>`<button type="button" class="acct-row tone" data-tone="${k}" aria-pressed="${k===tone}"><span><b>${l}</b><small>“${T(ex)}”</small></span><i class="tone-ck" aria-hidden="true">${k===tone?"✓":""}</i></button>`).join("")}</div>
    <p class="hint" style="margin-top:-4px">말하는 방식만 바뀌고, 정리 규칙과 안전 규칙은 그대로예요.</p>
    <h3 class="acct-k">기능</h3><div class="acct-list">
      ${acctRow("언어","화면과 크루의 답, 레슨 정리 결과가 이 언어로 나와요",`<select class="lang-sel" id="st-lang">${LANG_OPTS.map(([k,l])=>`<option value="${k}" ${k===(inf.lang||"ko")?"selected":""}>${l}</option>`).join("")}</select>`)}
      ${acctRow("진동","저장·체크할 때 살짝 떨림",`<label class="switch"><input type="checkbox" id="st-vib" ${prefGet("vib","1")==="1"?"checked":""}><i></i></label>`)}</div>
    <h3 class="acct-k">도움</h3><div class="acct-list">
      ${acctRow("문의하기",CONTACT_EMAIL?esc(CONTACT_EMAIL):"궁금한 점은 먼저 크루나 밀로에게 물어보세요. 문의 메일은 곧 안내해요.",CONTACT_EMAIL?`<a class="btn sm" href="mailto:${esc(CONTACT_EMAIL)}">메일 보내기</a>`:`<button class="btn sm" type="button" data-show="ask">오늘의 대화</button>`)}</div>
    <h3 class="acct-k">계정</h3><div class="acct-list">
      ${acctRow("로그아웃","",`<button class="btn sm" type="button" data-logout>로그아웃</button>`)}
      ${acctRow(`<span class="danger">계정 삭제</span>`,"내 기록과 계정을 지워요",`<button class="btn sm" type="button" data-st="del">자세히</button>`)}
      <div id="st-del" hidden></div></div>
    <h3 class="acct-k">정보 · 약관</h3><div class="acct-list">
      ${acctRow("연구 참여","가린 기록으로 AP 훈련 규칙을 다듬는 데 보태요. 안 해도 똑같이 쓸 수 있어요",`<label class="switch"><input type="checkbox" id="st-res" ${inf.research?"checked":""} ${myAge==="child"?"disabled":""}><i></i></label>`)}
      ${myAge==="child"?`<p class="hint" style="margin:0 16px 10px">만 14세 미만 기록은 연구에 쓰지 않아요.</p>`:""}
      <a class="acct-row link" href="${legalHref("privacy",inf.lang)}" target="_blank" rel="noopener"><span><b>개인정보 처리방침</b></span><i aria-hidden="true">›</i></a>
      <a class="acct-row link" href="${legalHref("terms",inf.lang)}" target="_blank" rel="noopener"><span><b>이용약관</b></span><i aria-hidden="true">›</i></a>
      ${myAge==="child"?acctRow("보호자 동의","만 14세 미만 · 보호자 확인 상태는 코치님이 확인해요"):""}
      ${acctRow("앱 버전",APP_VER)}</div>`;
}
$("set-box").addEventListener("click",async e=>{
  if(e.target.closest("[data-logout]"))return; // 아래 공용 처리
  const t=e.target.closest("[data-tone]");if(t){try{await db.doc("users/"+uid).update({tone:t.dataset.tone});if(user.info){const i=user.info();user.info=()=>({...i,tone:t.dataset.tone})}toast("크루 말투를 바꿨어요");buzz();renderSet()}catch(_){toast("저장하지 못했어요")}return}
  const b=e.target.closest("[data-st]");if(!b)return;
  if(b.dataset.st==="name"){const box=$("st-name");box.hidden=!box.hidden;box.innerHTML=`<form class="acct-row col" id="st-name-f"><label class="fld">앱 안에서 보일 이름<input id="st-name-i" maxlength="20" value="${esc(myName())}"></label><p class="hint" style="margin:0">연결된 코치님·부모님 화면에도 이 이름으로 보여요.</p><div class="actions"><button class="btn sm gold" type="submit">저장</button></div></form>`;return}
  if(b.dataset.st==="del"){const box=$("st-del");box.hidden=!box.hidden;box.innerHTML=`<div class="acct-row col"><p style="margin:0">지우면 내 레슨 기록, 문제 진술, 스테이트먼트, 만다라트·배틀플랜, 훈련 카드, 대화, 연결이 모두 사라지고 되돌릴 수 없어요.</p>
      <p class="hint" style="margin:0">공동 레거시 나무에 남긴 레슨 포인트는 이름이 가려진 채 남아요.</p>
      <label class="fld">확인을 위해 <b>삭제</b>라고 적어 주세요<input id="st-del-i" maxlength="12" autocomplete="off"></label>
      <div class="actions"><button class="btn sm danger-btn" type="button" data-st="del-go">계정 삭제</button></div><p class="status err" id="st-del-st"></p></div>`;return}
  if(b.dataset.st==="del-go"){if(![T("삭제"),"삭제"].includes($("st-del-i").value.trim())){$("st-del-st").textContent="'삭제'라고 정확히 적어 주세요.";return}
    if(!account){$("st-del-st").textContent="지금은 삭제할 수 없어요. 새로고침 후 다시 해 주세요.";return}
    b.disabled=true;$("st-del-st").textContent="지우는 중이에요…";
    try{await account({task:"delete",confirm:"삭제"});toast("계정을 삭제했어요");setTimeout(()=>$("logout").click(),800)}catch(_){$("st-del-st").textContent="삭제하지 못했어요. 잠시 뒤 다시 해 주세요.";b.disabled=false}}
});
$("set-box").addEventListener("submit",async e=>{if(e.target.id!=="st-name-f")return;e.preventDefault();const v=$("st-name-i").value.trim();if(!v){toast("이름을 적어 주세요");return}
  try{await db.doc("users/"+uid).update({nickname:v});$("who").textContent=v;setMenuUser(v,user.role?user.role():"");toast("이름을 바꿨어요");buzz();renderSet()}catch(_){toast("저장하지 못했어요")}});
$("set-box").addEventListener("change",async e=>{if(e.target.id==="st-vib"){prefSet("vib",e.target.checked?"1":"0");if(e.target.checked)buzz()}
  if(e.target.id==="st-lang"){const v=e.target.value;try{await db.doc("users/"+uid).update({lang:v});try{localStorage.setItem("ap-lang",v)}catch(_){}prefSet("speak",(LANG_OPTS.find(x=>x[0]===v)||[])[2]||"ko-KR");toast("언어를 바꿨어요");setTimeout(()=>location.reload(),500)}catch(_){toast("저장하지 못했어요")}return}
  if(e.target.id==="st-res"){const on=e.target.checked;try{await db.doc("users/"+uid).update({research:on,researchAt:new Date().toISOString()});const i=user.info();user.info=()=>({...i,research:on});toast(on?"연구 참여에 동의했어요":"연구 참여를 껐어요")}catch(_){e.target.checked=!on;toast("저장하지 못했어요")}}});
document.addEventListener("click",e=>{if(e.target.closest("#set-box [data-logout]"))$("logout").click()});

/* 말하는 언어(받아쓰기): 레슨에서 코치가 쓰는 말이 다를 수 있어 따로 고른다. 기본은 앱 언어. 정리할 때 AI가 원문 언어를 다시 식별해 함께 저장한다 */
function speakLang(){const i=(user&&user.info)?user.info():{};return prefGet("speak","")||(LANG_OPTS.find(x=>x[0]===(i.lang||"ko"))||LANG_OPTS[0])[2]}
function fillSpeak(root=document){const cur=speakLang();root.querySelectorAll("[data-speak]").forEach(sel=>{if(!sel.options.length)sel.innerHTML=LANG_OPTS.map(([k,l,b])=>`<option value="${b}">${l}</option>`).join("");sel.value=cur})}
document.addEventListener("change",e=>{const sel=e.target.closest&&e.target.closest("[data-speak]");if(!sel)return;prefSet("speak",sel.value);if(dict&&dict.setLang){dict.stop&&dict.stop().catch(()=>{});dict.setLang(sel.value)}fillSpeak();toast("말하는 언어: "+sel.options[sel.selectedIndex].text)});
new MutationObserver(()=>{if(document.querySelector("[data-speak]:empty"))fillSpeak()}).observe(document.body,{childList:true,subtree:true});
