/* AP 레슨 노트 · AI 훈련 카드 (서버 전용, 대외비)
 * 구조: 승인된 표준 템플릿 + 규칙(서버) + AI의 설명·개인화.
 * - 어떤 템플릿을 쓸지, 내부 Root 연결, 결과 검토, 다음 훈련 분기는 규칙이 정한다(AI가 정하지 않는다).
 * - AI는 선택된 템플릿 안에서 문구·거리·반복 수·성공 기준을 이 선수에게 맞게 채운다.
 * - 화면(카드)에는 Root 코드·가설 용어를 쓰지 않는다. 내부 기록(internal·review)에만 남긴다.
 * 바꾸면 버전 문자열을 올리고 docs/decisions.md 에 기록한다. */

const MATRIX_VER = "AP Swing Learning Matrix 명세 v1.2 (2026-11-17)";
const TPL_VER = "tpl-1";
const RULE_VER = "review-3 (v1.2 개정: 선수·과제 기준선 기반 의미 있는 변화)";
/* 운영 기준 (버전 관리, 코치진 확정 전 임시값) */
const OPS = {
  ver: "ops-1 (2026-11-17, 임시)",
  putt: { shortMax: 2, longMin: 10 },   // 숏퍼트 ≤ 2m, 롱퍼트 ≥ 10m (실제 거리 함께 기록)
  block: 2,                              // 번갈아 하기: 조건마다 2개씩 돌아가며
  z: 1.64,                               // 예측한 방향의 차이를 볼 때 측정 정밀도 배수
};
const meters = (v) => { const m = String(v || "").match(/(\d+(?:\.\d+)?)\s*(cm|m|미터)?/); if (!m) return null; const n = Number(m[1]); return m[2] === "cm" ? n / 100 : n; };
/* 조건 순서표: 번갈아(interleaved, 기본) 또는 조건별로 묶어서(blocked) */
function schedule(order, reps, mode) {
  if (mode === "blocked") return order.flatMap((k) => Array(reps).fill(k));
  const left = Object.fromEntries(order.map((k) => [k, reps])), out = [];
  let rot = [...order];
  while (Object.values(left).some((x) => x > 0)) {
    for (const k of rot) { const n = Math.min(OPS.block, left[k]); for (let i = 0; i < n; i++) out.push(k); left[k] -= n; }
    rot = [...rot.slice(1), rot[0]];
  }
  return out;
}

/* 내부 AP Matrix. Root는 '확인된 근본 원인'이 아니다. 검토마다 역할(원인 후보·매개 과정·관찰 결과·평가 지표)을 붙인다.
 * 번호는 기존 N1~N8과 같은 자리다(N3 = R3). 고정된 한 방향 사슬로 연결하지 않는다. */
const ROOTS = {
  R1: "Mental Focus", R2: "Perceived Impact", R3: "Face & Lever System", R4: "Club Path Control",
  R5: "Real Impact", R6: "Consistency", R7: "Efficiency", R8: "Adaptability",
};
const SUB = { MF07: "MF07 Pressure Response", MF02: "MF02 Pre-shot Entry", R6P: "Pressure Repeatability", R5S: "Start Direction Reality" };

/* Root별 연결 정보 (명세 v1.2 §11): 적용 과제·조건 / 필요한 관찰 / 가설 경로 / 대안 원인 / 템플릿 / 비교·지표 / 재검 / 분기 */
const ROOT_SPEC = {
  R1: { role: "원인 후보·매개 과정", sub: ["MF01 Attention Anchor", "MF02 Pre-shot Entry", "MF03 Tempo Awareness", "MF04 Timing Perception", "MF05 External vs Internal Focus", "MF06 Reset / Recovery", "MF07 Pressure Response"],
    tasks: "Shot·Putt·Approach, 압박·경쟁·결과 중요도 조건", observe: "유발조건, 체감 압박·상황 해석·불안·긴장(0~5/미측정), 루틴 진입·템포", paths: "과제·환경·상태 → R1 → R3·R4 실행 변화 → R5 → 결과",
    alternatives: "기술 취약성, 피로·순서·난도", template: "mf07", metric: "성공 비율·목표 오차, 준비 순서 지킨 횟수", retest: "다른 날 같은 조건", branches: "NEXT 표" },
  R2: { role: "원인 후보·매개 과정", sub: ["Impact Image", "Start Line Intention", "Trajectory Picture", "Direction Bias", "Contact Purpose", "Shot Pattern Projection"], tasks: "샷 전 의도를 말로 남길 수 있는 과제", observe: "사전에 표현한 의도와 실제 실행", paths: "R8 선택 → R2 → R3·R4", alternatives: "실행 문제, 의도 역추정 위험", template: "drill (확장 예정)", metric: "의도한 출발선 일치", retest: "다른 날", branches: "NEXT 표" },
  R3: { role: "원인 후보·매개 과정", sub: ["Face Angle", "Release Timing", "Grip Pressure", "Wrist Structure", "Lever Sequence", "Handle Control / Loft Presentation"], tasks: "낮은 압박 같은 조건 반복", observe: "실행 지표와 충돌 자료", paths: "R1·R2 → R3(+R4) → R5", alternatives: "경로(R4)·보정 전략·장비", template: "drill", metric: "성공 비율·목표 오차", retest: "다른 날", branches: "NEXT 표" },
  R4: { role: "원인 후보·매개 과정", sub: ["Approach Direction", "Swing Arc Orientation", "Low Point Path Relation", "Inside/Outside Pattern", "Body-Club Path Sync", "Plane Access"], tasks: "낮은 압박 같은 조건 반복", observe: "실행 지표와 충돌 자료", paths: "R1·R2 → R4(+R3) → R5", alternatives: "페이스(R3)·보정 전략·장비", template: "drill", metric: "성공 비율·목표 오차", retest: "다른 날", branches: "NEXT 표" },
  R5: { role: "관찰 결과·볼 결과의 원인 후보", sub: ["Strike Quality", "Low Point Contact", "Face-to-Path Result", "Start Direction Reality", "Ground Contact Order", "Speed at Impact"], tasks: "충돌 관찰이 가능한 과제", observe: "충돌 지표와 볼 결과·환경(따로 저장)", paths: "R3·R4 결합 → R5 + 공·지면·환경 → 결과", alternatives: "환경·라이·장비", template: "drill", metric: "타점·출발 방향 관찰", retest: "다른 날", branches: "NEXT 표" },
  R6: { role: "평가 지표", sub: ["Pattern Repeatability", "Pre-shot Repeatability", "Miss Dispersion", "Contact Stability", "Session-to-Session Repeatability", "Pressure Repeatability"], tasks: "유사 조건 반복", observe: "반복 수·목표 오차·분산·조건", paths: "반복 수행 → R6 평가", alternatives: "원인으로 쓰지 않음", template: "모든 템플릿의 평가", metric: "정확도·평균 오차·분산·유지 (안정적으로 편향됨 구분)", retest: "다른 날 유지", branches: "—" },
  R7: { role: "평가 지표", sub: ["Energy Transfer", "Sequence Efficiency", "Mobility Limitation", "Transition Efficiency", "Force Waste Reduction", "Effort vs Output Ratio"], tasks: "투입 지표가 있는 과제", observe: "노력·비용 지표와 산출", paths: "투입·산출 → R7 평가", alternatives: "원인으로 쓰지 않음", template: "확장 예정", metric: "노력 대비 산출", retest: "다른 날", branches: "—" },
  R8: { role: "선택·조정 과정 / 조건 대응력 평가", sub: ["Shot Selection Range", "Adaptive Decision", "Pressure Execution", "Situation-specific Control", "Intentional Curve Creation", "Strategic Reproduction"], tasks: "조건이 바뀌는 과제", observe: "선택 근거·의도한 실행·실제 결과·새 조건 전이(따로)", paths: "과제·환경 → R8 선택 → R2 → 실행", alternatives: "성공만으로 좋은 선택 판정 금지", template: "확장 예정", metric: "선택 적절성·실행·결과·전이", retest: "새 조건", branches: "—" },
};
const rootOf = (n) => (/^N[1-8]$/.test(String(n || "")) ? "R" + String(n).slice(1) : null);

const TASKS = { Shot: "샷", Putt: "퍼트", Approach: "어프로치" };
const PRES = ["Single", "Composite", "Random"];
const TRIGGERS = {
  Shot: { visual: ["어려운 홀", "도그렉", "경사"], situation: ["버디 찬스", "파세이브", "경쟁"], club: ["드라이버", "우드", "유틸", "롱아이언", "숏아이언"] },
  Putt: { visual: ["숏퍼트", "롱퍼트", "라이 난이도", "거리감"], situation: ["버디 찬스", "파세이브", "경쟁"] },
  Approach: { visual: ["거리감", "라이 난이도", "그린 난이도", "내리막", "오르막", "포대그린"], situation: ["파세이브", "경쟁"] },
};
const ERR_UNIT = { Shot: "m", Putt: "cm", Approach: "m" };
const CLUB_RULE = { Shot: "드라이버·우드·유틸·롱아이언·숏아이언 중 실제 클럽", Putt: "퍼터", Approach: "실제 사용 클럽 기록" };

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
  retest_done: { tpl: "choose", text: "다른 날에도 같은 방향으로 좋아졌어요. 이 방법을 유지하면서 다음에 넓힐 조건을 코치님과 정해요." },
  baseline_first: { tpl: "same", text: "이번 결과를 이 선수의 기준으로 남겼어요. 같은 조건으로 한 번 더 하면 달라졌는지 판단할 수 있어요." },
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

/* 내부 Matrix 연결 (규칙, 명세 v1.2 §4). 주 검토·개입 Root 하나 + 관련 Root. R6·R7은 평가로만, R5는 관찰 결과로. */
function linkRoots(tpl, lesson) {
  const node = rootOf(lesson && lesson.result && lesson.result.node);
  const exec = ["R3", "R4"].includes(node) ? node : null;
  if (tpl === "mf07") return {
    primary: { root: "R1", name: ROOTS.R1, sub: SUB.MF07, role: "원인 후보", linkType: "원인 가설" },
    related: [
      { root: "R1", name: ROOTS.R1, sub: SUB.MF02, role: "매개 과정", linkType: "원인 가설", link: "압박 반응 → 루틴 진입·템포 (가설)" },
      ...(exec ? [{ root: exec, name: ROOTS[exec], role: "매개 과정", linkType: "원인 가설", link: "주의·루틴 변화 → 실행 변화 (가설)" }] : []),
      { root: "R5", name: ROOTS.R5, sub: SUB.R5S, role: "관찰 결과", linkType: "관찰", link: "출발 방향·접촉 관찰 (볼 결과는 따로 저장)" },
      { root: "R6", name: ROOTS.R6, sub: SUB.R6P, role: "평가 지표", linkType: "평가", link: "유사 압박 조건의 반복 정확도·안정성" },
    ],
    path: "유발조건 → 체감 압박·상황 해석 → 불안·긴장 → 주의·루틴·템포 → 실행·임팩트 → 수행 결과 (관찰 없는 단계는 미확인)",
  };
  if (tpl === "drill") {
    const pr = ["R2", "R3", "R4", "R5", "R8"].includes(node) ? node : null;
    return {
      primary: pr ? { root: pr, name: ROOTS[pr], role: pr === "R5" ? "관찰 결과·원인 후보" : "원인 후보", linkType: "원인 가설" } : { root: null, name: "주 검토 영역 미정(레슨 위치가 평가 영역이거나 없음)", role: "원인 후보", linkType: "원인 가설" },
      related: [...(pr && pr !== "R5" ? [{ root: "R5", name: ROOTS.R5, role: "관찰 결과", linkType: "관찰", link: "실제 충돌 관찰" }] : []), { root: "R6", name: ROOTS.R6, role: "평가 지표", linkType: "평가", link: "같은 조건 반복 정확도" }],
      path: "레슨 방법 적용 → 체크 포인트(실행) 변화 → 실제 임팩트 → 수행 결과 (미확인)",
    };
  }
  return { primary: { root: null, name: "검토 대상 없음 (평가 과제)", role: "관찰 결과", linkType: "관찰" }, related: [{ root: "R6", name: ROOTS.R6, role: "평가 지표", linkType: "평가", link: "현재 수행 기준값" }], path: "" };
}

/* 경쟁 가설 (명세 v1.2 §8). 처음엔 모두 미검토. */
const HYPS = {
  tech: "기술 가설 · 낮은 압박에서도 같은 실행 문제가 반복되는가",
  pressure: "MF07 가설 · 압박 반응과 주의·루틴 변화가 수행 변화에 앞서 나타나는가",
  interaction: "상호작용 가설 · 기술적 취약성이 압박 조건에서 더 크게 드러나는가",
  other: "기타·복합 가설 · 피로·통증·장비·난도·환경·학습·순서가 차이를 설명하는가",
};

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
- steps는 실제 순서대로 3~6개. 거리·클럽·조건당 반복 수가 들어간다. 비교하는 조건은 모두 같은 거리·경사·클럽으로 한다.
- 조건 순서는 서버가 만든 순서표(조건마다 ${OPS.block}개씩 번갈아)를 따른다. steps에 "순서표대로 번갈아 한다"고 쓰고, 한 조건을 몰아서 다 하라고 쓰지 않는다.
- 클럽: ${CLUB_RULE[pick.task]}.${pick.task === "Putt" ? ` 숏퍼트는 ${OPS.putt.shortMax}m 이하, 롱퍼트는 ${OPS.putt.longMin}m 이상(운영 기준 ${OPS.ver}). distance에는 실제 거리를 m 숫자로 쓴다.` : ""}
- 관찰하지 않은 중간 과정(예: 긴장해서 그립이 세졌다, 템포가 빨라졌다)을 사실처럼 쓰지 않는다. 기록에 있는 것만 관찰로, 나머지는 확인할 것으로 쓴다.
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
  if (pick.task === "Putt" && T.pressure) {
    const vis = A(((st.trigger || {}).visual), 20, 4), d = meters(st.distance);
    if ((vis.includes("숏퍼트") || vis.includes("롱퍼트")) && d === null) p.push("숏·롱퍼트인데 실제 거리(m)가 없음");
    if (vis.includes("숏퍼트") && d !== null && d > OPS.putt.shortMax) p.push(`숏퍼트 기준(${OPS.putt.shortMax}m 이하)과 거리 ${d}m가 맞지 않음`);
    if (vis.includes("롱퍼트") && d !== null && d < OPS.putt.longMin) p.push(`롱퍼트 기준(${OPS.putt.longMin}m 이상)과 거리 ${d}m가 맞지 않음`);
  }
  return p;
}

/* 검증을 통과한 출력으로 저장할 훈련 문서를 만든다 */
function buildDoc({ out, pick, lessons, parent, model, uid, history }) {
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
    task: pick.task, distance: S(st.distance, 40), slope: S(st.slope, 40), club: pick.task === "Putt" ? "퍼터" : S(st.club, 30),
    reps: Number(st.reps), success: S(st.success, 120), order, errUnit: ERR_UNIT[pick.task],
    orderMode: "interleaved", schedule: schedule(order, Number(st.reps), "interleaved"), distanceM: meters(st.distance),
    ...(T.pressure ? { trigger, presentation: PRES.includes(st.presentation) ? st.presentation : "Single", ...(st.presentation === "Random" ? { randomTarget: "유발조건" } : {}) } : {}),
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
      rootSpec: roots.primary.root ? ROOT_SPEC[roots.primary.root] : null,
      links: {
        causal: [roots.primary, ...roots.related].filter((x) => x.linkType === "원인 가설"),
        evaluation: [roots.primary, ...roots.related].filter((x) => x.linkType === "평가"),
        observation: [roots.primary, ...roots.related].filter((x) => x.linkType === "관찰"),
      },
      criterion: criterion(baselineOf(history || [], pick.task, null), Number(st.reps)),
      ops: OPS.ver,
      hypotheses: pick.tpl === "mf07" ? Object.fromEntries(Object.entries(HYPS).map(([k, q]) => [k, { q, status: "미검토" }])) : null,
      question: `이 선수에게, ${TASKS[pick.task]} 과제와 같은 거리·경사·클럽에서 ${S(inn.intervention, 120) || "개입"}을(를) 적용했을 때, ${S(inn.comparison, 120) || "비교 조건"}에 비해 성공 비율·목표 오차가 어떻게 달라지는가?`,
      heldEqual: "거리·경사·클럽·공·반복 수",
      alternatives: A(inn.alternatives, 200, 4), intervention: S(inn.intervention, 300), comparison: S(inn.comparison, 300),
      outcome: { metric: "성공 비율(성공 수/시도 수)", direction: "높을수록 좋음", secondary: { metric: "목표 오차", unit: ERR_UNIT[pick.task], direction: "작을수록 좋음" } },
      expected: S(inn.expected, 300), weakening: A(inn.weakening, 200, 4), repeat_plan: S(inn.repeat_plan, 300),
      branches: Object.fromEntries(Object.entries(NEXT).map(([k, v]) => [k, v.text])),
      versions: { matrix: MATRIX_VER, template: TPL_VER, rules: RULE_VER, ai: model },
    },
  };
}

/* ===== 결과 검토 (규칙, AI 없음, 명세 v1.2 §10) =====
 * 조건 효과 / 개입 효과 / 작동 경로를 따로 본다. 수행 개선을 전체 인과 경로의 입증으로 처리하지 않는다.
 * 상태: 미검토 · 검토 중 · 잠정 지지 · 반증 관찰 · 판단 유보 (근거·한계 함께)
 * 잠정 지지는 사전 예측과 맞는 변화가 별도 반복 블록 또는 재검에서도 같은 방향일 때만. 한 번이면 '검토 중'. */
/* 의미 있는 변화 기준 (명세 v1.2 개정 §10-4): 모든 과제에 같은 폭을 쓰지 않는다.
 * 이 선수·같은 과제의 이전 '평소 조건(A)' 결과(기초 확인 포함)를 기준선으로,
 * 기준 = max(측정 정밀도 z×√(p(1−p)×2/n), 세션 간 변동 2×SD(2회 이상일 때), 1/n). 기준선이 없으면 판단 유보. */
function baselineOf(history, task, excludeId) {
  const out = [];
  for (const t of history || []) {
    if (t.task !== task || t.id === excludeId) continue;
    for (const run of t.runs || []) { const a = run && !run.stopped && run.results && run.results.A; if (a && Number(a.tries) > 0 && a.made !== null && a.made !== undefined) out.push({ made: Number(a.made), tries: Number(a.tries), at: run.at }); }
  }
  return out;
}
function criterion(base, n) {
  if (!base.length) return { thr: null, basis: "기준선 없음 (이 과제의 평소 조건 결과가 아직 없음)", ops: OPS.ver };
  if (!n) return { thr: null, basis: "반복 수 없음", ops: OPS.ver };
  const M = base.reduce((a, x) => a + x.made, 0), T = base.reduce((a, x) => a + x.tries, 0);
  const p = (M + 1) / (T + 2), prec = OPS.z * Math.sqrt(p * (1 - p) * (2 / n));
  const rates = base.map((x) => x.made / x.tries), between = rates.length >= 2 ? 2 * sd(rates) : null;
  const thr = Math.max(prec, between || 0, 1 / n);
  const r2 = (x) => Math.round(x * 100) / 100;
  return { thr: r2(thr), p: r2(p), n, sessions: base.length, precision: r2(prec), between: between === null ? "미산출 (기준선 2회 미만)" : r2(between), ops: OPS.ver,
    basis: `기준선 ${base.length}회(평균 성공 비율 ${r2(p)}) · 조건당 ${n}번`, };
}
const H = (status, basis, limits) => ({ status, basis, limits });
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
function rateOf(x) { const m = num(x && x.made), t = num(x && x.tries); return m === null || !t ? null : m / t; }
function sd(a) { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }

/* R6: 정확도와 반복 분산을 분리. 목표에서 계속 벗어나면서 분산만 작으면 '안정적으로 편향됨' */
function r6(res, unit) {
  const out = {};
  for (const [k, v] of Object.entries(res || {})) {
    const errs = (Array.isArray(v.errs) ? v.errs : []).map(num).filter((x) => x !== null);
    const bias = errs.length ? errs.reduce((s, x) => s + x, 0) / errs.length : num(v.err);
    const spread = errs.length >= 3 ? sd(errs) : null, rate = rateOf(v);
    out[k] = {
      accuracy: rate === null ? "미산출" : `${v.made}/${v.tries}`,
      motion: num(v.routine) === null ? "미산출 (루틴·체크 포인트 기록 없음)" : `${v.routine}/${v.tries} (동작·루틴 재현)`,
      bias: bias === null ? "미산출" : Math.round(bias * 10) / 10 + unit,
      spread: spread === null ? "미산출 (각 시도 오차 3개 미만)" : Math.round(spread * 10) / 10 + unit,
      pattern: spread !== null && bias > 0 && spread < bias * 0.5 && rate !== null && rate < 0.5 ? "안정적으로 편향됨" : spread === null ? "미산출" : "—",
      retention: "미산출 (다른 날 재검 전)",
    };
  }
  return out;
}

/* 사전 예측 방향(+1 예측대로, -1 반대, 0 차이 작음, null 판단 불가) */
const dir = (a, b, thr) => (a === null || b === null || thr === null ? null : a - b >= thr ? 1 : b - a >= thr ? -1 : 0);
/* 직전 같은 템플릿 결과(별도 블록 또는 다른 날)와 방향이 같을 때만 잠정 지지 */
function confirmStatus(d, prevDir, basis, lim, againWhat) {
  if (d === 1) return prevDir === 1 ? H("잠정 지지", basis + ` · ${againWhat}에서도 같은 방향`, lim + " · 남은 대안 설명 있음") : H("검토 중", basis + " · 예측과 맞는 변화(반복·재검 전)", lim);
  if (d === -1) return H("반증 관찰", basis, lim);
  return H("판단 유보", basis + " · 차이 작음", lim);
}

function reviewRun(t, parent, history) {
  const run = (t.runs || []).slice(-1)[0];
  const tpl = t.template.id, cur = t.current || t.proposal, min = t.template.minReps || 5;
  const base = { at: new Date().toISOString(), rules: RULE_VER, matrix: MATRIX_VER };
  const HOLD = (why) => ({ cond: H("판단 유보", why, ""), int: H("판단 유보", why, ""), path: H("판단 유보", why, "") });
  if (!run) return { ...base, decision: "no_data", h: HOLD("결과 미입력") };
  if (run.stopped) return { ...base, decision: "stopped", h: HOLD("통증·피로로 중단 (" + run.stopped + ")"), note: "완료·실패로 계산하지 않음" };
  const res = run.results || {}, keys = cur.conditions.map((c) => c.key);
  const missing = keys.filter((k) => rateOf(res[k]) === null);
  const R6 = r6(res, cur.setup.errUnit || "");
  if (missing.length) return { ...base, decision: "no_data", h: HOLD("결과 없는 조건: " + missing.join(",")), r6: R6, need: missing };
  if (tpl === "baseline") return { ...base, decision: "baseline_done", h: { cond: H("미검토", "평가 과제", ""), int: H("미검토", "평가 과제", ""), path: H("미검토", "평가 과제", "") }, r6: R6 };
  if (run.sameSetup === false) return { ...base, decision: "compare_hard", h: HOLD("조건마다 거리·경사·클럽이 달랐음"), r6: R6 };
  const few = keys.filter((k) => num(res[k].tries) < min);
  if (few.length) return { ...base, decision: "repeat_more", h: HOLD(`시도 수 부족(${few.join(",")}: ${min}회 미만)`), r6: R6 };

  const prevOk = parent && parent.template && parent.template.id === tpl && parent.review && parent.review.dirs;
  const pd = (k) => (prevOk ? parent.review.dirs[k] : null);
  const ps = parent && (parent.current || parent.proposal);
  const againWhat = ps && ps.setup && ps.setup.otherDay ? "다른 날 재검" : "별도 반복 블록";
  const fixedOrder = cur.setup.orderMode === "blocked" || run.orderFollowed === false;
  const lim = "같은 날 비교" + (fixedOrder ? " · 고정 순서로 진행: 연습·피로·순서 효과 가능" : " · 번갈아 진행");
  const crit = criterion(baselineOf(history || [], t.task, t.id), Math.min(...keys.map((k) => num(res[k].tries))));
  const thr = crit.thr;
  if (thr === null) return { ...base, decision: "baseline_first", h: HOLD(crit.basis), crit, r6: R6, note: "이번 평소 조건 결과가 다음 비교의 기준선이 됨" };
  const keep = (k) => { const r = num(res[k] && res[k].routine), tr = num(res[k] && res[k].tries); return r === null || !tr ? null : r / tr; };
  let h, decision, dirs, hyp = null;
  if (tpl === "mf07") {
    const [rA, rB, rC] = ["A", "B", "C"].map((k) => rateOf(res[k]));
    const pB = num(((res.B || {}).perceived || {}).pressure);
    const dCond = pB === null || pB <= 1 ? null : dir(rA, rB, thr), dInt = dir(rC, rB, thr);
    const kC = keep("C"), kB = keep("B");
    const dPath = kC === null ? null : kC >= 0.7 && (kB === null || kC > kB) ? 1 : 0;
    dirs = { cond: dCond, int: dInt, path: dPath };
    const ab = `평소 ${res.A.made}/${res.A.tries} · 압박 ${res.B.made}/${res.B.tries}`, cb = `준비 순서 유지 ${res.C.made}/${res.C.tries} · 압박 ${res.B.made}/${res.B.tries}`;
    const cond = pB === null ? H("판단 유보", "압박 상황의 체감 부담 미측정", lim)
      : pB <= 1 ? H("판단 유보", `압박 상황을 제시했지만 체감 부담 ${pB}/5 (압박 효과 판정 유보)`, lim)
      : confirmStatus(dCond, pd("cond"), ab + ` · 체감 부담 ${pB}/5`, lim, againWhat);
    const int = confirmStatus(dInt, pd("int"), cb, lim, againWhat);
    const tB = num(((res.B || {}).perceived || {}).tension), tC = num(((res.C || {}).perceived || {}).tension);
    const pathBasis = `준비 순서 지킨 횟수 C ${kC === null ? "미입력" : res.C.routine + "/" + res.C.tries}, B ${kB === null ? "미입력" : res.B.routine + "/" + res.B.tries}` + (tB !== null && tC !== null ? ` · 체감 긴장 B ${tB} → C ${tC}(진술)` : " · 긴장 미측정");
    const path = kC === null ? H("판단 유보", "준비 순서 기록 없음", "긴장 진술을 신체·기술 변화로 바꾸지 않음")
      : dInt === 1 && dPath === 1 ? confirmStatus(1, pd("int") === 1 && pd("path") === 1 ? 1 : null, pathBasis, lim, againWhat)
      : dInt === 1 ? H("판단 유보", "수행은 좋아졌지만 준비 순서 변화가 확인되지 않음 · " + pathBasis, lim)
      : dPath === 1 ? H("반증 관찰", "준비 순서는 지켰지만 수행 차이 없음 · " + pathBasis, lim)
      : H("판단 유보", pathBasis, lim);
    h = { cond, int, path };
    /* 경쟁 가설 (§8): 한 번의 비교로는 '검토 중'까지만 */
    const baseBad = rA < 0.5;
    hyp = {
      tech: baseBad ? H("검토 중", `낮은 압박(평소)에서도 성공 ${res.A.made}/${res.A.tries}`, lim) : H("반증 관찰", `평소 조건에선 ${res.A.made}/${res.A.tries}로 유지`, lim),
      pressure: dCond === 1 && kB !== null && kB < 0.7 ? H("검토 중", "압박 조건에서 수행 저하와 준비 순서 흐트러짐이 함께 관찰", lim + " · 선후 관계 미확인") : dCond === 1 ? H("검토 중", "압박 조건 수행 저하 · 과정 변화 기록 부족", lim) : H("판단 유보", "압박 조건 차이 미확인", lim),
      interaction: dCond === 1 && rA < 0.75 ? H("검토 중", "평소에도 완전하지 않은 수행이 압박에서 더 떨어짐", lim) : H("판단 유보", "근거 부족", lim),
      other: H("판단 유보", "피로·순서·연습 효과 미분리" + (run.memo ? " · 메모: " + String(run.memo).slice(0, 80) : ""), lim),
    };
    if (pB !== null && pB <= 1 && dInt !== 1) decision = "no_pressure";
    else if (dInt === 1) decision = int.status === "잠정 지지" ? (againWhat === "다른 날 재검" ? "retest_done" : "retest_other_day") : "immediate_only";
    else if (dPath === 1) decision = "mechanism_no_effect";
    else if (baseBad && dir(rA, rB, thr) !== 1) decision = "alt_check";
    else decision = "hold";
  } else {
    const [rA, rB] = ["A", "B"].map((k) => rateOf(res[k]));
    const dInt = dir(rB, rA, thr), kB = keep("B"), dPath = kB === null ? null : kB >= 0.7 ? 1 : 0;
    dirs = { cond: null, int: dInt, path: dPath };
    const int = confirmStatus(dInt, pd("int"), `레슨 방법 ${res.B.made}/${res.B.tries} · 평소 ${res.A.made}/${res.A.tries}`, lim, againWhat);
    const pb = kB === null ? "" : `체크 포인트 지킴 ${res.B.routine}/${res.B.tries}`;
    const path = kB === null ? H("판단 유보", "체크 포인트 기록 없음", lim)
      : dInt === 1 && dPath === 1 ? confirmStatus(1, pd("int") === 1 && pd("path") === 1 ? 1 : null, pb, lim, againWhat)
      : dPath === 1 ? H("반증 관찰", "체크 포인트는 지켰지만 수행 차이 없음 · " + pb, lim)
      : H("판단 유보", pb, lim);
    h = { cond: H("미검토", "이 훈련은 상황 변화를 비교하지 않음", ""), int, path };
    if (dInt === 1) decision = int.status === "잠정 지지" ? (againWhat === "다른 날 재검" ? "retest_done" : "retest_other_day") : "immediate_only";
    else if (dPath === 1) decision = "mechanism_no_effect";
    else if (rA < 0.5) decision = "alt_check";
    else decision = "hold";
  }
  return { ...base, decision, h, dirs, crit, ...(hyp ? { hyp } : {}), r6: R6 };
}

function nextOf(decision) {
  const n = NEXT[decision] || NEXT.hold;
  return { decision, text: n.text, tpl: n.tpl, ...(n.order ? { order: n.order } : {}) };
}

module.exports = { OPS, schedule, criterion, baselineOf, ROOT_SPEC, HYPS, TEMPLATES, TRIGGERS, TASKS, ROOTS, NEXT, choose, trainPrompt, validate, buildDoc, reviewRun, nextOf, MATRIX_VER, TPL_VER, RULE_VER };
