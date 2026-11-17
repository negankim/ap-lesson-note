/* AP 레슨 노트 · AI 훈련 카드 (서버 전용, 대외비)
 * 구조: 승인된 표준 템플릿 + 규칙(서버) + AI의 설명·개인화.
 * - 어떤 템플릿을 쓸지, 내부 Root 연결, 결과 검토, 다음 훈련 분기는 규칙이 정한다(AI가 정하지 않는다).
 * - AI는 선택된 템플릿 안에서 문구·거리·반복 수·성공 기준을 이 선수에게 맞게 채운다.
 * - 화면(카드)에는 Root 코드·가설 용어를 쓰지 않는다. 내부 기록(internal·review)에만 남긴다.
 * 바꾸면 버전 문자열을 올리고 docs/decisions.md 에 기록한다. */

const MATRIX_VER = "AP Matrix R1~R8 (2026-11-17, R1-MF07 연결)";
const TPL_VER = "tpl-1";
const RULE_VER = "review-1";

/* 내부 AP Matrix. Root는 '확인된 근본 원인'이 아니다. 검토마다 역할(원인 후보·매개 과정·관찰 결과·평가 지표)을 붙인다.
 * 번호는 기존 N1~N8과 같은 자리다(N3 = R3). 고정된 한 방향 사슬로 연결하지 않는다. */
const ROOTS = {
  R1: "Mental Focus", R2: "Perceived Impact", R3: "Face & Lever System", R4: "Club Path Control",
  R5: "Real Impact", R6: "Consistency", R7: "Efficiency", R8: "Adaptability",
};
const SUB = { MF07: "Pressure Response", PSE: "Pre-shot Entry" };
const rootOf = (n) => (/^N[1-8]$/.test(String(n || "")) ? "R" + String(n).slice(1) : null);

const TASKS = { Shot: "샷", Putt: "퍼트", Approach: "어프로치" };
const PRES = ["Single", "Composite", "Random"];
const TRIGGERS = {
  Shot: { visual: ["어려운 홀", "도그렉", "경사"], situation: ["버디 찬스", "파세이브", "경쟁"], club: ["드라이버", "우드", "유틸", "롱아이언", "숏아이언"] },
  Putt: { visual: ["숏퍼트", "롱퍼트", "라이 난이도", "거리감"], situation: ["버디 찬스", "파세이브", "경쟁"] },
  Approach: { visual: ["거리감", "라이 난이도", "그린 난이도", "내리막", "오르막", "포대그린"], situation: ["파세이브", "경쟁"] },
};
const ERR_UNIT = { Shot: "m", Putt: "cm", Approach: "m" };

/* 승인된 표준 템플릿 (1차). conditions 의 role: 기준 / 조건 변화 / 개입 */
const TEMPLATES = {
  baseline: {
    name: "기초 확인", purpose: "지금 수행을 같은 조건에서 확인한다. 문제나 원인을 정하지 않는다.",
    conditions: [{ key: "A", label: "평소 방식", role: "기준" }],
    reps: { min: 5, max: 20, def: 10 }, track: {}, pressure: false,
  },
  drill: {
    name: "레슨 처방 비교", purpose: "평소 방식과 레슨에서 받은 방법을 같은 조건에서 번갈아 해 보고 수행이 달라지는지 본다.",
    conditions: [{ key: "A", label: "평소 방식", role: "기준" }, { key: "B", label: "레슨 방법 적용", role: "개입" }],
    reps: { min: 5, max: 15, def: 10 }, track: { B: "체크 포인트 지킨 횟수" }, pressure: false,
  },
  mf07: {
    name: "압박 상황 · 준비 순서 비교", purpose: "같은 거리·경사에서 평소, 압박 상황, 압박 상황 + 준비 순서 유지를 비교한다.",
    conditions: [
      { key: "A", label: "평소 방식", role: "기준" },
      { key: "B", label: "압박 상황", role: "조건 변화" },
      { key: "C", label: "압박 상황 + 준비 순서 유지", role: "개입" },
    ],
    reps: { min: 5, max: 12, def: 8 }, track: { B: "준비 순서 지킨 횟수", C: "준비 순서 지킨 횟수" }, pressure: true,
  },
};

/* 검토 결과 → 다음 동작 (대표 요청서 8항). tpl: 다음 템플릿 ("same" = 같은 템플릿, "choose" = 기록으로 다시 고름, null = 만들지 않음) */
const NEXT = {
  retest_other_day: { tpl: "same", text: "좋아진 결과가 반복에서도 유지됐어요. 다른 날 같은 조건으로 한 번 더 확인해요." },
  immediate_only: { tpl: "same", order: "reverse", text: "이번에 바로 좋아졌어요. 순서를 바꿔 반복해서, 연습 효과인지 확인해요." },
  mechanism_no_effect: { tpl: "drill", text: "확인하려던 부분은 지켰지만 결과는 비슷했어요. 다른 부분을 함께 살펴보는 훈련으로 바꿔요." },
  alt_check: { tpl: "drill", text: "평소 조건에서도 같은 미스가 나왔어요. 기술·난도·장비 쪽을 먼저 확인하는 훈련을 제안해요." },
  no_pressure: { tpl: "same", text: "이번 상황에서는 부담을 거의 느끼지 않았어요. 압박 효과는 아직 판단하지 않고, 다른 상황으로 다시 확인해요." },
  compare_hard: { tpl: "same", text: "조건이 서로 달라 좋아졌는지 나빠졌는지 비교하기 어려워요. 같은 거리·경사·클럽으로 다시 비교해요." },
  repeat_more: { tpl: "same", text: "시도 횟수가 적어 아직 비교하지 않았어요. 같은 조건으로 횟수를 채워 다시 해요." },
  hold: { tpl: "same", text: "조건 사이 차이가 뚜렷하지 않았어요. 같은 조건으로 한 번 더 비교해요." },
  baseline_done: { tpl: "choose", text: "현재 수행을 확인했어요. 이 결과를 기준으로 다음 훈련을 맞춰요." },
  no_data: { tpl: null, text: "결과가 아직 없어요. 각 조건의 성공 수와 시도 수만 입력해 주시면 다음 훈련을 맞출게요." },
  stopped: { tpl: null, text: "중단한 기록을 남겼어요. 그 동작은 멈추고 코치님과 먼저 상의한 뒤 다시 시작해요." },
};

const PRESSURE_WORDS = /압박|긴장|떨리|떨려|떨림|시합|대회|파\s?세이브|버디|경쟁|중요한\s?(퍼트|샷)|급해|빨라져|서두르/;
const taskOf = (pillar) => (pillar === "putt" ? "Putt" : pillar === "short" ? "Approach" : "Shot");

/* 템플릿 선택 (규칙). 기록이 부족하면 기초 확인. 원인을 만들어 내지 않는다. */
function choose({ lessons, parent }) {
  if (parent && parent.next && parent.next.tpl && parent.next.tpl !== "choose") {
    const tpl = parent.next.tpl === "same" ? parent.template.id : parent.next.tpl;
    if (tpl === "drill" && !(lessons[0] && (lessons[0].result.drills || []).length)) return { tpl: "baseline", task: parent.task, why: "레슨 처방 기록이 없어 기초 확인" };
    return { tpl, task: parent.task, why: "이전 결과 분기: " + parent.next.decision };
  }
  const l = lessons[0];
  const r = l && l.result;
  if (!r || !r.problem || !String(r.problem.observation || "").trim()) return { tpl: "baseline", task: r ? taskOf(r.pillar) : "Putt", why: "관찰 기록 부족" };
  const txt = [l.transcript, r.problem.observation, r.problem.interpretation, r.mf && r.mf.signs].join(" ");
  if (PRESSURE_WORDS.test(txt) || (r.mf && r.mf.level === "낮음")) return { tpl: "mf07", task: taskOf(r.pillar), why: "최근 레슨에 압박·시합 상황 관찰" };
  if ((r.drills || []).length) return { tpl: "drill", task: taskOf(r.pillar), why: "최근 레슨 처방이 있음" };
  return { tpl: "baseline", task: taskOf(r.pillar), why: "비교할 처방 없음" };
}

/* 내부 Matrix 연결 (규칙). R6·R7은 원인으로 쓰지 않고 평가 지표·관찰로만 붙인다. */
function linkRoots(tpl, lesson) {
  const node = rootOf(lesson && lesson.result && lesson.result.node);
  const exec = node && !["R1", "R6", "R7"].includes(node) ? node : null;
  if (tpl === "mf07") return {
    primary: { root: "R1", name: ROOTS.R1, sub: "MF07 " + SUB.MF07, role: "원인 후보" },
    related: [
      { root: "R1", name: ROOTS.R1, sub: SUB.PSE, role: "매개 과정", link: "압박 상황 → 준비 순서·템포 변화" },
      ...(exec ? [{ root: exec, name: ROOTS[exec], role: "매개 과정", link: "준비 변화 → 실행·임팩트 (레슨 위치)" }] : []),
      { root: "R6", name: ROOTS.R6, role: "평가 지표", link: "같은 조건 반복 정확도" },
    ],
    path: "유발조건 → 체감 압박·상황 해석 → 불안·긴장 → 주의·루틴·템포 → 실행·임팩트 → 수행 결과 (각 단계 미확인)",
  };
  if (tpl === "drill") return {
    primary: exec ? { root: exec, name: ROOTS[exec], role: "원인 후보" } : { root: null, name: "레슨 위치 미정", role: "원인 후보" },
    related: [{ root: "R6", name: ROOTS.R6, role: "평가 지표", link: "같은 조건 반복 정확도" }],
    path: "레슨 방법 적용 → 체크 포인트 변화 → 수행 결과 (미확인)",
  };
  return { primary: { root: null, name: "검토 대상 없음 (기초 확인)", role: "관찰 결과" }, related: [{ root: "R6", name: ROOTS.R6, role: "평가 지표", link: "현재 수행 기준값" }], path: "" };
}

function lessonsText(lessons) {
  return lessons.map((l, i) => {
    const r = l.result || {}, p = r.problem || {};
    const fb = (l.feedback || []).slice(-3).map((f) => f.verdict + (f.text ? "(" + f.text + ")" : "")).join(", ");
    return `L${i + 1} ${l.date || ""} 코치 ${l.coach || "미기재"} · ${r.title || ""}
  관찰: ${p.observation || "없음"} / 해석: ${p.interpretation || "없음"} (${p.basis || ""})
  레슨 포인트: ${((r.lesson && r.lesson.points) || []).join(" / ")}
  처방: ${(r.drills || []).map((d) => `${d.name} ${d.how || ""} ${d.dose || ""}`).join(" / ") || "없음"}
  멘탈 포커스 판단: ${(r.mf && r.mf.level) || "판단 보류"} ${(r.mf && r.mf.signs) || ""}
  연습 반응: ${fb || "없음"}`;
  }).join("\n") || "없음 (레슨 기록 없음)";
}

function trainingsText(list) {
  return list.map((t) => {
    const run = (t.runs || []).slice(-1)[0];
    const res = run && !run.stopped ? Object.entries(run.results || {}).map(([k, v]) => `${k} ${v.made ?? "?"}/${v.tries ?? "?"}`).join(", ") : run && run.stopped ? "중단(" + run.stopped + ")" : "결과 없음";
    return `- ${(t.createdAt || "").slice(0, 10)} ${TEMPLATES[t.template.id] ? TEMPLATES[t.template.id].name : t.template.id} · 상태 ${t.status} · ${res}${t.next ? " · 다음: " + t.next.decision : ""}`;
  }).join("\n") || "없음";
}

function trainPrompt({ pick, lessons, prior, parent, statementText, safety, minor }) {
  const T = TEMPLATES[pick.tpl], trig = TRIGGERS[pick.task];
  const parentTxt = parent ? `[직전 훈련 결과와 분기]\n${trainingsText([parent])}\n분기 이유: ${parent.next ? parent.next.text : ""}${parent.next && parent.next.order === "reverse" ? "\n이번에는 조건 순서를 바꾼다(개입 조건을 먼저)." : ""}` : "";
  return `너는 AP 레슨 노트의 훈련 설계 보조다. 서버 규칙이 고른 승인된 훈련 템플릿 안에서, 이 선수에게 맞게 문구와 설정만 채운다.
새 드릴의 효과가 검증됐다고 말하지 않고, 새 판정 규칙이나 원인을 만들지 않는다.
${safety(minor)}

[선택된 템플릿 · 바꾸지 않는다]
이름: ${T.name}
목적: ${T.purpose}
과제: ${TASKS[pick.task]}
비교 조건: ${T.conditions.map((c) => `${c.key} ${c.label}(${c.role})`).join(" / ")}
조건당 반복 수 범위: ${T.reps.min}~${T.reps.max} (기본 ${T.reps.def})
${T.pressure ? `압박 상황 고르기(이 목록에서만): 시각 조건 ${trig.visual.join("·")} / 상황 조건 ${trig.situation.join("·")}${trig.club ? " / 클럽 " + trig.club.join("·") : ""}
제시 방식: Single(한 가지 상황) 기본. Composite·Random은 기록상 필요할 때만.` : ""}

[근거로 쓸 수 있는 기록 · 이 선수 본인 것만]
${lessonsText(lessons)}

[이전 훈련 카드]
${trainingsText(prior)}
${parentTxt}
${statementText || ""}

[작성 원칙]
- card는 코치와 선수가 바로 실행할 수 있는 쉬운 말로 쓴다. R1·N3·MF07 같은 코드, '노드', '인과', '가설', '매개', '확률', '신뢰도', '%', '입증', '증명'이라는 말을 card에 쓰지 않는다.
- 기록에 나온 관찰과 해석을 구분한다. 원인을 확정하지 않는다("~때문입니다" 대신 "~인지 확인하는 훈련").
- ${pick.tpl === "baseline" ? "기초 확인 과제다. 기술 결함이나 멘탈 문제를 말하지 말고 '먼저 현재 수행을 확인한 뒤 다음 훈련을 맞춘다'는 목적만 쓴다." : "추천 이유(why)는 기록에 나온 모습을 근거로 한두 문장. 무엇을 확인하는 훈련인지 쓴다."}
- steps는 실제 순서대로 3~6개. 거리·클럽·조건 순서·조건당 반복 수가 들어간다. 비교하는 조건은 모두 같은 거리·경사·클럽으로 한다.
- success는 이 선수 기록에 맞춘 성공 기준 한 줄(예: 홀인, 홀 1m 원 안, 그린 적중). 모든 선수에게 같은 수치를 고정하지 않는다.
- reps는 범위 안 정수. 훈련량·연령·통증 기록을 고려한다.
- checks는 코치나 선수가 눈으로 확인할 핵심 2~3개.
- unknowns는 아직 모르는 것(쉬운 말, 0~3개).
- internal.evidence는 실제로 근거로 쓴 기록 번호(L1, L2 …)만. 레슨 기록이 없으면 빈 배열.
- internal.observed는 기록에서 뽑은 관찰(원문에 가까운 짧은 문장), missing은 판단에 부족한 정보, alternatives는 다른 가능한 설명(기술·난도·장비·컨디션 등), weakening은 이 추천의 전제를 약하게 만드는 관찰.

JSON만 출력:
{"card":{"goal":"오늘의 목표 한 문장","drill":"추천 훈련 한두 문장","steps":[""],"checks":[""],"why":"","unknowns":[""]},
"setup":{"distance":"","slope":"","club":"","reps":${T.reps.def},"success":""${T.pressure ? `,"trigger":{"visual":[],"situation":[]},"presentation":"Single"` : ""}},
"internal":{"evidence":["L1"],"observed":[""],"missing":[""],"alternatives":[""],"intervention":"바꾸려는 조건","comparison":"무엇과 비교하는지","expected":"개입 뒤 예상 변화","weakening":[""],"repeat_plan":"반복·재검 계획"}}`;
}

const BANNED = /\b[RN][1-8]\b|MF\d{2}|노드|인과|매개|가설|입증|증명|확률|신뢰도|\d\s*%|퍼센트|\bRoot\b/i;
const CAUSE_WORDS = /원인은|때문(입니다|이에요|이다)|문제(가|는)\s?있(습니다|어요)|결함/;
const S = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const A = (v, n, k) => (Array.isArray(v) ? v : []).map((x) => S(x, n)).filter(Boolean).slice(0, k);

/* AI 출력 검증. 문제 목록을 돌려준다(비어 있으면 통과). */
function validate(out, { pick, lessons }) {
  const p = [];
  const T = TEMPLATES[pick.tpl];
  const c = (out && out.card) || {}, st = (out && out.setup) || {}, inn = (out && out.internal) || {};
  if (!S(c.goal, 200)) p.push("card.goal 비어 있음");
  if (!S(c.drill, 400)) p.push("card.drill 비어 있음");
  if (A(c.steps, 300, 8).length < 2) p.push("진행 방법(steps) 부족");
  if (!A(c.checks, 100, 4).length) p.push("체크 포인트 없음");
  if (!S(st.success, 120)) p.push("성공 기준(success) 없음");
  const reps = Number(st.reps);
  if (!Number.isInteger(reps) || reps < T.reps.min || reps > T.reps.max) p.push(`반복 수 ${st.reps}가 범위 ${T.reps.min}~${T.reps.max} 밖`);
  const cardText = [c.goal, c.drill, c.why, ...(c.steps || []), ...(c.checks || []), ...(c.unknowns || []), st.success].join(" ");
  if (BANNED.test(cardText)) p.push("화면 문장에 내부 코드·용어·수치 확률이 있음");
  if (pick.tpl === "baseline" && CAUSE_WORDS.test(cardText)) p.push("기초 확인 과제에 원인·결함을 단정함");
  if (CAUSE_WORDS.test(String(c.why || "")) && !(lessons.length)) p.push("기록 없이 원인을 단정함");
  const ev = A(inn.evidence, 4, 5);
  if (ev.some((e) => !/^L[1-9]$/.test(e) || Number(e.slice(1)) > lessons.length)) p.push("존재하지 않는 근거 기록 번호");
  if (pick.tpl !== "baseline" && lessons.length && !ev.length) p.push("근거 기록이 비어 있음");
  if (T.pressure) {
    const tg = st.trigger || {}, tr = TRIGGERS[pick.task];
    const vis = A(tg.visual, 20, 4), sit = A(tg.situation, 20, 3);
    if (!sit.length && !vis.length) p.push("압박 상황(trigger)이 없음");
    if (vis.some((x) => !tr.visual.includes(x) && !(tr.club || []).includes(x)) || sit.some((x) => !tr.situation.includes(x))) p.push("지원하지 않는 압박 상황");
    if (st.presentation && !PRES.includes(st.presentation)) p.push("지원하지 않는 제시 방식");
  }
  if (!S(inn.expected, 300) || !S(inn.comparison, 300)) p.push("예상 변화·비교 기준 누락");
  return p;
}

/* 검증을 통과한 출력으로 저장할 훈련 문서를 만든다 */
function buildDoc({ out, pick, lessons, parent, model, uid }) {
  const T = TEMPLATES[pick.tpl], st = out.setup || {}, c = out.card, inn = out.internal || {};
  const lessonById = (e) => lessons[Number(e.slice(1)) - 1];
  const evidence = A(inn.evidence, 4, 5).map(lessonById).filter(Boolean)
    .map((l) => ({ id: l.id, date: l.date || "", coach: l.coach || "", title: (l.result && l.result.title) || "" }));
  const reverse = parent && parent.next && parent.next.order === "reverse";
  const order = T.conditions.map((x) => x.key);
  if (reverse && order.length > 2) order.splice(1, 2, order[2], order[1]);
  else if (reverse && order.length === 2) order.reverse();
  const tr = TRIGGERS[pick.task];
  const trigger = T.pressure ? {
    visual: A((st.trigger || {}).visual, 20, 4).filter((x) => tr.visual.includes(x) || (tr.club || []).includes(x)),
    situation: A((st.trigger || {}).situation, 20, 3).filter((x) => tr.situation.includes(x)),
  } : null;
  const setup = {
    task: pick.task, distance: S(st.distance, 40), slope: S(st.slope, 40), club: S(st.club, 30),
    reps: Number(st.reps), success: S(st.success, 120), order, errUnit: ERR_UNIT[pick.task],
    ...(T.pressure ? { trigger, presentation: PRES.includes(st.presentation) ? st.presentation : "Single" } : {}),
    ...(parent && parent.next && parent.next.decision === "retest_other_day" ? { otherDay: true } : {}),
  };
  const card = { goal: S(c.goal, 200), drill: S(c.drill, 400), steps: A(c.steps, 300, 8), checks: A(c.checks, 100, 4), why: S(c.why, 400), unknowns: A(c.unknowns, 150, 3) };
  const conditions = T.conditions.map((x) => ({ ...x, track: T.track[x.key] || "", perceived: T.pressure && x.key !== "A" }));
  const now = new Date().toISOString();
  const roots = linkRoots(pick.tpl, lessons[0]);
  return {
    createdAt: now, updatedAt: now, uid, status: "proposed", parent: parent ? parent.id : null,
    template: { id: pick.tpl, name: T.name, ver: TPL_VER, minReps: T.reps.min }, task: pick.task,
    kind: pick.tpl === "baseline" ? "baseline" : "standard",
    proposal: { card, setup, conditions, at: now },           // AI 원안 (고치지 않는다)
    current: { card, setup, conditions },                     // 지금 적용본 (수정되면 바뀜)
    adjustments: [], runs: [], events: [{ at: now, by: "ai", action: "proposed" }],
    review: null, next: null, compat: { ok: true, notes: [] },
    internal: {
      selection: pick.why, evidence,
      observed: A(inn.observed, 200, 5).map((t) => ({ text: t, source: "AI 추출", confirmed: false })),
      missing: A(inn.missing, 200, 5), primary: roots.primary, related: roots.related, path: roots.path,
      alternatives: A(inn.alternatives, 200, 4), intervention: S(inn.intervention, 300), comparison: S(inn.comparison, 300),
      outcome: { metric: "성공 비율(성공 수/시도 수)", direction: "높을수록 좋음", secondary: { metric: "목표 오차", unit: ERR_UNIT[pick.task], direction: "작을수록 좋음" } },
      expected: S(inn.expected, 300), weakening: A(inn.weakening, 200, 4), repeat_plan: S(inn.repeat_plan, 300),
      branches: Object.fromEntries(Object.entries(NEXT).map(([k, v]) => [k, v.text])),
      versions: { matrix: MATRIX_VER, template: TPL_VER, rules: RULE_VER, ai: model },
    },
  };
}

/* ===== 결과 검토 (규칙, AI 없음) =====
 * 세 가지를 따로 본다: 조건 변화 / 개입 효과 / 작동 경로. 수행이 좋아졌다고 원인이 확인된 것으로 처리하지 않는다.
 * 상태: 미검토 · 검토 중 · 잠정 지지 · 반증 관찰 · 판단 유보 (근거·한계 함께) */
const GAP = 0.2; // 성공 비율 차이 기준(규칙 v1). 화면에는 숫자로 보이지 않는다.
const H = (status, basis, limits) => ({ status, basis, limits });
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
function rateOf(x) { const m = num(x && x.made), t = num(x && x.tries); return m === null || !t ? null : m / t; }
function sd(a) { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }

function r6(res, unit) {
  const out = {};
  for (const [k, v] of Object.entries(res || {})) {
    const errs = (Array.isArray(v.errs) ? v.errs : []).map(num).filter((x) => x !== null);
    const bias = errs.length ? errs.reduce((s, x) => s + x, 0) / errs.length : num(v.err);
    out[k] = {
      accuracy: rateOf(v) === null ? "미산출" : `${v.made}/${v.tries}`,
      bias: bias === null ? "미산출" : Math.round(bias * 10) / 10 + unit,
      spread: errs.length >= 3 ? Math.round(sd(errs) * 10) / 10 + unit : "미산출 (각 시도 오차 3개 미만)",
      retention: "미산출 (다른 날 재검 전)",
    };
  }
  return out;
}

function reviewRun(t, parent) {
  const run = (t.runs || []).slice(-1)[0];
  const tpl = t.template.id, cur = t.current || t.proposal, min = t.template.minReps || 5;
  const base = { at: new Date().toISOString(), rules: RULE_VER };
  const HOLD = (why) => ({ cond: H("판단 유보", why, ""), int: H("판단 유보", why, ""), path: H("판단 유보", why, "") });
  if (!run) return { ...base, decision: "no_data", h: HOLD("결과 미입력") };
  if (run.stopped) return { ...base, decision: "stopped", h: HOLD("통증·피로로 중단 (" + run.stopped + ")"), note: "완료·실패로 계산하지 않음" };
  const res = run.results || {}, keys = cur.conditions.map((c) => c.key);
  const missing = keys.filter((k) => rateOf(res[k]) === null);
  const R6 = r6(res, cur.setup.errUnit || "");
  if (missing.length) return { ...base, decision: "no_data", h: HOLD("결과 없는 조건: " + missing.join(",")), r6: R6, need: missing };
  if (tpl === "baseline") return { ...base, decision: "baseline_done", h: { cond: H("미검토", "기초 확인 과제", ""), int: H("미검토", "기초 확인 과제", ""), path: H("미검토", "기초 확인 과제", "") }, r6: R6 };
  if (run.sameSetup === false) return { ...base, decision: "compare_hard", h: HOLD("조건마다 거리·경사·클럽이 달랐음"), r6: R6 };
  const few = keys.filter((k) => num(res[k].tries) < min);
  if (few.length) return { ...base, decision: "repeat_more", h: HOLD(`시도 수 부족(${few.join(",")}: ${min}회 미만)`), r6: R6 };

  const lim = "한 번의 비교 · 같은 날 결과";
  const keep = (k) => { const r = num(res[k] && res[k].routine), tr = num(res[k] && res[k].tries); return r === null || !tr ? null : r / tr; };
  let h, decision;
  if (tpl === "mf07") {
    const [rA, rB, rC] = ["A", "B", "C"].map((k) => rateOf(res[k]));
    const pB = num(((res.B || {}).perceived || {}).pressure);
    const cond = pB === null ? H("판단 유보", "압박 상황의 체감 부담 미측정", lim)
      : pB <= 1 ? H("판단 유보", `압박 상황을 제시했지만 체감 부담 ${pB}/5`, lim)
      : rA - rB >= GAP ? H("잠정 지지", `압박 상황(${res.B.made}/${res.B.tries})이 평소(${res.A.made}/${res.A.tries})보다 낮음 · 체감 부담 ${pB}/5`, lim)
      : rB - rA >= GAP ? H("반증 관찰", `압박 상황에서 오히려 높음(${res.B.made}/${res.B.tries} vs ${res.A.made}/${res.A.tries})`, lim)
      : H("반증 관찰", `압박 상황과 평소 차이 작음 · 체감 부담 ${pB}/5`, lim);
    const int = rC - rB >= GAP ? H("잠정 지지", `준비 순서 유지(${res.C.made}/${res.C.tries}) > 압박 상황(${res.B.made}/${res.B.tries})`, lim + " · 순서·연습 효과 미분리")
      : rB - rC >= GAP ? H("반증 관찰", `준비 순서 유지 조건이 더 낮음(${res.C.made}/${res.C.tries})`, lim)
      : H("판단 유보", "두 조건 차이 작음", lim);
    const kC = keep("C"), kB = keep("B");
    const tB = num(((res.B || {}).perceived || {}).tension), tC = num(((res.C || {}).perceived || {}).tension);
    const routineChanged = kC !== null && kC >= 0.7 && (kB === null || kC > kB);
    const pathBasis = `준비 순서 지킨 비율 C ${kC === null ? "미입력" : res.C.routine + "/" + res.C.tries}, B ${kB === null ? "미입력" : res.B.routine + "/" + res.B.tries}` + (tB !== null && tC !== null ? ` · 긴장 B ${tB} → C ${tC}` : " · 긴장 미측정");
    const path = kC === null ? H("판단 유보", "준비 순서 기록 없음", "선수 진술을 신체 변화로 바꾸지 않음")
      : int.status === "잠정 지지" && routineChanged ? H("잠정 지지", pathBasis, lim)
      : int.status === "잠정 지지" ? H("판단 유보", "수행은 좋아졌지만 준비 순서 변화가 확인되지 않음 · " + pathBasis, lim)
      : routineChanged ? H("반증 관찰", "준비 순서는 지켰지만 수행 차이 없음 · " + pathBasis, lim)
      : H("판단 유보", pathBasis, lim);
    h = { cond, int, path };
    const baseBad = rA < 0.5 && Math.abs(rA - rB) < GAP;
    if (pB !== null && pB <= 1 && int.status !== "잠정 지지") decision = "no_pressure";
    else if (int.status === "잠정 지지") decision = parent && parent.template.id === tpl && parent.review && parent.review.h && parent.review.h.int.status === "잠정 지지" ? "retest_other_day" : "immediate_only";
    else if (path.status === "반증 관찰") decision = "mechanism_no_effect";
    else if (baseBad) decision = "alt_check";
    else decision = "hold";
  } else {
    const [rA, rB] = ["A", "B"].map((k) => rateOf(res[k]));
    const int = rB - rA >= GAP ? H("잠정 지지", `레슨 방법(${res.B.made}/${res.B.tries}) > 평소(${res.A.made}/${res.A.tries})`, lim + " · 순서·연습 효과 미분리")
      : rA - rB >= GAP ? H("반증 관찰", `레슨 방법 조건이 더 낮음(${res.B.made}/${res.B.tries})`, lim)
      : H("판단 유보", "두 조건 차이 작음", lim);
    const kB = keep("B");
    const path = kB === null ? H("판단 유보", "체크 포인트 기록 없음", lim)
      : int.status === "잠정 지지" && kB >= 0.7 ? H("잠정 지지", `체크 포인트 지킴 ${res.B.routine}/${res.B.tries}`, lim)
      : kB >= 0.7 ? H("반증 관찰", `체크 포인트는 지켰지만 수행 차이 없음(${res.B.routine}/${res.B.tries})`, lim)
      : H("판단 유보", `체크 포인트 지킴 ${res.B.routine}/${res.B.tries}`, lim);
    h = { cond: H("미검토", "이 훈련은 상황 변화를 비교하지 않음", ""), int, path };
    if (int.status === "잠정 지지") decision = parent && parent.template.id === tpl && parent.review && parent.review.h && parent.review.h.int.status === "잠정 지지" ? "retest_other_day" : "immediate_only";
    else if (path.status === "반증 관찰") decision = "mechanism_no_effect";
    else if (rA < 0.5 && int.status !== "잠정 지지") decision = "alt_check";
    else decision = "hold";
  }
  return { ...base, decision, h, r6: R6 };
}

function nextOf(decision) {
  const n = NEXT[decision] || NEXT.hold;
  return { decision, text: n.text, tpl: n.tpl, ...(n.order ? { order: n.order } : {}) };
}

module.exports = { TEMPLATES, TRIGGERS, TASKS, ROOTS, NEXT, choose, trainPrompt, validate, buildDoc, reviewRun, nextOf, MATRIX_VER, TPL_VER, RULE_VER };
