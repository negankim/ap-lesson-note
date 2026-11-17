/* AP 레슨 노트 · 서버 함수
 * ai: 레슨 정리(organize)와 연습 피드백 조정(feedback)을 Claude API로 처리한다.
 * - API 키는 Firebase 비밀값(ANTHROPIC_API_KEY)에만 있다. 코드와 브라우저에는 없다.
 * - 로그인한 사람만 부를 수 있고, 하루 사용 횟수를 센다. */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { organizePrompt, feedbackPrompt, chatPrompt, statementText, safety } = require("./prompts");
const TR = require("./training");

admin.initializeApp();
const db = admin.firestore();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

/* 모델: 정리는 정확도 우선, 피드백은 빠르고 싸게. 바꾸면 docs/decisions.md 에 기록. */
const MODEL = { solve: "claude-sonnet-5-5", organize: "claude-sonnet-5-5", feedback: "claude-haiku-5-5", chat: "claude-haiku-5-5", train: "claude-sonnet-5-5" };
/* 하루 사용 한도 (사람당). 파일럿 비용 관리용. */
const DAILY_LIMIT = { organize: 20, feedback: 40, chat: 10, train: 20, solve: 20 };

async function callClaude(model, prompt, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY.value(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Claude API error", res.status, body.slice(0, 500));
    throw new HttpsError("unavailable", "AI 응답을 받지 못했습니다.");
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
  if (data.stop_reason === "max_tokens") {
    console.error("Claude answer cut off (max_tokens)", model, maxTokens, text.length);
    throw new HttpsError("internal", "AI 응답이 너무 길어 잘렸습니다.");
  }
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    console.error("Claude answer has no JSON", data.stop_reason, text.slice(0, 500));
    throw new HttpsError("internal", "AI 응답 형식이 맞지 않습니다.");
  }
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch (e) {
    console.error("Claude answer JSON parse failed", e.message, text.slice(0, 300), "...", text.slice(-300));
    throw new HttpsError("internal", "AI 응답을 읽지 못했습니다.");
  }
}

/* 크루 말투(설정): 사람에게 보이는 문장의 말하는 방식만 바꾼다. 앞의 문체 지시보다 이 말투가 먼저이고, 내용·판정·안전 규칙은 그대로.
 * 세 말투가 한눈에 다르게 들리도록 문장 길이·시작·끝맺음을 정해 준다(다른 언어로 쓸 때도 그 언어로 같은 느낌). */
const TONE_BASE = "\n\n[말투 · 사람이 읽는 문장 전부에 적용, 앞의 문체 지시보다 우선. 내용·판정 규칙·안전 규칙·JSON 형식은 그대로]\n";
const TONES = {
  coach: TONE_BASE + "코치형: 차분한 코치처럼 존댓말. '왜 → 무엇을 → 얼마나' 순서로, 근거를 짧게 붙이고 할 일을 분명히. 칭찬은 담백하게 한마디. 예) \"출발 방향이 오른쪽이라 페이스부터 봐요. 게이트 10개, 성공 수를 세 주세요.\"",
  friend: TONE_BASE + "친구형: 친한 선배처럼 다정한 존댓말(반말 금지). 첫 문장은 공감이나 반가움('괜찮아요!', '좋아요, 잘 왔어요'), 마지막은 응원 한마디와 느낌표. 어려운 말은 풀어서, 문장은 부드럽게. 예) \"어제 못 했어도 괜찮아요! 오늘은 게이트 10개만 같이 해 봐요. 하나씩 성공 세다 보면 금방 감 와요!\"",
  direct: TONE_BASE + "직설형: 결론과 할 일부터. 한 문장은 짧게(15자 안팎), 인사·공감·꾸밈말·느낌표 없음. 명사형으로 끝내도 됨. 답은 최대 3문장. 예) \"원인 후보: 페이스 열림. 게이트 10개. 성공 수 기록.\"",
};

async function countUse(uid, task) {
  let used = 0;
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  const ref = db.doc(`usage/${uid}_${day}`);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const n = (snap.exists && snap.data()[task]) || 0;
    if (n >= DAILY_LIMIT[task]) throw new HttpsError("resource-exhausted", "오늘 사용 한도를 넘었습니다.");
    t.set(ref, { uid, day, [task]: n + 1 }, { merge: true });
    used = n + 1;
  });
  return used;
}

/* 미성년자 보호: 나이 확인 전, 또는 만 14세 미만인데 보호자 확인 전이면 AI를 쓰지 않는다.
 * 나이 구분은 브라우저가 보낸 값이 아니라 서버가 users 문서에서 읽는다. */
async function ageOf(uid) {
  const me = await db.doc("users/" + uid).get();
  const u = me.exists ? me.data() : {};
  if (["coach", "admin"].includes(u.role)) return "adult";
  if (!u.ageBand) throw new HttpsError("failed-precondition", "age-required");
  /* 보호자 동의: 모든 나라 만 14세 미만, 인도네시아·말레이시아는 만 18세 이하까지 (나라는 처음 로그인 때 한 번 정함) */
  const country = u.country || "KR";
  const needG = u.ageBand === "child" || (u.ageBand === "teen" && ["ID", "MY"].includes(country));
  if (needG && u.guardianVerified !== true) throw new HttpsError("failed-precondition", "guardian-pending");
  /* 중국: 국외 이전 별도 동의(PIPL) 없이는 AI(미국 처리)를 쓰지 않는다 */
  if (country === "CN" && u.xbConsent !== true) throw new HttpsError("failed-precondition", "consent-required");
  return u.ageBand;
}


/* 스페셜 파트 · 입스(YIPS): 전체 에러코드로 따로 표시 (AI 판단 또는 본인 스테이트먼트·진술) */
function markSpecial(r, statement, extraText) {
  const y = statement && statement.special && statement.special.yips;
  const fromStmt = !!(y && (y.status === "지금 있음"));
  const fromText = /입스|yips|イップス|易普/i.test(String(extraText || ""));
  const fromAI = Array.isArray(r.special) && r.special.map(String).includes("YIPS");
  r.special = fromStmt || fromText || fromAI ? ["YIPS"] : [];
  return r;
}
/* 언어: 설정(users.lang)대로 사람이 읽는 문장을 쓴다. 정해진 값(enum)·노드 코드는 그대로 둔다.
 * 레코드 원문 언어는 AI가 src_lang 으로 식별해 함께 저장한다. */
const LANGS = { ko: "한국어", en: "English", ja: "日本語", zh: "简体中文", ms: "Bahasa Melayu", id: "Bahasa Indonesia" };
const langOf = (v) => (LANGS[v] ? v : "ko");
const langLine = (lang) => lang === "ko" ? "" : `\n\n[출력 언어] 사람이 읽는 모든 문장(제목·설명·요점·훈련 이름과 방법·답변·질문)은 ${LANGS[lang]}로 쓴다. 입력이 다른 언어여도 출력 언어는 ${LANGS[lang]}. JSON 키, 노드 코드(N1~N8), 이 지시문에서 정해 준 값(예: 높음·보통·낮음·판단 보류, 코치·AP 라이브러리·AI 보완, 코치 판단·본인 진술·AI 추정, 기록·AI 추정, tech·mental 등)은 번역하지 말고 그대로 쓴다. 코치 이름·고유명사는 원래대로 둔다.`;
const SRC_LINE = `\n\n[원문 언어] 출력 JSON 맨 위에 "src_lang" 키를 넣는다: 입력 원문(레슨 기록·진술)의 주된 언어 코드(ko, en, ja, zh, ms, id 중 하나, 그 밖이면 해당 ISO 639-1 두 글자). 여러 언어가 섞이면 가장 많은 쪽.`;
const cleanLang = (v) => (/^[a-z]{2}$/.test(String(v || "")) ? String(v) : "");
async function translateCard(card, setup, lang) {
  if (lang === "ko") return null;
  const src = { goal: card.goal, drill: card.drill, why: card.why, steps: card.steps, checks: card.checks, unknowns: card.unknowns, success: setup.success };
  const out = await callClaude(MODEL.feedback, `다음 JSON의 값(문장)만 ${LANGS[lang]}로 자연스럽게 옮긴다. 키·배열 길이·숫자·단위는 그대로. 골프 용어는 그 언어에서 흔히 쓰는 말로. 설명 없이 JSON만 출력.\n\n${JSON.stringify(src)}`, 3000);
  return out && typeof out === "object" ? out : null;
}
exports.ai = onCall({ secrets: [ANTHROPIC_API_KEY], region: "asia-northeast3", timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const d = req.data || {};
  const minor = (await ageOf(req.auth.uid)) !== "adult";
  let statement = null;
  try { const sd = await db.doc(`players/${req.auth.uid}/statement/current`).get(); statement = sd.exists ? sd.data() : null; } catch (_) {}
  /* 크루 말투 (설정): 내용·판정 규칙은 그대로, 말하는 방식만 바꾼다 */
  let toneLine = "", lang = "ko";
  try { const ud = await db.doc(`users/${req.auth.uid}`).get(); const ux = ud.exists ? ud.data() : {}; toneLine = TONES[ux.tone] || ""; lang = langOf(ux.lang); } catch (_) {}
  const LL = langLine(lang);
  if (d.task === "organize") {
    const text = String(d.text || "").slice(0, 12000);
    if (text.length < 20) throw new HttpsError("invalid-argument", "레슨 내용이 너무 짧습니다.");
    await countUse(req.auth.uid, "organize");
    const libSnap = await db.collection("library").where("status", "==", "active").get();
    const lib = libSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
    const coach = String(d.coach || "").slice(0, 40);
    const r = await callClaude(MODEL.organize, organizePrompt({
      text, coach, profile: d.profile || {}, history: (d.history || []).slice(0, 3), lib, minor, statement,
    }) + SRC_LINE + toneLine + LL, 16000);
    r.src_lang = cleanLang(r.src_lang); r.out_lang = lang;
    /* 새 레슨 포인트는 서버가 보관해 둔다. 공동 레거시에는 이 보관본만 올라간다(브라우저가 보낸 값은 쓰지 않음). */
    const NODE = /^N[1-8]$/, DOM = ["tech", "mental", "fitting", "physical", "course"];
    /* mf = R1 주의·준비 상태 관찰(Matrix v1.2, 계수 아님). 화면은 기존처럼 mental 표시만 쓴다 */
    const MF = ["높음", "보통", "낮음", "판단 보류"];
    r.mf = r.mf && typeof r.mf === "object" ? { level: MF.includes(r.mf.level) ? r.mf.level : "판단 보류", signs: String(r.mf.signs || "").slice(0, 200), basis: String(r.mf.basis || "").slice(0, 20) } : { level: "판단 보류", signs: "", basis: "" };
    r.mental = !!r.mental || r.mf.level === "낮음";
    if (!NODE.test(String(r.via2 || ""))) r.via2 = null;
    if (!NODE.test(String(r.via || ""))) r.via = null;
    markSpecial(r, statement, d.text);
    /* 경쟁 가설(내부 기록, 화면 미표시) */
    const hy = r.hyp && typeof r.hyp === "object" ? r.hyp : {};
    r.hyp = { tech: String(hy.tech || "미확인").slice(0, 200), pressure: String(hy.pressure || "미확인").slice(0, 200), interaction: String(hy.interaction || "미확인").slice(0, 200), other: String(hy.other || "미확인").slice(0, 200), matrix: "v1.2" };
    r.new_points = (Array.isArray(r.new_points) ? r.new_points : []).filter((p) => p && NODE.test(p.node) && (p.point || p.name)).slice(0, 5)
      .map((p) => ({ node: p.node, domain: DOM.includes(p.domain) ? p.domain : "tech", kind: p.kind === "drill" ? "drill" : "point",
        name: String(p.name || "").slice(0, 60), point: String(p.point || "").slice(0, 300), how: String(p.how || "").slice(0, 300), dose: String(p.dose || "").slice(0, 80) }));
    const dref = await db.collection("players/" + req.auth.uid + "/drafts").add({ coach, new_points: r.new_points, lang, src_lang: r.src_lang, at: Date.now() });
    r.draft_id = dref.id;
    return r;
  }
  /* 내 문제 진술: 본인 상황 진술 → 문제·솔루션·훈련·6일 플랜. 근거는 '본인 진술', 공동 레거시에는 올리지 않는다. */
  if (d.task === "solve") {
    const s = d.statement || {};
    const pick = (v, n) => (Array.isArray(v) ? v : []).map((x) => String(x).slice(0, 30)).slice(0, n);
    const parts = [
      `샷: ${pick(s.shots, 4).join(", ") || "미선택"}`,
      `공이 어떻게: ${pick(s.misses, 6).join(", ") || "미선택"}`,
      `언제 심한가: ${pick(s.when, 6).join(", ") || "미선택"}`,
      `얼마나 자주: ${Number.isFinite(Number(s.freq)) ? `10번 중 ${Number(s.freq)}번` : "미입력"}`,
      `얼마나 됐나: ${String(s.since || "미입력").slice(0, 20)}`,
      s.words ? `본인 말: ${String(s.words).slice(0, 1500)}` : "",
    ].filter(Boolean).join("\n");
    if (!pick(s.shots, 4).length || !pick(s.misses, 6).length) throw new HttpsError("invalid-argument", "샷과 공이 어떻게 갔는지를 골라 주세요.");
    await countUse(req.auth.uid, "solve");
    const libSnap = await db.collection("library").where("status", "==", "active").get();
    const lib = libSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
    const r = await callClaude(MODEL.solve, organizePrompt({
      text: parts, coach: "", profile: d.profile || {}, history: (d.history || []).slice(0, 3), lib, minor, statement, self: true,
    }) + SRC_LINE + toneLine + LL, 16000);
    if (r && typeof r === "object") { r.src_lang = s.words ? cleanLang(r.src_lang) : ""; r.out_lang = lang; }
    if (r && r.off_topic) return r;
    const NODE = /^N[1-8]$/, MF = ["높음", "보통", "낮음", "판단 보류"];
    r.mf = r.mf && typeof r.mf === "object" ? { level: MF.includes(r.mf.level) ? r.mf.level : "판단 보류", signs: String(r.mf.signs || "").slice(0, 200), basis: "본인 진술" } : { level: "판단 보류", signs: "", basis: "본인 진술" };
    r.mental = !!r.mental || r.mf.level === "낮음";
    ["via", "via2"].forEach((k) => { if (!NODE.test(String(r[k] || ""))) r[k] = null; });
    r.problem = { ...(r.problem || {}), basis: "본인 진술" };
    r.lesson = { points: [], feels: ((r.lesson && r.lesson.feels) || []).slice(0, 3) };
    r.drills = (r.drills || []).map((x) => ({ ...x, source: x.source === "AP 라이브러리" ? "AP 라이브러리" : "AI 보완" }));
    r.new_points = [];
    const hy = r.hyp && typeof r.hyp === "object" ? r.hyp : {};
    r.hyp = { tech: String(hy.tech || "미확인").slice(0, 200), pressure: String(hy.pressure || "미확인").slice(0, 200), interaction: String(hy.interaction || "미확인").slice(0, 200), other: String(hy.other || "미확인").slice(0, 200), matrix: "v1.2" };
    r.source = "self";
    markSpecial(r, statement, parts);
    return r;
  }
  if (d.task === "feedback") {
    await countUse(req.auth.uid, "feedback");
    return callClaude(MODEL.feedback, feedbackPrompt({
      lesson: d.lesson || {}, verdict: String(d.verdict || ""), text: String(d.text || "").slice(0, 300), minor, statement,
    }) + toneLine + LL, 2000);
  }
  if (d.task === "chat") {
    const q = String(d.text || "").trim().slice(0, 400);
    if (!q) throw new HttpsError("invalid-argument", "질문이 비어 있습니다.");
    const used = await countUse(req.auth.uid, "chat");
    const base = "players/" + req.auth.uid;
    /* 근거는 브라우저가 보낸 값이 아니라 서버가 읽은 본인 기록이다 */
    const [ls, pf, hs] = await Promise.all([
      db.collection(base + "/lessons").get(),
      db.doc(base).get(),
      db.collection(base + "/chats").orderBy("at", "desc").limit(6).get(),
    ]);
    const lessons = ls.docs.map((x) => ({ id: x.id, ...x.data() })).filter((l) => l.result)
      .sort((a, b) => ((b.date || "") + (b.createdAt || "")).localeCompare((a.date || "") + (a.createdAt || ""))).slice(0, 5);
    const history = hs.docs.map((x) => x.data()).reverse();
    const r = await callClaude(MODEL.chat, chatPrompt({
      question: q, lessons, profile: pf.exists ? pf.data() : {}, history, minor, statement,
      today: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
    }) + toneLine + LL, 1500);
    const who = ["logan", "rook", "daryl", "paco"].includes(r.who) ? r.who : "logan";
    const sources = (Array.isArray(r.sources) ? r.sources : []).map((s) => lessons[Number(String(s).replace(/\D/g, "")) - 1])
      .filter(Boolean).slice(0, 3).map((l) => ({ id: l.id, date: l.date || "", coach: l.coach || "", title: (l.result && l.result.title) || "" }));
    const ans = {
      who, text: String(r.answer || "").slice(0, 1200), sources,
      basis: sources.length && r.basis !== "AI 추정" ? "기록" : "AI 추정",
      coach_check: !!r.coach_check,
    };
    const col = db.collection(base + "/chats"), now = Date.now();
    await col.add({ role: "user", text: q, at: now });
    await col.add({ role: "crew", ...ans, at: now + 1 });
    return { ...ans, used, limit: DAILY_LIMIT.chat };
  }
  /* AI 훈련 카드: 규칙이 템플릿을 고르고, AI가 이 선수에게 맞게 채우고, 서버가 검증한 뒤에만 저장한다.
   * 근거는 브라우저가 보낸 값이 아니라 서버가 읽은 본인 기록뿐이다(다른 선수 기록이 섞이지 않는다). */
  if (d.task === "train") {
    const base = "players/" + req.auth.uid;
    const [ls, ts] = await Promise.all([db.collection(base + "/lessons").get(), db.collection(base + "/trainings").get()]);
    const lessons = ls.docs.map((x) => ({ id: x.id, ...x.data() })).filter((l) => l.result)
      .sort((a, b) => ((b.date || "") + (b.createdAt || "")).localeCompare((a.date || "") + (a.createdAt || ""))).slice(0, 5);
    const all = ts.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    let parent = null;
    if (d.parent) {
      parent = all.find((x) => x.id === String(d.parent));
      if (!parent) throw new HttpsError("not-found", "이전 훈련을 찾지 못했습니다.");
      if (!parent.next || !parent.next.tpl) throw new HttpsError("failed-precondition", "train-no-next");
    }
    await countUse(req.auth.uid, "train");
    const pick = TR.choose({ lessons, parent });
    const prompt = TR.trainPrompt({ pick, lessons, prior: all.slice(0, 3), parent, statementText: statementText(statement), safety, minor }) + toneLine.replace('사람이 읽는 문장 전부', 'card 문장').replace(/JSON 형식은 그대로/, 'JSON 형식·card 금지어 규칙은 그대로');
    let out = await TR_call(prompt), problems = TR.validate(out, { pick, lessons });
    if (problems.length) {
      console.warn("train validate retry", problems);
      out = await TR_call(prompt + "\n\n[이전 출력의 문제 · 고쳐서 다시 출력]\n- " + problems.join("\n- "));
      problems = TR.validate(out, { pick, lessons });
    }
    if (problems.length) { console.error("train validate failed", problems); throw new HttpsError("internal", "train-invalid"); }
    const doc = TR.buildDoc({ out, pick, lessons, parent, model: MODEL.train, uid: req.auth.uid, history: all });
    /* 검증은 한국어 원안으로 하고, 다른 언어면 지금 적용본(current)의 화면 문장만 옮긴다 */
    if (lang !== "ko" && doc.current) {
      try {
        const cur = JSON.parse(JSON.stringify(doc.current)), card = cur.card || {}, setup = cur.setup || {};
        const tr = await translateCard(card, setup, lang);
        if (tr) {
          ["goal", "drill", "why"].forEach((k) => { if (typeof tr[k] === "string" && tr[k]) card[k] = tr[k].slice(0, 400); });
          ["steps", "checks", "unknowns"].forEach((k) => { if (Array.isArray(tr[k]) && Array.isArray(card[k]) && tr[k].length === card[k].length) card[k] = tr[k].map((x) => String(x).slice(0, 300)); });
          if (typeof tr.success === "string" && tr.success) setup.success = tr.success.slice(0, 120);
          doc.current = { ...cur, card, setup };
        }
      } catch (e) { console.warn("train translate", e.message); }
      doc.lang = lang; // proposal(AI 원안·검증본)은 한국어 그대로 보존
    }
    const ref = await db.collection(base + "/trainings").add(doc);
    if (parent) await db.doc(base + "/trainings/" + parent.id).update({ nextId: ref.id });
    return { id: ref.id };
  }
  /* 결과 검토: AI를 쓰지 않는 규칙 검토. 결과를 저장한 뒤 부른다. */
  if (d.task === "train_review") {
    const base = "players/" + req.auth.uid + "/trainings/";
    const snap = await db.doc(base + String(d.id || "")).get();
    if (!snap.exists) throw new HttpsError("not-found", "훈련 기록을 찾지 못했습니다.");
    const t = { id: snap.id, ...snap.data() };
    const hs = await db.collection("players/" + req.auth.uid + "/trainings").get();
    const history = hs.docs.map((x) => ({ id: x.id, ...x.data() }));
    let parent = null;
    if (t.parent) { const ps = await db.doc(base + t.parent).get(); parent = ps.exists ? { id: ps.id, ...ps.data() } : null; }
    const review = TR.reviewRun(t, parent, history);
    const next = TR.nextOf(review.decision);
    const reviews = [...(t.reviews || []), review];
    await snap.ref.update({ review, reviews, next, updatedAt: new Date().toISOString() });
    return { decision: review.decision, next };
  }
  throw new HttpsError("invalid-argument", "알 수 없는 요청입니다.");
});
const TR_call = (prompt) => callClaude(MODEL.train, prompt, 4000);

/* ===== 공동 레거시 (AP 레거시 광장의 나무) =====
 * 개인 기록과 분리된 하나의 나무. 선수가 레슨을 저장하면 그 레슨의 새 포인트가 여기에 잎으로 쌓인다.
 * - legacyPoints/{key}: 고유 포인트 (key = 노드 + 이름을 정리한 값). 같은 포인트가 또 오면 출처만 늘린다.
 * - legacy/stats: total(고유 포인트 수), nodes.N1~N8, domains, coaches(코치 수), contributions(기여 횟수)
 * - legacyCoaches/{key}: 코치 이름별 기여 (코치 수 세기)
 * 개인 기록을 지워도 이 나무는 줄지 않는다. */
const crypto = require("crypto");
const normKey = (s) => String(s || "").replace(/[\s·.,'"“”‘’!?()\-]/g, "").toLowerCase();
const playerLabel = (u) => {
  if (u.ageBand && u.ageBand !== "adult") return "주니어 선수";
  const n = String(u.name || "").trim();
  return n ? n.slice(0, 1) + "○○ 선수" : "선수";
};
/* 레거시 포인트 통합: 어느 언어로 정리했든 한국어 기준문(name·point·how·dose)으로 맞추고 6개 언어 번역(i18n)을 붙인다.
 * 같은 노드의 기존 포인트와 뜻이 같으면 그 포인트로 합친다(언어가 달라도 하나의 잎). 실패하면 원문 그대로 쌓고 i18n 없음으로 둔다. */
const PT_LANGS = ["ko", "en", "ja", "zh", "ms", "id"];
const ptFields = (x) => ({ name: String((x && x.name) || "").slice(0, 60), point: String((x && x.point) || "").slice(0, 300), how: String((x && x.how) || "").slice(0, 300), dose: String((x && x.dose) || "").slice(0, 80) });
async function canonize(pts, lang) {
  const nodes = [...new Set(pts.map((p) => p.node))];
  const cand = {};
  for (const n of nodes) {
    const sn = await db.collection("legacyPoints").where("node", "==", n).limit(80).get();
    cand[n] = sn.docs.map((d) => ({ id: d.id, name: d.data().name || "", point: String(d.data().point || "").slice(0, 120) }));
  }
  const prompt = `골프 레슨 포인트를 공동 지식 나무에 쌓기 위해 정리한다. 입력 포인트(원문 언어: ${LANGS[lang] || lang})마다:
1) 한국어 기준문(ko)과 en(English)·ja(日本語)·zh(简体中文)·ms(Bahasa Melayu)·id(Bahasa Indonesia) 번역을 만든다. 각 언어 객체는 name·point·how·dose. 뜻을 더하거나 빼지 말고, 숫자·단위·클럽 번호는 그대로, 골프 용어는 그 언어에서 흔히 쓰는 말로. 원문 언어 칸은 원문을 그대로 둔다.
2) 같은 노드의 기존 포인트 목록에서 "같은 교정 내용"(같은 동작을 같은 방향으로 고치는 것)이면 same_as 에 그 id, 아니면 null. 비슷한 주제일 뿐이면 null.
설명 없이 JSON만: {"points":[{"i":0,"same_as":null,"ko":{...},"en":{...},"ja":{...},"zh":{...},"ms":{...},"id":{...}}]}

[입력 포인트]
${JSON.stringify(pts.map((p, i) => ({ i, node: p.node, name: p.name, point: p.point, how: p.how, dose: p.dose })))}

[같은 노드의 기존 포인트]
${JSON.stringify(cand)}`;
  const out = await callClaude(MODEL.feedback, prompt, 6000);
  const list = (out && Array.isArray(out.points)) ? out.points : [];
  return pts.map((p, i) => {
    const r = list.find((x) => Number(x.i) === i);
    if (!r || !r.ko || !r.ko.name) return { ...p, i18n: null, same: null };
    const i18n = {};
    PT_LANGS.forEach((L) => { if (r[L] && r[L].name) i18n[L] = ptFields(r[L]); });
    i18n[lang] = ptFields(p); // 원문 언어 칸은 원문 그대로
    const ok = (cand[p.node] || []).some((c) => c.id === r.same_as);
    return { ...p, ...ptFields(r.ko), orig: ptFields(p), i18n, same: ok ? r.same_as : null };
  });
}
/* 예전에 번역 없이 쌓인 포인트를 조금씩 채운다(레거시에 보탤 때마다 최대 8개) */
async function backfillI18n() {
  const sn = await db.collection("legacyPoints").where("i18nAt", "==", null).limit(8).get().catch(() => null);
  let docs = sn ? sn.docs : [];
  if (!docs.length) {
    const all = await db.collection("legacyPoints").limit(200).get();
    docs = all.docs.filter((d) => !d.data().i18n).slice(0, 8);
  }
  if (!docs.length) return;
  const pts = docs.map((d) => ({ node: d.data().node, ...ptFields(d.data()) }));
  const prompt = `다음 한국어 골프 레슨 포인트를 en·ja·zh·ms·id 로 옮긴다. 각 언어 객체는 name·point·how·dose. 뜻을 더하거나 빼지 말고 숫자·단위는 그대로. JSON만: {"points":[{"i":0,"en":{...},"ja":{...},"zh":{...},"ms":{...},"id":{...}}]}\n\n${JSON.stringify(pts.map((p, i) => ({ i, ...p })))}`;
  const out = await callClaude(MODEL.feedback, prompt, 6000);
  const list = (out && Array.isArray(out.points)) ? out.points : [];
  await Promise.all(docs.map((d, i) => {
    const r = list.find((x) => Number(x.i) === i);
    if (!r) return null;
    const i18n = { ko: ptFields(d.data()) };
    PT_LANGS.slice(1).forEach((L) => { if (r[L] && r[L].name) i18n[L] = ptFields(r[L]); });
    return d.ref.update({ i18n, i18nAt: Date.now() });
  }));
}
async function addToLegacy(uid, lessonId) {
  const lref = db.doc(`players/${uid}/lessons/${lessonId}`);
  const [ls, us] = await Promise.all([lref.get(), db.doc("users/" + uid).get()]);
  if (!ls.exists) throw new HttpsError("not-found", "레슨을 찾지 못했습니다.");
  const L = ls.data();
  if (L.legacyAt) return { added: 0, echoed: 0, already: true };
  if (!L.draftId) { await lref.update({ legacyAt: Date.now(), legacyAdded: 0 }); return { added: 0, echoed: 0 }; }
  const dref = db.doc(`players/${uid}/drafts/${L.draftId}`);
  const ds = await dref.get();
  if (!ds.exists || ds.data().usedBy) { await lref.update({ legacyAt: Date.now(), legacyAdded: 0 }); return { added: 0, echoed: 0 }; }
  const draft = ds.data(), coach = String(draft.coach || "").trim(), plang = draft.lang || "ko";
  let pts = draft.new_points || [];
  try { if (pts.length) pts = await canonize(pts, plang); } catch (e) { console.warn("legacy canonize", e.message); pts = pts.map((p) => ({ ...p, i18n: null, same: null })); }
  const src = { coach: coach || "코치 미기재", player: playerLabel(us.exists ? us.data() : {}), date: L.date || "", lang: draft.lang || "ko", at: Date.now() };
  let added = 0, echoed = 0;
  await db.runTransaction(async (t) => {
    const stRef = db.doc("legacy/stats");
    const refs = pts.map((p) => db.doc("legacyPoints/" + (p.same || crypto.createHash("sha1").update(p.node + "|" + normKey(p.name || p.point)).digest("hex").slice(0, 20))));
    const ck = normKey(coach), cref = ck ? db.doc("legacyCoaches/" + crypto.createHash("sha1").update(ck).digest("hex").slice(0, 20)) : null;
    const snaps = await Promise.all(refs.map((r) => t.get(r)));
    const cs = cref ? await t.get(cref) : null;
    const inc = admin.firestore.FieldValue.increment;
    const st = { total: inc(0), contributions: inc(pts.length) };
    pts.forEach((p, i) => {
      if (snaps[i].exists) {
        echoed++;
        const up = { echoes: inc(1), sources: admin.firestore.FieldValue.arrayUnion(src), updatedAt: Date.now() };
        if (!snaps[i].data().i18n && p.i18n) { up.i18n = { ko: ptFields(snaps[i].data()), ...p.i18n }; up.i18nAt = Date.now(); }
        t.update(refs[i], up);
      } else {
        added++;
        const { same, ...pp } = p;
        t.set(refs[i], { ...pp, lang: plang, i18nAt: p.i18n ? Date.now() : null, coach: src.coach, sources: [src], echoes: 1, confirmed: false, createdAt: Date.now(), updatedAt: Date.now() });
        st["nodes." + p.node] = inc(1);
        st["domains." + p.domain] = inc(1);
      }
    });
    st.total = inc(added);
    if (cref && !cs.exists) { t.set(cref, { name: coach, points: pts.length, firstAt: Date.now() }); st.coaches = inc(1); }
    else if (cref) t.update(cref, { points: inc(pts.length) });
    if (pts.length) t.set(stRef, st, { merge: true });
    t.update(dref, { usedBy: lessonId });
    t.update(lref, { legacyAt: Date.now(), legacyAdded: added, legacyEchoed: echoed });
  });
  await Promise.race([backfillI18n(), new Promise((r) => setTimeout(r, 25000))]).catch((e) => console.warn("legacy backfill", e.message));
  return { added, echoed };
}
exports.legacy = onCall({ secrets: [ANTHROPIC_API_KEY], region: "asia-northeast3", timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const id = String((req.data || {}).lessonId || "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new HttpsError("invalid-argument", "레슨 번호가 맞지 않습니다.");
  return addToLegacy(req.auth.uid, id);
});

/* 훈련 라이브러리 첫 데이터 넣기 — 관리자만, 없는 항목만 추가(코치진이 고친 내용은 덮어쓰지 않음) */
exports.seedLibrary = onCall({ region: "asia-northeast3" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const me = await db.doc("users/" + req.auth.uid).get();
  if (!me.exists || me.data().role !== "admin") throw new HttpsError("permission-denied", "관리자만 할 수 있습니다.");
  const items = require("./library-seed.json");
  let added = 0, skipped = 0;
  for (const [id, data] of Object.entries(items)) {
    const ref = db.doc("library/" + id);
    if ((await ref.get()).exists) { skipped++; continue; }
    await ref.set(data); added++;
  }
  return { added, skipped };
});


/* 계정: 본인 계정 삭제. 개인 기록(선수 기록·스테이트먼트·만다라트·연결·대화)과 로그인 계정을 지운다.
 * 공동 레거시 나무의 포인트는 이름이 가려진 채 남는다(제품 원칙: 개인 기록을 지워도 공동 나무는 줄지 않는다). */
exports.account = onCall({ region: "asia-northeast3", timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = req.auth.uid, d = req.data || {};
  if (d.task !== "delete") throw new HttpsError("invalid-argument", "알 수 없는 요청입니다.");
  if (String(d.confirm || "") !== "삭제") throw new HttpsError("failed-precondition", "확인 문구가 맞지 않습니다.");
  // 내가 보던 선수들 쪽 연결 기록 지우기
  const watching = await db.collection(`users/${uid}/watching`).get();
  await Promise.all(watching.docs.map((x) => db.doc(`players/${x.id}/viewers/${uid}`).delete().catch(() => {})));
  // 나를 보던 사람들 쪽 목록 지우기
  const viewers = await db.collection(`players/${uid}/viewers`).get();
  await Promise.all(viewers.docs.map((x) => db.doc(`users/${x.id}/watching/${uid}`).delete().catch(() => {})));
  const invites = await db.collection("invites").where("owner", "==", uid).get();
  await Promise.all(invites.docs.map((x) => x.ref.delete()));
  await db.recursiveDelete(db.doc(`players/${uid}`));
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.doc(`guardians/${uid}`).delete().catch(() => {});
  const usage = await db.collection("usage").where("uid", "==", uid).get();
  await Promise.all(usage.docs.map((x) => x.ref.delete()));
  await admin.auth().deleteUser(uid).catch(() => {});
  return { ok: true };
});
