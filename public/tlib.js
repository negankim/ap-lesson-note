/* AP Training Library · 화면 (코치·관리자)
   선수 선택 → 문제 관찰 → 원인 가설 → 관련 드릴 추천(규칙) → 코치 처방 확정(채택·수정·제외·직접 검색) → 수행 결과 기록 → 재평가
   - 데이터: tl_drills·tl_variants·tl_sources·tl_rx(읽기), players/{uid}/tlRx(처방·결과, 덧붙이기만)
   - 추천은 규칙(노드·증상·가설·처방 규칙·근거 단계)으로만 정한다. AI가 원인을 확정하거나 효과를 판단하지 않는다.
   - 관찰(현상)과 원인 가설을 따로 적고, 가설은 '추가 확인 필요'로 남긴다. */
let C = null;               // app.js 가 넘겨주는 도구들
let drills = [], variants = [], sources = {}, rxRules = [], observed = [], taxo = null, loaded = false, loading = null;
let F = { q: "", axis: "", node: "", r8: "", diff: "", equip: "", ev: "", stage: "" }, sel = null, mode = "browse";
let RX = { pid: "", pname: "", lesson: null, obs: "", tags: [], hyp: "", node: "", axis: "", picks: [], doc: null, docId: "" };
const PILLAR_AXIS = { drive: "SWING", iron: "SWING", short: "SHORT_GAME", putt: "PUTTING", course: "COURSE", mind: "MENTAL", body: "PHYSICAL", life: "MENTAL" };

export const EVIDENCE = ["source", "standardized", "reviewed", "field", "verified"];
export const EV_KO = { source: "원천 자료만 확보", standardized: "AP 표준화 완료", reviewed: "코치 검토 완료", field: "현장 적용 중", verified: "효과 검증 완료" };
const EV_TONE = { source: "", standardized: "", reviewed: "gold", field: "gold", verified: "ok" };
const R8_SUB = ["Shot Selection Range", "Adaptive Decision", "Pressure Execution", "Situation-specific Control", "Intentional Curve Creation", "Strategic Reproduction"];
const EVAL_KO = { repeat: "반복 성공률로 평가", adapt: "조건이 바뀔 때의 적응으로 평가", other: "드릴 기준으로 평가" };
const NODE_KO = { N1: "Mental Focus", N2: "Perceived Impact", N3: "Club Face Control & Lever System", N4: "Club Path Control", N5: "Real Impact", N6: "Consistency", N7: "Efficiency", N8: "Adaptability" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const T = (s) => (window.APT ? window.APT(s) : s);
const words = (s) => String(s || "").toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
/* AP 훈련 사다리(대표 정의): 기술 교정(베이직 · Matrix·6-Axis가 받침) → 선택 → 경험 → 판단 → 인사이트 → 인내·기억 */
export const STAGE_KO = { TECH: "기술 교정 · 베이직", CHOICE: "선택", EXPERIENCE: "경험", JUDGMENT: "판단", INSIGHT: "인사이트", PATIENCE_MEMORY: "인내·기억" };
export const PLACE_KO = { range: "연습장", short: "숏게임장", green: "퍼팅그린", screen: "스크린", field: "필드", home: "집" };
const stageOf = (d) => d.stage || "TECH";
const ladder = (cur) => `<div class="tl-ladder">${Object.keys(STAGE_KO).map((k, i) => `${i ? `<i aria-hidden="true">→</i>` : ""}<span class="${k === cur ? "on" : ""}">${esc(STAGE_KO[k])}</span>`).join("")}</div>`;
const AXIS_KO = { SWING: "스윙", PUTTING: "퍼팅", SHORT_GAME: "숏게임", COURSE: "코스운영", MENTAL: "멘탈", PHYSICAL: "피지컬" };
const axisL = (a) => a ? `${AXIS_KO[a] || a}` : "";
const APPR_KO = { PENDING: "코치 승인 대기", APPROVED: "코치 승인", REVISE: "수정 요청", REJECTED: "반려" };
const dname = (d) => { if (!d) return ""; const ko = (window.AP_LANG || "ko") === "ko"; const a = ko ? d.nameKo : d.nameEn, b = ko ? d.nameEn : d.nameKo; return a && b ? `${a} · ${b}` : a || b || d.id; };
const evPill = (e) => `<span class="pill ${EV_TONE[e] || ""}">${esc(EV_KO[e] || EV_KO.source)}</span>`;
const nodePills = (d) => (d.nodes || []).map((n) => `<span class="pill" title="${esc(NODE_KO[n])}">${n} ${esc(NODE_KO[n])}${d.nodeStatus === "tentative" ? " " + T("(잠정)") : ""}</span>`).join("") + (d.nodeCrossRef || []).map((n) => `<span class="pill" title="다른 Axis 교차참조">↔ ${n} ${esc(NODE_KO[n])}</span>`).join("");

export function initTL(ctx) { C = ctx; }

export async function loadTL(force) {
  if (loaded && !force) return;
  if (loading && !force) return loading;
  loading = (async () => {
    const [a, b, c, r, o] = await Promise.all(["tl_drills", "tl_variants", "tl_sources", "tl_rx", "tl_observed"].map((n) => C.db.collection(n).get().catch(() => ({ docs: [] }))));
    observed = o.docs.map((x) => ({ id: x.id, ...x.data() }));
    try { const t = await C.db.doc("tl_meta/taxonomy").get(); taxo = t.exists ? t.data() : null; } catch (_) { taxo = null; }
    drills = a.docs.map((x) => ({ id: x.id, ...x.data() })).filter((d) => d.status !== "retired");
    variants = b.docs.map((x) => ({ id: x.id, ...x.data() }));
    sources = Object.fromEntries(c.docs.map((x) => [x.id, { id: x.id, ...x.data() }]));
    rxRules = r.docs.map((x) => ({ id: x.id, ...x.data() }));
    loaded = true;
  })();
  return loading;
}

/* ===== 규칙 기반 추천 =====
   점수 = 노드 일치 + 증상·관찰 단어 일치 + 원인 가설 단어 일치 + 처방 규칙 일치 + 근거 단계
   이유는 맞은 조건을 그대로 보여 준다(원인을 확정하는 말은 쓰지 않는다). */
export function recommend({ obs = "", tags = [], hyp = "", node = "", via = [], axis = "" }, n = 8) {
  /* 한국어 조사(출발선'이')가 붙어도 맞도록 글자 포함으로 비교. 흔한 말은 뺀다 */
  const STOP = new Set(["반복", "편차", "변동", "문제", "가능성", "차이", "증가", "부족", "퍼팅", "스윙", "숏게임", "샷", "the", "and"]);
  const otext = [obs, ...tags].join(" ").toLowerCase().normalize("NFKC"), htext = String(hyp || "").toLowerCase().normalize("NFKC");
  const hit = (txt, phrase) => words(phrase).filter((w) => w.length >= 2 && !STOP.has(w) && txt.includes(w));
  const ow = { has: (w) => !STOP.has(w) && otext.includes(w) }, hw = { has: (w) => !STOP.has(w) && htext.includes(w) };
  return drills.filter((d) => !d.dupOf && d.coachApproval !== "REJECTED").map((d) => {
    let s = 0; const why = [];
    const sameAxis = !axis || d.axis === axis || (d.axisSecondary || []).includes(axis);
    if (axis && sameAxis) { s += 2; why.push(`같은 영역(${axisL(axis)})`); }
    if (axis && !sameAxis) s -= 6; // 다른 Axis 드릴은 강한 근거가 없으면 추천하지 않는다(R09)
    // 8노드는 Swing Matrix 지도: 같은 Axis 안에서만, 다른 Axis 는 교차참조로만
    if (node && sameAxis && (d.nodes || []).includes(node)) { s += 3; why.push(`주 검토 영역 ${node} ${NODE_KO[node]}과 연결 (잠정)`); }
    else if (node && sameAxis && (d.nodeCrossRef || []).includes(node)) { s += 1; why.push(`${node} 교차참조`); }
    else if (sameAxis && via.some((v) => (d.nodes || []).includes(v))) { s += 1; why.push("함께 볼 관련 영역과 연결"); }
    const symHit = (d.symptoms || []).filter((x) => hit(otext, x).length);
    if (symHit.length) { s += 2 * symHit.length; why.push(`관찰한 문제와 같은 증상: ${symHit.slice(0, 3).join(", ")}`); }
    const nameHit = words([d.nameKo, d.nameEn, d.purpose].join(" ")).filter((w) => ow.has(w));
    if (nameHit.length && !symHit.length) { s += 1; why.push("목적·이름이 관찰 내용과 겹침"); }
    const hypHit = (d.hypotheses || []).filter((x) => hit(htext, x).length);
    if (hypHit.length) { s += 1.5; why.push(`같은 원인 가설을 확인하는 드릴: ${hypHit[0]}`); }
    const rule = rxRules.find((r) => (r.drills || []).includes(d.id) && ((r.node && r.node === node) || (r.symptomTags || []).some((t) => words(t).some((w) => ow.has(w)))));
    if (rule) { s += rule.approved ? 4 : 2; why.push(rule.approved ? "코치가 승인한 처방 규칙" : "처방 규칙 초안(승인 전)"); }
    if (/압박|시합|긴장|pressure/i.test(obs) && (d.r8sub || []).includes("Pressure Execution")) { s += 1.5; why.push("압박 상황 수행(R8 Pressure Execution)"); }
    s += EVIDENCE.indexOf(d.evidence || "source") * 0.4;
    return { d, s, why };
  }).filter((x) => x.s >= 2.5 && x.why.some((w) => !/^같은 영역/.test(w))).sort((a, b) => b.s - a.s).slice(0, n);
}

/* ===== 화면 ===== */
export async function renderTL() {
  const box = $("tl-box"); if (!box) return;
  box.innerHTML = `<div class="tl-tabs chips" role="tablist">
      <button type="button" class="chip" data-tlmode="browse" aria-pressed="${mode === "browse"}">드릴 탐색</button>
      <button type="button" class="chip" data-tlmode="rx" aria-pressed="${mode === "rx"}">선수 처방</button>
      <button type="button" class="chip" data-tlmode="data" aria-pressed="${mode === "data"}">데이터 관리</button></div>
    <div id="tl-body"><p class="hint">불러오는 중…</p></div>`;
  await loadTL();
  if (mode === "browse") renderBrowse(); else if (mode === "rx") renderRx(); else renderData();
}

function opts(list, cur, all) { return `<option value="">${esc(all)}</option>` + list.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join(""); }
function filtered() {
  const qw = words(F.q);
  return drills.filter((d) => (!F.axis || d.axis === F.axis) && (!F.node || (d.nodes || []).includes(F.node) || (d.nodeCrossRef || []).includes(F.node)) && (!F.r8 || (d.r8sub || []).includes(F.r8))
    && (!F.stage || stageOf(d) === F.stage) && (!F.diff || String(d.difficulty || "") === F.diff) && (!F.equip || (d.equipment || []).includes(F.equip)) && (!F.ev || d.evidence === F.ev)
    && (!qw.length || qw.every((w) => words([d.nameKo, d.nameEn, d.purpose, (d.symptoms || []).join(" "), (d.hypotheses || []).join(" "), (d.aliases || []).join(" ")].join(" ")).some((x) => x.includes(w)))));
}
function renderBrowse() {
  const body = $("tl-body");
  if (!drills.length) { body.innerHTML = `<div class="notice">아직 Training Library에 드릴이 없어요. 관리자가 '데이터 관리'에서 엑셀 자료를 가져오면 여기에 보여요.</div>`; return; }
  const axes = ["SWING", "PUTTING", "SHORT_GAME", "COURSE", "MENTAL", "PHYSICAL"].filter((a) => drills.some((d) => d.axis === a)), equips = [...new Set(drills.flatMap((d) => d.equipment || []))].sort();
  const list = filtered();
  body.innerHTML = `<div class="panel tl-phil"><b>AP 훈련 사다리</b>${ladder(F.stage)}<p class="hint" style="margin:0">Matrix와 6-Axis로 하는 기술 교정이 베이직이에요. 그 위에서 선택이 경험이 되고, 판단 능력을 키워 인사이트에 이르고, 인내와 기억으로 가는 실전 인지 능력 훈련이 한 단계 위예요. Matrix·Axis는 이를 받쳐 줍니다.</p></div>
    <div class="tl-filters">
      <label class="fld tl-q">문제 증상·이름 검색<input id="tl-q" value="${esc(F.q)}" placeholder="예: 출발선 우측, 짧은 퍼팅, gate"></label>
      <label class="fld">훈련 단계<select data-f="stage">${opts(Object.entries(STAGE_KO), F.stage, "전체")}</select></label>
      <label class="fld">Axis<select data-f="axis">${opts(axes.map((a) => [a, axisL(a)]), F.axis, "전체")}</select></label>
      <label class="fld">Matrix 노드<select data-f="node">${opts(Object.entries(NODE_KO).map(([k, v]) => [k, k + " " + v]), F.node, "전체")}</select></label>
      ${F.node === "N8" ? `<label class="fld">R8 세부<select data-f="r8">${opts(R8_SUB.map((x) => [x, x]), F.r8, "전체")}</select></label>` : ""}
      <label class="fld">난이도<select data-f="diff">${opts([1, 2, 3, 4, 5].map((x) => [String(x), String(x)]), F.diff, "전체")}</select></label>
      <label class="fld">장비<select data-f="equip">${opts(equips.map((x) => [x, x]), F.equip, "전체")}</select></label>
      <label class="fld">근거 단계<select data-f="ev">${opts(EVIDENCE.map((e) => [e, EV_KO[e]]), F.ev, "전체")}</select></label></div>
    <p class="hint">${list.length} / ${drills.length}개 드릴 · 수집 관측 ${observed.length}건 · 표준 드릴 초안과 수집 자료는 승인·검증된 드릴이 아니에요.</p>
    <div class="tl-list">${list.slice(0, 200).map(card).join("") || `<p class="hint">조건에 맞는 드릴이 없어요.</p>`}</div>
    <div id="tl-detail"></div>`;
  if (sel) showDetail(sel);
}
function card(d) {
  return `<button type="button" class="tl-card" data-tlsel="${esc(d.id)}" aria-pressed="${sel === d.id}">
    <b>${esc(dname(d))}</b><small>${esc((d.symptoms || [])[0] || d.purpose || "")}</small>
    <span class="tl-tags"><span class="pill">${esc(d.id)}</span><span class="pill ${stageOf(d) === "TECH" ? "" : "gold"}">${esc(STAGE_KO[stageOf(d)])}</span>${(d.places || []).map((p) => `<span class="pill">${esc(PLACE_KO[p] || p)}</span>`).join("")}${d.axis ? `<span class="pill">${esc(axisL(d.axis))}</span>` : ""}${nodePills(d)}${d.difficulty ? `<span class="pill">난이도 ${d.difficulty}</span>` : ""}${evPill(d.evidence)}<span class="pill">${esc(APPR_KO[d.coachApproval] || APPR_KO.PENDING)}</span>${d.draft ? `<span class="pill">표준 초안</span>` : ""}${(d.dupCandidates || []).length ? `<span class="pill warn">중복 확인 필요</span>` : ""}</span></button>`;
}
async function showDetail(id) {
  const d = drills.find((x) => x.id === id), box = $("tl-detail"); if (!d || !box) return;
  const vs = variants.filter((v) => v.drillId === id), srcs = (d.sources || []).map((s) => sources[s]).filter(Boolean);
  const row = (k, v) => v ? `<div class="tl-row"><small>${k}</small><div>${v}</div></div>` : "";
  const ul = (a) => a && a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  box.innerHTML = `<article class="panel tl-detail" aria-label="드릴 상세">
    <div class="t-head"><h2 style="margin:0">${esc(dname(d))}</h2><button class="btn sm" type="button" data-tlclose>닫기</button></div>
    <div class="tl-tags"><span class="pill">${esc(d.id)}</span>${d.axis ? `<span class="pill">${esc(axisL(d.axis))}${(d.axisSecondary || []).length ? " + " + d.axisSecondary.map(axisL).join(", ") : ""}</span>` : ""}<span class="pill">${esc(APPR_KO[d.coachApproval] || APPR_KO.PENDING)}</span>${nodePills(d)}${(d.r8sub || []).map((x) => `<span class="pill">R8 · ${esc(x)}</span>`).join("")}${evPill(d.evidence)}<span class="pill">${esc(EVAL_KO[d.evalType] || EVAL_KO.other)}</span><span class="pill">v${d.rev || 1}</span></div>
    ${d.evidence === "source" || d.evidence === "standardized" ? `<p class="notice" style="margin:0">효과 검증 전 · 코치 승인 필요</p>` : ""}
    ${row("훈련 단계", ladder(stageOf(d)) + (d.ability ? `<span class="hint">키우는 능력 · ${esc(d.ability)}</span>` : ""))}${row("하는 곳", esc((d.places || []).map((p) => PLACE_KO[p] || p).join(", ")))}
    ${row("이럴 때 써요", ul(d.symptoms))}${row("대립 가능한 원인 가설 (단정 금지)", ul(d.hypotheses))}${row("적용 조건", esc(d.conditions))}
    ${row("수행 방법 (AP 요약)", esc(d.how))}${row("필요한 도구", esc((d.equipment || []).join(", ")))}${row("난이도 · 권장 수행량", esc([d.difficulty ? "난이도 " + d.difficulty : "", d.dose].filter(Boolean).join(" · ")))}
    ${row("성공 기준", esc(d.success))}${row("측정 지표", ul(d.metrics))}${row("해석 주의", esc(d.guardrail))}${row("근거 등급(엑셀)", esc(d.evidenceGrade))}
    ${vs.length ? row("변형", `<ul>${vs.map((v) => `<li><b>${esc(v.label)}</b>${v.difficulty ? " · 난이도 " + v.difficulty : ""}${v.conditions ? " · " + esc(v.conditions) : ""}${v.dose ? " · " + esc(v.dose) : ""}</li>`).join("")}</ul>`) : ""}
    ${row("원본 출처 · 사용권", srcs.length ? `<ul>${srcs.map((s) => `<li>${esc(s.title || s.rawName || s.id)}${s.publisher ? " · " + esc(s.publisher) : ""} · <span class="pill ${s.license === "restricted" ? "warn" : ""}">${esc({ unknown: "사용권 확인 전", permitted: "사용 허락", restricted: "사용 제한", own: "AP 자체" }[s.license] || "사용권 확인 전")}</span>${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">출처</a>` : ""}</li>`).join("")}</ul>` : `<span class="hint">출처 없음</span>`)}
    ${(() => { const os = observed.filter((o) => o.family === d.id); return os.length ? row(`수집 관측 ${os.length}건 (제목·링크만)`, `<ul>${os.map((o) => `<li>${esc(o.title)} · ${esc((sources[o.source] || {}).publisher || o.source)} <a href="${esc(o.url)}" target="_blank" rel="noopener">링크</a></li>`).join("")}</ul>`) : ""; })()}
    ${d.coachReview && (d.coachReview.reviewer || d.coachReview.indications || d.coachReview.contraindications) ? row("코치 검토", esc([d.coachReview.reviewer, d.coachReview.date, d.coachReview.indications && "적응: " + d.coachReview.indications, d.coachReview.contraindications && "금기: " + d.coachReview.contraindications, d.coachReview.measureAgreed && "측정 합의: " + d.coachReview.measureAgreed].filter(Boolean).join(" · "))) : ""}
    ${d.approvedBy ? row("승인", `${esc(EV_KO[d.evidence])} · ${esc((d.approvedAt || "").slice(0, 10))}`) : ""}
    ${(d.dupCandidates || []).length ? row("중복 후보", `<ul>${d.dupCandidates.map((c) => { const o = drills.find((x) => x.id === c.id); return `<li>${esc(dname(o) || c.id)} · 비슷함 ${Math.round(c.score * 100)}%</li>`; }).join("")}</ul>`) : ""}
    <div id="tl-uses"><p class="hint">적용 이력을 불러오는 중…</p></div>
    ${C.isEditor() ? `<details class="tl-edit"><summary>근거 단계 · 승인 · 고치기</summary>
      <form id="tl-edit-f" data-id="${esc(d.id)}" class="tl-form">
        <label class="fld">근거 단계<select name="evidence">${EVIDENCE.map((e) => `<option value="${e}" ${e === d.evidence ? "selected" : ""} ${e === "verified" && C.role() !== "admin" ? "disabled" : ""}>${esc(EV_KO[e])}</option>`).join("")}</select></label>
        <label class="fld">코치 승인<select name="coachApproval">${["PENDING", "APPROVED", "REVISE", "REJECTED"].map((k) => `<option value="${k}" ${k === (d.coachApproval || "PENDING") ? "selected" : ""}>${esc(APPR_KO[k])}</option>`).join("")}</select></label>
        <label class="fld">적응(Indications)<input name="cr_indications" value="${esc((d.coachReview || {}).indications || "")}" maxlength="300"></label>
        <label class="fld">금기(Contraindications)<input name="cr_contraindications" value="${esc((d.coachReview || {}).contraindications || "")}" maxlength="300"></label>
        <label class="fld">측정 합의<input name="cr_measureAgreed" value="${esc((d.coachReview || {}).measureAgreed || "")}" maxlength="200"></label>
        <label class="fld">도구 (쉼표)<input name="equipment" value="${esc((d.equipment || []).join(", "))}" maxlength="200"></label>
        <label class="fld">난이도 1~5<input name="difficulty" type="number" min="1" max="5" value="${esc(d.difficulty || "")}"></label>
        ${(d.nodes || []).includes("N8") ? `<label class="fld">R8 세부 분류 (쉼표)<input name="r8sub" value="${esc((d.r8sub || []).join(", "))}" placeholder="${esc(R8_SUB.join(", "))}"></label>` : ""}
        <label class="fld">평가 방식<select name="evalType">${Object.entries(EVAL_KO).map(([k, v]) => `<option value="${k}" ${k === d.evalType ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        <label class="fld">한글명<input name="nameKo" value="${esc(d.nameKo)}" maxlength="120"></label>
        <label class="fld">수행량<input name="dose" value="${esc(d.dose)}" maxlength="160"></label>
        <label class="fld">성공 기준<input name="success" value="${esc(d.success)}" maxlength="300"></label>
        <label class="fld">바꾸는 이유 (필수)<input name="note" maxlength="200" required placeholder="예: 현장 3명 적용, 수행량 조정"></label>
        <div class="actions"><button class="btn sm gold" type="submit">저장 (v${(d.rev || 1) + 1})</button>${(d.dupCandidates || []).length ? `<button class="btn sm" type="button" data-tldup="${esc(d.dupCandidates[0].id)}">'${esc(dname(drills.find((x) => x.id === d.dupCandidates[0].id)) || d.dupCandidates[0].id)}'의 중복으로 표시</button>` : ""}</div>
        <p class="status" id="tl-edit-st"></p></form>
      ${(d.history || []).length ? `<details><summary class="hint">변경 이력 ${(d.history || []).length}</summary>${d.history.slice().reverse().map((h) => `<div class="hint">v${h.rev} · ${esc((h.at || "").slice(0, 10))} ${esc(h.note || "")}</div>`).join("")}</details>` : ""}</details>` : ""}
  </article>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  loadUses(id);
}
async function loadUses(id) {
  const el = $("tl-uses"); if (!el) return;
  let uses = [];
  try { const s = await C.db.group("tlRx").get(); uses = s.docs.map((x) => x.data()).filter((r) => (r.picks || []).some((p) => p.drillId === id && p.status !== "excluded")); } catch (_) { el.innerHTML = ""; return; }
  const res = uses.flatMap((u) => (u.results || []).filter((r) => r.drillId === id));
  const att = res.reduce((a, r) => a + (+r.attempts || 0), 0), suc = res.reduce((a, r) => a + (+r.successes || 0), 0);
  el.innerHTML = `<div class="tl-row"><small>훈련 결과 · 적용 이력</small><div>${uses.length ? `처방 ${uses.length}건 · 결과 기록 ${res.length}건${att ? ` · 합계 ${suc}/${att}회 (${Math.round(suc / att * 100)}%)` : ""}<br><span class="hint">결과 숫자는 기록 그대로이며, 효과 검증 판단은 코치진이 따로 합니다.</span>` : `<span class="hint">아직 적용 이력이 없어요.</span>`}</div></div>`;
}

/* ===== 선수 처방 ===== */
async function renderRx() {
  const body = $("tl-body");
  let players = [];
  try { const s = await C.db.collection("users").get(); players = s.docs.map((x) => ({ id: x.id, ...x.data() })).filter((u) => (u.role || "player") === "player"); } catch (_) {}
  let lessons = [];
  if (RX.pid) { try { const s = await C.db.collection(`players/${RX.pid}/lessons`).get(); lessons = s.docs.map((x) => ({ id: x.id, ...x.data() })).filter((l) => l.result).sort((a, b) => (b.date || "").localeCompare(a.date || "")); } catch (_) {} }
  const L = RX.lesson, r = (L && L.result) || {};
  const rec = RX.pid && (RX.obs || L) ? recommend({ obs: RX.obs, tags: RX.tags, hyp: RX.hyp, node: RX.node, axis: RX.axis, via: [r.via, r.via2].filter(Boolean) }) : [];
  rec.forEach(({ d, why }) => { if (!RX.picks.find((p) => p.drillId === d.id)) RX.picks.push({ drillId: d.id, status: "recommended", reason: why.join(" · "), mods: {} }); });
  RX.picks = RX.picks.filter((p) => p.status !== "recommended" || rec.find((x) => x.d.id === p.drillId));
  body.innerHTML = `<ol class="tl-steps">
    <li><b>선수 선택</b><select id="rx-player"><option value="">선수를 고르세요</option>${players.map((p) => `<option value="${esc(p.id)}" ${p.id === RX.pid ? "selected" : ""}>${esc(p.nickname || p.name || p.email || p.id)}</option>`).join("")}</select></li>
    ${RX.pid ? `<li><b>레슨 고르기 (선택)</b><select id="rx-lesson"><option value="">레슨 없이 처방</option>${lessons.map((l) => `<option value="${esc(l.id)}" ${L && L.id === l.id ? "selected" : ""}>${esc(C.md(l.date))} · ${esc(l.result.title || "")}</option>`).join("")}</select></li>
    <li><b>문제 관찰</b> <span class="hint">본 것 그대로 (현상)</span><textarea id="rx-obs" rows="2" placeholder="예: 짧은 퍼팅에서 출발선이 우측으로 벗어나는 빈도가 높음">${esc(RX.obs)}</textarea>
      <label class="fld">영역 (AP Axis)<select id="rx-axis"><option value="">정하지 않음</option>${["SWING", "PUTTING", "SHORT_GAME", "COURSE", "MENTAL", "PHYSICAL"].map((a) => `<option value="${a}" ${a === RX.axis ? "selected" : ""}>${esc(axisL(a))}</option>`).join("")}</select></label>
      <label class="fld">증상 태그 (쉼표로)<input id="rx-tags" value="${esc(RX.tags.join(", "))}" placeholder="예: Putting, Start Direction"></label></li>
    <li><b>원인 가설</b> <span class="pill">추가 확인 필요</span><textarea id="rx-hyp" rows="2" placeholder="예: 페이스 방향 제어 문제 또는 클럽 패스의 영향 가능성">${esc(RX.hyp)}</textarea>
      <label class="fld">주 검토 영역 (Matrix 노드, 원인 확정 아님${RX.axis && RX.axis !== "SWING" ? " · 스윙 외 영역은 교차참조로만" : ""})<select id="rx-node"><option value="">정하지 않음</option>${Object.entries(NODE_KO).map(([k, v]) => `<option value="${k}" ${k === RX.node ? "selected" : ""}>${k} ${esc(v)}</option>`).join("")}</select></label>
      <button class="btn sm" type="button" id="rx-run">추천 다시 보기</button></li>
    <li><b>추천 드릴 후보</b> <span class="hint">채택·수정·제외하거나 직접 찾아 넣으세요</span>
      <div class="tl-picks">${RX.picks.map(pickRow).join("") || `<p class="hint">관찰·가설을 적으면 규칙에 맞는 드릴이 추천돼요.</p>`}</div>
      <label class="fld">직접 검색해서 넣기<input id="rx-search" placeholder="드릴 이름·증상"></label><div id="rx-found"></div></li>
    <li><b>코치 처방 확정</b><div class="actions"><button class="btn gold" type="button" id="rx-save">${RX.docId ? "처방 고쳐 저장" : "처방 확정"}</button></div><p class="status" id="rx-st"></p></li>
    ${RX.docId ? `<li><b>수행 결과 · 재평가</b>${resultForm()}</li>` : ""}` : ""}
  </ol>`;
}
function pickRow(p) {
  const d = drills.find((x) => x.id === p.drillId); if (!d) return "";
  const st = { recommended: "추천", adopted: "채택", modified: "수정 채택", excluded: "제외" }[p.status];
  return `<div class="tl-pick" data-st="${p.status}"><div class="t-head"><b>${esc(dname(d))}</b><span class="pill ${p.status === "adopted" || p.status === "modified" ? "gold" : ""}">${esc(st)}</span></div>
    <small>${esc(d.purpose || "")}</small>
    ${p.reason ? `<small><b>추천 이유</b> ${esc(p.reason)}</small>` : ""}
    <div class="tl-tags">${d.axis ? `<span class="pill">${esc(d.axis)}</span>` : ""}${nodePills(d)}${evPill(d.evidence)}</div>
    <small><b>수행 방법</b> ${esc(d.how || "")}</small>
    <small><b>결과 평가</b> ${esc(d.success || (d.metrics || []).join(", ") || EVAL_KO[d.evalType] || "")}</small>
    ${p.status === "modified" ? `<div class="tl-mods"><label class="fld">수행 조건<input data-mod="conditions" data-id="${esc(d.id)}" value="${esc(p.mods.conditions || "")}"></label><label class="fld">수행량<input data-mod="dose" data-id="${esc(d.id)}" value="${esc(p.mods.dose || d.dose || "")}"></label><label class="fld">평가 기준<input data-mod="success" data-id="${esc(d.id)}" value="${esc(p.mods.success || d.success || "")}"></label></div>` : ""}
    <div class="actions"><button class="btn sm" type="button" data-pick="adopted" data-id="${esc(d.id)}">채택</button><button class="btn sm" type="button" data-pick="modified" data-id="${esc(d.id)}">수정</button><button class="btn sm" type="button" data-pick="excluded" data-id="${esc(d.id)}">제외</button></div></div>`;
}
function resultForm() {
  const used = RX.picks.filter((p) => p.status === "adopted" || p.status === "modified");
  const res = (RX.doc && RX.doc.results) || [], rea = (RX.doc && RX.doc.reassess) || [];
  return `<form id="rx-res" class="tl-form"><label class="fld">드릴<select name="drillId">${used.map((p) => `<option value="${esc(p.drillId)}">${esc(dname(drills.find((x) => x.id === p.drillId)))}</option>`).join("")}</select></label>
    <label class="fld">훈련 시행 (회)<input name="attempts" type="number" min="0" max="999" inputmode="numeric"></label>
    <label class="fld">성공 (회)<input name="successes" type="number" min="0" max="999" inputmode="numeric"></label>
    <label class="fld">결과 종류<select name="kind"><option value="immediate">즉시 결과</option><option value="baseline">기준선(드릴 전)</option><option value="retention">지연 재검사(다른 날)</option><option value="transfer">전이(랜덤·코스 조건)</option></select></label>
    <label class="fld">측정값 (선택)<input name="metric" maxlength="80" placeholder="예: 출발선 오차 평균 3cm"></label>
    <label class="fld">조건 (클럽·거리·라이)<input name="context" maxlength="120" placeholder="예: 퍼터 · 1.5m · 평지"></label>
    <label class="fld">압박 0~5<input name="pressure" type="number" min="0" max="5" inputmode="numeric"></label>
    <label class="fld">긴장 0~5<input name="tension" type="number" min="0" max="5" inputmode="numeric"></label>
    <label class="fld">불안 0~5<input name="anxiety" type="number" min="0" max="5" inputmode="numeric"></label>
    <label class="fld">조건·메모<input name="note" maxlength="200"></label>
    <div class="actions"><button class="btn sm gold" type="submit">결과 기록</button></div></form>
    ${res.length ? `<ul class="tl-res">${res.slice().reverse().map((x) => `<li>${esc((x.at || "").slice(0, 10))} · ${esc({ immediate: "즉시", baseline: "기준선", retention: "지연 재검사", transfer: "전이" }[x.kind] || "즉시")} · ${esc(dname(drills.find((d) => d.id === x.drillId)))} · ${x.context ? esc(x.context) + " · " : ""}${x.pressure != null ? "압박 " + x.pressure + " · " : ""}${x.attempts != null ? `${x.successes ?? "—"}/${x.attempts}회${x.attempts ? ` (${Math.round((x.successes || 0) / x.attempts * 100)}%)` : ""}` : "미측정"}${x.metric ? " · " + esc(x.metric) : ""}${x.note ? " · " + esc(x.note) : ""}</li>`).join("")}</ul>` : ""}
    <form id="rx-rea" class="tl-form"><label class="fld">재평가<select name="outcome"><option>개선 관찰</option><option>변화 없음</option><option>악화 관찰</option><option>판단 유보</option></select></label>
      <label class="fld">근거 (본 것)<input name="note" maxlength="200" placeholder="예: 같은 조건 30회 중 21회, 지난번 12회"></label>
      <div class="actions"><button class="btn sm" type="submit">재평가 남기기</button></div></form>
    ${rea.length ? `<ul class="tl-res">${rea.slice().reverse().map((x) => `<li>${esc((x.at || "").slice(0, 10))} · <b>${esc(x.outcome)}</b>${x.note ? " · " + esc(x.note) : ""}</li>`).join("")}</ul>` : ""}
    <p class="hint">즉시 성공률만으로는 성과로 보지 않아요. 다른 날 지연 재검사와 랜덤·코스 조건 전이 결과를 함께 남겨 주세요(R15). 재평가는 관찰한 결과입니다. 원인이 확인됐다는 뜻은 아니며, 드릴의 효과 검증은 여러 선수의 결과를 코치진이 따로 판단합니다.</p>`;
}

/* ===== 데이터 관리 ===== */
async function renderData() {
  const body = $("tl-body");
  let meta = null, gov = null, mig = null;
  try { const [m, g, x] = await Promise.all(["stats", "governance", "migrations"].map((k) => C.db.doc("tl_meta/" + k).get())); meta = m.exists ? m.data() : null; gov = g.exists ? g.data() : null; mig = x.exists ? x.data() : null; } catch (_) {}
  const by = (k) => drills.reduce((a, d) => { const v = d[k] || "—"; a[v] = (a[v] || 0) + 1; return a; }, {});
  const evc = by("evidence"), apc = by("coachApproval");
  const n8 = drills.filter((d) => (d.nodes || []).includes("N8")), n8bad = n8.filter((d) => !(d.r8sub || []).length);
  const open = observed.filter((o) => !drills.find((d) => d.id === o.family)), amb = open.filter((o) => o.family === "FAMILY_AMBIGUOUS");
  const lr = meta && meta.lastImport, rep = lr && lr.report;
  const migItems = mig ? Object.values(mig).flatMap((v) => v.items || []) : [];
  const fams = drills.map((d) => [d.id, d.id + " · " + (d.nameKo || d.nameEn)]);
  body.innerHTML = `<div class="panel" style="display:grid;gap:8px">
      <div class="t-head"><b>현재 데이터</b><span class="pill">${esc((meta && meta.schema) || "tl-1")}</span></div>
      <div class="plan-use"><span>원본 출처 <b>${Object.keys(sources).length}</b></span><span>수집 관측 <b>${observed.length}</b></span><span>표준 드릴 <b>${drills.length}</b></span><span>변형 <b>${variants.length}</b></span></div>
      <div class="tl-tags">${EVIDENCE.map((e) => `<span class="pill">${esc(T(EV_KO[e]))} · ${evc[e] || 0}</span>`).join("")}</div>
      <div class="tl-tags">${["PENDING", "APPROVED", "REVISE", "REJECTED"].map((k) => `<span class="pill">${esc(T(APPR_KO[k]))} · ${apc[k] || 0}</span>`).join("")}</div>
      <p class="hint" style="margin:0">표준 드릴에 연결된 관측 ${observed.length - open.length} · 미분류 ${open.length - amb.length} · 포괄명(세부 분해 필요) ${amb.length}</p>
      ${lr ? `<p class="hint" style="margin:0">마지막 가져오기 ${esc((lr.at || "").slice(0, 16).replace("T", " "))} · ${esc(lr.batch || "")} · 드릴 새로 ${rep.drills.added}·바뀜 ${rep.drills.updated}·같음 ${rep.drills.same} · 관측 새로 ${rep.observed.added}·같음 ${rep.observed.same}${rep.observed.skippedRegistryOnly ? ` · 수집 금지 출처 제외 ${rep.observed.skippedRegistryOnly}` : ""}</p>` : ""}
    </div>
    ${C.role() === "admin" ? `<div class="panel" style="display:grid;gap:8px"><b>엑셀 자료 가져오기</b><p class="hint" style="margin:0">함께 배포된 AP Global Training Library 자료를 넣습니다. 같은 내용은 새로 만들지 않고, 바뀐 내용은 버전을 올리며, 코치가 고친 칸·근거 단계·승인은 덮지 않아요.</p><div class="actions"><button class="btn gold" type="button" id="tl-import">가져오기</button></div><p class="status" id="tl-import-st"></p></div>` : ""}
    <div class="panel"><b>R8 Adaptability 점검</b><p class="hint">Consistency(같은 수행의 반복 재현)와 Adaptability(상황이 바뀌어도 필요한 수행을 선택·구현)는 따로 평가합니다.</p>
      <ul><li>R8에 연결된 표준 드릴: ${n8.length}개${n8bad.length ? ` (세부 분류 없음 ${n8bad.length})` : ""}</li>
      <li>조건이 바뀌는 적응 평가(adapt) 드릴: ${drills.filter((d) => d.evalType === "adapt").length}개 · 반복 성공률 평가(repeat): ${drills.filter((d) => d.evalType === "repeat").length}개</li>
      ${(taxo && taxo.roots) ? `<li>분류표 N8: ${esc((taxo.roots.find((r) => r.key === "N8") || {}).name || "")}${(taxo.roots.find((r) => r.key === "N8") || {}).legacyName ? ` (옛 이름 ${esc(taxo.roots.find((r) => r.key === "N8").legacyName)} 정정됨)` : ""}</li>` : ""}</ul></div>
    ${migItems.length ? `<div class="panel"><b>버전 정정 기록</b><ul>${migItems.map((m) => `<li><b>${esc(m.where)}</b> ${esc(m.from)} → ${esc(m.to)}<br><small class="hint">${esc(m.why)}</small></li>`).join("")}</ul></div>` : ""}
    ${rep && (rep.dupObserved || []).length ? `<div class="panel"><b>병합 검토 후보 (이름이 거의 같은 관측)</b><ul>${rep.dupObserved.map((x) => `<li>${esc(x.at)} ↔ ${esc(x.bt)} · ${Math.round(x.score * 100)}%</li>`).join("")}</ul><p class="hint">포괄명(Towel·Gate 등)은 세부 드릴로 나눠야 처방할 수 있어요(R04).</p></div>` : ""}
    ${open.length ? `<details class="panel"><summary><b>미분류 관측 ${open.length}건 · 표준 드릴에 연결하기</b></summary>
      <div class="tl-obs">${open.slice(0, 200).map((o) => `<div class="tl-obs-row"><span><b>${esc(o.title)}</b><small>${esc(axisL(o.axis))} · ${esc((sources[o.source] || {}).publisher || o.source)} · ${esc(o.family === "FAMILY_AMBIGUOUS" ? "포괄명" : "미분류")}</small></span>
        ${C.isEditor() ? `<select data-link="${esc(o.id)}"><option value="">연결할 드릴</option>${fams.filter(([id]) => (drills.find((d) => d.id === id) || {}).axis === o.axis || !o.axis).map(([id, l]) => `<option value="${esc(id)}">${esc(l)}</option>`).join("")}</select>` : ""}</div>`).join("")}</div></details>` : ""}
    <details class="panel"><summary><b>원본 출처 ${Object.keys(sources).length}곳 · 사용권</b></summary><ul>${Object.values(sources).sort((a, b) => a.id.localeCompare(b.id)).map((s) => `<li><b>${esc(s.id)} ${esc(s.publisher || s.title)}</b> · ${esc(s.capturePolicy || "")} · <span class="pill ${s.license === "restricted" ? "warn" : ""}">${esc(s.clearance || s.license)}</span><br><small class="hint">${esc(s.licenseNote || "")}</small></li>`).join("")}</ul></details>
    ${gov && gov.rules ? `<details class="panel"><summary><b>데이터 거버넌스 ${gov.rules.length}개 규칙</b></summary><ul>${gov.rules.map((r) => `<li><b>${esc(r.id)} ${esc(r.policy)}</b> · ${esc(r.impl)}<br><small class="hint">${esc(r.gate)} · ${esc(r.type)}</small></li>`).join("")}</ul></details>` : ""}
    ${rep && (rep.drills.problems || []).length ? `<details class="panel"><summary><b>칸이 비어 있는 드릴 ${rep.drills.problems.length}</b></summary><ul>${rep.drills.problems.map((p) => `<li>${esc(p.id)} ${esc(p.name || "")} · ${esc(p.problems.join(", "))}</li>`).join("")}</ul></details>` : ""}`;
}

/* ===== 이벤트 ===== */
export function bindTL() {
  const root = $("tl-box"); if (!root || root.dataset.bound) return; root.dataset.bound = "1";
  root.addEventListener("click", async (e) => {
    const m = e.target.closest("[data-tlmode]"); if (m) { mode = m.dataset.tlmode; renderTL(); return; }
    const s = e.target.closest("[data-tlsel]"); if (s) { sel = s.dataset.tlsel; root.querySelectorAll("[data-tlsel]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tlsel === sel)); showDetail(sel); return; }
    const g = e.target.closest("[data-tlgo]"); if (g) { sel = g.dataset.tlgo; mode = "browse"; renderTL(); return; }
    if (e.target.closest("[data-tlclose]")) { sel = null; $("tl-detail").innerHTML = ""; return; }
    const dp = e.target.closest("[data-tldup]"); if (dp) { const f = $("tl-edit-f"); const note = f.note.value.trim() || "중복 표시"; await edit(f.dataset.id, { dupOf: dp.dataset.tldup }, note); return; }
    const pk = e.target.closest("[data-pick]"); if (pk) { const p = RX.picks.find((x) => x.drillId === pk.dataset.id); if (p) { p.status = pk.dataset.pick; renderRx(); } return; }
    const f = e.target.closest("[data-addpick]"); if (f) { if (!RX.picks.find((x) => x.drillId === f.dataset.addpick)) RX.picks.push({ drillId: f.dataset.addpick, status: "adopted", reason: "코치가 직접 선택", mods: {} }); renderRx(); return; }
    if (e.target.id === "rx-run") { readRx(); RX.picks = RX.picks.filter((p) => p.status !== "recommended"); renderRx(); return; }
    if (e.target.id === "rx-save") { readRx(); await saveRx(); return; }
    if (e.target.id === "tl-import") {
      const st = $("tl-import-st"); e.target.disabled = true; st.textContent = "가져오는 중이에요… 몇 분 걸릴 수 있어요.";
      try { const r = await C.tlib({ task: "import" }); const d = r.data.report.drills; st.textContent = `완료 · 드릴 새로 ${d.added}, 바뀜 ${d.updated}, 같음 ${d.same} · 원본 자료 새로 ${r.data.report.sources.added}`; await loadTL(true); renderData(); }
      catch (err) { st.textContent = (err && err.message) || "가져오지 못했어요."; e.target.disabled = false; }
    }
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "tl-q") { F.q = e.target.value; clearTimeout(root._t); root._t = setTimeout(() => { const pos = e.target.selectionStart; renderBrowse(); const q = $("tl-q"); q.focus(); q.setSelectionRange(pos, pos); }, 250); }
    if (e.target.id === "rx-search") { const qw = words(e.target.value); const hits = qw.length ? drills.filter((d) => qw.every((w) => words([d.nameKo, d.nameEn, (d.symptoms || []).join(" ")].join(" ")).some((x) => x.includes(w)))).slice(0, 8) : []; $("rx-found").innerHTML = hits.map((d) => `<button type="button" class="tl-card sm" data-addpick="${esc(d.id)}"><b>${esc(dname(d))}</b>${evPill(d.evidence)}</button>`).join(""); }
    if (e.target.dataset.mod) { const p = RX.picks.find((x) => x.drillId === e.target.dataset.id); if (p) p.mods[e.target.dataset.mod] = e.target.value; }
  });
  root.addEventListener("change", async (e) => {
    if (e.target.dataset.link) {
      const fam = e.target.value; if (!fam) return;
      try { await C.tlib({ task: "link", id: e.target.dataset.link, family: fam, note: "코치 연결" }); C.toast("표준 드릴에 연결했어요"); await loadTL(true); renderData(); } catch (err) { C.toast((err && err.message) || "연결하지 못했어요"); }
      return;
    }
    const f = e.target.dataset.f; if (f) { F[f] = e.target.value; if (f === "node" && F.node !== "N8") F.r8 = ""; renderBrowse(); return; }
    if (e.target.id === "rx-player") { RX = { pid: e.target.value, pname: e.target.options[e.target.selectedIndex].text, lesson: null, obs: "", tags: [], hyp: "", node: "", axis: "", picks: [], doc: null, docId: "" }; renderRx(); return; }
    if (e.target.id === "rx-axis" || e.target.id === "rx-node") { readRx(); if (RX.axis && RX.axis !== "SWING" && e.target.id === "rx-axis") RX.node = ""; RX.picks = RX.picks.filter((p) => p.status !== "recommended"); renderRx(); return; }
    if (e.target.id === "rx-lesson") {
      const id = e.target.value; let L = null;
      if (id) { try { const d = await C.db.doc(`players/${RX.pid}/lessons/${id}`).get(); L = d.exists ? { id, ...d.data() } : null; } catch (_) {} }
      RX.lesson = L; RX.picks = []; RX.doc = null; RX.docId = "";
      const r = (L && L.result) || {};
      if (L) { RX.obs = (r.problem && r.problem.observation) || r.title || ""; RX.hyp = (r.problem && r.problem.interpretation) || ""; RX.axis = PILLAR_AXIS[r.pillar] || ""; RX.node = RX.axis === "SWING" || !RX.axis ? (r.node || "") : ""; RX.tags = []; }
      try { const s = await C.db.collection(`players/${RX.pid}/tlRx`).get(); const ex = s.docs.map((x) => ({ id: x.id, ...x.data() })).find((x) => x.lessonId === id && id); if (ex) { RX.doc = ex; RX.docId = ex.id; RX.obs = ex.observation; RX.tags = ex.tags || []; RX.hyp = ex.hypothesis; RX.node = ex.node || ""; RX.axis = ex.axis || ""; RX.picks = ex.picks || []; } } catch (_) {}
      renderRx();
    }
  });
  root.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.id === "tl-edit-f") {
      const fd = Object.fromEntries(new FormData(f)); const note = fd.note; delete fd.note;
      const cr = {}; Object.keys(fd).filter((k) => k.startsWith("cr_")).forEach((k) => { cr[k.slice(3)] = fd[k]; delete fd[k]; });
      ["equipment", "r8sub"].forEach((k) => { if (fd[k] !== undefined) fd[k] = fd[k].split(/[,;]/).map((x) => x.trim()).filter(Boolean); });
      fd.coachReview = cr; await edit(f.dataset.id, fd, note);
    }
    if (f.id === "rx-res") {
      const fd = Object.fromEntries(new FormData(f)); const num = (v) => (v === "" || v == null ? null : Math.max(0, Math.min(999, parseInt(v, 10) || 0)));
      const a = num(fd.attempts), s = num(fd.successes);
      if (a != null && s != null && s > a) { C.toast("성공 횟수가 시행 횟수보다 많아요"); return; }
      const r05 = (v) => (v === "" || v == null ? null : Math.max(0, Math.min(5, parseInt(v, 10) || 0)));
      const rec = { at: new Date().toISOString(), by: C.uid(), drillId: fd.drillId, kind: fd.kind || "immediate", attempts: a, successes: s, metric: fd.metric || "", context: fd.context || "", pressure: r05(fd.pressure), tension: r05(fd.tension), anxiety: r05(fd.anxiety), note: fd.note || "" };
      await appendRx("results", rec);
    }
    if (f.id === "rx-rea") { const fd = Object.fromEntries(new FormData(f)); await appendRx("reassess", { at: new Date().toISOString(), by: C.uid(), outcome: fd.outcome, note: fd.note || "" }); }
  });
}
function readRx() {
  if ($("rx-obs")) RX.obs = $("rx-obs").value.trim();
  if ($("rx-tags")) RX.tags = $("rx-tags").value.split(/[,·]/).map((x) => x.trim()).filter(Boolean).slice(0, 10);
  if ($("rx-hyp")) RX.hyp = $("rx-hyp").value.trim();
  if ($("rx-node")) RX.node = $("rx-node").value;
  if ($("rx-axis")) RX.axis = $("rx-axis").value;
}
async function saveRx() {
  const st = $("rx-st");
  if (!RX.pid) { st.textContent = "선수를 골라 주세요."; return; }
  if (!RX.obs) { st.textContent = "관찰한 문제를 적어 주세요."; return; }
  const kept = RX.picks.filter((p) => p.status !== "recommended");
  if (!kept.some((p) => p.status === "adopted" || p.status === "modified")) { st.textContent = "채택한 드릴이 하나 이상 있어야 해요."; return; }
  const now = new Date().toISOString();
  const data = { lessonId: (RX.lesson && RX.lesson.id) || "", observation: RX.obs, tags: RX.tags, hypothesis: RX.hyp, hypothesisStatus: "가설 · 추가 확인 필요", axis: RX.axis || "", node: RX.node || "", picks: kept.map((p) => ({ drillId: p.drillId, status: p.status, reason: p.reason || "", mods: p.mods || {}, evidenceAtPick: (drills.find((d) => d.id === p.drillId) || {}).evidence || "source" })), drillIds: kept.filter((p) => p.status !== "excluded").map((p) => p.drillId), confirmedBy: C.uid(), confirmedAt: now, updatedAt: now };
  try {
    if (RX.docId) await C.db.doc(`players/${RX.pid}/tlRx/${RX.docId}`).update(data);
    else { const ref = await C.db.collection(`players/${RX.pid}/tlRx`).add({ ...data, results: [], reassess: [], createdAt: now }); RX.docId = ref.id; RX.doc = { ...data, results: [], reassess: [] }; }
    RX.picks = data.picks; C.toast("처방을 확정했어요"); renderRx();
  } catch (_) { st.textContent = "저장하지 못했어요. 코치 권한을 확인해 주세요."; }
}
async function appendRx(k, rec) {
  if (!RX.docId) return;
  try {
    const d = await C.db.doc(`players/${RX.pid}/tlRx/${RX.docId}`).get(); const cur = d.exists ? d.data() : {};
    const arr = [...(cur[k] || []), rec];
    await C.db.doc(`players/${RX.pid}/tlRx/${RX.docId}`).update({ [k]: arr, updatedAt: rec.at });
    RX.doc = { ...cur, [k]: arr }; C.toast(k === "results" ? "결과를 기록했어요" : "재평가를 남겼어요"); renderRx();
  } catch (_) { C.toast("저장하지 못했어요"); }
}
async function edit(id, patch, note) {
  const st = $("tl-edit-st");
  if (!String(note || "").trim()) { if (st) st.textContent = "바꾸는 이유를 한 줄 적어 주세요."; return; }
  try { const r = await C.tlib({ task: "edit", id, patch, note }); C.toast(r.data.changed ? `저장했어요 (v${r.data.rev})` : "바뀐 내용이 없어요"); await loadTL(true); renderBrowse(); showDetail(id); }
  catch (err) { if (st) st.textContent = (err && err.message) || "저장하지 못했어요."; }
}

/* ===== 선수 화면: 코치가 처방한 드릴과 결과 기록 ===== */
export async function renderMyRx(uid, el) {
  if (!el) return;
  let list = [];
  try { const s = await C.db.collection(`players/${uid}/tlRx`).get(); list = s.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => (b.confirmedAt || "").localeCompare(a.confirmedAt || "")); } catch (_) {}
  if (!list.length) { el.hidden = true; return; }
  await loadTL();
  el.hidden = false;
  el.innerHTML = `<h3 class="acct-k">코치 처방 훈련</h3>` + list.slice(0, 5).map((r) => {
    const used = (r.picks || []).filter((p) => p.status === "adopted" || p.status === "modified");
    return `<div class="panel tl-my" data-rx="${esc(r.id)}"><small class="hint">${esc((r.confirmedAt || "").slice(0, 10))} · 관찰: ${esc(r.observation)}</small>
      ${used.map((p) => { const d = drills.find((x) => x.id === p.drillId) || { id: p.drillId }; return `<div class="drill"><div class="t"><b>${esc(dname(d))}</b><span class="dose">${esc(p.mods.dose || d.dose || "")}</span></div><small>${esc(d.how || "")}</small><small><b>성공 기준</b> ${esc(p.mods.success || d.success || "")}</small></div>`; }).join("")}
      <form class="tl-form" data-myres="${esc(r.id)}"><label class="fld">드릴<select name="drillId">${used.map((p) => `<option value="${esc(p.drillId)}">${esc(dname(drills.find((x) => x.id === p.drillId)) || p.drillId)}</option>`).join("")}</select></label>
        <label class="fld">해 본 횟수<input name="attempts" type="number" min="0" max="999" inputmode="numeric"></label><label class="fld">성공<input name="successes" type="number" min="0" max="999" inputmode="numeric"></label>
        <div class="actions"><button class="btn sm gold" type="submit">결과 남기기</button></div></form>
      <small class="hint">기록 ${(r.results || []).length}건</small></div>`;
  }).join("");
  if (!el.dataset.bound) {
    el.dataset.bound = "1";
    el.addEventListener("submit", async (e) => {
      const f = e.target.closest("[data-myres]"); if (!f) return; e.preventDefault();
      const fd = Object.fromEntries(new FormData(f)), n = (v) => (v === "" ? null : Math.max(0, Math.min(999, parseInt(v, 10) || 0)));
      const a = n(fd.attempts), s = n(fd.successes);
      if (a == null) { C.toast("해 본 횟수를 적어 주세요"); return; }
      if (s != null && s > a) { C.toast("성공 횟수가 시행 횟수보다 많아요"); return; }
      try {
        const ref = C.db.doc(`players/${uid}/tlRx/${f.dataset.myres}`), d = await ref.get(), cur = d.exists ? d.data() : {};
        const at = new Date().toISOString();
        await ref.update({ results: [...(cur.results || []), { at, by: uid, drillId: fd.drillId, attempts: a, successes: s, metric: "", note: "선수 기록" }], updatedAt: at });
        C.toast("결과를 남겼어요"); renderMyRx(uid, el);
      } catch (_) { C.toast("저장하지 못했어요"); }
    });
  }
}

/* 오늘의 훈련(app.js)이 한 목록으로 모을 때 쓰는 '코치 처방 훈련' 항목: 가장 최근 처방에서 채택·수정한 드릴 */
export async function myRxItems(uid) {
  let list = [];
  try { const s = await C.db.collection(`players/${uid}/tlRx`).get(); list = s.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => (b.confirmedAt || "").localeCompare(a.confirmedAt || "")); } catch (_) { return []; }
  if (!list.length) return [];
  await loadTL();
  const r = list[0];
  return (r.picks || []).filter((p) => p.status === "adopted" || p.status === "modified").map((p) => {
    const d = drills.find((x) => x.id === p.drillId) || { id: p.drillId };
    return { key: `rx:${r.id}:${p.drillId}`, src: "코치 처방", name: dname(d), dose: (p.mods && p.mods.dose) || d.dose || "", how: d.how || "", axis: d.axis || "" };
  });
}

/* 오늘의 훈련(app.js)에 넣는 AP 실전 인지 드릴: 코치가 승인한 것만(초안은 넣지 않음) */
const AP_REAL = "AP 실전";
export async function apPracticeItems() {
  try { await loadTL(); } catch (_) { return []; }
  const AXP = { PUTTING: "putt", SHORT_GAME: "short", SWING: "drive", COURSE: "course", MENTAL: "mind", PHYSICAL: "body" };
  return drills.filter((d) => stageOf(d) !== "TECH" && d.coachApproval === "APPROVED" && d.status !== "retired").map((d) => ({
    key: `ap:${d.id}`, src: AP_REAL + " · " + STAGE_KO[stageOf(d)], name: dname(d), dose: d.dose || "", how: d.how || "", pillar: AXP[d.axis] || "", places: d.places || [], stage: stageOf(d), kind: "ap" }));
}
